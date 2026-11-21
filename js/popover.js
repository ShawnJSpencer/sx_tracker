// Small anchored pop-ups: the 0–10 wheel, choices, numbers, notes, doses.
import { h, scoreColor, scoreInk, esc } from './util.js';

let pop = null, onClose = null;
export function closePop() {
  if (!pop) return;
  pop.classList.remove('show');
  const p = pop; setTimeout(() => p.remove(), 160);
  pop = null; const c = onClose; onClose = null; c && c();
}
document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('[data-keep-pop]')) closePop(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

export function openPop(anchor, content, { cls = '', close } = {}) {
  closePop();
  pop = h('div', { class: `pop ${cls}` }, content);
  document.body.append(pop);
  onClose = close || null;
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const vw = innerWidth, vh = innerHeight;
  let x = r.left + r.width / 2 - pw / 2;
  let y = r.bottom + 8;
  if (y + ph > vh - 8) y = r.top - ph - 8;
  if (y < 8) y = Math.max(8, Math.min(vh - ph - 8, r.top + r.height / 2 - ph / 2));
  x = Math.max(8, Math.min(vw - pw - 8, x));
  pop.style.left = x + 'px'; pop.style.top = y + 'px';
  requestAnimationFrame(() => pop && pop.classList.add('show'));
  return pop;
}

// 0 at 12 o'clock, then clockwise to 10.
export function wheel(anchor, { title, value, better, onPick }) {
  const size = 228, R = 86, c = size / 2;
  const wrap = h('div', { class: 'wheel', style: `width:${size}px;height:${size}px` });
  for (let i = 0; i <= 10; i++) {
    const a = (i / 11) * Math.PI * 2 - Math.PI / 2;
    const x = c + R * Math.cos(a), y = c + R * Math.sin(a);
    const b = h('button', {
      class: 'wheel-n' + (value === i ? ' on' : ''),
      style: `left:${x}px;top:${y}px;background:${scoreColor(i, better)};color:${scoreInk(i)}`,
      onclick: () => { onPick(i); closePop(); },
      'aria-label': `${title} ${i}`,
    }, String(i));
    wrap.append(b);
  }
  wrap.append(h('div', { class: 'wheel-mid' },
    h('div', { class: 'wheel-title' }, title),
    h('div', { class: 'wheel-sub' }, better === 'high' ? '0 none · 10 best' : '0 none · 10 worst'),
    value != null ? h('button', { class: 'wheel-clear', onclick: () => { onPick(null); closePop(); } }, 'Clear') : null));
  return openPop(anchor, wrap, { cls: 'pop-wheel' });
}

export function choices(anchor, { title, options, value, onPick, extra = [] }) {
  const box = h('div', { class: 'pop-box' }, h('div', { class: 'pop-title' }, title),
    h('div', { class: 'chips' }, options.map(o => h('button', { class: 'chip' + (String(value) === String(o) ? ' on' : ''), onclick: () => { onPick(o); closePop(); } }, String(o)))),
    extra.length ? h('div', { class: 'chips subtle' }, extra.map(([label, fn]) => h('button', { class: 'chip ghost', onclick: () => { fn(); closePop(); } }, label))) : null,
    value != null ? h('button', { class: 'link-btn', onclick: () => { onPick(null); closePop(); } }, 'Clear') : null);
  return openPop(anchor, box);
}

export function number(anchor, { title, value, unit, step = 1, min, max, presets = [], onPick }) {
  let v = value ?? presets[Math.floor(presets.length / 2)] ?? min ?? 0;
  const out = h('input', { class: 'num-in', type: 'number', inputmode: 'decimal', step, value: v });
  const fix = x => Math.round(x / step) * step;
  const bump = d => { v = fix((+out.value || 0) + d); if (min != null) v = Math.max(min, v); if (max != null) v = Math.min(max, v); out.value = +v.toFixed(2); };
  const box = h('div', { class: 'pop-box' }, h('div', { class: 'pop-title' }, title),
    h('div', { class: 'num-row' }, h('button', { class: 'round-btn', onclick: () => bump(-step) }, '−'), out, h('span', { class: 'unit' }, unit || ''), h('button', { class: 'round-btn', onclick: () => bump(step) }, '+')),
    presets.length ? h('div', { class: 'chips' }, presets.map(p => h('button', { class: 'chip', onclick: () => { onPick(p); closePop(); } }, String(p)))) : null,
    h('div', { class: 'pop-actions' },
      value != null ? h('button', { class: 'link-btn', onclick: () => { onPick(null); closePop(); } }, 'Clear') : h('span'),
      h('button', { class: 'btn primary', onclick: () => { const n = parseFloat(out.value); onPick(isNaN(n) ? null : n); closePop(); } }, 'Save')));
  const p = openPop(anchor, box);
  setTimeout(() => out.select(), 30);
  out.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('.btn.primary').click(); });
  return p;
}

export function note(anchor, { title, value, onPick }) {
  const ta = h('textarea', { class: 'note-in', rows: 5, placeholder: 'Anything worth remembering — triggers, foods, stress, what helped…' });
  ta.value = value || '';
  const box = h('div', { class: 'pop-box wide' }, h('div', { class: 'pop-title' }, title), ta,
    h('div', { class: 'pop-actions' },
      value ? h('button', { class: 'link-btn', onclick: () => { onPick(null); closePop(); } }, 'Delete') : h('span'),
      h('button', { class: 'btn primary', onclick: () => { onPick(ta.value.trim() || null); closePop(); } }, 'Save')));
  const p = openPop(anchor, box); setTimeout(() => ta.focus(), 30); return p;
}

export function menu(anchor, { title, items }) {
  const box = h('div', { class: 'pop-box' }, title ? h('div', { class: 'pop-title', html: esc(title) }) : null,
    h('div', { class: 'menu' }, items.map(([label, fn]) => h('button', { class: 'menu-item', onclick: () => { closePop(); fn(); } }, label))));
  return openPop(anchor, box);
}

// Full-screen sheet for larger content (photos, day summary).
export function sheet(title, content, { onClose: oc } = {}) {
  closePop();
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); oc && oc(); };
  const el = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === el) close(); } },
    h('div', { class: 'sheet' }, h('div', { class: 'sheet-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, '✕')), h('div', { class: 'sheet-body' }, content)));
  document.body.append(el); requestAnimationFrame(() => el.classList.add('show'));
  return { el, close };
}

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg); document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
