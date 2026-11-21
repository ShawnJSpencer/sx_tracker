// Analytics: trends, patterns, medication effects and correlations.
import { SYMPTOMS, SYM, GROUPS, SERIES } from './config.js';
import { getCell, medList, doseFor, doseChanges, datesWithData } from './store.js';
import { h, $, today, addDays, range, mean, round1, pearson, fmtDate, parse, WEEKDAYS, esc } from './util.js';
import { lineChart, doseSteps, calendar, hbars, groupedBars, scatter, matrix, dumbbell } from './charts.js';

let span = localStorage.getItem('sx_span') || '30';
let heatSym = localStorage.getItem('sx_heat') || 'fatigue';
let root;

export function periodDates(sp = span) {
  const t = today();
  if (sp === 'all') { const d = datesWithData(); return range(d[0] && d[0] < t ? d[0] : addDays(t, -29), t); }
  return range(addDays(t, -(+sp - 1)), t);
}
const vals = (sym, dates) => dates.map(d => { const v = getCell(d, sym); return typeof v === 'number' ? v : null; });
export function rolling(arr, w = 7) {
  return arr.map((_, i) => { const win = arr.slice(Math.max(0, i - w + 1), i + 1).filter(v => v != null); return win.length >= 2 ? mean(win) : (arr[i] ?? null); });
}
const avgOf = (sym, dates) => mean(vals(sym, dates).filter(v => v != null));
const loggedDays = dates => dates.filter(d => SYMPTOMS.some(s => s.type !== 'photo' && getCell(d, s.id) !== undefined));

export function mountInsights(el) { root = el; render(); }
export function refreshInsights() { if (root && root.offsetParent) render(); }
addEventListener('resize', () => { clearTimeout(window.__rt); window.__rt = setTimeout(refreshInsights, 200); });

function card(title, sub, body, cls = '') {
  return h('section', { class: 'card ' + cls }, h('header', {}, h('h3', {}, title), sub ? h('p', {}, sub) : null), body);
}

function render() {
  const dates = periodDates();
  const prevDates = range(addDays(dates[0], -dates.length), addDays(dates[0], -1));
  const logged = loggedDays(dates);
  root.innerHTML = '';

  // filter row
  const spans = [['14', '2 weeks'], ['30', 'Month'], ['90', '3 months'], ['180', '6 months'], ['all', 'All']];
  root.append(h('div', { class: 'filters' },
    h('div', { class: 'seg' }, spans.map(([k, l]) => h('button', { class: k === span ? 'on' : '', onclick: () => { span = k; localStorage.setItem('sx_span', k); render(); } }, l))),
    h('span', { class: 'muted' }, `${fmtDate(dates[0])} – ${fmtDate(dates.at(-1))} · ${logged.length} of ${dates.length} days logged`)));

  if (!logged.length) {
    root.append(h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, '✿'), h('h3', {}, 'Nothing to chart yet'), h('p', {}, 'A few days of check-ins on the Log tab and the patterns start to show up here.')));
    return;
  }

  // highlights
  root.append(card('What stands out', 'Patterns in the logged days. Useful for conversations with her doctors, but not proof of cause.', h('ul', { class: 'highlights' }, highlights(dates, prevDates).map(t => h('li', { html: t })))));

  // KPIs
  const kpi = (label, sym, better) => {
    const a = avgOf(sym, dates), b = avgOf(sym, prevDates);
    const delta = a != null && b != null ? a - b : null;
    const good = delta == null || Math.abs(delta) < 0.25 ? 'flat' : (better === 'high' ? delta > 0 : delta < 0) ? 'good' : 'bad';
    return h('div', { class: 'kpi' }, h('div', { class: 'kpi-l' }, label), h('div', { class: 'kpi-v' }, round1(a), h('small', {}, '/10')),
      h('div', { class: 'kpi-d ' + good }, delta == null ? 'no earlier data' : `${good === 'flat' ? '≈' : delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} vs prior`));
  };
  const flagDays = dates.filter(d => SYMPTOMS.some(s => s.g === 'flags' && s.type === 'yesno' && getCell(d, s.id) === true) || (getCell(d, 'temp') ?? 0) >= 100.4).length;
  const rashDays = dates.filter(d => (getCell(d, 'rash') ?? 0) >= 1).length;
  root.append(h('div', { class: 'kpis' }, kpi('Fatigue', 'fatigue'), kpi('Brain fog', 'brainfog'), kpi('Woke refreshed', 'refreshed', 'high'), kpi('Joint pain', 'jointpain'),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi-l' }, 'Rash days'), h('div', { class: 'kpi-v' }, rashDays, h('small', {}, ` / ${logged.length}`)), h('div', { class: 'kpi-d flat' }, 'facial rash ≥ 1')),
    h('div', { class: 'kpi' }, h('div', { class: 'kpi-l' }, 'Immune-clue days'), h('div', { class: 'kpi-v' }, flagDays), h('div', { class: 'kpi-d ' + (flagDays ? 'bad' : 'flat') }, 'any clue present'))));

  // markers
  const meds = medList();
  const markers = meds.flatMap(m => doseChanges(m.id, dates[0], dates.at(-1)).map(c => ({ date: c.date, label: `${m.name} ${c.value ?? 'stopped'}${typeof c.value === 'number' ? m.unit : ''}` })));
  const pack = meds.find(m => m.kind === 'pack');
  const bands = [];
  if (pack) { let start = null; dates.forEach((d, i) => { const p = doseFor(d, pack.id).value === 'Placebo'; if (p && !start) start = d; if ((!p || i === dates.length - 1) && start) { bands.push({ from: start, to: p ? d : dates[i - 1] }); start = null; } }); }

  // trend
  const trendSyms = ['fatigue', 'brainfog', 'refreshed', 'jointpain', 'rash', 'mood'];
  const tc = h('div'); root.append(card('How she’s feeling', `Dots are daily scores; lines are 7-day averages. Dashed lines mark medication changes${bands.length ? '; shaded stretches are ' + pack.name + ' placebo days' : ''}. Tap the legend to show or hide.`, tc, 'wide'));
  lineChart(tc, { dates, markers, bands, series: trendSyms.map(id => { const v = vals(id, dates); return { name: SYM[id].label, color: SERIES[id], values: v, smooth: rolling(v), hidden: ['jointpain', 'mood'].includes(id) }; }) });

  // meds
  const mc = h('div'); root.append(card('Medications', 'Daily dose over the same period', mc, 'wide'));
  doseSteps(mc, { dates, meds: meds.map(m => ({ name: m.name, sub: m.generic || '', unit: m.unit, pack: m.kind === 'pack', values: dates.map(d => doseFor(d, m.id).value) })) });

  // heat calendar
  const heatOpts = SYMPTOMS.filter(s => ['scale', 'yesno'].includes(s.type));
  const sel = h('select', { class: 'select', onchange: e => { heatSym = e.target.value; localStorage.setItem('sx_heat', heatSym); drawHeat(); } }, heatOpts.map(s => h('option', { value: s.id, selected: s.id === heatSym }, s.label)));
  const hc = h('div');
  const hd = range(addDays(today(), -181), today());
  const drawHeat = () => { const s = SYM[heatSym]; const v = {}; hd.forEach(d => { const x = getCell(d, s.id); if (x !== undefined) v[d] = x; }); calendar(hc, { dates: hd, values: v, better: s.better, label: s.label, isBool: s.type === 'yesno' }); };
  root.append(card('Six-month calendar', null, h('div', {}, h('div', { class: 'card-tools' }, sel), hc), 'wide'));
  drawHeat();

  const two = h('div', { class: 'two' }); root.append(two);

  // immune clues
  const flagSyms = SYMPTOMS.filter(s => s.g === 'flags' && s.type === 'yesno').concat([SYM.lidknuckle, SYM.jointswell]);
  const fc = h('div');
  two.append(card('Immune clues', 'Share of logged days each was present. Tap a bar for dates.', fc));
  const feverDays = logged.filter(d => (getCell(d, 'temp') ?? 0) >= 100.4);
  hbars(fc, [...flagSyms.map(s => {
    const yes = logged.filter(d => getCell(d, s.id) === true);
    return { label: s.label, value: logged.length ? yes.length / logged.length : 0, note: ` ${yes.length}d`, color: s.urgent ? '#9C385D' : '#C4587C', tip: `<div class="th">${esc(s.label)}</div>${yes.slice(-10).map(fmtDate).join(', ') || 'none'}` };
  }), { label: 'Fever ≥ 100.4°F', value: logged.length ? feverDays.length / logged.length : 0, note: ` ${feverDays.length}d`, tip: feverDays.map(fmtDate).join(', ') || 'none' }].sort((a, b) => b.value - a.value));

  // sun & rash
  const sc = h('div');
  two.append(card('Sun and the rash', 'Average facial-rash score by that day’s sun exposure', sc));
  const lv = SYM.sun.options;
  const same = lv.map(o => logged.filter(d => getCell(d, 'sun') === o).map(d => getCell(d, 'rash')).filter(v => typeof v === 'number'));
  const next = lv.map(o => logged.filter(d => getCell(d, 'sun') === o).map(d => [getCell(addDays(d, 1), 'rash'), getCell(addDays(d, 2), 'rash')].filter(v => typeof v === 'number')).flat());
  groupedBars(sc, { groups: lv, series: [{ name: 'Same day', color: '#D2709A', values: same.map(mean), n: same.map(a => a.length) }, { name: 'Next 2 days', color: '#6A55C8', values: next.map(mean), n: next.map(a => a.length) }] });

  // before / after
  const changes = meds.flatMap(m => doseChanges(m.id, addDays(today(), -365), today()).filter(c => c.prev !== undefined || c.value !== undefined).map(c => ({ ...c, med: m }))).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 4);
  if (changes.length) {
    const bc = h('div', { class: 'ba' });
    for (const c of changes) {
      const before = range(addDays(c.date, -14), addDays(c.date, -1)), after = range(c.date, addDays(c.date, 13)).filter(d => d <= today());
      const rows = ['fatigue', 'brainfog', 'mood', 'anxiety', 'refreshed', 'rash'].map(id => { const b = vals(id, before).filter(v => v != null), a = vals(id, after).filter(v => v != null); return { label: SYM[id].label, before: b.length >= 3 ? mean(b) : null, after: a.length >= 3 ? mean(a) : null, nb: b.length, na: a.length, betterHigh: SYM[id].better === 'high' }; });
      if (rows.every(r => r.before == null || r.after == null)) continue;
      const box = h('div'); dumbbell(box, rows);
      bc.append(h('div', { class: 'ba-block' }, h('h4', {}, `${c.med.name} ${c.prev ?? 'none'} → ${c.value ?? 'stopped'}${typeof c.value === 'number' ? ' ' + c.med.unit : ''}`, h('small', {}, ` · ${fmtDate(c.date)}`)), box));
    }
    if (bc.children.length) root.append(card('Before and after medication changes', 'Average of the 14 days before (hollow) and after (filled) each change. Green = moved in the better direction.', bc, 'wide'));
  }

  const three = h('div', { class: 'two' }); root.append(three);

  // sleep → fatigue
  const pc = h('div');
  three.append(card('Sleep and fatigue', 'Each dot is a day: how refreshed she woke vs. fatigue', pc));
  scatter(pc, { points: logged.map(d => ({ date: d, x: getCell(d, 'refreshed'), y: getCell(d, 'fatigue') })).filter(p => typeof p.x === 'number' && typeof p.y === 'number'), xLabel: 'Woke refreshed', yLabel: 'Fatigue' });

  // weekday
  const wc = h('div');
  three.append(card('Day-of-week rhythm', 'Average score by weekday', wc));
  const wsy = ['fatigue', 'brainfog', 'mood'];
  groupedBars(wc, { groups: WEEKDAYS, series: wsy.map(id => { const by = WEEKDAYS.map((_, k) => logged.filter(d => parse(d).getDay() === k).map(d => getCell(d, id)).filter(v => typeof v === 'number')); return { name: SYM[id].label, color: SERIES[id], values: by.map(mean), n: by.map(a => a.length) }; }) });

  // pill cycle
  if (pack) {
    const act = logged.filter(d => doseFor(d, pack.id).value === 'Active'), plc = logged.filter(d => doseFor(d, pack.id).value === 'Placebo');
    if (act.length && plc.length) {
      const pc2 = h('div');
      const ids = ['mood', 'anxiety', 'headache', 'fatigue', 'nausea', 'acne', 'rash'].filter(i => vals(i, plc).some(v => v != null) && vals(i, act).some(v => v != null));
      root.append(card(`${pack.name}: active vs. placebo days`, `Hormone-free days can shift mood and headaches, and they can also change lamotrigine levels. ${plc.length} placebo days and ${act.length} active days logged.`, pc2, 'wide'));
      groupedBars(pc2, { groups: ids.map(i => SYM[i].label), series: [{ name: 'Active pill', color: '#D2709A', values: ids.map(i => avgOf(i, act)), n: ids.map(i => vals(i, act).filter(v => v != null).length) }, { name: 'Placebo', color: '#4A72C8', values: ids.map(i => avgOf(i, plc)), n: ids.map(i => vals(i, plc).filter(v => v != null).length) }] });
    }
  }

  // correlations
  const cs = SYMPTOMS.filter(s => s.type === 'scale' && vals(s.id, logged).filter(v => v != null).length >= 8);
  const M = [], N = [];
  cs.forEach((a, i) => { M[i] = []; N[i] = []; cs.forEach((b, j) => { const xs = [], ys = []; logged.forEach(d => { const x = getCell(d, a.id), y = getCell(d, b.id); if (typeof x === 'number' && typeof y === 'number') { xs.push(x); ys.push(y); } }); N[i][j] = xs.length; M[i][j] = xs.length >= 8 ? pearson(xs, ys) : null; }); });
  const xc = h('div');
  if (cs.length >= 2) root.append(card('What moves together', 'Same-day correlation between scores (needs at least 8 days of both). Strong colours = stronger link.', xc, 'wide'));
  if (cs.length >= 2) matrix(xc, { labels: cs.map(s => s.label), m: M, n: N });

  // weight & sleep hours (separate charts, never a shared axis)
  const four = h('div', { class: 'two' }); root.append(four);
  const hrs = vals('sleep_hrs', dates);
  if (hrs.some(v => v != null)) { const c = h('div'); four.append(card('Hours slept', null, c)); lineChart(c, { dates, ymin: 0, ymax: 12, height: 200, unit: 'h', series: [{ name: 'Hours slept', color: '#22A07A', values: hrs, smooth: rolling(hrs) }] }); }
  const wt = vals('weight', dates);
  if (wt.some(v => v != null)) {
    const nums = wt.filter(v => v != null), lo = Math.floor(Math.min(...nums) - 3), hi = Math.ceil(Math.max(...nums) + 3);
    const c = h('div'); four.append(card('Weight', null, c)); lineChart(c, { dates, ymin: lo, ymax: hi, height: 200, unit: '', series: [{ name: 'Weight (lb)', color: '#6A55C8', values: wt, smooth: rolling(wt) }] });
  }

  // completeness
  const cc = h('div');
  root.append(card('Logging consistency', 'Share of days in this period with at least one entry in each group', cc));
  hbars(cc, GROUPS.filter(g => SYMPTOMS.some(s => s.g === g.id && s.type !== 'photo')).map(g => { const ss = SYMPTOMS.filter(s => s.g === g.id && s.type !== 'photo'); const n = dates.filter(d => ss.some(s => getCell(d, s.id) !== undefined)).length; return { label: `${g.glyph} ${g.name}`, value: n / dates.length, note: ` ${n}d`, color: '#22A07A' }; }));
}

function highlights(dates, prevDates) {
  const out = [];
  const f = avgOf('fatigue', dates), fp = avgOf('fatigue', prevDates);
  if (f != null) out.push(`Fatigue averaged <b>${round1(f)}</b>/10${fp != null ? `, ${Math.abs(f - fp) < 0.25 ? 'about the same as' : f < fp ? `<span class="good">down ${(fp - f).toFixed(1)}</span> from` : `<span class="bad">up ${(f - fp).toFixed(1)}</span> from`} the period before` : ''}.`);
  const nr = dates.filter(d => getCell(d, 'newrash') === true);
  if (nr.length) out.unshift(`<span class="bad">New rash, blisters or peeling</span> was logged on ${nr.map(fmtDate).join(', ')}. Any new rash while lamotrigine is being started or increased should be seen by a clinician promptly.`);
  const lots = dates.filter(d => getCell(d, 'sun') === 'Lots').map(d => getCell(addDays(d, 1), 'rash')).filter(v => typeof v === 'number');
  const none = dates.filter(d => getCell(d, 'sun') === 'None').map(d => getCell(addDays(d, 1), 'rash')).filter(v => typeof v === 'number');
  if (lots.length >= 3 && none.length >= 3) out.push(`The day after <b>lots of sun</b>, the rash averaged <b>${round1(mean(lots))}</b> vs <b>${round1(mean(none))}</b> after no sun (${lots.length} and ${none.length} days).`);
  // strongest pair
  const cs = SYMPTOMS.filter(s => s.type === 'scale'); let best = null;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const xs = [], ys = []; dates.forEach(d => { const x = getCell(d, cs[i].id), y = getCell(d, cs[j].id); if (typeof x === 'number' && typeof y === 'number') { xs.push(x); ys.push(y); } });
    if (xs.length < 10) continue; const r = pearson(xs, ys); if (r != null && Math.abs(r) >= 0.45 && (!best || Math.abs(r) > Math.abs(best.r))) best = { r, a: cs[i].label, b: cs[j].label, n: xs.length };
  }
  if (best) out.push(`<b>${best.a}</b> and <b>${best.b}</b> tend to ${best.r > 0 ? 'rise and fall together' : 'move in opposite directions'} (r = ${best.r.toFixed(2)}, ${best.n} days).`);
  const flagSyms = SYMPTOMS.filter(s => s.g === 'flags' && s.type === 'yesno' && !s.urgent);
  const seen = flagSyms.map(s => [s, dates.filter(d => getCell(d, s.id) === true).length]).filter(([, n]) => n);
  if (seen.length) out.push(`Immune clues seen: ${seen.map(([s, n]) => `${s.label.toLowerCase()} (${n}d)`).join(', ')}.`);
  else if (dates.some(d => flagSyms.some(s => getCell(d, s.id) === false))) out.push('No immune clues were logged as present in this period.');
  const lam = medList().find(m => m.id === 'lamictal');
  if (lam) { const ch = doseChanges(lam.id, addDays(today(), -120), today()).at(-1); if (ch) out.push(`Last ${lam.name} change: <b>${ch.prev ?? 'start'} → ${ch.value ?? 'stopped'}${typeof ch.value === 'number' ? ' ' + lam.unit : ''}</b> on ${fmtDate(ch.date)}.`); }
  if (!out.length) out.push('Keep logging. Patterns usually start to show after 2–3 weeks of consistent check-ins.');
  return out;
}
