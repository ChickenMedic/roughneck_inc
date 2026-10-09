// World-generation, calendar, price-track, Phase 3 invariants and determinism check. Run: node test/smoke.mjs [seed]
import { newGame, advanceMonth, migrateState } from '../js/sim.js';
import { dateStr, monthOf, yearOf } from '../js/util.js';
import { inflate } from '../js/era.js';
import { resolveEvent } from '../js/events.js';
import { approach } from '../js/people.js';

const seed = Number(process.argv[2] || 42);
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } };
const noNaN = (o) => !JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN!' : v)).includes('NaN!');
const topUp = (st) => { st.company.cash = Math.max(st.company.cash, inflate(st, 100_000)); }; // no bot plays here; keep the office open
const drain = (st) => { while (st.pending.length) resolveEvent(st, 0, st.log); }; // indicted: hire the lawyer
// Nobody drills in the smoke run, but somebody should be leaning on the courthouse so the law has something to find:
// an envelope for the judge every eighteen months, from a company with too much cash and no courthouse man,
// until the first conviction teaches it manners.
const crooked = (st) => { if (st.month % 18 === 6 && st.law.absentUntil <= st.month && !st.law.convictions) approach(st, 'judge', 'bribe', { ask: 'permit' }); };

const s = newGame({ seed, skipFounding: true });
assert(dateStr(0) === 'Sep 1952', `month 0 is ${dateStr(0)}`);
console.log('pools:', s.pools.map((p) => `${p.name}: ${p.parcels.length} sections, ${Math.round(p.ooip / 1e6)} MMbbl OOIP, ${p.discovered ? 'known' : 'undiscovered'}, ${Math.round(p.x * 100)}% depleted, pressure ${Math.round(p.pressure * 100)}%`).join('\n  '));
console.log('competitors:', s.competitors.map((c) => `${c.tag}: ${c.held.length} sections, ${c.wells.length} wells, ${Math.round(c.wells.reduce((a, w) => a + w.qi, 0))} bbl/d IP total${c.dormant ? ' (dormant)' : ''}, ethics ${c.ethics.toFixed(2)}`).join('; '));
console.log('people:', Object.values(s.people).map((p) => `${p.office}: ${p.name} (${p.party || 'none'}, disp ${p.disposition}, honesty ${p.honesty.toFixed(2)}, corrupt ${p.corruptibility.toFixed(2)}, ${p.secrets.length} secret${p.secrets.length === 1 ? '' : 's'})`).join('; '));
console.log('parcels on structure:', s.parcels.filter((p) => p.truth.sand.onStructure).length, 'of', s.parcels.length, '| held by rivals:', s.parcels.filter((p) => p.mineral.leasedBy && p.mineral.leasedBy !== 'player').length, '| permits this year:', s.permits.countyBudget, '| allowable', s.permits.allowable.toFixed(2));
assert(s.competitors.every((c) => c.wells.every((w) => w.target === 'sand')), 'no shale wells in 1952');
assert(s.competitors.find((c) => c.tag === 'TB').held.length === 0, 'Trans-Basin holds nothing while dormant');
assert(Object.keys(s.offices).length === 8 && Object.values(s.offices).every((id) => s.people[id]), 'eight offices filled');
assert(s.permits.countyBudget >= 1, 'permit budget initialised');

// Run 30 years. Track the price at the checkpoints and the Phase 3 invariants every month.
const prices = {};
let snapshot120 = null, elections = 0;
for (let i = 0; i < 360; i++) {
  topUp(s); crooked(s); advanceMonth(s); drain(s);
  if (s.month === monthOf(1955, 8)) prices[1955] = s.market.oil;
  if (s.month === monthOf(1975, 8)) prices[1975] = s.market.oil;
  if (s.month === monthOf(1981, 8)) prices[1981] = s.market.oil;
  if (s.month === 120) snapshot120 = JSON.stringify({ ...s, log: undefined });
  assert(noNaN({ cash: s.company.cash, value: s.company.value, rep: s.company.reputation, heat: s.law.heat, notoriety: s.press.notoriety, morale: s.labor.morale }), `NaN at month ${s.month}`);
  assert(s.permits.countyUsed <= s.permits.countyBudget, `countyUsed ${s.permits.countyUsed} > countyBudget ${s.permits.countyBudget} at month ${s.month}`);
  for (const p of Object.values(s.people)) assert(p.disposition >= 0 && p.disposition <= 100, `${p.name} disposition ${p.disposition} out of range at month ${s.month}`);
  assert(s.permits.allowable > 0 && s.permits.allowable <= 1, `allowable ${s.permits.allowable} out of range`);
}
elections = s.news.filter((n) => /ELECTION DAY/.test(n.text)).length;
assert(!s.company.bankrupt && s.month === 360, `the smoke company should survive thirty years (bankrupt ${s.company.bankrupt}, ruined ${s.law.ruined}, month ${s.month})`);
console.log(`ran to ${dateStr(s.month)}; oil Sep 1955 $${prices[1955].toFixed(2)}, Sep 1975 $${prices[1975].toFixed(2)}, Sep 1981 $${prices[1981].toFixed(2)}; allowable now ${s.permits.allowable.toFixed(2)}`);
assert(prices[1955] >= 2.2 && prices[1955] <= 3.6, `oil in Sep 1955 out of range: ${prices[1955]}`);
assert(prices[1975] > 6, `oil in 1975 should exceed $6: ${prices[1975]}`);
assert(prices[1981] > 20, `oil in 1981 should exceed $20: ${prices[1981]}`);
assert(s.tech && Object.keys(s.tech.unlocks).length > 0, 'tech table initialised');
assert(s.press.clippings.length > 0, 'the Clarion printed something in thirty years');
assert(s.permits.allowable === 1, 'proration over by 1982');
console.log(`clippings: ${s.press.clippings.length}, disasters: ${s.disasters.count} (${Object.entries(s.disasters.byKind).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), investigations: ${s.law.investigations.length}, crimes: ${s.crimes.filter((c) => !c.byRival).length} yours / ${s.crimes.filter((c) => c.byRival).length} theirs, elections logged: ${elections}`);
console.log(s.press.clippings.slice(-6).map((c) => `[${dateStr(c.month)}] ${c.headline}`).join('\n'));
console.log('people after 30 years:', Object.keys(s.offices).map((o) => { const p = s.people[s.offices[o]]; return `${o}: ${p.name} (${p.party || '-'}, ${Math.round(p.disposition)})`; }).join('; '));
console.log('pools after 30 years:', s.pools.map((p) => `${p.name} ${p.discovered ? 'known' : 'hidden'} ${Math.round(p.x * 100)}%`).join(', '));

// Determinism: a second run with the same seed must produce the identical state at month 120.
const s2 = newGame({ seed, skipFounding: true });
let snapshot120b = null;
for (let i = 0; i < 120; i++) { topUp(s2); crooked(s2); advanceMonth(s2); drain(s2); if (s2.month === 120) snapshot120b = JSON.stringify({ ...s2, log: undefined }); }
assert(snapshot120 === snapshot120b, 'two runs with the same seed diverged by month 120');

// Migration: strip the Phase 3 keys from a save and backfill them; migrate twice and nothing changes.
const old = JSON.parse(JSON.stringify({ ...s2, log: undefined }));
for (const k of ['people', 'offices', 'press', 'crimes', 'dirt', 'law', 'labor', 'disasters', 'permits']) delete old[k];
for (const st of old.staff) delete st.loyalty;
for (const c of old.competitors) { delete c.ethics; delete c.heat; delete c.hostility; delete c.standing; }
migrateState(old);
const once = JSON.stringify({ ...old, log: undefined });
migrateState(old);
assert(JSON.stringify({ ...old, log: undefined }) === once, 'migrateState is idempotent');
assert(old.people && old.offices.judge && old.press && old.law && old.labor && old.disasters && old.permits && old.staff.every((x) => x.loyalty !== undefined) && old.competitors.every((c) => c.ethics !== undefined), 'migrateState backfilled every key');
advanceMonth(old); drain(old);
assert(noNaN({ cash: old.company.cash, value: old.company.value }), 'migrated save ticks without NaN');

// At least one disaster and one investigation across seeds 1, 7 and 42 over thirty years.
let disasters = 0, investigations = 0;
for (const sd of [1, 7, 42]) {
  const st = newGame({ seed: sd, skipFounding: true });
  for (let i = 0; i < 360; i++) { topUp(st); crooked(st); advanceMonth(st); drain(st); }
  disasters += st.disasters.count; investigations += st.law.investigations.length;
  console.log(`seed ${sd}: ${st.disasters.count} disasters, ${st.law.investigations.length} investigations (${st.law.indictments} indictments, ${st.law.convictions} convictions), heat ${Math.round(st.law.heat)}, ${st.press.clippings.length} clippings, ${st.crimes.filter((c) => c.byRival).length} rival tricks${st.company.bankrupt ? ', RUINED' : ''}`);
}
assert(disasters > 0, 'at least one disaster across seeds 1/7/42');
assert(investigations > 0, 'at least one investigation across seeds 1/7/42');

// The 1987 check and the shale gate need a longer run.
const s3 = newGame({ seed: seed + 1, skipFounding: true });
let firstShale3 = null; const p1987 = [];
for (let i = 0; i < 12 * 60; i++) {
  topUp(s3); advanceMonth(s3); drain(s3);
  if (yearOf(s3.month) === 1987) p1987.push(s3.market.oil);
  if (firstShale3 === null && s3.competitors.some((c) => c.wells.some((w) => w.target === 'shale'))) firstShale3 = yearOf(s3.month);
}
const avg1987 = p1987.reduce((a, b) => a + b, 0) / p1987.length;
console.log(`seed ${seed + 1}: 1987 average oil $${avg1987.toFixed(2)}, first rival shale well ${firstShale3 ?? 'none'} (${dateStr(s3.month)})`);
assert(avg1987 < 17, `1987 average oil should be under $17: ${avg1987}`);
assert(firstShale3 === null || firstShale3 >= 1990, `shale well before 1990: ${firstShale3}`);
assert(firstShale3 !== null, 'expected a rival shale well by 2012 once the technology unlocked');
assert(!s3.competitors.find((c) => c.tag === 'TB').dormant && s3.competitors.find((c) => c.tag === 'TB').held.length > 0, 'Trans-Basin should be active after 1975');
assert(noNaN({ cash: s3.company.cash, value: s3.company.value, rep: s3.company.reputation }), 'NaN in long run');
JSON.parse(JSON.stringify({ ...s, log: undefined }));
console.log(failures ? `${failures} FAILURE(S)` : 'smoke OK');
process.exit(failures ? 1 : 0);
