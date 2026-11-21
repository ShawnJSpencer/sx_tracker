// Lab results log with a trend line per test.
import { labList, upsertLab, deleteLab } from './store.js';
import { h, today, fmtDate, fmtDateLong, uid, esc } from './util.js';
import { spark } from './charts.js';
import { sheet } from './popover.js';

export const LAB_TESTS = [
  ['ANA titer', ''], ['ANA pattern', ''], ['Anti-dsDNA', 'IU/mL'], ['C3', 'mg/dL'], ['C4', 'mg/dL'], ['Urine protein/creatinine', 'mg/g'], ['Urinalysis', ''],
  ['CK', 'U/L'], ['Aldolase', 'U/L'], ['AST', 'U/L'], ['ALT', 'U/L'], ['TSH', 'mIU/L'], ['Free T4', 'ng/dL'], ['Free T4 (equilibrium dialysis)', 'ng/dL'], ['Free T3', 'pg/mL'], ['TBG', 'µg/mL'],
  ['Ferritin', 'ng/mL'], ['Iron saturation', '%'], ['Hemoglobin', 'g/dL'], ['WBC', 'K/µL'], ['Platelets', 'K/µL'], ['Creatinine', 'mg/dL'], ['ESR', 'mm/hr'], ['CRP', 'mg/dL'],
  ['Vitamin B12', 'pg/mL'], ['Methylmalonic acid', 'nmol/L'], ['Vitamin D', 'ng/mL'], ['Magnesium', 'mg/dL'], ['tTG-IgA', 'U/mL'], ['IgA', 'mg/dL'], ['AM cortisol', 'µg/dL'], ['Lamotrigine level', 'µg/mL'],
];

let root;
export function mountLabs(el) { root = el; render(); }
export function refreshLabs() { if (root && root.offsetParent) render(); }

let view = localStorage.getItem('sx_labview') || 'cards';
let query = '', onlyFlagged = false;
const flagText = f => f === 'high' ? 'High' : f === 'low' ? 'Low' : f === 'pos' ? 'Abnormal' : 'In range';
const flaggedFirst = (a, b, ta, tb) => ((labFlag(a) === 'ok') - (labFlag(b) === 'ok')) || ta.localeCompare(tb);

function render() {
  const all = labList();
  root.innerHTML = '';
  const seg = h('div', { class: 'seg' }, [['cards', 'Cards'], ['list', 'List']].map(([k, l]) => h('button', { class: k === view ? 'on' : '', onclick: () => { view = k; localStorage.setItem('sx_labview', k); render(); } }, l)));
  root.append(h('div', { class: 'filters' }, h('h2', { class: 'page-title' }, 'Lab results'), h('button', { class: 'btn primary', onclick: () => editLab() }, '＋ Add result')));
  if (!all.length) {
    root.append(h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, '⚗'), h('h3', {}, 'No results yet'), h('p', {}, 'Add results as they come back. Each test gets its own trend line, and results outside the reference range are highlighted.')));
    return;
  }
  const search = h('input', { class: 'in lab-search', type: 'search', placeholder: 'Search tests…', value: query });
  search.addEventListener('input', () => { query = search.value; body(); });
  const flagChip = h('button', { class: 'chip' + (onlyFlagged ? ' on' : ''), onclick: e => { onlyFlagged = !onlyFlagged; e.currentTarget.classList.toggle('on', onlyFlagged); body(); } }, 'Out of range only');
  const count = h('span', { class: 'muted small' });
  root.append(h('div', { class: 'filters lab-tools' }, seg, search, flagChip, count));
  const box = h('div'); root.append(box);
  const body = () => {
    const q = query.trim().toLowerCase();
    let labs = all.filter(l => !q || l.test.toLowerCase().includes(q) || (l.note || '').toLowerCase().includes(q));
    if (onlyFlagged) labs = labs.filter(l => labFlag(l) !== 'ok');
    labs.sort((a, b) => a.date < b.date ? 1 : -1);
    count.textContent = `${new Set(labs.map(l => l.test)).size} tests · ${labs.length} results`;
    box.innerHTML = '';
    if (!labs.length) { box.append(h('p', { class: 'muted' }, 'No results match.')); return; }
    view === 'list' ? listView(box, labs, all) : cardView(box, labs);
  };
  body();
}

function cardView(box, labs) {
  const byTest = {};
  labs.forEach(l => (byTest[l.test] ||= []).push(l));
  const grid = h('div', { class: 'lab-grid' });
  for (const [test, rows] of Object.entries(byTest).sort((a, b) => flaggedFirst(a[1][0], b[1][0], a[0], b[0]))) {
    const latest = rows[0];
    const nums = rows.filter(r => !isNaN(parseFloat(r.value))).map(r => ({ v: parseFloat(r.value), d: r.date })).reverse();
    const flag = labFlag(latest);
    const sp = h('div', { class: 'lab-spark' });
    const card = h('section', { class: 'card lab-card' },
      h('header', {}, h('h3', {}, test), h('span', { class: 'flag ' + flag }, flagText(flag))),
      h('div', { class: 'lab-latest' }, h('b', {}, latest.value), ' ', latest.unit || '', h('small', {}, ` · ${fmtDate(latest.date)}`)),
      latest.lo || latest.hi ? h('div', { class: 'muted small' }, `Range ${rangeTxt(latest)} ${latest.unit || ''}`) : null,
      nums.length > 1 ? sp : null,
      h('ul', { class: 'lab-hist' }, rows.map(r => h('li', { onclick: () => editLab(r) }, h('span', {}, fmtDate(r.date)), h('b', { class: labFlag(r) }, `${r.value} ${r.unit || ''}`), r.note ? h('em', {}, r.note) : null))));
    grid.append(card);
    if (nums.length > 1) requestAnimationFrame(() => spark(sp, nums, { lo: num(latest.lo), hi: num(latest.hi) }));
  }
  box.append(grid);
}

// Report-style table, grouped by date, with the previous result for comparison.
function listView(box, labs, all) {
  const byDate = {};
  labs.forEach(l => (byDate[l.date] ||= []).push(l));
  const prevOf = l => all.filter(x => x.test === l.test && x.date < l.date).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  const rows = [];
  for (const d of Object.keys(byDate).sort().reverse()) {
    const items = byDate[d].sort((a, b) => flaggedFirst(a, b, a.test, b.test));
    const nf = items.filter(l => labFlag(l) !== 'ok').length;
    rows.push(h('tr', { class: 'grp' }, h('td', { colspan: 5 }, fmtDateLong(d), h('span', { class: 'grp-meta' }, `${items.length} result${items.length === 1 ? '' : 's'}${nf ? ` · ${nf} out of range` : ''}`))));
    for (const l of items) {
      const f = labFlag(l), p = prevOf(l);
      let prev = '';
      if (p) {
        const a = parseFloat(p.value), b = parseFloat(l.value);
        const arrow = !isNaN(a) && !isNaN(b) ? (b > a ? ' ▲' : b < a ? ' ▼' : ' =') : '';
        prev = `${p.value} (${fmtDate(p.date)})${arrow}`;
      }
      rows.push(h('tr', { class: f !== 'ok' ? 'hl' : '', onclick: () => editLab(l) },
        h('td', {}, l.test),
        h('td', { class: 'res' }, h('b', { class: f }, l.value), l.unit ? h('span', { class: 'u' }, ' ' + l.unit) : null, f !== 'ok' ? h('span', { class: 'flag ' + f }, flagText(f)) : null),
        h('td', { class: 'muted' }, rangeTxt(l)),
        h('td', { class: 'muted' }, prev),
        h('td', { class: 'muted note' }, l.note || '')));
    }
  }
  box.append(h('div', { class: 'paper lab-paper' }, h('table', { class: 'rep-table lab-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, 'Result'), h('th', {}, 'Range'), h('th', {}, 'Previous'), h('th', {}, 'Note'))),
    h('tbody', {}, rows))));
}
export const rangeTxt = l => l.lo && l.hi ? `${l.lo}–${l.hi}` : l.hi ? `< ${l.hi}` : l.lo ? `> ${l.lo}` : '';
const num = v => v === '' || v == null || isNaN(parseFloat(v)) ? null : parseFloat(v);
export function labFlag(l) {
  if (l.abnormal) return 'pos';
  const v = parseFloat(l.value); if (isNaN(v)) return 'ok';
  if (num(l.hi) != null && v > num(l.hi)) return 'high';
  if (num(l.lo) != null && v < num(l.lo)) return 'low';
  return 'ok';
}

function editLab(l = {}) {
  const f = { date: l.date || today(), test: l.test || '', value: l.value ?? '', unit: l.unit || '', lo: l.lo ?? '', hi: l.hi ?? '', note: l.note || '', abnormal: !!l.abnormal };
  const dl = h('datalist', { id: 'labtests' }, LAB_TESTS.map(([t]) => h('option', { value: t })));
  const inp = (k, attrs = {}) => { const i = h('input', { class: 'in', value: f[k], ...attrs }); i.addEventListener('input', () => { f[k] = i.value; if (k === 'test') { const m = LAB_TESTS.find(([t]) => t === i.value); if (m && !f.unit) { f.unit = m[1]; form.querySelector('[data-k=unit]').value = m[1]; } } }); i.dataset.k = k; return i; };
  const ab = h('input', { type: 'checkbox', checked: f.abnormal, onchange: e => f.abnormal = e.target.checked });
  const form = h('div', { class: 'form' }, dl,
    h('label', {}, 'Test', inp('test', { list: 'labtests', placeholder: 'e.g. Anti-dsDNA' })),
    h('div', { class: 'row3' }, h('label', {}, 'Date', inp('date', { type: 'date' })), h('label', {}, 'Result', inp('value', { placeholder: '1:80, 0.92, Negative…' })), h('label', {}, 'Unit', inp('unit'))),
    h('div', { class: 'row3' }, h('label', {}, 'Range low', inp('lo', { inputmode: 'decimal' })), h('label', {}, 'Range high', inp('hi', { inputmode: 'decimal' })), h('label', { class: 'check' }, ab, 'Flag as abnormal')),
    h('label', {}, 'Note', inp('note', { placeholder: 'Pattern, lab, who ordered it…' })),
    h('div', { class: 'pop-actions' },
      l.id ? h('button', { class: 'link-btn danger', onclick: () => { if (confirm('Delete this result?')) { deleteLab(l.id); s.close(); render(); } } }, 'Delete') : h('span'),
      h('button', { class: 'btn primary', onclick: () => { if (!f.test || f.value === '') return alert('Test and result are required.'); upsertLab({ ...f, id: l.id || uid() }); s.close(); render(); } }, 'Save')));
  const s = sheet(l.id ? 'Edit result' : 'Add lab result', form);
}
