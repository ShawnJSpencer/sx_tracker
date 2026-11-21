const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const range = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
export const now = () => Date.now();
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const monShort = s => MON[parse(s).getMonth()];
export const wdShort = s => WD[parse(s).getDay()];
export const fmtDate = s => { const d = parse(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };
export const fmtDateLong = s => { const d = parse(s); return `${WD[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
export const WEEKDAYS = WD;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
}

export const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
export const round1 = x => x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1);
export function pearson(xs, ys) {
  const n = xs.length; if (n < 4) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// Colour for a 0–10 score: blush ramp for "worse", sage ramp for "better".
const ROSE = ['#FBEFF2', '#F6DDE4', '#F0C6D2', '#E8AABD', '#DE8CA5', '#D2708F', '#C4587C', '#B2456C', '#9C385D', '#842D4F', '#6C2542'];
const SAGE = ['#EEF5F0', '#E0EDE4', '#CFE3D5', '#BAD7C3', '#A3C9B0', '#8ABA9B', '#72AA87', '#5C9874', '#4A8463', '#3B6F53', '#2E5B44'];
export function scoreColor(v, better) { const r = better === 'high' ? SAGE : ROSE; return r[Math.max(0, Math.min(10, Math.round(v)))]; }
export const scoreInk = v => v >= 6 ? '#fff' : '#3a2f33';
