// Symptom catalogue, groups and default medications.
// Nothing personal lives in this file — the repo is public. All logged data is
// kept on the device and synced only as an encrypted file to a private repo.

export const GROUPS = [
  { id: 'energy', name: 'Energy & Mind', glyph: '✦' },
  { id: 'sleep',  name: 'Sleep',         glyph: '☾' },
  { id: 'skin',   name: 'Skin & Hair',   glyph: '✿' },
  { id: 'body',   name: 'Joints & Muscles', glyph: '❋' },
  { id: 'flags',  name: 'Immune Clues',  glyph: '◈', hint: 'The features doctors look for when weighing lupus and related conditions' },
  { id: 'gut',    name: 'Digestion',     glyph: '❀' },
  { id: 'daily',  name: 'Daily Notes',   glyph: '✎' },
  { id: 'custom', name: 'My Additions',  glyph: '✧' },
];

// type: scale (0–10 wheel) | yesno (tap cycles) | choice | number | note | photo
// better: 'high' when a higher score is good (default: higher = worse)
export const SYMPTOMS = [
  { id: 'fatigue',   g: 'energy', label: 'Fatigue', type: 'scale' },
  { id: 'brainfog',  g: 'energy', label: 'Brain fog', type: 'scale' },
  { id: 'mood',      g: 'energy', label: 'Low mood', type: 'scale' },
  { id: 'anxiety',   g: 'energy', label: 'Anxiety', type: 'scale' },
  { id: 'headache',  g: 'energy', label: 'Headache', type: 'scale' },

  { id: 'sleep_hrs', g: 'sleep', label: 'Hours slept', type: 'number', min: 0, max: 14, step: 0.5, presets: [5, 6, 7, 8, 9], unit: 'h' },
  { id: 'refreshed', g: 'sleep', label: 'Woke refreshed', type: 'scale', better: 'high' },
  { id: 'sleepy',    g: 'sleep', label: 'Daytime sleepiness', type: 'scale' },
  { id: 'snoring',   g: 'sleep', label: 'Snoring / gasping', type: 'yesno' },
  { id: 'rls',       g: 'sleep', label: 'Restless legs (evening)', type: 'yesno' },

  { id: 'rash',      g: 'skin', label: 'Facial rash', type: 'scale' },
  { id: 'sun',       g: 'skin', label: 'Sun exposure', type: 'choice', options: ['None', 'Some', 'Lots'], short: ['–', 'S', 'L'] },
  { id: 'sunscreen', g: 'skin', label: 'Sunscreen worn', type: 'yesno', neutral: true },
  { id: 'flushing',  g: 'skin', label: 'Flushing (heat, food, wine)', type: 'yesno' },
  { id: 'acne',      g: 'skin', label: 'Acne', type: 'scale' },
  { id: 'hair',      g: 'skin', label: 'Hair shedding', type: 'scale' },
  { id: 'lidknuckle',g: 'skin', label: 'Eyelid or knuckle rash', type: 'yesno' },
  { id: 'photo',     g: 'skin', label: 'Photos', type: 'photo' },

  { id: 'jointpain', g: 'body', label: 'Joint pain', type: 'scale' },
  { id: 'jointswell',g: 'body', label: 'Joint swelling', type: 'yesno' },
  { id: 'stiffness', g: 'body', label: 'Morning stiffness', type: 'choice', options: ['None', '< 30 min', '30–60 min', '> 1 hour'], short: ['–', '<30', '≤60', '60+'] },
  { id: 'weakness',  g: 'body', label: 'Muscle weakness', type: 'scale', sub: 'stairs, arms overhead, rising from a chair' },
  { id: 'cramps',    g: 'body', label: 'Leg cramps / aches', type: 'scale' },
  { id: 'backpain',  g: 'body', label: 'Back pain', type: 'scale' },

  { id: 'sores',     g: 'flags', label: 'Mouth or nose sores', type: 'yesno' },
  { id: 'raynaud',   g: 'flags', label: 'Fingers white/blue in cold', type: 'yesno' },
  { id: 'temp',      g: 'flags', label: 'Highest temperature', type: 'number', min: 95, max: 105, step: 0.1, presets: [97.5, 98.6, 99.5, 100.4, 101.5], unit: '°F' },
  { id: 'pleurisy',  g: 'flags', label: 'Chest pain on deep breath', type: 'yesno' },
  { id: 'swelling',  g: 'flags', label: 'Leg or eyelid swelling', type: 'yesno' },
  { id: 'urine',     g: 'flags', label: 'Foamy or dark urine', type: 'yesno' },
  { id: 'dryness',   g: 'flags', label: 'Dry eyes / dry mouth', type: 'yesno' },
  { id: 'newrash',   g: 'flags', label: 'New rash, blisters or peeling', type: 'yesno', urgent: true },

  { id: 'nausea',    g: 'gut', label: 'Nausea', type: 'scale' },
  { id: 'nauseatime',g: 'gut', label: 'Nausea timing', type: 'choice', options: ['Morning', 'Afternoon', 'Evening', 'All day'], short: ['AM', 'PM', 'Eve', 'All'] },
  { id: 'gi',        g: 'gut', label: 'Bloating / GI upset', type: 'scale' },

  { id: 'vision',    g: 'daily', label: 'Vision changes', type: 'yesno' },
  { id: 'spotting',  g: 'daily', label: 'Spotting / bleeding', type: 'yesno' },
  { id: 'newproduct',g: 'daily', label: 'New skin or hair product', type: 'yesno', neutral: true },
  { id: 'weight',    g: 'daily', label: 'Weight', type: 'number', min: 80, max: 300, step: 0.2, presets: [], unit: 'lb' },
  { id: 'note',      g: 'daily', label: 'Notes', type: 'note' },
];

export const SYM = Object.fromEntries(SYMPTOMS.map(s => [s.id, s]));
const BASE = SYMPTOMS.slice();

// Symptoms she adds in Settings live in her (encrypted) data, not in this file.
// They are spliced into the shared SYMPTOMS list so every screen picks them up.
export function applyCustomSyms(records) {
  SYMPTOMS.splice(0, SYMPTOMS.length, ...BASE);
  for (const k of Object.keys(SYM)) if (k.startsWith('c_')) delete SYM[k];
  const list = Object.values(records || {}).filter(r => !r.deleted).sort((a, b) => (a.created || 0) - (b.created || 0));
  const byGroup = {};
  for (const r of list) {
    const s = { ...r, custom: true, g: GROUPS.some(g => g.id === r.g) ? r.g : 'custom' };
    if (s.type === 'choice') { s.options = (r.options || []).filter(Boolean); s.short = s.options.map(o => o.length > 5 ? o.slice(0, 4) + '…' : o); }
    if (s.type === 'number') { s.presets = s.presets || []; s.step = +s.step || 1; }
    (byGroup[s.g] ||= []).push(s); SYM[s.id] = s;
  }
  // insert each custom symptom after the last built-in row of its group
  for (const [g, arr] of Object.entries(byGroup)) {
    let at = -1; SYMPTOMS.forEach((x, i) => { if (x.g === g) at = i; });
    SYMPTOMS.splice(at < 0 ? SYMPTOMS.length : at + 1, 0, ...arr);
  }
}
export const TYPE_LABELS = { scale: '0–10 score', yesno: 'Yes / No', number: 'Number', choice: 'Pick from a list', photo: 'Photos', note: 'Note' };

// Default medications. Fixed ids so two devices never create duplicates.
// kind: 'mg' carries a dose forward until changed; 'pack' follows an
// active/placebo cycle from the pack start date.
export const DEFAULT_MEDS = [
  { id: 'zoloft',   name: 'Zoloft', generic: 'sertraline', kind: 'mg', unit: 'mg', quick: [50, 100, 150, 200], order: 1, seed: 200 },
  { id: 'lamictal', name: 'Lamictal', generic: 'lamotrigine', kind: 'mg', unit: 'mg', quick: [25, 50, 75, 100, 150, 200], order: 2, seed: 75 },
  { id: 'loryna',   name: 'Loryna', generic: 'drospirenone / EE', kind: 'pack', unit: '', pack: { start: '', active: 24, inactive: 4 }, order: 3 },
];

// Chart series colours (validated for colour-vision deficiency; see README).
export const SERIES = {
  fatigue: '#4A72C8', brainfog: '#D06A3E', refreshed: '#22A07A', jointpain: '#C08A10',
  rash: '#D2709A', mood: '#6A55C8',
};
export const SERIES_ORDER = ['#4A72C8', '#D06A3E', '#22A07A', '#C08A10', '#D2709A', '#6A55C8'];
