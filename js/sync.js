// End-to-end encrypted sync to a PRIVATE GitHub repository.
// The public sx_tracker repo only ever holds app code. Her data is gzipped,
// encrypted on the device with AES-256-GCM (key from her passphrase via
// PBKDF2-SHA256, 310k rounds) and stored as ciphertext in the private repo,
// so even GitHub only ever sees unreadable bytes.
import { state, merge, kvGet, kvSet, kvDel, photoGet, photoSet, save, clearDirty } from './store.js';

const ITER = 310000;
const DATA_PATH = 'sx/data.enc.json';
const te = new TextEncoder(), td = new TextDecoder();

// ---------- base64 ----------
export function b64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s) { const bin = atob(s.replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

// ---------- compression ----------
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
const canGz = typeof CompressionStream !== 'undefined';
const gz = b => pipe(b, new CompressionStream('gzip'));
const gunz = b => pipe(b, new DecompressionStream('gzip'));

// ---------- crypto ----------
export async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealBytes(key, salt, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const z = canGz ? await gz(bytes) : bytes;
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, z);
  return { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), gz: canGz, ct: b64(ct) };
}
export async function openBytes(key, env) {
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct)));
  return env.gz ? gunz(pt) : pt;
}
export const sealJSON = (key, salt, obj) => sealBytes(key, salt, te.encode(JSON.stringify(obj)));
export const openJSON = async (key, env) => JSON.parse(td.decode(await openBytes(key, env)));

// ---------- config & key ----------
let cfg = JSON.parse(localStorage.getItem('sx_sync') || 'null');
let session = null; // { key, salt }
export const config = () => cfg;
export const unlocked = () => !!session;
export function saveConfig(c) { cfg = c; localStorage.setItem('sx_sync', JSON.stringify(c)); }

export async function restoreKey() {
  const k = await kvGet('key');
  if (k) session = { key: k.key, salt: unb64(k.salt) };
  return !!session;
}
export async function lock() { session = null; await kvDel('key'); setStatus('locked'); }

// ---------- GitHub API ----------
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
    cache: 'no-store',
  });
  return r;
}
async function getFile(path) {
  const r = await gh(`/contents/${path}?ref=${encodeURIComponent(cfg.branch || 'main')}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || ''}`);
  const meta = await r.json();
  let text;
  if (meta.content && meta.encoding === 'base64') text = td.decode(unb64(meta.content));
  else { // > 1 MB: fetch the blob
    const b = await gh(`/git/blobs/${meta.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (!b.ok) throw new Error(`GitHub blob ${b.status}`);
    text = await b.text();
  }
  return { sha: meta.sha, text };
}
async function putFile(path, text, sha, message) {
  const r = await gh(`/contents/${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: b64(te.encode(text)), sha: sha || undefined, branch: cfg.branch || 'main' }),
  });
  if (r.status === 409 || r.status === 422) return { conflict: true };
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || ''}`);
  return { sha: (await r.json()).content.sha };
}

// ---------- setup ----------
// First device creates the encrypted file; later devices must enter the same passphrase.
export async function connect({ owner, repo, branch, token, pass, remember }) {
  saveConfig({ owner: owner.trim(), repo: repo.trim(), branch: (branch || 'main').trim(), token: token.trim() });
  const test = await gh('');
  if (test.status === 404) throw new Error('Repository not found — check the name, and that the token has access to it.');
  if (test.status === 401) throw new Error('GitHub rejected the token.');
  const info = await test.json();
  if (!info.private) throw new Error('That repository is PUBLIC. Use a private repository for her data.');
  const f = await getFile(DATA_PATH);
  let salt, key;
  if (f) {
    const env = JSON.parse(f.text); salt = unb64(env.salt); key = await deriveKey(pass, salt);
    try { await openJSON(key, env); } catch { throw new Error('That passphrase does not open the existing data.'); }
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16)); key = await deriveKey(pass, salt);
  }
  session = { key, salt };
  if (remember) await kvSet('key', { key, salt: b64(salt) }); else await kvDel('key');
  localStorage.setItem('sx_remember', remember ? '1' : '0');
  await sync();
}
export async function unlockWith(pass) {
  const f = await getFile(DATA_PATH); if (!f) throw new Error('No data found yet.');
  const env = JSON.parse(f.text); const salt = unb64(env.salt); const key = await deriveKey(pass, salt);
  try { await openJSON(key, env); } catch { throw new Error('Wrong passphrase.'); }
  session = { key, salt };
  if (localStorage.getItem('sx_remember') === '1') await kvSet('key', { key, salt: b64(salt) });
  await sync();
}

// ---------- status ----------
const statusListeners = new Set();
let status = { state: 'idle' };
export const onStatus = fn => { statusListeners.add(fn); fn(status); };
function setStatus(s, extra = {}) { status = { state: s, at: Date.now(), ...extra }; statusListeners.forEach(fn => fn(status)); }
export const getStatus = () => status;

// ---------- sync ----------
let running = null, again = false;
export function sync() {
  if (!cfg || !session) { setStatus(cfg ? 'locked' : 'local'); return Promise.resolve(); }
  if (!navigator.onLine) { setStatus('offline'); return Promise.resolve(); }
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const f = await getFile(DATA_PATH);
        let needsPush = true;
        if (f) {
          const remote = await openJSON(session.key, JSON.parse(f.text));
          ({ needsPush } = merge(remote));
        }
        if (!needsPush) break;
        await save();
        const env = await sealJSON(session.key, session.salt, state);
        const res = await putFile(DATA_PATH, JSON.stringify(env), f?.sha, 'update');
        if (!res.conflict) break;
      }
      clearDirty();
      await syncPhotos();
      setStatus('synced');
    } catch (e) {
      console.error(e);
      setStatus(navigator.onLine ? 'error' : 'offline', { message: e.message });
    }
  })().finally(() => { running = null; if (again) { again = false; sync(); } });
  return running;
}
let pushTimer;
export function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(sync, 2500); }

// Photos: each one is its own encrypted file; uploaded once, fetched on demand.
async function syncPhotos() {
  const uploaded = new Set(JSON.parse(localStorage.getItem('sx_photos_up') || '[]'));
  for (const p of Object.values(state.photos)) {
    if (p.deleted || uploaded.has(p.id)) continue;
    const blob = await photoGet(p.id); if (!blob) continue;
    const env = await sealBytes(session.key, session.salt, new Uint8Array(await blob.arrayBuffer()));
    const res = await putFile(`sx/photos/${p.id}.enc.json`, JSON.stringify(env), null, 'photo');
    if (!res.conflict) uploaded.add(p.id);
    else uploaded.add(p.id); // already exists remotely
  }
  localStorage.setItem('sx_photos_up', JSON.stringify([...uploaded]));
}
export async function loadPhoto(id) {
  const local = await photoGet(id); if (local) return local;
  if (!cfg || !session) return null;
  const f = await getFile(`sx/photos/${id}.enc.json`); if (!f) return null;
  const bytes = await openBytes(session.key, JSON.parse(f.text));
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  await photoSet(id, blob);
  const up = new Set(JSON.parse(localStorage.getItem('sx_photos_up') || '[]')); up.add(id);
  localStorage.setItem('sx_photos_up', JSON.stringify([...up]));
  return blob;
}
