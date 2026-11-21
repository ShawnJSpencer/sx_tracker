import { load, onChange, state, medList, upsertMed, setProfile, profile, replaceState, merge, save, upsertSym, customSyms } from './store.js';
import { SYMPTOMS, GROUPS, TYPE_LABELS } from './config.js';
import { mountLog, refresh as refreshLog, onShowLog } from './log.js';
import { mountInsights, refreshInsights } from './insights.js';
import { mountLabs, refreshLabs } from './labs.js';
import { mountReport, refreshReport } from './report.js';
import { config, connect, unlocked, restoreKey, sync, schedulePush, onStatus, lock, unlockWith } from './sync.js';
import { h, $, $$, today, uid, esc, range, fmtDate } from './util.js';
import { sheet, toast } from './popover.js';
import { getCell } from './store.js';

const TABS = [['log', 'Log'], ['insights', 'Insights'], ['labs', 'Labs'], ['report', 'Report']];
let tab = localStorage.getItem('sx_tab') || 'log';

async function boot() {
  await load();
  await restoreKey();
  const app = $('#app');
  const nav = h('nav', { class: 'tabs' }, TABS.map(([k, l]) => h('button', { 'data-tab': k, onclick: () => show(k) }, l)));
  const status = h('button', { class: 'sync-pill', onclick: () => openSettings('sync') });
  app.append(h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'sprig', html: SPRIG }), h('div', {}, h('div', { class: 'brand-t' }, 'Daily Bloom'), h('div', { class: 'brand-s' }, greeting()))),
    nav, h('div', { class: 'top-r' }, status, h('button', { class: 'icon-btn', onclick: () => openSettings(), 'aria-label': 'Settings' }, '⚙'))));
  const views = {}; for (const [k] of TABS) { views[k] = h('main', { class: 'view', id: 'v-' + k }); app.append(views[k]); }
  mountLog(views.log); mountInsights(views.insights); mountLabs(views.labs); mountReport(views.report);
  show(tab);

  onChange(info => { refreshLog(info); schedulePush(); });
  onStatus(s => {
    const map = { local: ['On this iPad only', 'muted'], locked: ['Locked — tap to unlock', 'warn'], syncing: ['Syncing…', 'busy'], synced: ['Synced', 'ok'], offline: ['Offline — saved here', 'warn'], error: ['Sync problem', 'bad'], idle: ['', 'muted'] };
    const [t, c] = map[s.state] || ['', ''];
    status.textContent = t; status.className = 'sync-pill ' + c; status.title = s.message || '';
  });
  if (config() && !unlocked()) promptUnlock(); else sync();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); else save(); });
  addEventListener('online', () => sync());
  setInterval(() => document.visibilityState === 'visible' && sync(), 120000);
  document.addEventListener('sx:settings', e => openSettings(e.detail));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
}

function show(k) {
  tab = k; localStorage.setItem('sx_tab', k);
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + k));
  if (k === 'log') requestAnimationFrame(onShowLog);
  if (k === 'insights') refreshInsights();
  if (k === 'labs') refreshLabs();
  if (k === 'report') refreshReport();
}
function greeting() {
  const hr = new Date().getHours(); const n = profile('name');
  const first = n ? n.split(' ')[0] : '';
  return `${hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'}${first ? ', ' + first : ''}`;
}

// ---------- settings ----------
function openSettings(focus) {
  const body = h('div', { class: 'settings' });
  const s = sheet('Settings', body);
  body.append(syncSection(s), medsSection(), symptomsSection(), profileSection(), dataSection());
  if (focus) setTimeout(() => body.querySelector(`[data-sec="${focus}"]`)?.scrollIntoView({ behavior: 'smooth' }), 250);
}

function syncSection(s) {
  const c = config() || {};
  const f = { owner: c.owner || 'ShawnJSpencer', repo: c.repo || 'sx_tracker_data', branch: c.branch || 'main', token: c.token || '', pass: '', remember: localStorage.getItem('sx_remember') !== '0' };
  const inp = (k, a = {}) => { const i = h('input', { class: 'in', value: f[k], ...a }); i.addEventListener('input', () => f[k] = i.value); return i; };
  const msg = h('p', { class: 'muted small' });
  const go = h('button', { class: 'btn primary', onclick: async () => {
    if (!f.token || !f.pass) { msg.textContent = 'Token and passphrase are both required.'; return; }
    if (f.pass.length < 10) { msg.textContent = 'Use a passphrase of at least 10 characters — a short sentence works well.'; return; }
    go.disabled = true; msg.textContent = 'Connecting… (deriving the encryption key takes a few seconds)';
    try { await connect(f); msg.textContent = 'Connected. Her data is encrypted and syncing.'; toast('Sync connected'); }
    catch (e) { msg.textContent = e.message; }
    go.disabled = false;
  } }, config() ? 'Reconnect' : 'Connect & encrypt');
  const rem = h('input', { type: 'checkbox', checked: f.remember, onchange: e => f.remember = e.target.checked });
  return h('section', { class: 'set-sec', 'data-sec': 'sync' }, h('h4', {}, '🔒 Private sync'),
    h('p', { class: 'muted small', html: 'This app’s code is public, but her data never goes there. Entries are encrypted on this device with your passphrase (AES-256) and saved to a <b>separate private repository</b>. Without the passphrase the file is unreadable — even to GitHub. Use the same repository and passphrase on each iPad or iPhone.' }),
    h('div', { class: 'row3' }, h('label', {}, 'GitHub owner', inp('owner')), h('label', {}, 'Private repo', inp('repo')), h('label', {}, 'Branch', inp('branch'))),
    h('label', {}, 'Access token (fine-grained, this repo only, Contents: read & write)', inp('token', { type: 'password', autocomplete: 'off' })),
    h('label', {}, 'Encryption passphrase', inp('pass', { type: 'password', autocomplete: 'new-password', placeholder: 'A sentence you’ll remember' })),
    h('label', { class: 'check' }, rem, 'Remember on this device (stays unlocked; uncheck to ask each time)'),
    h('p', { class: 'muted small warn-t' }, 'If the passphrase is lost the synced copy cannot be recovered. Keep it somewhere safe, and download a backup now and then.'),
    h('div', { class: 'pop-actions' }, config() ? h('button', { class: 'link-btn', onclick: async () => { await lock(); toast('Locked on this device'); s.close(); } }, 'Lock this device') : h('span'), go), msg);
}

function medsSection() {
  const wrap = h('section', { class: 'set-sec', 'data-sec': 'meds' }, h('h4', {}, '💊 Medications'),
    h('p', { class: 'muted small' }, 'Doses are set right in the medication rows at the top of the log: tap a day and pick the dose. A dose carries forward until you change it, so a titration only needs an entry on the days it changes. You can enter future days to plan the schedule.'));
  const list = h('div', { class: 'med-list' });
  const draw = () => {
    list.innerHTML = '';
    for (const m of medList(true)) {
      const quick = h('input', { class: 'in', value: (m.quick || []).join(', '), placeholder: 'Quick doses, e.g. 25, 50, 100' });
      const name = h('input', { class: 'in', value: m.name });
      const generic = h('input', { class: 'in', value: m.generic || '', placeholder: 'generic name' });
      const unit = h('input', { class: 'in sm', value: m.unit || '' });
      const packStart = h('input', { class: 'in', type: 'date', value: m.pack?.start || '' });
      const act = h('input', { class: 'in sm', inputmode: 'numeric', value: m.pack?.active ?? 24 });
      const inact = h('input', { class: 'in sm', inputmode: 'numeric', value: m.pack?.inactive ?? 4 });
      const saveBtn = h('button', { class: 'btn', onclick: () => {
        const upd = { ...m, name: name.value.trim() || m.name, generic: generic.value.trim(), unit: unit.value.trim() };
        if (m.kind === 'pack') upd.pack = { start: packStart.value, active: act.value === '' ? 24 : +act.value, inactive: inact.value === '' ? 4 : +inact.value };
        else upd.quick = quick.value.split(',').map(x => parseFloat(x)).filter(x => !isNaN(x));
        upsertMed(upd); toast('Saved');
      } }, 'Save');
      list.append(h('div', { class: 'med-edit' + (m.archived ? ' archived' : '') },
        h('div', { class: 'row3' }, h('label', {}, 'Name', name), h('label', {}, 'Generic', generic), m.kind === 'pack' ? h('span') : h('label', {}, 'Unit', unit)),
        m.kind === 'pack'
          ? h('div', { class: 'row3' }, h('label', {}, 'Current pack started', packStart), h('label', {}, 'Active pills', act), h('label', {}, 'Placebo pills', inact))
          : h('label', {}, 'Quick-pick doses', quick),
        h('div', { class: 'pop-actions' }, h('button', { class: 'link-btn', onclick: () => { upsertMed({ ...m, archived: !m.archived }); draw(); } }, m.archived ? 'Show again' : 'Hide (stopped)'), saveBtn)));
    }
  };
  draw();
  const nm = h('input', { class: 'in', placeholder: 'New medication name' });
  const kind = h('select', { class: 'in' }, h('option', { value: 'mg' }, 'Daily dose (mg)'), h('option', { value: 'pack' }, 'Pill pack with placebo days'));
  wrap.append(list, h('div', { class: 'add-row' }, nm, kind, h('button', { class: 'btn', onclick: () => {
    if (!nm.value.trim()) return;
    const k = kind.value; const order = Math.max(0, ...medList(true).map(m => m.order || 0)) + 1;
    upsertMed(k === 'pack' ? { id: uid(), name: nm.value.trim(), kind: 'pack', unit: '', pack: { start: '', active: 24, inactive: 4 }, order } : { id: uid(), name: nm.value.trim(), kind: 'mg', unit: 'mg', quick: [], order });
    nm.value = ''; draw();
  } }, 'Add')));
  return wrap;
}

function symptomsSection() {
  const wrap = h('section', { class: 'set-sec', 'data-sec': 'symptoms' });
  const draw = () => {
    wrap.innerHTML = '';
    wrap.append(h('h4', {}, '✧ Add a symptom'), h('p', { class: 'muted small' }, 'Adds a new row to the log. It syncs to her other devices and shows up in Insights and the Report automatically.'), addSymForm(draw));
    const mine = customSyms();
    if (mine.length) {
      wrap.append(h('div', { class: 'sym-toggle-g' }, 'Her added symptoms'));
      wrap.append(h('div', { class: 'cust-list' }, mine.map(c => customRow(c, draw))));
    }
    const hidden = new Set(JSON.parse(localStorage.getItem('sx_hidden') || '[]'));
    wrap.append(h('h4', { class: 'sub-h' }, '✿ Rows shown in the log'), h('p', { class: 'muted small' }, 'Hide rows she doesn’t need. Hidden rows keep their past data.'));
    for (const g of GROUPS) {
      const ss = SYMPTOMS.filter(s => s.g === g.id); if (!ss.length) continue;
      wrap.append(h('div', { class: 'sym-toggle-g' }, `${g.glyph} ${g.name}`));
      wrap.append(h('div', { class: 'chips' }, ss.map(s => h('button', { class: 'chip' + (hidden.has(s.id) ? '' : ' on'), onclick: e => {
        hidden.has(s.id) ? hidden.delete(s.id) : hidden.add(s.id); e.currentTarget.classList.toggle('on');
        localStorage.setItem('sx_hidden', JSON.stringify([...hidden])); refreshLog({ all: true });
      } }, s.label))));
    }
  };
  draw();
  return wrap;
}

function addSymForm(done) {
  const f = { label: '', type: 'scale', g: 'custom', better: false, unit: '', options: '', step: '1' };
  const name = h('input', { class: 'in', placeholder: 'e.g. Ringing in ears, Hot flashes, Steps walked' });
  name.addEventListener('input', () => f.label = name.value);
  const type = h('select', { class: 'in' }, Object.entries(TYPE_LABELS).map(([k, l]) => h('option', { value: k }, l)));
  const group = h('select', { class: 'in' }, GROUPS.map(g => h('option', { value: g.id, selected: g.id === 'custom' }, `${g.glyph} ${g.name}`)));
  group.addEventListener('change', () => f.g = group.value);
  const extra = h('div');
  const preview = h('div', { class: 'type-hint muted small' });
  const hints = {
    scale: 'Tap the cell → the 0–10 wheel.', yesno: 'Tap to cycle ● yes → – no → blank.', number: 'Tap → enter a number (steps, ounces of water, blood pressure…).',
    choice: 'Tap → pick one of the options you list.', photo: 'Tap → add photos for that day (encrypted).', note: 'Tap → write a short note.',
  };
  const drawExtra = () => {
    f.type = type.value; extra.innerHTML = ''; preview.textContent = hints[f.type];
    if (f.type === 'scale') {
      const cb = h('input', { type: 'checkbox', checked: f.better, onchange: e => f.better = e.target.checked });
      extra.append(h('label', { class: 'check' }, cb, 'Higher is better (like “Energy” — colours it green instead of rose)'));
    } else if (f.type === 'number') {
      const u = h('input', { class: 'in', placeholder: 'e.g. oz, steps, mmHg', value: f.unit }); u.addEventListener('input', () => f.unit = u.value);
      const st = h('select', { class: 'in' }, [['1', 'Whole numbers'], ['0.5', 'Halves (0.5)'], ['0.1', 'Decimals (0.1)']].map(([v, l]) => h('option', { value: v, selected: v === f.step }, l)));
      st.addEventListener('change', () => f.step = st.value);
      extra.append(h('div', { class: 'row3' }, h('label', {}, 'Unit (optional)', u), h('label', {}, 'Precision', st), h('span')));
    } else if (f.type === 'choice') {
      const o = h('input', { class: 'in', placeholder: 'Separate with commas, e.g. Left, Right, Both', value: f.options }); o.addEventListener('input', () => f.options = o.value);
      extra.append(h('label', {}, 'Options', o));
    }
  };
  type.addEventListener('change', drawExtra); drawExtra();
  const msg = h('span', { class: 'muted small' });
  const add = h('button', { class: 'btn primary', onclick: () => {
    const label = f.label.trim();
    if (!label) { msg.textContent = 'Give it a name first.'; return; }
    if (SYMPTOMS.some(s => s.label.toLowerCase() === label.toLowerCase())) { msg.textContent = 'There is already a row with that name.'; return; }
    const rec = { id: 'c_' + uid(), label, type: f.type, g: f.g, created: Date.now() };
    if (f.type === 'scale' && f.better) rec.better = 'high';
    if (f.type === 'number') { rec.unit = f.unit.trim(); rec.step = +f.step; rec.presets = []; }
    if (f.type === 'choice') { rec.options = f.options.split(',').map(x => x.trim()).filter(Boolean); if (rec.options.length < 2) { msg.textContent = 'List at least two options.'; return; } }
    upsertSym(rec); toast(`“${label}” added to the log`); done();
  } }, 'Add row');
  return h('div', { class: 'add-sym' },
    h('div', { class: 'row3' }, h('label', {}, 'Symptom name', name), h('label', {}, 'Type of answer', type), h('label', {}, 'Group', group)),
    preview, extra, h('div', { class: 'pop-actions' }, msg, add));
}

function customRow(c, done) {
  const name = h('input', { class: 'in', value: c.label });
  const group = h('select', { class: 'in' }, GROUPS.map(g => h('option', { value: g.id, selected: g.id === (c.g || 'custom') }, `${g.glyph} ${g.name}`)));
  const opts = c.type === 'choice' ? h('input', { class: 'in', value: (c.options || []).join(', ') }) : null;
  const detail = c.type === 'number' && c.unit ? ` · ${c.unit}` : c.type === 'scale' && c.better === 'high' ? ' · higher is better' : '';
  return h('div', { class: 'cust-row' },
    h('div', { class: 'row3' }, h('label', {}, 'Name', name), h('label', {}, 'Group', group), h('label', {}, 'Type', h('div', { class: 'type-pill' }, TYPE_LABELS[c.type] + detail))),
    opts ? h('label', {}, 'Options (add new ones at the end; renaming an option leaves old days under the old name)', opts) : null,
    h('div', { class: 'pop-actions' },
      h('button', { class: 'link-btn danger', onclick: () => { if (confirm(`Remove “${c.label}” from the log? Days already logged are kept in her data.`)) { upsertSym({ ...c, deleted: true }); done(); } } }, 'Remove row'),
      h('button', { class: 'btn', onclick: () => {
        const upd = { ...c, label: name.value.trim() || c.label, g: group.value };
        if (opts) { const o = opts.value.split(',').map(x => x.trim()).filter(Boolean); if (o.length >= 2) upd.options = o; }
        upsertSym(upd); toast('Saved'); done();
      } }, 'Save')));
}

function profileSection() {
  const n = h('input', { class: 'in', value: profile('name') || '', placeholder: 'Shown on printed reports' });
  return h('section', { class: 'set-sec' }, h('h4', {}, '☺ Name'), h('div', { class: 'add-row' }, n, h('button', { class: 'btn', onclick: () => { setProfile('name', n.value.trim()); toast('Saved'); } }, 'Save')),
    h('p', { class: 'muted small' }, 'Stored with her encrypted data, not in the app code.'));
}

function dataSection() {
  const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none', onchange: async () => {
    const f = file.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); if (!data.cells) throw new Error('Not a backup file'); merge(data); refreshLog({ all: true }); toast('Backup merged in'); } catch (e) { alert(e.message); }
  } });
  return h('section', { class: 'set-sec', 'data-sec': 'data' }, h('h4', {}, '⇩ Backup & export'),
    h('p', { class: 'muted small' }, 'Backups and CSV files are NOT encrypted. Keep them somewhere private.'),
    h('div', { class: 'chips' },
      h('button', { class: 'chip', onclick: () => download(`sx-backup-${today()}.json`, JSON.stringify(state), 'application/json') }, 'Download backup'),
      h('button', { class: 'chip', onclick: () => file.click() }, 'Restore / merge backup'),
      h('button', { class: 'chip', onclick: exportCSV }, 'Export CSV (spreadsheet)')), file);
}

function exportCSV() {
  const dates = Object.keys(state.cells).sort();
  if (!dates.length) return toast('Nothing to export yet');
  const all = range(dates[0], today());
  const meds = medList(true);
  const head = ['date', ...meds.map(m => m.name), ...SYMPTOMS.filter(s => s.type !== 'photo').map(s => s.label)];
  const q = v => { const s = v === undefined ? '' : v === true ? 'yes' : v === false ? 'no' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = all.map(d => [d, ...meds.map(m => q(doseForSafe(d, m.id))), ...SYMPTOMS.filter(s => s.type !== 'photo').map(s => q(getCell(d, s.id)))].join(','));
  download(`sx-log-${today()}.csv`, [head.map(q).join(','), ...rows].join('\n'), 'text/csv');
}
import { doseFor } from './store.js';
const doseForSafe = (d, id) => doseFor(d, id).value;
function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove();
}

function promptUnlock() {
  const pass = h('input', { class: 'in', type: 'password', placeholder: 'Encryption passphrase', autocomplete: 'current-password' });
  const msg = h('p', { class: 'muted small' }, 'Logging works while locked; it syncs once unlocked.');
  const btn = h('button', { class: 'btn primary', onclick: async () => { btn.disabled = true; msg.textContent = 'Unlocking…'; try { await unlockWith(pass.value); s.close(); toast('Unlocked'); } catch (e) { msg.textContent = e.message; btn.disabled = false; } } }, 'Unlock');
  pass.addEventListener('keydown', e => e.key === 'Enter' && btn.click());
  const s = sheet('Unlock sync', h('div', { class: 'form' }, pass, h('div', { class: 'pop-actions' }, h('span'), btn), msg));
  setTimeout(() => pass.focus(), 250);
}

const SPRIG = `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><path d="M20 36 C20 26 20 18 22 8" stroke="#7C9A86" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M20.6 24c-5-1-8-5-8.5-9 4.6.3 8 3.6 8.5 9z" fill="#A8C3AF"/><path d="M21 18c4.2-1.2 6.8-4.6 7-8.2-4 .5-6.8 3.6-7 8.2z" fill="#C7DACB"/><circle cx="22.4" cy="7" r="4" fill="#E9A9BD"/><circle cx="22.4" cy="7" r="1.6" fill="#D9B26A"/></svg>`;

boot();
