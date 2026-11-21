// Local data store (IndexedDB) with per-cell timestamps so edits made on the
// iPad and the iPhone merge cleanly instead of overwriting each other.
import { DEFAULT_MEDS } from './config.js';
import { today, diffDays, now } from './util.js';

const DB = 'sx_tracker', VER = 1;
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('photos'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode); const s = tx.objectStore(store);
    const out = fn(s); tx.oncomplete = () => res(out instanceof IDBRequest ? out.result : out); tx.onerror = () => rej(tx.error);
  });
}
export const kvGet = k => idb('kv', 'readonly', s => s.get(k));
export const kvSet = (k, v) => idb('kv', 'readwrite', s => { s.put(v, k); });
export const kvDel = k => idb('kv', 'readwrite', s => { s.delete(k); });
export const photoGet = id => idb('photos', 'readonly', s => s.get(id));
export const photoSet = (id, blob) => idb('photos', 'readwrite', s => { s.put(blob, id); });

export function emptyState() {
  return { schema: 1, meds: {}, doses: {}, cells: {}, labs: {}, photos: {}, profile: {} };
}
export let state = emptyState();
const listeners = new Set();
export const onChange = fn => listeners.add(fn);
let saveTimer, dirty = false;
function changed(info) {
  dirty = true;
  invalidateDoseIndex();
  listeners.forEach(fn => fn(info));
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
}
export async function save() { clearTimeout(saveTimer); await kvSet('state', state); }
export const isDirty = () => dirty;
export const clearDirty = () => { dirty = false; };

export async function load() {
  const s = await kvGet('state');
  state = s ? { ...emptyState(), ...s } : emptyState();
  seedMeds();
  invalidateDoseIndex();
}
function seedMeds() {
  // ts = 1 so any real edit (on any device) wins a merge.
  for (const m of DEFAULT_MEDS) {
    if (state.meds[m.id]) continue;
    const { seed, ...rest } = m;
    state.meds[m.id] = { ...rest, ts: 1 };
    if (seed != null) (state.doses[today()] ||= {})[m.id] ??= [seed, 1];
  }
}
export function replaceState(s) { state = { ...emptyState(), ...s }; seedMeds(); changed({ all: true }); }

// ---------- cells ----------
export function getCell(date, sym) { const c = state.cells[date]?.[sym]; return c && c[0] != null ? c[0] : undefined; }
export function setCell(date, sym, value) {
  const day = (state.cells[date] ||= {});
  day[sym] = [value === '' || value == null ? null : value, now()];
  changed({ date, sym });
}
export function datesWithData() {
  const set = new Set();
  for (const [d, row] of Object.entries(state.cells)) if (Object.values(row).some(c => c[0] != null)) set.add(d);
  return [...set].sort();
}

// ---------- meds ----------
export const medList = (all = false) => Object.values(state.meds).filter(m => all || !m.archived).sort((a, b) => (a.order || 99) - (b.order || 99));
export function upsertMed(m) { state.meds[m.id] = { ...state.meds[m.id], ...m, ts: now() }; changed({ med: m.id }); }

let doseIdx = null;
function invalidateDoseIndex() { doseIdx = null; }
function buildDoseIndex() {
  doseIdx = {};
  for (const [date, row] of Object.entries(state.doses))
    for (const [mid, c] of Object.entries(row)) if (c[0] != null) (doseIdx[mid] ||= []).push([date, c[0]]);
  for (const k in doseIdx) doseIdx[k].sort((a, b) => a[0] < b[0] ? -1 : 1);
}
export function explicitDose(date, mid) { const c = state.doses[date]?.[mid]; return c && c[0] != null ? c[0] : undefined; }
// Returns { value, explicit, inherited } for a day. 'Missed' applies to its day only.
export function doseFor(date, mid) {
  const med = state.meds[mid]; if (!med) return { value: undefined };
  const ex = explicitDose(date, mid);
  if (ex !== undefined) return { value: ex, explicit: true };
  if (med.kind === 'pack') {
    const p = med.pack || {}; if (!p.start || date < p.start) return { value: undefined };
    const cyc = (+p.active || 24) + (+p.inactive || 4);
    const pos = ((diffDays(p.start, date) % cyc) + cyc) % cyc;
    return { value: pos < (+p.active || 24) ? 'Active' : 'Placebo', inherited: true, day: pos + 1 };
  }
  if (!doseIdx) buildDoseIndex();
  const arr = doseIdx[mid] || [];
  let lo = 0, hi = arr.length - 1, found = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m][0] < date) { found = m; lo = m + 1; } else hi = m - 1; }
  for (let i = found; i >= 0; i--) if (arr[i][1] !== 'Missed') return arr[i][1] === 'Off' ? { value: undefined, inherited: true } : { value: arr[i][1], inherited: true };
  return { value: undefined };
}
export function setDose(date, mid, value) {
  (state.doses[date] ||= {})[mid] = [value === '' || value == null ? null : value, now()];
  changed({ date, med: mid });
}
// Days where the effective dose differs from the day before.
export function doseChanges(mid, from, to) {
  const out = []; let prev;
  const med = state.meds[mid]; if (!med || med.kind === 'pack') return out;
  if (!doseIdx) buildDoseIndex();
  for (const [d, v] of doseIdx[mid] || []) {
    if (v === 'Missed') continue;
    const val = v === 'Off' ? undefined : v;
    if (val !== prev && d >= from && d <= to) out.push({ date: d, value: val, prev });
    prev = val;
  }
  return out;
}

// ---------- labs / photos / profile ----------
export function upsertLab(l) { state.labs[l.id] = { ...l, ts: now() }; changed({ lab: l.id }); }
export function deleteLab(id) { if (state.labs[id]) { state.labs[id] = { ...state.labs[id], deleted: true, ts: now() }; changed({ lab: id }); } }
export const labList = () => Object.values(state.labs).filter(l => !l.deleted);
export function addPhotoMeta(p) { state.photos[p.id] = { ...p, ts: now() }; changed({ photo: p.id, date: p.date, sym: 'photo' }); }
export function deletePhoto(id) { const p = state.photos[id]; if (p) { state.photos[id] = { ...p, deleted: true, ts: now() }; changed({ photo: id, date: p.date, sym: 'photo' }); } }
export const photosFor = date => Object.values(state.photos).filter(p => p.date === date && !p.deleted);
export function setProfile(k, v) { state.profile[k] = [v, now()]; changed({ profile: k }); }
export const profile = k => state.profile[k]?.[0];

// ---------- merge (last write wins per cell) ----------
function mergeCells(a = {}, b = {}) {
  let ch = false;
  for (const [d, row] of Object.entries(b)) {
    const mine = (a[d] ||= {});
    for (const [k, c] of Object.entries(row)) if (!mine[k] || mine[k][1] < c[1]) { mine[k] = c; ch = true; }
  }
  return ch;
}
function mergeRecs(a = {}, b = {}) {
  let ch = false;
  for (const [id, r] of Object.entries(b)) if (!a[id] || (a[id].ts || 0) < (r.ts || 0)) { a[id] = r; ch = true; }
  return ch;
}
function mergeFlat(a = {}, b = {}) {
  let ch = false;
  for (const [k, c] of Object.entries(b)) if (!a[k] || a[k][1] < c[1]) { a[k] = c; ch = true; }
  return ch;
}
// Merge remote into local. Returns whether local changed (UI needs refresh)
// and whether remote is missing anything local has (needs push).
export function merge(remote) {
  const before = JSON.stringify(state);
  let ch = false;
  ch = mergeCells(state.cells, remote.cells) || ch;
  ch = mergeCells(state.doses, remote.doses) || ch;
  ch = mergeRecs(state.meds, remote.meds) || ch;
  ch = mergeRecs(state.labs, remote.labs) || ch;
  ch = mergeRecs(state.photos, remote.photos) || ch;
  ch = mergeFlat(state.profile, remote.profile) || ch;
  if (ch) { invalidateDoseIndex(); listeners.forEach(fn => fn({ all: true })); save(); }
  const needsPush = JSON.stringify(state) !== JSON.stringify(remote);
  return { changed: ch && JSON.stringify(state) !== before, needsPush };
}
