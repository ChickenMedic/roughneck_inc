// The founding year: recruit a roster by talking, form the company, run it; fail by idling; autoFound is deterministic.
// Run: node test/foundtest.mjs [seed]
import { newGame, advanceMonth, isFounding, computeValuation } from '../js/sim.js';
import { founderTalk, foundersAt, canForm, formCompany, foundingSummary, FOUNDERS, FOUNDER_PLACES, founderTerms, capitalAt } from '../js/founding.js';
import { fire, founderBuyout } from '../js/staff.js';
import { resolveEvent, EVENTS } from '../js/events.js';
import { inflate } from '../js/era.js';
import { money, dateStr } from '../js/util.js';
import { FOUNDING_CASH, FOUNDING_LIVING, FOUNDING_MONTHS, PORTRAITS } from '../js/data.js';

const seed = Number(process.argv[2] || 42);
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } };
const noNaN = (o) => !JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN!' : v)).includes('NaN!');
const drain = (st) => { while (st.pending.length) resolveEvent(st, 0, st.log); };
const strip = (st) => JSON.stringify({ ...st, log: undefined });
// Pick a dialogue option by label prefix and run its effect the way the UI does.
const choose = (st, node, prefix) => { const o = node.options.find((x) => x.label.startsWith(prefix)); assert(o, `option "${prefix}" on "${node.title}" (have: ${node.options.map((x) => x.label).join(' | ')})`); if (!o) return null; assert(!o.disabled, `option "${prefix}" enabled (${o.hint || ''})`); return o.effect(st, {}, st.log); };

// --- Roster sanity -------------------------------------------------------------------------------------------
for (const [id, d] of Object.entries(FOUNDERS)) {
  assert(FOUNDER_PLACES.includes(d.place), `${id} place ${d.place} is a known place`);
  assert(PORTRAITS.includes(d.portrait), `${id} portrait ${d.portrait} is drawable`);
}

// --- The scripted founding: Pruitt, the Jessup brothers, Ellison ---------------------------------------------
const s = newGame({ seed });
assert(isFounding(s), 'a default new game starts in the founding phase');
assert(s.company.cash === 0 && s.staff.length === 0, 'no company cash or staff before formation');
assert(s.founding.personalCash === inflate(s, FOUNDING_CASH) && s.founding.livingCost === inflate(s, FOUNDING_LIVING) && s.founding.monthsLeft === FOUNDING_MONTHS, 'founding defaults');
assert(s.company.value === s.founding.personalCash, 'company value during founding is the money in your pocket');
const cafe = foundersAt(s, 'cafe');
assert(cafe.length === 1 && cafe[0].id === 'pruitt' && cafe[0].status === 'available', 'Pruitt is at the cafe');
assert(foundersAt(s, 'church').map((f) => f.id).sort().join() === 'hargrove,preacher', 'the widow and the pastor are at the church');
assert(foundersAt(s, 'bank')[0].name === s.people[s.offices.banker].name, 'Ellison is the banker from state.people');
console.log('roster:', FOUNDER_PLACES.map((pl) => `${pl}: ${foundersAt(s, pl).map((f) => `${f.name} [${f.terms}]`).join(', ') || '-'}`).join('\n  '));

// Ellison refuses before there is a geologist and a rig.
let node = founderTalk(s, 'ellison');
assert(node.speaker && node.speaker.name && node.text && node.options.length >= 3, 'founderTalk is conversation-shaped');
let acc = node.options.find((o) => o.label.startsWith('Accept'));
assert(acc && acc.disabled && /geologist/.test(acc.hint), `Ellison's loan is gated on a geologist (${acc?.hint})`);
let r = acc.effect(s, {}, s.log);
assert(r && r.ok === false, 'the gated effect refuses politely');

// Ask about Pruitt, then accept his terms.
node = founderTalk(s, 'pruitt');
const about = node.options.find((o) => o.label === 'Ask about them');
assert(about && typeof about.next === 'function', 'ask-about hands the UI a next node');
const aboutNode = about.next(s);
assert(/Seminole/.test(aboutNode.text) && aboutNode.options.some((o) => typeof o.next === 'function'), 'about node has the blurb and a way back');
r = choose(s, founderTalk(s, 'pruitt'), 'Accept');
assert(r.ok, `Pruitt signs: ${r.msg}`);
assert(s.founding.founders.pruitt.status === 'signed' && s.founding.founders.pruitt.terms.equity === 0.10, 'Pruitt signed at 10%');
r = choose(s, founderTalk(s, 'jessup'), 'Accept');
assert(r.ok, `Jessup signs: ${r.msg}`);
let cf = canForm(s);
assert(!cf.ok && cf.missing.length === 1 && /capital/.test(cf.missing[0]), `geologist + rig but not enough money: ${cf.missing.join('; ')}`);
r = choose(s, founderTalk(s, 'ellison'), 'Accept');
assert(r.ok, `Ellison lends: ${r.msg}`);
cf = canForm(s);
assert(cf.ok && cf.missing.length === 0, `canForm true (${cf.missing.join('; ')})`);
const expectedCash = inflate(s, FOUNDING_CASH) + inflate(s, 30_000) - inflate(s, 4_000);
assert(capitalAt(s) === expectedCash, `capital ${capitalAt(s)} = ${expectedCash}`);
const summary = foundingSummary(s);
assert(summary.canForm && summary.signed.length === 3 && summary.geologist && summary.rig, 'foundingSummary agrees');

// Counter-offers resolve either way and never throw; the option disappears once refused.
const s0 = newGame({ seed: seed + 100 });
const ctr = founderTalk(s0, 'cobb').options.find((o) => o.label.startsWith('Counter'));
assert(ctr && typeof ctr.effect === 'function', 'Cobb offers a counter');
const cr = ctr.effect(s0, {}, s0.log);
assert(typeof cr.ok === 'boolean' && typeof cr.msg === 'string' && cr.p > 0 && cr.p < 1, `counter returns {ok, msg, p} (${JSON.stringify(cr)})`);
if (cr.ok) assert(s0.founding.founders.cobb.status === 'signed' && s0.founding.founders.cobb.terms.equity < 0.03, 'a won counter signs at the lower number');
else assert(s0.founding.founders.cobb.status === 'available' && !founderTalk(s0, 'cobb').options.some((o) => o.label.startsWith('Counter')), 'a lost counter leaves them available and done haggling');

// Form the company.
const form = formCompany(s, { name: 'Coyote Creek Oil' });
assert(form.ok, `formCompany: ${form.msg}`);
assert(!isFounding(s) && s.founding.phase === 'done' && s.founding.formedMonth === 0, 'founding is over');
assert(s.company.name === 'Coyote Creek Oil', 'company named');
assert(s.company.cash === expectedCash, `company cash ${s.company.cash} = personal + loan - contract (${expectedCash})`);
const pruitt = s.staff.find((x) => x.founderId === 'pruitt');
assert(pruitt && pruitt.founder && pruitt.equity === 0.10 && pruitt.role === 'geologist' && pruitt.skill === 8 && pruitt.traits.includes('drinker'), 'Pruitt is on staff as a founder');
assert(s.company.equitySold === 0.10, `equitySold ${s.company.equitySold}`);
assert(s.company.loan && s.company.loan.principal === inflate(s, 30_000) && s.company.loan.balance === s.company.loan.principal && s.company.loan.monthly > 0 && s.company.loan.term === 60, 'loan on the books');
assert(s.flags.rigCredits === 3, 'Jessup contract gives three rig credits');
assert(s.founding.pruittParcels.length === 3, 'Pruitt marked three sections');
const pools = new Set(s.founding.pruittParcels.map((id) => s.parcels[id].truth.sand.pool));
assert(pools.size === 1 && !s.pools.find((p) => p.id === [...pools][0]).discovered, 'all three sections lie in one undiscovered field');
assert(s.founding.pruittParcels.every((id) => s.parcels[id].survey.level === 2 && s.parcels[id].survey.est && s.parcels[id].survey.by === pruitt.name), 'level-2 estimates by Pruitt exist');
assert(s.company.creditLimit > 0 && s.company.creditScale >= 0.5 && s.company.creditScale <= 1.25, `credit line ${money(s.company.creditLimit)} (scale ${s.company.creditScale})`);
assert(s.candidates.length >= 6, 'candidates to hire after formation');
assert(s.news.some((n) => /incorporated/.test(n.text)), 'incorporation news line');
console.log(`formed ${s.company.name}: cash ${money(s.company.cash)}, credit ${money(s.company.creditLimit)}, loan ${money(s.company.loan.principal)} at ${(s.company.loan.rate * 100).toFixed(1)}% (${money(s.company.loan.monthly)}/mo), equity sold ${Math.round(s.company.equitySold * 100)}%, Pruitt's sections ${s.founding.pruittParcels.join(', ')}`);

// Twenty-four months, then on to month sixty: the note amortises to zero; nothing goes NaN.
const bal0 = s.company.loan.balance;
for (let i = 0; i < 24; i++) { advanceMonth(s); drain(s); assert(noNaN({ cash: s.company.cash, value: s.company.value, loan: s.company.loan.balance, credit: s.company.creditLimit }), `NaN at month ${s.month}`); }
assert(s.company.loan.balance < bal0 && s.company.loan.balance > 0, `loan amortising (${money(bal0)} -> ${money(s.company.loan.balance)})`);
assert(s.ledger.interest > 0, 'interest hits the ledger');
assert(s.history.length === 24 && s.history.every((h) => Number.isFinite(h.cash)), 'history rows pushed');
console.log(`after 24 months: ${dateStr(s.month)}, cash ${money(s.company.cash)}, loan balance ${money(s.company.loan.balance)}, staff ${s.staff.length}, bankrupt ${s.company.bankrupt}`);
for (let i = 24; i < 60 && !s.company.bankrupt; i++) { s.company.cash = Math.max(s.company.cash, inflate(s, 50_000)); advanceMonth(s); drain(s); }
assert(s.company.loan.balance === 0, `loan paid off by month 60 (balance ${s.company.loan.balance})`);
assert(s.news.some((n) => /paid off/.test(n.text)), 'pay-off news line');

// Firing a founder means buying out the equity.
computeValuation(s);
const buy = founderBuyout(s, pruitt);
assert(buy === Math.round(0.10 * Math.max(s.company.value, 0)), `buyout ${buy} = 10% of value ${money(s.company.value)}`);
s.company.cash = -s.company.creditLimit; // broke: cannot buy him out
let fr = fire(s, pruitt.id);
assert(!fr.ok && /partner/.test(fr.msg || ''), 'cannot fire a founder without the buyout money');
s.company.cash = buy + pruitt.salary * 2 + inflate(s, 1_000);
const cashBefore = s.company.cash, eqBefore = s.company.equitySold; // drain() may have sold 30% to the Houston syndicate along the way
fr = fire(s, pruitt.id);
assert(fr.ok && fr.buyout === buy && s.company.cash === cashBefore - buy - fr.severance && !s.staff.some((x) => x.id === pruitt.id) && Math.abs(s.company.equitySold - (eqBefore - 0.10)) < 1e-9, `founder bought out (${JSON.stringify(fr)}, buy ${buy}, cash ${s.company.cash} vs ${cashBefore - buy - fr.severance}, equitySold ${eqBefore} -> ${s.company.equitySold})`);
JSON.parse(strip(s));

// --- Sandoval's rig and the widow's church section --------------------------------------------------------------
const s1 = newGame({ seed: seed + 1 });
for (const id of ['cobb', 'sandoval', 'hargrove']) { const rr = choose(s1, founderTalk(s1, id), 'Accept'); assert(rr && rr.ok, `${id} signs: ${rr?.msg}`); }
assert(formCompany(s1, { name: 'Sandoval & Cobb' }).ok, 'form with the rig and the widow');
assert(s1.flags.ownRig && s1.flags.ownRig.wellsLeft === 2 && s1.flags.ownRig.depthLimit === 4000, 'own rig flag');
assert(s1.founding.churchParcel !== null && s1.parcels[s1.founding.churchParcel].restricted === 'church', 'church section marked undrillable');
assert(Math.abs(s1.company.equitySold - 0.43) < 1e-9 && s1.company.loan === null, `widow 25% + Sandoval 15% + Cobb 3%, no loan (${s1.company.equitySold})`);
const bull = s1.staff.find((x) => x.founderId === 'sandoval');
assert(bull && bull.role === 'driller' && bull.equity === 0.15, 'Sandoval on staff at 15%');
const { estimateWell, defaultDesign, startWell } = await import('../js/wells.js');
const shallow = s1.parcels.filter((p) => p.drillable && p.truth.sand.depth <= 4000 && p.id !== s1.founding.churchParcel)[0];
const deep = s1.parcels.filter((p) => p.drillable && p.truth.sand.depth > 4000)[0];
if (shallow && deep) {
  const eS = estimateWell(s1, { ...shallow, survey: { level: 4, est: shallow.truth }, wells: [] }, defaultDesign('sand', s1), {});
  const eD = estimateWell(s1, { ...deep, survey: { level: 4, est: deep.truth }, wells: [] }, defaultDesign('sand', s1), {});
  assert(eS.ownRig && eS.months === 2, `shallow well uses the spudder (+1 month): ${eS.months}`);
  assert(!eD.ownRig && eD.months === 1, 'deep well is contracted out');
}
const church = s1.parcels[s1.founding.churchParcel];
const sw = startWell(s1, church, defaultDesign('sand', s1), null, null, s1.log);
assert(!sw.ok && sw.needs === 'restricted', `no drilling on the church section (${sw.msg})`);
assert(s1.people[s1.offices.preacher].favors === 0, 'no favour owed without the building fund');

// --- The failure path: a year in the hotel and nothing to show for it ---------------------------------------------
const f = newGame({ seed: seed + 2 });
const pc0 = f.founding.personalCash, lc0 = f.founding.livingCost;
let left = 0;
for (let i = 0; i < 12; i++) {
  assert(!f.pending.length, 'no decision events during founding');
  advanceMonth(f);
  left = f.news.filter((n) => n.kind === 'founderLeaves').length;
  assert(noNaN({ pc: f.founding.personalCash, v: f.company.value }), 'no NaN while idling');
  if (i < 11) assert(!f.company.bankrupt && isFounding(f), `still in town at month ${f.month}`);
}
assert(f.founding.failed && f.company.bankrupt && f.founding.phase === 'done', 'twelve idle months: failed and bankrupt');
assert(f.news.some((n) => /Tulsa to sell insurance/.test(n.text)), 'the insurance line');
assert(left >= 3 && Object.values(f.founding.founders).filter((x) => x.status === 'gone').length === left, `founders left town with a news line each (${left})`);
assert(f.founding.personalCash === pc0 - 12 * lc0, `living costs came out of your pocket (${f.founding.personalCash} vs ${pc0 - 12 * lc0})`);
assert(f.history.length === 12 && f.history.every((h) => h.oil === 0), 'reduced tick pushed history rows');
const m = f.month; advanceMonth(f); assert(f.month === m, 'a failed founding does not advance');
assert(f.company.cash === 0 && f.staff.length === 0, 'no company was ever formed');
const gone = founderTalk(f, 'pruitt');
assert(/left town/.test(gone.text) && gone.options.length === 1, 'talking to a departed founder says so');
JSON.parse(strip(f));

// The world keeps turning while you recruit: rivals lease and drill, the price moves, the cafe gossips.
const w = newGame({ seed: seed + 3 });
const oil0 = w.market.oil, rivalHeld0 = w.competitors.reduce((a, c) => a + c.held.length, 0);
for (let i = 0; i < 6; i++) advanceMonth(w);
assert(w.market.oilHistory.length > 12 && (w.market.oil !== oil0 || w.competitors.reduce((a, c) => a + c.held.length, 0) !== rivalHeld0 || w.news.length > 3), 'reduced tick moved the world');
assert(w.crimes.length === 0 && w.press.stories.length === 0, 'no rival tricks against a company that does not exist');

// --- skipFounding: deterministic, and the standard roster -------------------------------------------------------------
const a = newGame({ seed, skipFounding: true }), b = newGame({ seed, skipFounding: true });
assert(strip(a) === strip(b), 'newGame({skipFounding}) is deterministic');
assert(!isFounding(a) && a.founding.phase === 'done' && a.company.cash > 0, 'autoFound formed the company at month 0');
assert(a.staff.some((x) => x.founderId === 'pruitt') && a.staff.some((x) => x.founderId === 'whitlock'), 'Pruitt and Whitlock on the payroll');
assert(a.flags.boardPressure && a.flags.boardPressure.equity === 0.45 && a.flags.rigCredits === 3 && a.company.loan && a.company.loan.principal === inflate(a, 30_000), 'Cravens, Jessup and Ellison in the standard deal');
assert(Math.abs(a.company.equitySold - 0.60) < 1e-9, `standard deal sells 60% (${a.company.equitySold})`);
assert(a.company.cash === inflate(a, 12_000) + inflate(a, 60_000) + inflate(a, 30_000) - inflate(a, 4_000), `autoFound cash ${money(a.company.cash)}`);
assert(a.founding.pruittParcels.length === 3, "Pruitt's map in the standard deal too");
// The RNG stream is global (one seed per game), so the two runs go one after the other, never interleaved.
for (let i = 0; i < 12; i++) { advanceMonth(a); drain(a); }
const b2 = newGame({ seed, skipFounding: true });
for (let i = 0; i < 12; i++) { advanceMonth(b2); drain(b2); }
assert(strip(a) === strip(b2), 'still identical after a year');
assert(EVENTS.boardPressure && typeof EVENTS.boardPressure.when === 'function', 'boardPressure event exists');
a.flags.boardPressure.last = -99; a.pending = [];
assert(EVENTS.boardPressure.when(a), 'Cravens telephones a company with no wells');
const bp = EVENTS.boardPressure.params(a);
assert(bp.dividend > 0 && typeof EVENTS.boardPressure.text(a, bp) === 'string', 'boardPressure text renders');
for (let i = 0; i < 3; i++) { const cash = a.company.cash; EVENTS.boardPressure.options[i].effect(a, bp, a.log); assert(noNaN({ cash: a.company.cash, patience: a.flags.boardPressure.patience }), `boardPressure option ${i}`); if (i === 0) assert(a.company.cash === cash - bp.dividend, 'dividend paid'); }

// --- Migration: an old save without a founding key is treated as formed ----------------------------------------------
const { migrateState } = await import('../js/sim.js');
const old = JSON.parse(strip(a)); delete old.founding; delete old.company.creditScale;
migrateState(old);
assert(old.founding && old.founding.phase === 'done' && old.company.creditScale === 1 && !isFounding(old), 'migrateState backfills founding');
advanceMonth(old);
assert(noNaN({ cash: old.company.cash, value: old.company.value }), 'migrated save ticks');

console.log(failures ? `${failures} FAILURE(S)` : 'foundtest OK');
process.exit(failures ? 1 : 0);
