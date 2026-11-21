// Hand-rolled SVG charts with touch-friendly tooltips (no external libraries,
// so everything works offline).
import { h, esc, fmtDate, scoreColor, round1, WEEKDAYS, parse } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); kids.flat().forEach(k => k && el.append(k)); return el; };
const INK = '#3a2f33', MUTED = '#8c7f82', GRID = '#eee5e2', AXIS = '#d9cdca';

let tip;
function showTip(html, x, y) {
  if (!tip) { tip = h('div', { class: 'tip' }); document.body.append(tip); }
  tip.innerHTML = html; tip.classList.add('show');
  const w = tip.offsetWidth, hgt = tip.offsetHeight;
  let left = x + 14, top = y - hgt - 12;
  if (left + w > innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
export function hideTip() { tip && tip.classList.remove('show'); }
document.addEventListener('scroll', hideTip, true);

function frame(el, height, pad) {
  el.innerHTML = '';
  const W = Math.max(280, el.clientWidth || 600);
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, width: '100%', height, class: 'chart-svg', role: 'img' });
  el.append(svg);
  return { svg, W, H: height, x0: pad.l, x1: W - pad.r, y0: height - pad.b, y1: pad.t };
}
function niceTicks(max, n = 5) {
  if (max <= 0) return [0];
  const raw = max / n, mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw);
  const out = []; for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
}
function yAxis(svg, f, ticks, ymin, ymax, fmt = v => v) {
  const y = v => f.y0 - (v - ymin) / (ymax - ymin || 1) * (f.y0 - f.y1);
  for (const t of ticks) {
    svg.append(s('line', { x1: f.x0, x2: f.x1, y1: y(t), y2: y(t), stroke: GRID, 'stroke-width': 1 }));
    svg.append(s('text', { x: f.x0 - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'ax' }, document.createTextNode(fmt(t))));
  }
  return y;
}
function dateAxis(svg, f, dates, x) {
  const n = dates.length; const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((f.x1 - f.x0) / 70))));
  svg.append(s('line', { x1: f.x0, x2: f.x1, y1: f.y0, y2: f.y0, stroke: AXIS }));
  dates.forEach((d, i) => { if (i % every) return; svg.append(s('text', { x: x(i), y: f.y0 + 18, 'text-anchor': 'middle', class: 'ax' }, document.createTextNode(fmtDate(d)))); });
}
function legend(el, items, onToggle) {
  const lg = h('div', { class: 'legend' });
  for (const it of items) {
    const b = h('button', { class: 'lg' + (it.off ? ' off' : ''), onclick: onToggle ? () => onToggle(it) : null }, h('i', { style: `background:${it.color}` }), it.name);
    lg.append(b);
  }
  el.append(lg);
}
function pointerTracker(svg, f, onMove) {
  const hit = s('rect', { x: f.x0, y: f.y1, width: f.x1 - f.x0, height: f.y0 - f.y1, fill: 'transparent', style: 'touch-action: pan-y' });
  svg.append(hit);
  const move = e => { const r = svg.getBoundingClientRect(); const k = r.width / svg.viewBox.baseVal.width; onMove((e.clientX - r.left) / k, e); };
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { onMove(null); hideTip(); });
}

// ---------- multi-series line (daily dots + rolling average) ----------
export function lineChart(el, { dates, series, ymin = 0, ymax = 10, markers = [], bands = [], height = 300, unit = '' }) {
  const state = { off: new Set(series.filter(x => x.hidden).map(x => x.name)) };
  const draw = () => {
    el.innerHTML = '';
    const box = h('div'); el.append(box);
    const f = frame(box, height, { l: 36, r: 16, t: 26, b: 30 });
    const { svg } = f; const n = dates.length;
    const x = i => n <= 1 ? (f.x0 + f.x1) / 2 : f.x0 + i / (n - 1) * (f.x1 - f.x0);
    const y = yAxis(svg, f, niceTicks(ymax - ymin, 5).map(t => t + ymin), ymin, ymax, v => v + unit);
    for (const b of bands) {
      const i0 = dates.indexOf(b.from), i1 = dates.indexOf(b.to);
      if (i0 < 0 || i1 < 0) continue;
      svg.append(s('rect', { x: x(i0) - 2, y: f.y1, width: Math.max(4, x(i1) - x(i0) + 4), height: f.y0 - f.y1, fill: b.color || '#f4ecf0', opacity: 0.55 }));
    }
    dateAxis(svg, f, dates, x);
    markers.forEach((m, k) => {
      const i = dates.indexOf(m.date); if (i < 0) return;
      svg.append(s('line', { x1: x(i), x2: x(i), y1: f.y1 - 6, y2: f.y0, stroke: '#b9a0aa', 'stroke-dasharray': '3 4', 'stroke-width': 1.5 }));
      svg.append(s('text', { x: x(i) + 4, y: f.y1 - 10 + (k % 2) * 12, class: 'mk' }, document.createTextNode(m.label)));
    });
    const vis = series.filter(sr => !state.off.has(sr.name));
    for (const sr of vis) {
      sr.values.forEach((v, i) => { if (v != null) svg.append(s('circle', { cx: x(i), cy: y(v), r: n > 120 ? 1.6 : 2.6, fill: sr.color, opacity: 0.28 })); });
      const sm = sr.smooth || sr.values;
      let d = '', pen = false;
      sm.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      svg.append(s('path', { d, fill: 'none', stroke: sr.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
    const cross = s('line', { y1: f.y1, y2: f.y0, stroke: INK, 'stroke-opacity': 0.25, visibility: 'hidden' });
    svg.append(cross);
    pointerTracker(svg, f, (px, e) => {
      if (px == null) return cross.setAttribute('visibility', 'hidden');
      const i = Math.max(0, Math.min(n - 1, Math.round((px - f.x0) / (f.x1 - f.x0) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      const rows = vis.map(sr => `<div class="tr"><i style="background:${sr.color}"></i>${esc(sr.name)}<b>${sr.values[i] ?? '–'}${sr.values[i] != null ? unit : ''}</b><span>${sr.smooth ? 'avg ' + round1(sr.smooth[i]) : ''}</span></div>`).join('');
      const mk = markers.filter(m => m.date === dates[i]).map(m => `<div class="tmk">${esc(m.label)}</div>`).join('');
      showTip(`<div class="th">${fmtDate(dates[i])}</div>${rows}${mk}`, e.clientX, e.clientY);
    });
    if (series.length > 1) legend(el, series.map(sr => ({ name: sr.name, color: sr.color, off: state.off.has(sr.name) })), it => { state.off.has(it.name) ? state.off.delete(it.name) : state.off.add(it.name); draw(); });
  };
  draw();
}

// ---------- medication dose step lines (small multiples, own scale each) ----------
export function doseSteps(el, { dates, meds }) {
  el.innerHTML = '';
  for (const m of meds) {
    const row = h('div', { class: 'dose-row' }, h('div', { class: 'dose-label' }, m.name, h('small', {}, m.sub || '')));
    const box = h('div', { class: 'dose-plot' }); row.append(box); el.append(row);
    const f = frame(box, 64, { l: 8, r: 8, t: 10, b: 8 });
    const n = dates.length, x = i => f.x0 + i / Math.max(1, n - 1) * (f.x1 - f.x0);
    const nums = m.values.filter(v => typeof v === 'number'); const mx = Math.max(1, ...nums);
    const y = v => f.y0 - (v / mx) * (f.y0 - f.y1);
    if (m.pack) {
      const w = (f.x1 - f.x0) / Math.max(1, n - 1);
      m.values.forEach((v, i) => { if (v) f.svg.append(s('rect', { x: x(i) - w / 2, y: f.y1 + 8, width: Math.max(1, w - 1), height: f.y0 - f.y1 - 16, rx: 2, fill: v === 'Active' ? '#D2709A' : v === 'Placebo' ? '#f2dbe3' : '#ccc' })); });
    } else {
      let d = '', pen = false;
      m.values.forEach((v, i) => { const ok = typeof v === 'number'; if (!ok) { pen = false; return; } d += pen ? `H${x(i)}V${y(v)}` : `M${x(i)},${y(v)}`; pen = true; });
      f.svg.append(s('path', { d, fill: 'none', stroke: '#4A72C8', 'stroke-width': 2.2 }));
      m.values.forEach((v, i) => { if (typeof v === 'number' && v !== m.values[i - 1]) f.svg.append(s('text', { x: x(i) + 3, y: y(v) - 4, class: 'mk' }, document.createTextNode(v + (m.unit || '')))); });
    }
    pointerTracker(f.svg, f, (px, e) => { if (px == null) return; const i = Math.max(0, Math.min(n - 1, Math.round((px - f.x0) / (f.x1 - f.x0) * (n - 1)))); const v = m.values[i]; showTip(`<div class="th">${fmtDate(dates[i])}</div><div class="tr">${esc(m.name)}<b>${v ?? '–'}${typeof v === 'number' ? ' ' + (m.unit || '') : ''}</b></div>`, e.clientX, e.clientY); });
  }
}

// ---------- calendar heatmap ----------
export function calendar(el, { dates, values, better, label, max = 10, isBool }) {
  el.innerHTML = '';
  if (!dates.length) return;
  const startDow = parse(dates[0]).getDay();
  const weeks = Math.ceil((dates.length + startDow) / 7);
  const cell = Math.max(10, Math.min(20, Math.floor(((el.clientWidth || 600) - 40) / weeks) - 3));
  const W = 34 + weeks * (cell + 3), H = 20 + 7 * (cell + 3);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg' });
  ['M', 'W', 'F'].forEach((t, k) => svg.append(s('text', { x: 0, y: 20 + (1 + k * 2) * (cell + 3) + cell - 3, class: 'ax' }, document.createTextNode(t))));
  let lastMon = -1, lastX = -99;
  dates.forEach((d, i) => {
    const k = i + startDow, wk = Math.floor(k / 7), dow = k % 7;
    const X = 34 + wk * (cell + 3), Y = 20 + dow * (cell + 3);
    const dt = parse(d);
    if (dt.getMonth() !== lastMon && dow <= 1 && X - lastX > 3 * (cell + 3)) { lastMon = dt.getMonth(); lastX = X; svg.append(s('text', { x: X, y: 12, class: 'ax' }, document.createTextNode(dt.toLocaleString('en', { month: 'short' })))); }
    const v = values[d];
    const fill = v == null ? '#f3eeec' : isBool ? (v ? '#C4587C' : '#e6dcd9') : scoreColor(v / max * 10, better);
    const r = s('rect', { x: X, y: Y, width: cell, height: cell, rx: 3, fill });
    r.addEventListener('pointerenter', e => showTip(`<div class="th">${fmtDate(d)}</div><div class="tr">${esc(label)}<b>${v == null ? 'not logged' : isBool ? (v ? 'Yes' : 'No') : v}</b></div>`, e.clientX, e.clientY));
    r.addEventListener('pointerdown', e => showTip(`<div class="th">${fmtDate(d)}</div><div class="tr">${esc(label)}<b>${v == null ? 'not logged' : isBool ? (v ? 'Yes' : 'No') : v}</b></div>`, e.clientX, e.clientY));
    r.addEventListener('pointerleave', hideTip);
    svg.append(r);
  });
  el.append(h('div', { class: 'cal-scroll' }, svg));
  const scale = h('div', { class: 'cal-scale' }, h('span', {}, isBool ? 'No' : 'Low'));
  (isBool ? ['#e6dcd9', '#C4587C'] : [0, 2, 4, 6, 8, 10].map(v => scoreColor(v, better))).forEach(c => scale.append(h('i', { style: `background:${c}` })));
  scale.append(h('span', {}, isBool ? 'Yes' : 'High'), h('span', { class: 'gap' }), h('i', { style: 'background:#f3eeec' }), h('span', {}, 'not logged'));
  el.append(scale);
}

// ---------- horizontal bars (share of days) ----------
export function hbars(el, items, { color = '#C4587C', fmt = v => Math.round(v * 100) + '%' } = {}) {
  el.innerHTML = '';
  const max = Math.max(0.0001, ...items.map(i => i.value));
  for (const it of items) {
    const row = h('div', { class: 'hb' }, h('div', { class: 'hb-l' }, it.label),
      h('div', { class: 'hb-t' }, h('div', { class: 'hb-b', style: `width:${it.value / max * 100}%;background:${it.color || color}` })),
      h('div', { class: 'hb-v' }, fmt(it.value), h('small', {}, it.note || '')));
    row.addEventListener('pointerdown', e => it.tip && showTip(it.tip, e.clientX, e.clientY));
    el.append(row);
  }
}

// ---------- grouped vertical bars ----------
export function groupedBars(el, { groups, series, ymax = 10, height = 220, unit = '' }) {
  el.innerHTML = '';
  const box = h('div'); el.append(box);
  const f = frame(box, height, { l: 32, r: 10, t: 14, b: 28 });
  const y = yAxis(f.svg, f, niceTicks(ymax, 4), 0, ymax);
  const gw = (f.x1 - f.x0) / groups.length, bw = Math.min(26, (gw - 14) / series.length - 2);
  groups.forEach((g, gi) => {
    const gx = f.x0 + gi * gw + (gw - series.length * (bw + 2)) / 2;
    f.svg.append(s('text', { x: f.x0 + gi * gw + gw / 2, y: f.y0 + 18, 'text-anchor': 'middle', class: 'ax' }, document.createTextNode(g)));
    series.forEach((sr, si) => {
      const v = sr.values[gi]; if (v == null) return;
      const X = gx + si * (bw + 2), top = y(v), hgt = Math.max(1, f.y0 - top);
      const p = s('path', { d: `M${X},${f.y0}V${top + 4}q0,-4 4,-4h${bw - 8}q4,0 4,4V${f.y0}Z`, fill: sr.color });
      if (hgt < 5) p.setAttribute('d', `M${X},${f.y0}V${top}h${bw}V${f.y0}Z`);
      const tipHtml = `<div class="th">${esc(g)}</div><div class="tr"><i style="background:${sr.color}"></i>${esc(sr.name)}<b>${round1(v)}${unit}</b><span>${sr.n ? 'n=' + sr.n[gi] : ''}</span></div>`;
      p.addEventListener('pointerenter', e => showTip(tipHtml, e.clientX, e.clientY)); p.addEventListener('pointerdown', e => showTip(tipHtml, e.clientX, e.clientY)); p.addEventListener('pointerleave', hideTip);
      f.svg.append(p);
    });
  });
  if (series.length > 1) legend(el, series);
}

// ---------- scatter with trend line ----------
export function scatter(el, { points, xLabel, yLabel, xmax = 10, ymax = 10, color = '#4A72C8' }) {
  el.innerHTML = '';
  const box = h('div'); el.append(box);
  const f = frame(box, 260, { l: 36, r: 14, t: 14, b: 40 });
  const y = yAxis(f.svg, f, niceTicks(ymax, 5), 0, ymax);
  const x = v => f.x0 + v / xmax * (f.x1 - f.x0);
  niceTicks(xmax, 5).forEach(t => f.svg.append(s('text', { x: x(t), y: f.y0 + 18, 'text-anchor': 'middle', class: 'ax' }, document.createTextNode(t))));
  f.svg.append(s('text', { x: (f.x0 + f.x1) / 2, y: f.y0 + 34, 'text-anchor': 'middle', class: 'ax-t' }, document.createTextNode(xLabel)));
  f.svg.append(s('text', { x: 10, y: f.y1 + 4, class: 'ax-t', transform: `rotate(-90 10 ${f.y1 + 4})`, 'text-anchor': 'end' }, document.createTextNode(yLabel)));
  // jitter identical points a little so stacks are visible
  const seen = {};
  for (const p of points) {
    const key = p.x + ',' + p.y; const k = (seen[key] = (seen[key] || 0) + 1) - 1;
    const a = k * 2.4, rr = k ? 3 + k * 0.8 : 0;
    const c = s('circle', { cx: x(p.x) + Math.cos(a) * rr, cy: y(p.y) + Math.sin(a) * rr, r: 4.5, fill: color, 'fill-opacity': 0.55, stroke: '#fff', 'stroke-width': 1.5 });
    const t = `<div class="th">${fmtDate(p.date)}</div><div class="tr">${esc(xLabel)}<b>${p.x}</b></div><div class="tr">${esc(yLabel)}<b>${p.y}</b></div>`;
    c.addEventListener('pointerenter', e => showTip(t, e.clientX, e.clientY)); c.addEventListener('pointerdown', e => showTip(t, e.clientX, e.clientY)); c.addEventListener('pointerleave', hideTip);
    f.svg.append(c);
  }
  if (points.length >= 4) {
    const n = points.length, mx = points.reduce((a, p) => a + p.x, 0) / n, my = points.reduce((a, p) => a + p.y, 0) / n;
    const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0); if (sxx) {
      const b = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx, a0 = my - b * mx;
      const clampY = v => Math.max(0, Math.min(ymax, v));
      f.svg.append(s('line', { x1: x(0), y1: y(clampY(a0)), x2: x(xmax), y2: y(clampY(a0 + b * xmax)), stroke: INK, 'stroke-opacity': 0.55, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }));
    }
  }
}

// ---------- correlation matrix (diverging: blue ← neutral → terracotta) ----------
export function matrix(el, { labels, m, n }) {
  el.innerHTML = '';
  const k = labels.length, lw = 110, cs = Math.max(26, Math.min(44, Math.floor(((el.clientWidth || 600) - lw - 10) / k)));
  const W = lw + k * cs + 4, H = lw * 0.0 + 70 + k * cs;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg' });
  const col = r => {
    if (r == null) return '#f3eeec';
    const t = Math.min(1, Math.abs(r)); const [a, b] = r >= 0 ? [[239, 234, 228], [208, 106, 62]] : [[239, 234, 228], [74, 114, 200]];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
  };
  labels.forEach((l, i) => {
    svg.append(s('text', { x: lw - 8, y: 70 + i * cs + cs / 2 + 4, 'text-anchor': 'end', class: 'ax' }, document.createTextNode(l)));
    svg.append(s('text', { x: lw + i * cs + cs / 2, y: 62, class: 'ax', transform: `rotate(-40 ${lw + i * cs + cs / 2} 62)` }, document.createTextNode(l)));
  });
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const r = m[i][j];
    const rect = s('rect', { x: lw + j * cs + 1, y: 70 + i * cs + 1, width: cs - 2, height: cs - 2, rx: 4, fill: i === j ? '#f7f2ef' : col(r) });
    if (i !== j && r != null && cs >= 30) svg.append(rect, s('text', { x: lw + j * cs + cs / 2, y: 70 + i * cs + cs / 2 + 4, 'text-anchor': 'middle', class: 'mx', fill: Math.abs(r) > 0.6 ? '#fff' : INK }, document.createTextNode(r.toFixed(1).replace('0.', '.'))));
    else svg.append(rect);
    if (i !== j) {
      const t = `<div class="th">${esc(labels[i])} × ${esc(labels[j])}</div><div class="tr">correlation<b>${r == null ? 'not enough data' : r.toFixed(2)}</b><span>${n[i][j]} days</span></div>`;
      rect.addEventListener('pointerenter', e => showTip(t, e.clientX, e.clientY)); rect.addEventListener('pointerdown', e => showTip(t, e.clientX, e.clientY)); rect.addEventListener('pointerleave', hideTip);
    }
  }
  el.append(h('div', { class: 'cal-scroll' }, svg));
  el.append(h('div', { class: 'cal-scale' }, h('span', {}, 'move opposite'), ...[-1, -0.5, 0, 0.5, 1].map(r => h('i', { style: `background:${col(r)}` })), h('span', {}, 'move together')));
}

// ---------- before / after dumbbells ----------
export function dumbbell(el, rows, { max = 10 } = {}) {
  el.innerHTML = '';
  for (const r of rows) {
    const row = h('div', { class: 'db' }, h('div', { class: 'db-l' }, r.label, h('small', {}, r.sub || '')));
    const track = h('div', { class: 'db-t' });
    if (r.before != null && r.after != null) {
      const a = r.before / max * 100, b = r.after / max * 100;
      const better = r.betterHigh ? r.after > r.before : r.after < r.before;
      track.append(h('div', { class: 'db-line', style: `left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%` }),
        h('div', { class: 'db-dot before', style: `left:${a}%` }), h('div', { class: 'db-dot after ' + (Math.abs(b - a) < 0.3 ? 'same' : better ? 'good' : 'worse'), style: `left:${b}%` }));
    }
    row.append(track, h('div', { class: 'db-v' }, r.before == null || r.after == null ? 'not enough data' : `${round1(r.before)} → ${round1(r.after)}`));
    row.addEventListener('pointerdown', e => showTip(`<div class="th">${esc(r.label)}</div><div class="tr">14 days before<b>${round1(r.before)}</b><span>n=${r.nb}</span></div><div class="tr">14 days after<b>${round1(r.after)}</b><span>n=${r.na}</span></div>`, e.clientX, e.clientY));
    el.append(row);
  }
}

// ---------- sparkline for labs ----------
export function spark(el, pts, { lo, hi }) {
  el.innerHTML = '';
  const W = 140, H = 36, svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const vals = pts.map(p => p.v).concat([lo, hi].filter(v => v != null));
  const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1;
  const y = v => H - 4 - (v - mn) / span * (H - 8), x = i => 4 + i / Math.max(1, pts.length - 1) * (W - 8);
  if (lo != null && hi != null) svg.append(s('rect', { x: 0, y: y(hi), width: W, height: Math.max(1, y(lo) - y(hi)), fill: '#e7f1ea' }));
  svg.append(s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join(''), fill: 'none', stroke: '#4A72C8', 'stroke-width': 2 }));
  pts.forEach((p, i) => svg.append(s('circle', { cx: x(i), cy: y(p.v), r: 3, fill: (lo != null && p.v < lo) || (hi != null && p.v > hi) ? '#C4587C' : '#4A72C8' })));
  el.append(svg);
}
export { WEEKDAYS };
