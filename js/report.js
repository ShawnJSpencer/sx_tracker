// Appointment summary: shown on screen and exported as a real PDF file
// (iOS ignores window.print() inside home-screen apps, so we build the PDF
// ourselves and hand it to the share sheet: Print, Save to Files, Mail…).
import { SYMPTOMS, SYM, GROUPS, SERIES } from './config.js';
import { getCell, medList, doseFor, doseChanges, labList, photosFor, profile } from './store.js';
import { h, today, addDays, range, mean, round1, fmtDate, fmtDateLong } from './util.js';
import { lineChart } from './charts.js';
import { rolling } from './insights.js';
import { labFlag, rangeTxt } from './labs.js';
import { loadPhoto } from './sync.js';
import { PDF, PAGE, wrap, measure } from './pdf.js';
import { sheet, toast } from './popover.js';

let root, from = addDays(today(), -29), to = today(), withPhotos = false;
export function mountReport(el) { root = el; render(); }
export function refreshReport() { if (root && root.offsetParent) render(); }

const SUN = `<svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><defs><clipPath id="sunclip"><rect width="40" height="40" rx="10"/></clipPath></defs><g clip-path="url(#sunclip)"><rect width="40" height="23" fill="#F79A82"/><rect y="23" width="40" height="17" fill="#2EC4C0"/><path d="M11.5 23 A8.5 8.5 0 0 1 28.5 23 Z" fill="#FFD45E"/></g></svg>`;
const TREND = ['fatigue', 'brainfog', 'refreshed', 'rash', 'jointpain'];
const FOOT = 'Self-reported daily log. Scores are 0–10 (10 = worst, except rows where higher is better, such as “Woke refreshed”).';

// ---------- shared data model ----------
function model() {
  const dates = range(from, to);
  const logged = dates.filter(d => SYMPTOMS.some(s => getCell(d, s.id) !== undefined));
  const meds = medList();
  const medRows = meds.map(m => {
    const cur = doseFor(to, m.id).value;
    const ch = doseChanges(m.id, from, to);
    const missed = dates.filter(d => doseFor(d, m.id).value === 'Missed').length;
    return [m.name + (m.generic ? ` (${m.generic})` : ''),
      m.kind === 'pack' ? (m.pack?.start ? `${m.pack.active}/${m.pack.inactive} cycle` : '—') : cur === undefined ? '—' : `${cur} ${m.unit}`,
      ch.length ? ch.map(c => `${fmtDate(c.date)}: ${c.prev ?? 'start'} → ${c.value ?? 'stopped'}`).join('; ') : 'No changes', String(missed)];
  });
  const markers = meds.flatMap(m => doseChanges(m.id, from, to).map(c => ({ date: c.date, label: `${m.name} ${c.value ?? 'stop'}` })));
  const series = TREND.map(id => { const v = dates.map(d => typeof getCell(d, id) === 'number' ? getCell(d, id) : null); return { name: SYM[id].label, color: SERIES[id], values: v, smooth: rolling(v) }; });
  const groups = [];
  for (const g of GROUPS) {
    const rows = SYMPTOMS.filter(s => s.g === g.id && !['note', 'photo'].includes(s.type)).map(s => {
      const vals = logged.map(d => getCell(d, s.id)).filter(v => v !== undefined);
      if (!vals.length) return null;
      let c;
      if (s.type === 'scale') { const x = vals.filter(v => typeof v === 'number'); c = [`avg ${round1(mean(x))}`, `max ${Math.max(...x)}`, `${x.filter(v => s.better === 'high' ? v <= 4 : v >= 6).length} days ${s.better === 'high' ? '≤ 4' : '≥ 6'}`]; }
      else if (s.type === 'yesno') { const y = logged.filter(d => getCell(d, s.id) === true); c = [`${y.length} of ${vals.length} days`, y.length ? y.slice(0, 10).map(fmtDate).join(', ') + (y.length > 10 ? '…' : '') : '', '']; }
      else if (s.type === 'choice') { const k = {}; vals.forEach(v => k[v] = (k[v] || 0) + 1); c = [Object.entries(k).map(([a, b]) => `${a} ${b}`).join(' · '), '', '']; }
      else { const x = vals.map(Number); c = [`avg ${round1(mean(x))}${s.unit ? ' ' + s.unit : ''}`, `range ${+Math.min(...x).toFixed(1)}–${+Math.max(...x).toFixed(1)}`, s.id === 'temp' ? `${x.filter(v => v >= 100.4).length} days ≥ 100.4°F` : '']; }
      const hl = s.g === 'flags' && ((s.type === 'yesno' && !c[0].startsWith('0 ')) || (s.id === 'temp' && !c[2].startsWith('0 ')));
      return { cells: [s.label, ...c], hl };
    }).filter(Boolean);
    if (rows.length) groups.push({ name: g.name, rows });
  }
  const notes = dates.map(d => [d, getCell(d, 'note')]).filter(([, x]) => x);
  const labs = labList().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : ((labFlag(a) === 'ok') - (labFlag(b) === 'ok')) || a.test.localeCompare(b.test));
  const photos = withPhotos ? dates.flatMap(d => photosFor(d)) : [];
  return { dates, logged, medRows, markers, series, groups, notes, labs, photos, name: profile('name') };
}
const labResult = (l, words) => `${l.value} ${l.unit || ''}${labFlag(l) === 'high' ? (words ? '  High' : ' ↑') : labFlag(l) === 'low' ? (words ? '  Low' : ' ↓') : ''}`.trim();

// ---------- on-screen ----------
function render() {
  root.innerHTML = '';
  const fi = h('input', { type: 'date', class: 'in', value: from, onchange: e => { from = e.target.value; render(); } });
  const ti = h('input', { type: 'date', class: 'in', value: to, onchange: e => { to = e.target.value; render(); } });
  const pdfBtn = h('button', { class: 'btn primary', onclick: () => makePDF(pdfBtn) }, 'Save / Share PDF');
  root.append(h('div', { class: 'filters no-print' },
    h('div', { class: 'seg' }, [['14', '2 weeks'], ['30', 'Month'], ['90', '3 months']].map(([k, l]) => h('button', { onclick: () => { from = addDays(today(), -(+k - 1)); to = today(); render(); } }, l))),
    h('label', { class: 'inline' }, 'From ', fi), h('label', { class: 'inline' }, 'to ', ti),
    h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: withPhotos, onchange: e => { withPhotos = e.target.checked; render(); } }), 'Include photos'),
    pdfBtn));
  const M = model();
  const paper = h('article', { class: 'paper' }); root.append(paper);
  paper.append(h('header', { class: 'rep-head' },
    h('div', {}, h('div', { class: 'rep-kicker' }, 'Symptom summary'), h('h1', {}, M.name || 'Daily symptom log'), h('p', {}, `${fmtDateLong(from)} – ${fmtDateLong(to)} · ${M.logged.length} of ${M.dates.length} days logged`)),
    h('div', { class: 'rep-mark', html: SUN })));
  paper.append(h('section', {}, h('h2', {}, 'Medications'), h('table', { class: 'rep-table' }, h('thead', {}, h('tr', {}, ['Medication', `Dose on ${fmtDate(to)}`, 'Changes in period', 'Missed'].map(x => h('th', {}, x)))), h('tbody', {}, M.medRows.map(r => h('tr', {}, r.map(x => h('td', {}, x))))))));
  const tc = h('div', { class: 'rep-chart' });
  paper.append(h('section', {}, h('h2', {}, 'Trend'), tc));
  requestAnimationFrame(() => lineChart(tc, { dates: M.dates, markers: M.markers, height: 240, series: M.series }));
  const body = M.groups.flatMap(g => [h('tr', { class: 'grp' }, h('td', { colspan: 4 }, g.name)), ...g.rows.map(r => h('tr', { class: r.hl ? 'hl' : '' }, r.cells.map(x => h('td', {}, x))))]);
  paper.append(h('section', {}, h('h2', {}, 'Symptoms'), body.length ? h('table', { class: 'rep-table' }, h('tbody', {}, body)) : h('p', { class: 'muted' }, 'Nothing logged in this period.')));
  if (M.notes.length) paper.append(h('section', {}, h('h2', {}, 'Notes'), h('ul', { class: 'rep-notes' }, M.notes.map(([d, x]) => h('li', {}, h('b', {}, fmtDate(d)), ' ', x)))));
  if (M.labs.length) paper.append(h('section', {}, h('h2', {}, 'Lab results'), h('table', { class: 'rep-table' },
    h('thead', {}, h('tr', {}, ['Date', 'Test', 'Result', 'Range'].map(x => h('th', {}, x)))),
    h('tbody', {}, M.labs.map(l => h('tr', { class: labFlag(l) !== 'ok' ? 'hl' : '' }, h('td', {}, fmtDate(l.date)), h('td', {}, l.test), h('td', {}, labResult(l)), h('td', {}, rangeTxt(l))))))));
  if (M.photos.length) {
    const grid = h('div', { class: 'rep-photos' });
    paper.append(h('section', {}, h('h2', {}, 'Photos'), grid));
    M.photos.forEach(p => { const fig = h('figure', {}, h('div', { class: 'ph-load' }, '…'), h('figcaption', {}, `${fmtDate(p.date)} · ${p.tag}`)); grid.append(fig); loadPhoto(p.id).then(b => b && fig.firstChild.replaceWith(h('img', { src: URL.createObjectURL(b) }))); });
  }
  paper.append(h('footer', { class: 'rep-foot' }, `${FOOT} Generated ${fmtDateLong(today())}.`));
}

// ---------- PDF ----------
const C = { ink: '#3A2F33', ink2: '#5E5155', muted: '#8C7F82', line: '#EFE6E2', line2: '#E4D8D3', rose: '#B5677D', roseD: '#9C385D', hl: '#FDF1F5', grp: '#F7F1EC' };
const ML = 48, MR = PAGE.W - 48, TOP = 56, BOTTOM = PAGE.H - 54, CW = MR - ML;

async function buildPDF(M) {
  const pdf = new PDF();
  let y = TOP;
  const newPage = () => { pdf.page(); y = TOP; };
  const ensure = need => { if (y + need > BOTTOM) { newPage(); return true; } return false; };

  // header
  pdf.text(ML, y + 8, 'SYMPTOM SUMMARY', { size: 8.5, font: 'bold', color: C.rose });
  pdf.text(ML, y + 36, M.name || 'Daily symptom log', { size: 24, font: 'serif' });
  pdf.text(ML, y + 54, `${fmtDateLong(from)} – ${fmtDateLong(to)}  ·  ${M.logged.length} of ${M.dates.length} days logged`, { size: 9.5, color: C.muted });
  sunrise(pdf, MR - 34, y + 4, 34);
  y += 66; pdf.line(ML, y, MR, y, { color: '#F2DCE4', width: 1.5 }); y += 18;

  const section = title => { ensure(60); pdf.text(ML, y + 12, title, { size: 14, font: 'serif', color: C.roseD }); y += 24; };

  const table = (cols, rows, { head = true } = {}) => {
    const size = 8.8, lh = 11.2, pad = 5;
    const xs = []; let x = ML; for (const c of cols) { xs.push(x); x += c.w * CW; }
    const drawHead = () => {
      if (!head) return;
      cols.forEach((c, i) => pdf.text(xs[i] + pad, y + 10, c.label, { size: 8, font: 'bold', color: C.muted }));
      y += 15; pdf.line(ML, y, MR, y, { color: C.line2 });
    };
    drawHead();
    for (const r of rows) {
      if (r.group) {
        if (ensure(40)) drawHead();
        pdf.rect(ML, y, CW, 18, { fill: C.grp }); pdf.text(ML + pad, y + 12.5, r.group, { size: 10.5, font: 'serif' }); y += 18; continue;
      }
      const lines = r.cells.map((t, i) => wrap(t, cols[i].w * CW - pad * 2, size, i === 0 && r.boldFirst ? 'bold' : 'sans'));
      const rh = Math.max(...lines.map(l => l.length)) * lh + 7;
      if (ensure(rh)) drawHead();
      if (r.hl) pdf.rect(ML, y, CW, rh, { fill: C.hl });
      lines.forEach((ls, i) => ls.forEach((t, k) => pdf.text(xs[i] + pad, y + 11 + k * lh, t, { size, font: i === 0 && r.boldFirst ? 'bold' : 'sans', color: r.hl && (r.hlCol ?? -1) === i ? C.roseD : C.ink })));
      y += rh; pdf.line(ML, y, MR, y, { color: C.line });
    }
    y += 14;
  };

  // medications
  section('Medications');
  table([{ label: 'Medication', w: .30 }, { label: `Dose on ${fmtDate(to)}`, w: .17 }, { label: 'Changes in period', w: .43 }, { label: 'Missed', w: .10 }], M.medRows.map(c => ({ cells: c, boldFirst: true })));

  // trend chart
  section('Trend');
  ensure(230);
  trendChart(pdf, M, ML, y, CW, 180); y += 222;

  // symptoms
  section('Symptoms');
  if (M.groups.length) table([{ label: 'Symptom', w: .30 }, { label: '', w: .22 }, { label: '', w: .30 }, { label: '', w: .18 }],
    M.groups.flatMap(g => [{ group: g.name }, ...g.rows.map(r => ({ cells: r.cells, hl: r.hl }))]), { head: false });
  else { pdf.text(ML, y + 10, 'Nothing logged in this period.', { size: 9.5, color: C.muted }); y += 26; }

  // notes
  if (M.notes.length) {
    section('Notes');
    for (const [d, t] of M.notes) {
      const ls = wrap(t, CW - 70, 9.2);
      ensure(ls.length * 12 + 6);
      pdf.text(ML, y + 10, fmtDate(d), { size: 9.2, font: 'bold' });
      ls.forEach((l, k) => pdf.text(ML + 62, y + 10 + k * 12, l, { size: 9.2 }));
      y += ls.length * 12 + 6;
    }
    y += 10;
  }

  // labs
  if (M.labs.length) {
    section('Lab results');
    table([{ label: 'Date', w: .13 }, { label: 'Test', w: .37 }, { label: 'Result', w: .27 }, { label: 'Range', w: .23 }],
      M.labs.map(l => ({ cells: [fmtDate(l.date), l.test, labResult(l, true), rangeTxt(l)], hl: labFlag(l) !== 'ok', hlCol: 2 })));
  }

  // photos
  if (M.photos.length) {
    section('Photos');
    const per = 3, gap = 12, bw = (CW - gap * (per - 1)) / per, bh = bw;
    let col = 0;
    for (const p of M.photos) {
      const blob = await loadPhoto(p.id); if (!blob) continue;
      const { bytes, w, h: hh } = await jpegOf(blob);
      if (col === 0 && ensure(bh + 26)) {}
      const x = ML + col * (bw + gap);
      const k = Math.min(bw / w, bh / hh), dw = w * k, dh = hh * k;
      pdf.rect(x, y, bw, bh, { fill: '#F5EEE9' });
      pdf.image(bytes, w, hh, x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh);
      pdf.text(x, y + bh + 12, `${fmtDate(p.date)} · ${p.tag || ''}`, { size: 8.5, color: C.ink2 });
      col++; if (col === per) { col = 0; y += bh + 24; }
    }
    if (col) y += bh + 24;
  }

  ensure(30);
  wrap(`${FOOT} Generated ${fmtDateLong(today())}.`, CW, 8).forEach((l, k) => pdf.text(ML, y + 8 + k * 10, l, { size: 8, color: C.muted }));

  // page footers
  const total = pdf.pageCount;
  pdf.pages.forEach((pg, i) => {
    pdf.cur = pg;
    pdf.line(ML, PAGE.H - 36, MR, PAGE.H - 36, { color: C.line });
    pdf.text(ML, PAGE.H - 24, `New Day${M.name ? ' · ' + M.name : ''} · ${fmtDate(from)} – ${fmtDate(to)}`, { size: 7.5, color: C.muted });
    pdf.text(MR, PAGE.H - 24, `Page ${i + 1} of ${total}`, { size: 7.5, color: C.muted, align: 'right' });
  });
  return pdf.output();
}

function sunrise(pdf, x, y, s) {
  const hz = y + s * 0.575;
  pdf.rect(x, y, s, s, { fill: '#F79A82', r: s * 0.22 });
  pdf.circle(x + s / 2, hz, s * 0.21, { fill: '#FFD45E' });
  pdf.rect(x, hz, s, s * 0.2, { fill: '#2EC4C0' });
  pdf.rect(x, hz, s, s * 0.425, { fill: '#2EC4C0', r: s * 0.22 });
  pdf.rect(x, hz, s, s * 0.2, { fill: '#2EC4C0' });
}

function trendChart(pdf, M, x0, y0, w, hgt) {
  const L = x0 + 22, R = x0 + w - 6, T = y0 + 16, B = y0 + hgt;
  const n = M.dates.length, X = i => n <= 1 ? (L + R) / 2 : L + i / (n - 1) * (R - L), Y = v => B - v / 10 * (B - T);
  for (let v = 0; v <= 10; v += 2) { pdf.line(L, Y(v), R, Y(v), { color: v ? C.line : C.line2 }); pdf.text(L - 6, Y(v) + 3, String(v), { size: 7.5, color: C.muted, align: 'right' }); }
  const every = Math.max(1, Math.ceil(n / 7));
  M.dates.forEach((d, i) => { if (i % every === 0) pdf.text(X(i), B + 12, fmtDate(d), { size: 7.5, color: C.muted, align: 'center' }); });
  M.markers.forEach((m, k) => {
    const i = M.dates.indexOf(m.date); if (i < 0) return;
    pdf.line(X(i), T - 4, X(i), B, { color: '#C6AEB7', dash: [2, 3], width: 0.9 });
    pdf.text(X(i) + 3, T - 6 + (k % 2) * 9, m.label, { size: 7, font: 'bold', color: '#8F6878' });
  });
  for (const s of M.series) {
    s.values.forEach((v, i) => { if (v != null) pdf.circle(X(i), Y(v), 1.6, { fill: s.color, alpha: 0.3 }); });
    let seg = [];
    s.smooth.forEach((v, i) => { if (v == null) { pdf.polyline(seg, { color: s.color }); seg = []; } else seg.push([X(i), Y(v)]); });
    pdf.polyline(seg, { color: s.color });
  }
  let lx = L, ly = B + 30;
  for (const s of M.series) {
    const tw = measure(s.name, 8.5) + 22;
    if (lx + tw > R) { lx = L; ly += 13; }
    pdf.rect(lx, ly - 7, 8, 8, { fill: s.color, r: 2 }); pdf.text(lx + 12, ly, s.name, { size: 8.5, color: C.ink2 }); lx += tw;
  }
}

// photos are stored as JPEG; re-encode anything else
async function jpegOf(blob) {
  const url = URL.createObjectURL(blob);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  let b = blob;
  if (blob.type !== 'image/jpeg') {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  }
  return { bytes: new Uint8Array(await b.arrayBuffer()), w: img.naturalWidth, h: img.naturalHeight };
}

async function makePDF(btn) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Making PDF…';
  try {
    const bytes = await buildPDF(model());
    const name = `Symptom summary ${from} to ${to}.pdf`;
    const file = new File([bytes], name, { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const s = sheet('Your PDF is ready', h('div', { class: 'pdf-ready' },
      h('div', { class: 'pdf-ic' }, 'PDF'), h('p', {}, h('b', {}, name), h('br'), h('span', { class: 'muted small' }, `${Math.max(1, Math.round(bytes.length / 1024))} KB`)),
      canShare ? h('p', { class: 'muted small' }, 'Share opens the iPad share sheet: Print, Save to Files, Mail, Messages or AirDrop.') : null,
      h('div', { class: 'pdf-actions' },
        canShare ? h('button', { class: 'btn primary', onclick: async () => { try { await navigator.share({ files: [file], title: name }); s.close(); } catch (e) { if (e.name !== 'AbortError') toast('Sharing didn’t work — try Open'); } } }, 'Share / Print…') : null,
        h('a', { class: 'btn' + (canShare ? '' : ' primary'), href: url, download: name }, 'Download'),
        h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Open'))));
  } catch (e) { console.error(e); toast('Could not make the PDF: ' + e.message); }
  btn.disabled = false; btn.textContent = label;
}
