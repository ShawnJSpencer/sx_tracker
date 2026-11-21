// Lab results log with a trend line per test.
import { labList, upsertLab, deleteLab } from './store.js';
import { h, today, fmtDate, uid, esc } from './util.js';
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

function render() {
  const labs = labList().sort((a, b) => a.date < b.date ? 1 : -1);
  const byTest = {};
  labs.forEach(l => (byTest[l.test] ||= []).push(l));
  root.innerHTML = '';
  root.append(h('div', { class: 'filters' }, h('h2', { class: 'page-title' }, 'Lab results'), h('button', { class: 'btn primary', onclick: () => editLab() }, '＋ Add result')));
  if (!labs.length) {
    root.append(h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, '⚗'), h('h3', {}, 'No results yet'), h('p', {}, 'Add results as they come back. Each test gets its own trend line, and results outside the reference range are highlighted.')));
    return;
  }
  const grid = h('div', { class: 'lab-grid' });
  for (const [test, rows] of Object.entries(byTest).sort()) {
    const latest = rows[0];
    const nums = rows.filter(r => !isNaN(parseFloat(r.value))).map(r => ({ v: parseFloat(r.value), d: r.date })).reverse();
    const flag = labFlag(latest);
    const sp = h('div', { class: 'lab-spark' });
    const card = h('section', { class: 'card lab-card' },
      h('header', {}, h('h3', {}, test), h('span', { class: 'flag ' + flag }, flag === 'high' ? 'High' : flag === 'low' ? 'Low' : flag === 'pos' ? 'Abnormal' : 'In range')),
      h('div', { class: 'lab-latest' }, h('b', {}, latest.value), ' ', latest.unit || '', h('small', {}, ` · ${fmtDate(latest.date)}`)),
      latest.lo || latest.hi ? h('div', { class: 'muted small' }, `Range ${latest.lo ?? ''}–${latest.hi ?? ''} ${latest.unit || ''}`) : null,
      nums.length > 1 ? sp : null,
      h('ul', { class: 'lab-hist' }, rows.map(r => h('li', { onclick: () => editLab(r) }, h('span', {}, fmtDate(r.date)), h('b', { class: labFlag(r) }, `${r.value} ${r.unit || ''}`), r.note ? h('em', {}, r.note) : null))));
    grid.append(card);
    if (nums.length > 1) requestAnimationFrame(() => spark(sp, nums, { lo: num(latest.lo), hi: num(latest.hi) }));
  }
  root.append(grid);
}
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
