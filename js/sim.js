// New game creation, the monthly tick, and migration of older saves.
import { seedRng, rnd, randInt, chance, rand } from './rng.js';
import { clamp, sum, money, dateStr } from './util.js';
import { START_CREDIT, GA_MONTHLY } from './data.js';
import { generateBasin, updatePool } from './geology.js';
import { initCompetitors, tickCompetitors, rivalCharacter } from './competitors.js';
import { generateParcels, tickLand, runSurvey, HYPE_BASE, grantAgencySurface } from './land.js';
import { refreshCandidates, monthlyStaff } from './staff.js';
import { initMarket, tickMarket, realizedOil, realizedGas, midstreamCost } from './market.js';
import { tickWells, forecast, liftFactor, producingWells, rateAt, disposalRate } from './wells.js';
import { initGov, tickGov, initPermits, tickPermits, applyParty, prorationMult } from './government.js';
import { initEnv, tickEnv, incidents } from './environment.js';
import { tickEvents, EVENTS, resolveEvent, caretakerChoice } from './events.js';
import { inflate, interestRate, calMonth, yearOf, shaleScale } from './era.js';
import { initTech, tickTech } from './tech.js';
import { generateGeography } from './geography.js';
import { initPeople, tickPeople } from './people.js';
import { initPress, tickPress } from './press.js';
import { initLaw, tickLaw, caretakerTick } from './law.js';
import { initLabor, tickLabor } from './labor.js';
import { initDisasters, tickDisasters } from './disasters.js';
import { initFounding, autoFound, founderTick, isFounding } from './founding.js';
export { isFounding };

export function newGame(opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  seedRng(seed);
  const tech = initTech();
  const state = {
    seed, nextId: 1, month: 0, version: 4,
    player: { name: opts.player || 'The newcomer' },
    company: { name: opts.name || 'Dry Fork Petroleum', cash: 0, creditLimit: 0, creditScale: 1, reputation: 55, equitySold: 0, underwater: 0, bankrupt: false, creditBoost: null, creditPenaltyUntil: -1, loan: null },
    staff: [], candidates: [], candidatesRefreshed: -99,
    wells: [], parcels: [],
    market: initMarket(), gov: null, env: initEnv(), tech,
    land: { hype: HYPE_BASE, competitorWells: 0 },
    ledger: { revenue: 0, royalties: 0, taxes: 0, opex: 0, salaries: 0, land: 0, capex: 0, hedging: 0, fines: 0, interest: 0, other: 0, ga: 0 },
    ledgerPrev: null, monthlyLedger: null,
    month_prod: { oil: 0, gas: 0, water: 0, flared: 0, net: 0 },
    policy: { maintenance: 'reactive', autoWorkover: true, insured: false },
    news: [], pending: [], eventHistory: {}, flags: {}, history: [],
    selectedParcel: null,
    people: null, offices: null, press: initPress(), crimes: [], dirt: [], law: initLaw(), labor: initLabor(), disasters: initDisasters(), permits: null,
  };
  state.gov = initGov(state);
  const { geo, pools } = generateBasin();
  state.pools = pools;
  state.parcels = generateParcels(state, geo);
  state.geography = generateGeography(state);
  // No staff and no money yet: the founding phase (or autoFound) supplies both.
  refreshCandidates(state);
  initCompetitors(state);
  // People after the basin, staff and rivals so existing seeds keep their worlds.
  initPeople(state);
  state.permits = initPermits(state);
  for (const pool of state.pools) updatePool(pool);
  for (let i = 0; i < 12; i++) state.market.oilHistory.push(Math.round(state.market.oil * rand(0.98, 1.02) * 100) / 100), state.market.gasHistory.push(Math.round(state.market.gas * rand(0.95, 1.05) * 100) / 100);
  state.log = (t, k) => log(state, t, k);
  tickTech(state, state.log);
  const judge = state.people[state.offices.judge], sheriff = state.people[state.offices.sheriff];
  state.news.push({ month: 0, text: `${dateStr(0)}. Dry Fork: 140 sections of prairie, some of it already leased by the neighbours. Crude is posted at $${state.market.oil.toFixed(2)} a barrel and the commission allows ${Math.round(state.permits.allowable * 100)} percent. Judge ${judge.name.split(' ')[1]} runs the courthouse for the ${state.gov.party === 'ring' ? 'Courthouse Ring' : 'Reform Ticket'}; Sheriff ${sheriff.name.split(' ')[1]} runs everything else.`, kind: 'company' });
  // The founding year, or (for tests and players who skip it) the standard roster signed at once.
  initFounding(state, opts);
  if (opts.skipFounding) autoFound(state, opts);
  computeValuation(state);
  return state;
}

export function log(state, text, kind = 'info') {
  state.news.push({ month: state.month, text, kind });
  if (state.news.length > 400) state.news.shift();
}

// Backfill every Phase 3 key on an older save. Idempotent; safe to call on every load.
export function migrateState(state) {
  if (!state) return state;
  state.version = 4;
  state.log = (t, k) => log(state, t, k);
  state.company.creditBoost ??= null; state.company.creditPenaltyUntil ??= -1; state.company.loan ??= null; state.company.creditScale ??= 1;
  if (state.company.loan) { state.company.loan.balance ??= state.company.loan.principal ?? 0; state.company.loan.rate ??= interestRate(state); state.company.loan.monthly ??= Math.round((state.company.loan.balance || 0) / 60); }
  // Older saves were always past the founding year.
  state.founding ||= { phase: 'done', startMonth: 0, personalCash: 0, livingCost: 0, monthsLeft: 0, recruited: [], founders: {}, formedMonth: 0, failed: false, churchParcel: null, pruittParcels: [] };
  state.policy ||= { maintenance: 'reactive', autoWorkover: true }; state.policy.insured ??= false;
  state.player ||= { name: 'The newcomer' };
  for (const p of state.parcels || []) if (p.mineral?.leasedBy === 'player') grantAgencySurface(state, p);
  state.flags ||= {}; state.eventHistory ||= {}; state.pending ||= []; state.history ||= [];
  state.pending = state.pending.filter((e) => EVENTS[e.id]); // events that no longer exist (storm, documentary) are dropped
  if (!state.tech) state.tech = initTech();
  if (!state.geography) state.geography = generateGeography(state);
  if (!state.gov) state.gov = initGov(state);
  state.gov.donations ||= { ring: 0, reform: 0 }; state.gov.freezeUntil ??= -1; state.gov.lobbyingTotal ??= 0; state.gov.scandals ??= 0; state.gov.taxCredits ??= 0;
  applyParty(state.gov, state);
  state.press ||= initPress();
  for (const [k, v] of Object.entries(initPress())) if (state.press[k] === undefined) state.press[k] = v;
  state.crimes ||= []; state.dirt ||= [];
  state.law ||= initLaw();
  for (const [k, v] of Object.entries(initLaw())) if (state.law[k] === undefined) state.law[k] = v;
  state.labor ||= initLabor();
  for (const [k, v] of Object.entries(initLabor())) if (state.labor[k] === undefined) state.labor[k] = v;
  if (state.flags.union === true && !state.labor.union) state.labor.union = 'recognised';
  if (state.flags.union === 'busted' && !state.labor.union) state.labor.union = 'busted';
  state.disasters ||= initDisasters();
  for (const [k, v] of Object.entries(initDisasters())) if (state.disasters[k] === undefined) state.disasters[k] = v;
  if (!state.people || !state.offices) initPeople(state);
  for (const p of Object.values(state.people)) { p.askCooldown ||= {}; p.memory ||= []; p.secrets ||= []; p.cowed ??= false; p.since ??= 0; }
  if (!state.permits) state.permits = initPermits(state);
  for (const [k, v] of Object.entries(initPermits(state))) if (state.permits[k] === undefined) state.permits[k] = v;
  for (const s of state.staff) { s.loyalty ??= 60; s.traits ||= []; }
  for (const c of state.candidates || []) { c.loyalty ??= 60; }
  for (const c of state.competitors || []) { if (c.ethics === undefined) Object.assign(c, rivalCharacter(c)); c.frozenUntil ??= -1; }
  for (const w of state.wells) { w.declineT ??= w.prodMonths; w.prorated ??= 1; }
  for (const p of state.parcels) { p.mineral.topLease ??= null; }
  return state;
}

export function advanceMonth(state) {
  if (state.company.bankrupt) return;
  const absent = state.law?.absentUntil > state.month;
  if (state.pending.length) {
    if (!absent) return; // must resolve events first
    // The bookkeeper decides while you are away.
    while (state.pending.length) { const def = EVENTS[state.pending[0].id]; resolveEvent(state, def ? caretakerChoice(def) : 0, state.log); }
  }
  state.month++;
  state.ledgerPrev = { ...state.ledger };
  state.month_prod = { oil: 0, gas: 0, water: 0, flared: 0, net: 0 };
  state.log = (t, k) => log(state, t, k);
  const L = state.log;
  if (isFounding(state)) return foundingMonth(state, L);
  tickMarket(state, L);
  tickTech(state, L);
  monthlyStaff(state, L);
  if (state.flags.steelShortage && state.flags.steelShortage <= state.month) state.flags.steelShortage = 0;
  tickLabor(state, L);
  tickWells(state, L, incidents);
  tickCompetitors(state, L);
  for (const pool of state.pools) updatePool(pool);
  tickLand(state, L);
  tickPeople(state, L);
  tickGov(state, L);
  tickEnv(state, L);
  tickDisasters(state, L);
  tickPress(state, L);
  tickLaw(state, L);
  caretakerTick(state, L);
  tickEvents(state, L);
  // G&A, interest, credit
  const ga = inflate(state, GA_MONTHLY);
  state.company.cash -= ga; state.ledger.ga += ga;
  // The founders' note: a level payment every month whether or not the wells pay, amortised over the term.
  const loan = state.company.loan;
  if (loan && loan.balance > 0) {
    const i = loan.balance * (loan.rate ?? interestRate(state)) / 12;
    const last = state.month - (loan.startMonth ?? 0) >= (loan.term ?? 60) || loan.balance <= (loan.monthly ?? 0);
    const pay = last ? loan.balance + i : Math.min(loan.monthly ?? loan.balance + i, loan.balance + i);
    const principal = pay - i;
    loan.balance = Math.max(0, Math.round((loan.balance - principal) * 100) / 100);
    state.company.cash -= pay; state.ledger.interest += i; state.ledger.other += principal;
    if (loan.balance === 0) L(`The note at First State Bank is paid off. ${loan.lender || 'The banker'} shakes your hand and asks about the next one.`, 'company');
  }
  if (state.company.cash < 0) { const i = -state.company.cash * interestRate(state) / 12; state.company.cash -= i; state.ledger.interest += i; }
  const annualNet = state.history.slice(-12).reduce((a, h) => a + h.net, 0) + state.month_prod.net;
  const baseCredit = Math.round(inflate(state, START_CREDIT) * (state.company.creditScale ?? 1));
  let credit = Math.max(baseCredit, Math.round(baseCredit * 0.5 + 2.2 * Math.max(0, annualNet)));
  if (state.company.creditBoost && state.company.creditBoost.until > state.month) credit += state.company.creditBoost.amount;
  if (state.company.creditPenaltyUntil > state.month) credit = Math.round(credit * 0.8);
  if (state.law?.convictions > 0) credit = Math.round(credit * 0.85);
  state.company.creditLimit = credit;
  if (state.company.cash < -state.company.creditLimit) {
    state.company.underwater++;
    if (state.company.underwater === 1) L(`The bank notes you are past your line of credit. Mr. Ellison gives you three months to fix it.`, 'company');
    if (state.company.underwater >= 3) { state.company.bankrupt = true; L(`The bank called the note. ${state.company.name} is in receivership. Your leases will be sold on the courthouse steps to Prairie Royalty & Land at a discount.`, 'company'); }
  } else state.company.underwater = 0;
  // Monthly ledger delta
  const ml = {}; for (const k in state.ledger) ml[k] = state.ledger[k] - (state.ledgerPrev[k] || 0);
  state.monthlyLedger = ml;
  computeValuation(state);
  state.history.push({ month: state.month, cash: state.company.cash, value: state.company.value, oil: state.month_prod.oil, gas: state.month_prod.gas, net: state.month_prod.net, price: state.market.oil, rep: state.company.reputation, env: state.env.score, act: state.env.activism, heat: state.law.heat, notoriety: state.press.notoriety, goodwill: state.press.goodwill, morale: state.labor.morale });
  if (calMonth(state) === 0) annualReport(state, L);
}

// The reduced tick while there is no company yet: the world turns, the founders drift, the hotel bill comes due.
function foundingMonth(state, L) {
  tickMarket(state, L);
  tickTech(state, L);
  tickCompetitors(state, L);
  for (const pool of state.pools) updatePool(pool);
  tickLand(state, L);
  tickPeople(state, L);
  tickPermits(state, L);
  founderTick(state, L);
  const ml = {}; for (const k in state.ledger) ml[k] = state.ledger[k] - (state.ledgerPrev[k] || 0);
  state.monthlyLedger = ml;
  computeValuation(state);
  const f = state.founding;
  state.history.push({ month: state.month, cash: f.personalCash, value: state.company.value, oil: 0, gas: 0, net: 0, price: state.market.oil, rep: state.company.reputation, env: state.env.score, act: state.env.activism, heat: state.law.heat, notoriety: state.press.notoriety, goodwill: state.press.goodwill, morale: state.labor.morale });
}

// PV10 of producing wells + cash + midstream salvage + lease carrying value.
export function computeValuation(state) {
  if (isFounding(state)) { state.company.pv10 = 0; state.company.value = state.founding.personalCash; return state.company.value; }
  const oilP = realizedOil(state), gasP = realizedGas(state);
  const fixedSand = inflate(state, 250), fixedShale = 16_000 * shaleScale(state), disp = disposalRate(state);
  let pv = 0;
  for (const w of state.wells) {
    if (!['producing', 'workover', 'shutin'].includes(w.status)) continue;
    const roy = state.parcels[w.parcelId].mineral.lease?.royalty ?? 0.125;
    const fc = forecast(w.perf, 180);
    const disc = Math.pow(1.10, 1 / 12);
    const t0 = Math.floor(w.declineT ?? w.prodMonths);
    for (let t = t0; t < fc.length; t++) {
      const cap = prorationMult(state, w, fc[t] / 30.4, state.parcels[w.parcelId].truth.sand.depth);
      const oil = fc[t] * liftFactor(w.design, t, fc[t] / 30.4) * cap;
      const gas = oil * w.perf.gasPerBbl + w.perf.gasFree * 30.4 / Math.pow(1 + w.perf.b * w.perf.Di * t, 1 / w.perf.b);
      const cf = (oil * oilP + gas * gasP) * (1 - roy - state.gov.severance) - (w.target === 'sand' ? fixedSand : fixedShale) - oil * disp * 2;
      if (cf < 0) break;
      pv += cf / Math.pow(disc, t - t0 + 1);
    }
  }
  const leases = sum(state.parcels.filter((p) => p.mineral.leasedBy === 'player' && p.mineral.lease), (p) => p.mineral.lease.bonus * 0.6);
  const mid = ['oilPipeline', 'gasGathering', 'disposalWell'].reduce((a, k) => a + (state.market[k] ? 0.6 * midstreamCost(state, k) : 0), 0);
  state.company.pv10 = pv;
  state.company.value = (state.company.cash + pv + leases + mid) * (1 - state.company.equitySold);
  return state.company.value;
}

function annualReport(state, L) {
  const yr = yearOf(state) - 1;
  const h = state.history.slice(-12);
  const oil = sum(h, (x) => x.oil), net = sum(h, (x) => x.net);
  L(`ANNUAL REPORT, ${yr}: produced ${Math.round(oil).toLocaleString()} bbl, lease cash flow ${money(net)}, company value ${money(state.company.value)}, reputation ${Math.round(state.company.reputation)}, environmental score ${Math.round(state.env.score)}, ${state.press.clippings.filter((c) => yearOf(c.month) === yr).length} clippings in the Clarion.`, 'company');
}

export function companyStats(state) {
  const prod = producingWells(state);
  return {
    wells: prod.length, oilRate: sum(prod, (w) => w.lastMonth?.rate || 0), gasRate: sum(prod, (w) => (w.lastMonth?.gas || 0) / 30.4),
    monthlyNet: state.month_prod.net, payroll: sum(state.staff, (s) => Math.round(s.salary * (state.labor?.wageMult || 1))),
  };
}
export const isAbsent = (state) => !!(state.law && state.law.absentUntil > state.month);
