// The day-by-day grid: dates across, symptoms frozen on the left, medications
// frozen across the top, and a "Today" beacon that points the way back.
import { GROUPS, SYMPTOMS, SYM } from './config.js';
import { state, getCell, setCell, medList, doseFor, explicitDose, setDose, datesWithData, photosFor, addPhotoMeta, photoSet, deletePhoto, upsertMed } from './store.js';
import { h, $, $$, today, addDays, range, wdShort, monShort, parse, fmtDate, fmtDateLong, diffDays, scoreColor, scoreInk, uid, esc } from './util.js';
import { wheel, choices, number, note, menu, sheet, toast, closePop } from './popover.js';
import { loadPhoto } from './sync.js';

let COL = 58;      // day column width (read from CSS after build)
let first, last, root, scroller, beaconL, beaconR;
const collapsed = new Set(JSON.parse(localStorage.getItem('sx_collapsed') || '[]'));
const hidden = () => new Set(JSON.parse(localStorage.getItem('sx_hidden') || '[]'));

export function mountLog(el) {
  root = el;
  const t = today();
  const data = datesWithData();
  first = data.length && data[0] < addDays(t, -42) ? data[0] : addDays(t, -42);
  last = addDays(t, 28);
  root.innerHTML = '';
  scroller = h('div', { class: 'grid-scroll', tabindex: 0 });
  beaconL = h('button', { class: 'beacon left', onclick: goToday });
  beaconR = h('button', { class: 'beacon right', onclick: goToday });
  root.append(h('div', { class: 'grid-wrap' }, scroller, beaconL, beaconR));
  build();
  requestAnimationFrame(onShowLog);
  let ticking = false;
  scroller.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { ticking = false; updateBeacons(); maybeExtend(); });
  }, { passive: true });
  addEventListener('resize', updateBeacons);
}

function build() {
  const days = range(first, last);
  const t = today();
  const hid = hidden();
  const table = h('table', { class: 'grid' });
  const thead = h('thead');

  // Row 1 — dates
  const dr = h('tr', { class: 'row-dates' }, h('th', { class: 'corner' },
    h('div', { class: 'corner-inner' }, h('span', { class: 'corner-title' }, 'Daily log'), h('button', { class: 'today-btn', onclick: () => goToday() }, 'Today'))));
  for (const d of days) {
    const dt = parse(d), dom = dt.getDate();
    const cls = ['dh', d === t ? 'is-today' : '', d > t ? 'future' : '', dt.getDay() === 0 ? 'week-start' : '', dom === 1 ? 'month-start' : ''].join(' ');
    dr.append(h('th', { class: cls, 'data-d': d, onclick: e => dayMenu(e.currentTarget, d) },
      (dom === 1 || d === first) ? h('span', { class: 'mon' }, monShort(d)) : null,
      h('span', { class: 'wd' }, wdShort(d)), h('span', { class: 'dom' }, dom),
      d === t ? h('span', { class: 'today-tag' }, 'Today') : null));
  }
  thead.append(dr);

  // Medication rows (frozen at top)
  const meds = medList();
  meds.forEach((m, i) => {
    const tr = h('tr', { class: 'row-med' + (i === meds.length - 1 ? ' last-med' : '') },
      h('th', { class: 'side med-name', onclick: e => medMenu(e.currentTarget, m) },
        h('span', { class: 'pill-dot' }), h('span', { class: 'mn' }, m.name), m.unit ? h('span', { class: 'mu' }, m.unit) : null));
    for (const d of days) tr.append(h('td', { class: medClass(d, t), 'data-d': d, 'data-m': m.id }));
    thead.append(tr);
  });
  table.append(thead);

  const tbody = h('tbody');
  for (const g of GROUPS) {
    const syms = SYMPTOMS.filter(s => s.g === g.id && !hid.has(s.id));
    if (!syms.length) continue;
    const isC = collapsed.has(g.id);
    tbody.append(h('tr', { class: 'row-group' + (isC ? ' collapsed' : ''), 'data-g': g.id },
      h('th', { class: 'side group-name', onclick: () => toggleGroup(g.id) },
        h('span', { class: 'glyph' }, g.glyph), h('span', {}, g.name), h('span', { class: 'chev' }, '›')),
      h('td', { class: 'group-fill', colspan: days.length })));
    for (const s of syms) {
      const tr = h('tr', { class: 'row-sym' + (isC ? ' hide' : ''), 'data-g': g.id },
        h('th', { class: 'side sym-name' + (s.urgent ? ' urgent' : '') }, h('span', { class: 'sn' }, s.label), s.sub ? h('span', { class: 'ss' }, s.sub) : null));
      for (const d of days) tr.append(h('td', { class: cellClass(s, d, t), 'data-d': d, 'data-s': s.id }));
      tbody.append(tr);
    }
  }
  table.append(tbody);
  scroller.innerHTML = ''; scroller.append(table);
  table.addEventListener('click', onCellClick);
  stickyTops(table);
  paintAll();
}

const medClass = (d, t) => ['mc', d === t ? 'is-today' : '', d > t ? 'future' : '', parse(d).getDay() === 0 ? 'week-start' : ''].join(' ');
const cellClass = (s, d, t) => ['c', `t-${s.type}`, d === t ? 'is-today' : '', d > t ? 'future' : '', parse(d).getDay() === 0 ? 'week-start' : ''].join(' ');

// Each header row sticks just below the one above it.
function stickyTops(table) {
  let top = 0;
  for (const tr of $$('thead tr', table)) { for (const th of tr.children) th.style.top = top + 'px'; top += tr.getBoundingClientRect().height || 34; }
  table.style.setProperty('--head-h', top + 'px');
}

function paintAll() {
  for (const td of $$('td.c', scroller)) paintCell(td);
  for (const td of $$('td.mc', scroller)) paintMed(td);
}
export function refresh(info = {}) {
  if (!scroller) return;
  if (info.all || (info.med && !info.date)) { const sl = scroller.scrollLeft, st = scroller.scrollTop; build(); scroller.scrollLeft = sl; scroller.scrollTop = st; return; }
  if (info.date && info.sym) { const td = scroller.querySelector(`td[data-d="${info.date}"][data-s="${info.sym}"]`); td && paintCell(td); }
  if (info.med) $$(`td[data-m="${info.med}"]`, scroller).forEach(paintMed);
}

function paintCell(td) {
  const s = SYM[td.dataset.s], d = td.dataset.d;
  const v = getCell(d, s.id);
  td.classList.remove('has-v', 'v-yes', 'v-no');
  let html = '';
  if (s.type === 'photo') {
    const n = photosFor(d).length;
    html = n ? `<span class="ph">◉${n > 1 ? `<sup>${n}</sup>` : ''}</span>` : '<span class="ph-add">+</span>';
    if (n) td.classList.add('has-v');
  } else if (v === undefined) {
    html = '';
  } else if (s.type === 'scale') {
    td.classList.add('has-v'); html = `<span class="sc" style="background:${scoreColor(v, s.better)};color:${scoreInk(v)}">${v}</span>`;
  } else if (s.type === 'yesno') {
    td.classList.add('has-v', v ? 'v-yes' : 'v-no');
    html = v ? `<span class="yes${s.neutral ? ' neutral' : ''}${s.urgent ? ' urgent' : ''}">●</span>` : '<span class="no">–</span>';
  } else if (s.type === 'choice') {
    td.classList.add('has-v'); const i = s.options.indexOf(v);
    html = `<span class="ch ch-${i}">${esc(s.short?.[i] ?? v)}</span>`;
  } else if (s.type === 'number') {
    td.classList.add('has-v'); html = `<span class="nm">${+(+v).toFixed(1)}</span>`;
  } else if (s.type === 'note') {
    td.classList.add('has-v'); html = '<span class="nt">✎</span>';
  }
  td.innerHTML = html;
}

function paintMed(td) {
  const d = td.dataset.d, m = state.meds[td.dataset.m];
  const { value, explicit, inherited } = doseFor(d, m.id);
  const prev = doseFor(addDays(d, -1), m.id).value;
  td.classList.toggle('explicit', !!explicit);
  td.classList.toggle('changed', value !== undefined && prev !== undefined && value !== prev && value !== 'Missed' && m.kind !== 'pack');
  td.classList.toggle('started', value !== undefined && prev === undefined && m.kind !== 'pack');
  let label = value === undefined ? '' : value;
  if (m.kind === 'pack') label = value === 'Active' ? '●' : value === 'Placebo' ? '○' : value === 'Missed' ? '✕' : value ?? '';
  else if (value === 'Missed') label = '✕';
  td.innerHTML = label === '' ? '' : `<span class="dose ${value === 'Placebo' ? 'placebo' : ''} ${value === 'Missed' ? 'missed' : ''}">${esc(label)}</span>`;
  td.title = value === undefined ? '' : `${m.name} ${value}${m.kind === 'mg' && typeof value === 'number' ? ' ' + m.unit : ''}${inherited ? '' : ' (set this day)'}`;
}

function onCellClick(e) {
  const td = e.target.closest('td'); if (!td) return;
  const d = td.dataset.d;
  if (td.dataset.m) return doseEditor(td, d, state.meds[td.dataset.m]);
  if (!td.dataset.s) return;
  const s = SYM[td.dataset.s];
  if (d > today()) return toast('That day hasn’t happened yet');
  const v = getCell(d, s.id);
  const title = `${s.label} · ${fmtDate(d)}`;
  switch (s.type) {
    case 'scale': return wheel(td, { title: s.label, value: v, better: s.better, onPick: x => setCell(d, s.id, x) });
    case 'yesno': { const nx = v === undefined ? true : v === true ? false : null; setCell(d, s.id, nx); td.classList.add('pulse'); setTimeout(() => td.classList.remove('pulse'), 300); return; }
    case 'choice': return choices(td, { title, options: s.options, value: v, onPick: x => setCell(d, s.id, x) });
    case 'number': return number(td, { title, value: v, unit: s.unit, step: s.step, min: s.min, max: s.max, presets: s.presets.length ? s.presets : lastNumbers(s.id, d), onPick: x => setCell(d, s.id, x) });
    case 'note': return note(td, { title: `Notes · ${fmtDate(d)}`, value: v, onPick: x => setCell(d, s.id, x) });
    case 'photo': return photoSheet(d);
  }
}
function lastNumbers(sym, d) { for (let i = 1; i < 60; i++) { const v = getCell(addDays(d, -i), sym); if (v !== undefined) return [v]; } return []; }

function doseEditor(td, d, m) {
  const cur = explicitDose(d, m.id);
  const { value } = doseFor(d, m.id);
  if (m.kind === 'pack') {
    return choices(td, {
      title: `${m.name} · ${fmtDate(d)}`, options: ['Active', 'Placebo', 'Missed', 'Off'], value: cur,
      onPick: x => setDose(d, m.id, x),
      extra: [['Start a new pack this day', () => upsertMed({ ...m, pack: { ...(m.pack || { active: 24, inactive: 4 }), start: d } })]],
    });
  }
  return choices(td, {
    title: `${m.name} (${m.unit}) · from ${fmtDate(d)}`, options: [...m.quick, 'Missed', 'Off'], value: cur ?? undefined,
    onPick: x => setDose(d, m.id, x),
    extra: [['Other dose…', () => number(td, { title: `${m.name} dose`, value: typeof value === 'number' ? value : undefined, unit: m.unit, step: 12.5, min: 0, presets: [], onPick: x => setDose(d, m.id, x) })]],
  });
}

function medMenu(el, m) {
  const items = [[`Edit ${m.name}…`, () => document.dispatchEvent(new CustomEvent('sx:settings', { detail: 'meds' }))]];
  if (m.kind === 'pack') items.unshift(['Pack started today', () => upsertMed({ ...m, pack: { ...(m.pack || { active: 24, inactive: 4 }), start: today() } })]);
  menu(el, { title: `${esc(m.name)}${m.generic ? ` <small>${esc(m.generic)}</small>` : ''}`, items });
}

function dayMenu(el, d) {
  if (d > today()) return menu(el, { title: fmtDateLong(d), items: [['Plan medication changes in the rows above', () => {}]] });
  menu(el, {
    title: fmtDateLong(d), items: [
      ['Mark all blank yes/no as “No”', () => { let n = 0; for (const s of SYMPTOMS) if (s.type === 'yesno' && !hidden().has(s.id) && getCell(d, s.id) === undefined) { setCell(d, s.id, false); n++; } toast(`${n} marked No`); }],
      ['Add photo', () => photoSheet(d)],
      ['Day summary', () => daySummary(d)],
    ],
  });
}

function toggleGroup(g) {
  collapsed.has(g) ? collapsed.delete(g) : collapsed.add(g);
  localStorage.setItem('sx_collapsed', JSON.stringify([...collapsed]));
  $$(`tr.row-sym[data-g="${g}"]`, scroller).forEach(tr => tr.classList.toggle('hide', collapsed.has(g)));
  scroller.querySelector(`tr.row-group[data-g="${g}"]`).classList.toggle('collapsed', collapsed.has(g));
}

// ---------- today beacon ----------
function measure() {
  const th = scroller?.querySelector('th.dh'); const w = th?.getBoundingClientRect().width;
  if (w) { COL = w; stickyTops(scroller.querySelector('table')); }
  return !!w;
}
let shownOnce = false;
export function onShowLog() { if (measure() && !shownOnce) { shownOnce = true; goToday(false); } updateBeacons(); }
function sideWidth() { return scroller.querySelector('th.corner')?.offsetWidth || 200; }
function todayX() { return diffDays(first, today()) * COL; }
export function goToday(smooth = true) {
  if (!scroller || !measure()) return;
  const view = scroller.clientWidth - sideWidth();
  const x = todayX() - view * 0.62 + COL / 2;
  scroller.scrollTo({ left: Math.max(0, x), behavior: smooth ? 'smooth' : 'auto' });
}
function updateBeacons() {
  if (!scroller.clientWidth) return;
  const x = todayX(), left = scroller.scrollLeft, view = scroller.clientWidth - sideWidth();
  const offL = x + COL < left + 4, offR = x > left + view - 4;
  const daysAway = offL ? Math.round((left - x) / COL) : offR ? Math.round((x - left - view) / COL) + 1 : 0;
  const ct = scroller.querySelector('.corner-title');
  if (ct) { const d = parse(addDays(first, Math.floor((left + view / 2) / COL))); ct.textContent = d.toLocaleString('en', { month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }); }
  beaconL.style.left = sideWidth() + 'px';
  beaconL.classList.toggle('show', offL); beaconR.classList.toggle('show', offR);
  beaconL.innerHTML = `<span class="arr">‹</span><span><b>Today</b><small>${daysAway} day${daysAway === 1 ? '' : 's'} back</small></span>`;
  beaconR.innerHTML = `<span><b>Today</b><small>${daysAway} day${daysAway === 1 ? '' : 's'} ahead</small></span><span class="arr">›</span>`;
}
function maybeExtend() {
  const sl = scroller.scrollLeft;
  if (sl < COL * 4) {
    first = addDays(first, -30); const st = scroller.scrollTop; build();
    scroller.scrollLeft = sl + 30 * COL; scroller.scrollTop = st;
  } else if (sl + scroller.clientWidth > scroller.scrollWidth - COL * 4) {
    last = addDays(last, 30); const st = scroller.scrollTop; build();
    scroller.scrollLeft = sl; scroller.scrollTop = st;
  }
}

// ---------- photos ----------
function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1400, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Could not read image')), 'image/jpeg', 0.78);
    };
    img.onerror = rej; img.src = url;
  });
}
export function photoSheet(d) {
  const grid = h('div', { class: 'photo-grid' });
  let tag = 'Face rash';
  const tags = h('div', { class: 'chips' }, ['Face rash', 'Other rash', 'Hair / part line', 'Other'].map(t => h('button', { class: 'chip' + (t === tag ? ' on' : ''), onclick: e => { tag = t; $$('.chip', tags).forEach(c => c.classList.toggle('on', c === e.currentTarget)); } }, t)));
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none', onchange: async () => {
    for (const f of input.files) { const blob = await compress(f); const id = uid(); await photoSet(id, blob); addPhotoMeta({ id, date: d, tag, takenAt: Date.now() }); }
    input.value = ''; render();
  } });
  const body = h('div', {}, h('p', { class: 'muted' }, 'Same spot, same light, every few days makes changes easy to see. Photos are encrypted before they sync.'),
    tags, h('button', { class: 'btn primary', onclick: () => input.click() }, '＋ Add photo'), input, grid);
  async function render() {
    grid.innerHTML = '';
    for (const p of photosFor(d)) {
      const fig = h('figure', {}, h('div', { class: 'ph-load' }, '…'), h('figcaption', {}, p.tag, h('button', { class: 'link-btn', onclick: () => { if (confirm('Delete this photo?')) { deletePhoto(p.id); render(); } } }, 'Delete')));
      grid.append(fig);
      loadPhoto(p.id).then(b => { if (b) fig.firstChild.replaceWith(h('img', { src: URL.createObjectURL(b), alt: p.tag })); else fig.firstChild.textContent = 'Not on this device yet'; });
    }
  }
  render();
  sheet(`Photos · ${fmtDateLong(d)}`, body);
}

export function daySummary(d) {
  const rows = [];
  for (const g of GROUPS) {
    const items = SYMPTOMS.filter(s => s.g === g.id && s.type !== 'photo').map(s => [s, getCell(d, s.id)]).filter(([, v]) => v !== undefined);
    if (!items.length) continue;
    rows.push(h('h4', {}, `${g.glyph} ${g.name}`));
    rows.push(h('ul', { class: 'sum-list' }, items.map(([s, v]) => h('li', {}, h('span', {}, s.label), h('b', {}, v === true ? 'Yes' : v === false ? 'No' : `${v}${s.unit ? ' ' + s.unit : ''}`)))));
  }
  const meds = medList().map(m => { const v = doseFor(d, m.id).value; return v === undefined ? null : `${m.name} ${v}${typeof v === 'number' ? ' ' + m.unit : ''}`; }).filter(Boolean);
  sheet(fmtDateLong(d), h('div', {}, meds.length ? h('p', { class: 'muted' }, 'Medications: ' + meds.join(' · ')) : null, rows.length ? rows : h('p', { class: 'muted' }, 'Nothing logged this day yet.')));
}
