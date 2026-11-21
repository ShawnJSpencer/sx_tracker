// Printable summary for appointments (Print → Save as PDF on iPad).
import { SYMPTOMS, SYM, GROUPS, SERIES } from './config.js';
import { getCell, medList, doseFor, doseChanges, labList, photosFor, profile } from './store.js';
import { h, today, addDays, range, mean, round1, fmtDate, fmtDateLong, esc } from './util.js';
import { lineChart } from './charts.js';
import { rolling } from './insights.js';
import { labFlag } from './labs.js';
import { loadPhoto } from './sync.js';

let root, from = addDays(today(), -29), to = today(), withPhotos = false;
export function mountReport(el) { root = el; render(); }
export function refreshReport() { if (root && root.offsetParent) render(); }

function render() {
  root.innerHTML = '';
  const fi = h('input', { type: 'date', class: 'in', value: from, onchange: e => { from = e.target.value; render(); } });
  const ti = h('input', { type: 'date', class: 'in', value: to, onchange: e => { to = e.target.value; render(); } });
  root.append(h('div', { class: 'filters no-print' },
    h('div', { class: 'seg' }, [['14', '2 weeks'], ['30', 'Month'], ['90', '3 months']].map(([n, l]) => h('button', { onclick: () => { from = addDays(today(), -(+n - 1)); to = today(); render(); } }, l))),
    h('label', { class: 'inline' }, 'From ', fi), h('label', { class: 'inline' }, 'to ', ti),
    h('label', { class: 'check inline' }, h('input', { type: 'checkbox', checked: withPhotos, onchange: e => { withPhotos = e.target.checked; render(); } }), 'Include photos'),
    h('button', { class: 'btn primary', onclick: () => print() }, 'Print / Save PDF')));
  const dates = range(from, to);
  const logged = dates.filter(d => SYMPTOMS.some(s => getCell(d, s.id) !== undefined));
  const paper = h('article', { class: 'paper' });
  root.append(paper);
  const name = profile('name');
  paper.append(h('header', { class: 'rep-head' },
    h('div', {}, h('div', { class: 'rep-kicker' }, 'Symptom summary'), h('h1', {}, name || 'Daily symptom log'), h('p', {}, `${fmtDateLong(from)} – ${fmtDateLong(to)} · ${logged.length} of ${dates.length} days logged`)),
    h('div', { class: 'rep-mark' }, '✿')));

  // meds
  const meds = medList();
  const medRows = meds.map(m => {
    const cur = doseFor(to, m.id).value;
    const ch = doseChanges(m.id, from, to);
    const missed = dates.filter(d => doseFor(d, m.id).value === 'Missed').length;
    return h('tr', {}, h('td', {}, h('b', {}, m.name), m.generic ? h('small', {}, ' ' + m.generic) : null),
      h('td', {}, m.kind === 'pack' ? (m.pack?.start ? `${m.pack.active}/${m.pack.inactive} cycle` : '—') : cur === undefined ? '—' : `${cur} ${m.unit}`),
      h('td', {}, ch.length ? ch.map(c => `${fmtDate(c.date)}: ${c.prev ?? 'start'} → ${c.value ?? 'stopped'}`).join('; ') : 'No changes'),
      h('td', {}, missed ? `${missed}` : '0'));
  });
  paper.append(h('section', {}, h('h2', {}, 'Medications'), h('table', { class: 'rep-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Medication'), h('th', {}, `Dose on ${fmtDate(to)}`), h('th', {}, 'Changes in period'), h('th', {}, 'Missed'))), h('tbody', {}, medRows))));

  // trend
  const tc = h('div', { class: 'rep-chart' });
  paper.append(h('section', {}, h('h2', {}, 'Trend'), tc));
  const markers = meds.flatMap(m => doseChanges(m.id, from, to).map(c => ({ date: c.date, label: `${m.name} ${c.value ?? 'stop'}` })));
  requestAnimationFrame(() => lineChart(tc, { dates, markers, height: 240, series: ['fatigue', 'brainfog', 'refreshed', 'rash', 'jointpain'].map(id => { const v = dates.map(d => typeof getCell(d, id) === 'number' ? getCell(d, id) : null); return { name: SYM[id].label, color: SERIES[id], values: v, smooth: rolling(v) }; }) }));

  // symptom table
  const body = [];
  for (const g of GROUPS) {
    const ss = SYMPTOMS.filter(s => s.g === g.id && !['note', 'photo'].includes(s.type));
    const rows = ss.map(s => {
      const vals = logged.map(d => getCell(d, s.id)).filter(v => v !== undefined);
      if (!vals.length) return null;
      let summary;
      if (s.type === 'scale') { const n = vals.filter(v => typeof v === 'number'); summary = [`avg ${round1(mean(n))}`, `max ${Math.max(...n)}`, `${n.filter(v => v >= 6).length} days ≥ 6`]; }
      else if (s.type === 'yesno') { const y = logged.filter(d => getCell(d, s.id) === true); summary = [`${y.length} of ${vals.length} days`, y.length ? y.slice(0, 8).map(fmtDate).join(', ') + (y.length > 8 ? '…' : '') : '', '']; }
      else if (s.type === 'choice') { const c = {}; vals.forEach(v => c[v] = (c[v] || 0) + 1); summary = [Object.entries(c).map(([k, n]) => `${k} ${n}`).join(' · '), '', '']; }
      else { const n = vals.map(Number); summary = [`avg ${round1(mean(n))}${s.unit ? ' ' + s.unit : ''}`, `range ${Math.min(...n)}–${Math.max(...n)}`, s.id === 'temp' ? `${n.filter(v => v >= 100.4).length} days ≥ 100.4°F` : '']; }
      return h('tr', { class: s.g === 'flags' && summary[0] && !summary[0].startsWith('0 ') ? 'hl' : '' }, h('td', {}, s.label), ...summary.map(x => h('td', {}, x)));
    }).filter(Boolean);
    if (rows.length) body.push(h('tr', { class: 'grp' }, h('td', { colspan: 4 }, `${g.glyph} ${g.name}`)), ...rows);
  }
  paper.append(h('section', {}, h('h2', {}, 'Symptoms'), body.length ? h('table', { class: 'rep-table' }, h('tbody', {}, body)) : h('p', { class: 'muted' }, 'Nothing logged in this period.')));

  // notes
  const notes = dates.map(d => [d, getCell(d, 'note')]).filter(([, n]) => n);
  if (notes.length) paper.append(h('section', {}, h('h2', {}, 'Notes'), h('ul', { class: 'rep-notes' }, notes.map(([d, n]) => h('li', {}, h('b', {}, fmtDate(d)), ' ', n)))));

  // labs
  const labs = labList().sort((a, b) => a.date < b.date ? 1 : -1);
  if (labs.length) paper.append(h('section', {}, h('h2', {}, 'Lab results'), h('table', { class: 'rep-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Test'), h('th', {}, 'Result'), h('th', {}, 'Range'))),
    h('tbody', {}, labs.slice(0, 40).map(l => h('tr', { class: labFlag(l) !== 'ok' ? 'hl' : '' }, h('td', {}, fmtDate(l.date)), h('td', {}, l.test), h('td', {}, `${l.value} ${l.unit || ''}${labFlag(l) === 'high' ? ' ↑' : labFlag(l) === 'low' ? ' ↓' : ''}`), h('td', {}, l.lo || l.hi ? `${l.lo ?? ''}–${l.hi ?? ''}` : '')))))));

  // photos
  if (withPhotos) {
    const ph = dates.flatMap(d => photosFor(d));
    if (ph.length) {
      const grid = h('div', { class: 'rep-photos' });
      paper.append(h('section', {}, h('h2', {}, 'Photos'), grid));
      ph.forEach(p => { const fig = h('figure', {}, h('div', { class: 'ph-load' }, '…'), h('figcaption', {}, `${fmtDate(p.date)} · ${p.tag}`)); grid.append(fig); loadPhoto(p.id).then(b => b && fig.firstChild.replaceWith(h('img', { src: URL.createObjectURL(b) }))); });
    }
  }
  paper.append(h('footer', { class: 'rep-foot' }, `Self-reported daily log. Scores are 0–10 (10 = worst, except “Woke refreshed” where 10 = best). Generated ${fmtDateLong(today())}.`));
}
