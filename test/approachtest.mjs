// Monte Carlo over approach(): success rates per method and ask, bribe success rising with corruptibility,
// honest officials reporting the envelope. Run: node test/approachtest.mjs [seed] [n]
import { newGame } from '../js/sim.js';
import { seedRng } from '../js/rng.js';
import { approach, ASKS, METHODS, expectedBribe, holder, askCatalog, conversation, personFor } from '../js/people.js';
import { inflate } from '../js/era.js';
import { addDirt } from '../js/law.js';

const seed = Number(process.argv[2] || 42);
const N = Number(process.argv[3] || 2000);
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } };
const pad = (v, n) => String(v).padStart(n);

// A fresh state per trial is too slow; instead reset the fields a trial touches.
const base = newGame({ seed, skipFounding: true });
function fresh(personOverrides = {}) {
  const s = base;
  s.month = 24; s.company.cash = inflate(s, 500_000); s.company.creditLimit = inflate(s, 30_000); s.company.reputation = 55;
  s.crimes = []; s.dirt = []; s.pending = []; s.law.heat = 0; s.law.investigations = []; s.press.stories = []; s.press.notoriety = 0; s.press.goodwill = 4;
  s.permits.countyBudget = 4; s.permits.countyUsed = 4; s.permits.bonus = 0; s.permits.exemptions = []; s.permits.spacingWaivers = []; s.permits.freezeUntil = -1;
  s.gov.donations = { ring: 0, reform: 0 }; s.flags.townDrilling = false;
  for (const p of Object.values(s.people)) { p.cooldownUntil = -1; p.askCooldown = {}; p.hostile = false; p.bought = false; p.cowed = false; p.favors = 0; p.disposition = 55; p.memory = []; Object.assign(p, personOverrides[p.office] || {}); }
  return s;
}
const s0 = fresh();
console.log('offices:', Object.keys(s0.offices).map((o) => { const p = holder(s0, o); return `${o}=${p.name} (h ${p.honesty.toFixed(2)} c ${p.corruptibility.toFixed(2)} g ${p.greed.toFixed(2)})`; }).join(', '));

// --- Rate table: method x ask ------------------------------------------------------------
const askOpts = (s, ask, p) => ask === 'spacing' ? { parcelId: 0 } : ask === 'plant' ? { target: 'self' } : ask === 'allowable' ? { wellId: null } : {};
const rows = [];
console.log('\n' + pad('ask', 14) + pad('who', 10) + METHODS.map((m) => pad(m, 11)).join('') + '   (success rate; bribe at 1.3x expected, blackmail with strength .6 dirt)');
for (const [ask, def] of Object.entries(ASKS)) {
  if (def.who.includes('landowner')) continue;
  const office = def.who[0];
  const row = [];
  for (const method of METHODS) {
    let ok = 0, tried = 0;
    seedRng(seed * 7 + 1);
    for (let i = 0; i < N; i++) {
      const s = fresh({ [office]: { disposition: 60 } });
      const p = holder(s, office);
      if (ask === 'bury') s.press.stories.push({ id: 1, month: s.month, kind: 'spill', about: 'player', heat: 40, repHit: 5, lawHeat: 0, status: 'brewing', printMonth: s.month, headline: 'X', truth: true });
      if (ask === 'drop') s.law.investigations.push({ id: 1, by: office === 'sheriff' ? 'sheriff' : 'state', opened: s.month - 3, evidence: 30, progress: 3, status: 'open', crimeIds: [] });
      if (ask === 'dismiss') s.law.investigations.push({ id: 1, by: 'sheriff', opened: s.month - 3, evidence: 60, progress: 3, status: 'charged', crimeIds: [] });
      if (method === 'blackmail') addDirt(s, { personId: p.id, kind: 'a lady friend in Tulsa', strength: 0.6, source: 'test' });
      if (method === 'threaten' && !s.staff.some((x) => x.traits.includes('cowboy'))) s.staff[0].traits.push('cowboy');
      const o = { ask, ...askOpts(s, ask, p) };
      if (method === 'bribe') o.amount = Math.round(expectedBribe(s, p, ask) * 1.3);
      if (method === 'donate') o.amount = inflate(s, 500);
      const r = approach(s, office, method, o);
      if (['cooldown', 'unavailable', 'nodirt', 'nocowboy', 'ask'].includes(r.outcome)) continue;
      tried++; if (r.ok) ok++;
    }
    row.push(tried ? (ok / tried).toFixed(2) : '  -');
  }
  rows.push([ask, office, ...row]);
  console.log(pad(ask, 14) + pad(office, 10) + row.map((v) => pad(v, 11)).join(''));
}

// --- Bribe success is monotone in corruptibility ------------------------------------------------
console.log('\nbribe success vs corruptibility (judge, permit, honesty .45, amount = expected):');
const corr = [0.1, 0.3, 0.5, 0.7, 0.9];
const bribeRates = [];
for (const c of corr) {
  let ok = 0; seedRng(seed * 11 + 3);
  for (let i = 0; i < N; i++) {
    const s = fresh({ judge: { corruptibility: c, honesty: 0.45, greed: 0.5 } });
    const p = holder(s, 'judge');
    const r = approach(s, 'judge', 'bribe', { ask: 'permit', amount: Math.round(expectedBribe(s, p, 'permit')) });
    if (r.ok) ok++;
  }
  bribeRates.push(ok / N);
}
console.log(corr.map((c, i) => `c=${c}: ${bribeRates[i].toFixed(3)}`).join('  '));
for (let i = 1; i < bribeRates.length; i++) assert(bribeRates[i] > bribeRates[i - 1], `bribe success not monotone: c=${corr[i - 1]} ${bribeRates[i - 1]} vs c=${corr[i]} ${bribeRates[i]}`);
assert(bribeRates[0] < 0.25 && bribeRates[4] > 0.7, `bribe rates at the extremes: ${bribeRates[0]} / ${bribeRates[4]}`);

// --- Honest officials report the envelope more than 30% of the time --------------------------------
console.log('\nreport rate when bribing (sheriff, drop, amount = expected):');
const honestyLevels = [0.3, 0.5, 0.7, 0.85];
const reports = [];
for (const h of honestyLevels) {
  let reported = 0, refused = 0; seedRng(seed * 13 + 5);
  for (let i = 0; i < N; i++) {
    const s = fresh({ sheriff: { honesty: h, corruptibility: 0.3, greed: 0.5 } });
    s.law.investigations.push({ id: 1, by: 'sheriff', opened: s.month - 3, evidence: 30, progress: 3, status: 'open', crimeIds: [] });
    const p = holder(s, 'sheriff');
    const r = approach(s, 'sheriff', 'bribe', { ask: 'drop', amount: Math.round(expectedBribe(s, p, 'drop')) });
    if (r.outcome === 'reported') reported++;
    if (!r.ok) refused++;
  }
  reports.push(reported / N);
  console.log(`honesty ${h}: reported ${(reported / N).toFixed(3)} of attempts (${(reported / Math.max(1, refused)).toFixed(2)} of refusals)`);
}
assert(reports[3] > 0.3, `honest sheriff (honesty .85) should report more than 30%: ${reports[3]}`);
assert(reports[0] < reports[3], 'report rate rises with honesty');

// --- Persuasion with decent relations should work often enough to keep a driller busy ------------------
console.log('\npersuade success for a permit vs judge disposition (reputation 55, no courthouse man):');
const dispLevels = [40, 55, 70, 85];
const persuade = [];
for (const d of dispLevels) {
  let ok = 0; seedRng(seed * 17 + 7);
  for (let i = 0; i < N; i++) { const s = fresh({ judge: { disposition: d } }); if (approach(s, 'judge', 'persuade', { ask: 'permit' }).ok) ok++; }
  persuade.push(ok / N);
}
console.log(dispLevels.map((d, i) => `disp ${d}: ${persuade[i].toFixed(3)}`).join('  '));
assert(persuade[2] > 0.35, `persuade at disposition 70 should succeed more than 35%: ${persuade[2]}`);
assert(persuade[3] > persuade[0], 'persuade rises with disposition');

// --- Conversation and catalog shapes ---------------------------------------------------------------
const s = fresh();
const cat = askCatalog(s, 'judge');
assert(cat.length >= 2 && cat.every((c) => 'ask' in c && 'label' in c && 'available' in c && 'bribe' in c), 'askCatalog shape');
const node = conversation(s, 'judge');
assert(node.title && node.text && node.speaker?.name && node.speaker?.portrait && Array.isArray(node.options) && node.options.length >= 2, 'conversation root node shape');
const askNode = conversation(s, 'judge', 'permit');
assert(askNode.options.some((o) => o.method === 'persuade') && askNode.options.some((o) => o.method === 'bribe'), 'conversation ask node offers persuade and bribe');
const r = askNode.options.find((o) => o.method === 'persuade').effect(s, {}, () => {});
assert(r && typeof r.ok === 'boolean' && typeof r.text === 'string', 'option effect returns the approach result');
const lo = personFor(s, 'parcel:5');
assert(lo && lo.office === 'landowner' && typeof lo.disposition === 'number', 'landowner adapter');
const oneAMonth = approach(s, 'judge', 'persuade', { ask: 'permit' });
assert(oneAMonth.outcome === 'cooldown', 'one approach per person per month');
JSON.parse(JSON.stringify({ ...s, log: undefined }));
console.log(failures ? `${failures} FAILURE(S)` : '\napproachtest OK');
process.exit(failures ? 1 : 0);
