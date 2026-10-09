// Oil & gas prices along the historical track, differentials, the gas market, hedging, and midstream.
import { rnd, rand, chance, gauss, pick } from './rng.js';
import { clamp, monthOf } from './util.js';
import { roleSkill } from './staff.js';
import { inflate, oilAnchor, gasAnchor, yearOf, calMonth, PRICE_STEPS } from './era.js';
import { techAvailable } from './tech.js';
export { oilAnchor, gasAnchor } from './era.js';

// Price regimes are derived from the calendar year, not rolled: proration (the commission sets allowables and
// the posted price barely moves), shock (embargo, crash, war) and normal.
export const REGIMES = {
  proration: { oilVol: 0.012, gasVol: 0.02, label: 'proration' },
  shock:     { oilVol: 0.08,  gasVol: 0.10, label: 'shock' },
  normal:    { oilVol: 0.04,  gasVol: 0.07, label: 'normal' },
};
const SHOCK_YEARS = new Set([1973, 1974, 1979, 1980, 1986, 1990, 1998, 2008, 2014, 2015, 2020]);
export function regimeFor(month) {
  const y = yearOf(month);
  return y <= 1972 ? 'proration' : SHOCK_YEARS.has(y) ? 'shock' : 'normal';
}

// Historical headlines. Steps in PRICE_STEPS move the anchor; these add the news and any temporary effect.
export const HISTORY = [
  { year: 1956, month: 10, text: 'SUEZ CANAL CLOSED. Tankers reroute around the Cape; European buyers scramble for American crude. The Texas commission raises allowables.', oil: 1.04 },
  { year: 1957, month: 0, text: 'The majors raise the posted price for Mid-Continent crude by thirty-five cents. Every royalty owner in the county reads it twice.' },
  { year: 1959, month: 2, text: 'Washington makes the oil import quota mandatory. Cheap foreign crude stays out; domestic posted prices hold.' },
  { year: 1960, month: 8, text: 'Five exporting countries meet in Baghdad and form a cartel called OPEC. The trade press gives it a paragraph.' },
  { year: 1972, month: 2, text: 'The Texas commission sets allowables at 100 percent for the first time since the war. Every well may produce all it can; spare capacity is gone.' },
  { year: 1973, month: 9, text: 'ARAB EMBARGO. Oil exporters cut shipments to the United States. Posted prices double within weeks; lines form at filling stations.', shockMonths: 18 },
  { year: 1974, month: 0, text: 'Washington imposes price controls: "old" oil is held at the 1972 price, "new" oil sells free. Every lawyer in the state is now an oil lawyer.' },
  { year: 1979, month: 2, text: 'REVOLUTION IN IRAN. Exports stop; spot crude runs past twenty dollars. Rig count climbs every week.', shockMonths: 12 },
  { year: 1981, month: 0, text: 'Price controls end. Crude sells at world prices; the drilling boom hits its peak.' },
  { year: 1982, month: 6, text: 'Penn Square Bank fails in Oklahoma City. Energy loans go bad across the country; the banks stop answering the telephone.' },
  { year: 1986, month: 0, text: 'PRICE COLLAPSE. Saudi Arabia floods the market to punish quota cheats. Crude falls below fifteen dollars; rigs stack by the hundred.', shockMonths: 18 },
  { year: 1990, month: 7, text: 'IRAQ INVADES KUWAIT. Crude jumps; the gain is gone within the year.', shockMonths: 8 },
  { year: 1998, month: 0, text: 'Asian financial crisis meets OPEC overproduction. Crude touches eleven dollars; the trade press writes about the end of oil.', shockMonths: 12 },
  { year: 2004, month: 0, text: 'Chinese demand and a weak dollar push crude past forty. The word "supercycle" appears in the newspapers.' },
  { year: 2008, month: 6, text: 'Crude peaks near $147 a barrel in New York. Two months later the banks fail and it is under forty.', shockMonths: 12 },
  { year: 2014, month: 10, text: 'OPEC declines to cut production in the face of American shale. Prices halve within months.', shockMonths: 18 },
  { year: 2020, month: 2, text: 'A pandemic closes the world. For one afternoon in April the futures price goes negative.', shockMonths: 12 },
];

export function initMarket() {
  return {
    oil: Math.round(oilAnchor(0) * rand(0.98, 1.02) * 100) / 100, gas: gasAnchor(0), regime: regimeFor(0), regimeMonths: 0, shockUntil: -1,
    oilHistory: [], gasHistory: [], shocks: [],
    oilPipeline: false, gasGathering: false, disposalWell: false,
    gasMarket: null, // {since, until, price, escalator}: a pipeline company's purchase contract; until then gas is flared
    hedges: [], contractMonths: 0,
    demandShock: 0,
  };
}

// Period-flavoured short-lived shocks.
const SHOCKS = {
  proration: [
    { text: 'Tank-car shortage on the railroad: the purchaser cannot move your crude and the differential widens for a few months.', diff: 0.15, months: 3 },
    { text: 'The purchaser cuts nominations. Every operator in the county is asked to hold back production this month.', oil: 0.97, months: 1 },
    { text: 'Refinery fire at the Cushing plant. Buyers get picky about gravity.', diff: 0.08, months: 2 },
    { text: 'The majors trim the posted price by a dime a barrel.', oil: 0.96, months: 1 },
    { text: 'Posted price raised ten cents. The Clarion prints it on the front page.', oil: 1.04, months: 1 },
  ],
  later: [
    { text: 'Pipeline outage in the region: local crude differentials blow out for a few months.', diffFrac: 0.08, months: 3 },
    { text: 'Refinery fire downstream. Buyers get picky about your barrels.', diffFrac: 0.04, months: 2 },
    { text: 'Hard winter: gas demand spikes.', gas: 1.4, months: 2 },
    { text: 'War scare in the Gulf: crude jumps on headlines.', oil: 1.12, months: 1 },
    { text: 'Recession fears: crude sells off.', oil: 0.88, months: 1 },
  ],
};

export function tickMarket(state, log) {
  const m = state.market;
  const yr = yearOf(state), cm = calMonth(state);
  const anchor = oilAnchor(state.month), ganchor = gasAnchor(state.month);
  // Historical headlines
  for (const h of HISTORY) {
    if (h.year !== yr || h.month !== cm) continue;
    log(h.text, 'market');
    if (h.oil) m.oil *= h.oil;
    if (h.shockMonths) m.shockUntil = state.month + h.shockMonths;
  }
  // Steps: snap to the new anchor the month it moves
  if (PRICE_STEPS.some((s) => s.month === state.month)) m.oil = anchor * rand(0.95, 1.05);
  const regime = m.shockUntil > state.month ? 'shock' : regimeFor(state.month);
  if (regime !== m.regime) { m.regime = regime; m.regimeMonths = 0; } else m.regimeMonths++;
  const r = REGIMES[regime];
  // Log-space mean reversion toward the historical anchor
  const rev = regime === 'proration' ? 0.25 : 0.15;
  const prevOil = m.oil;
  m.oil = Math.exp(Math.log(m.oil) + rev * (Math.log(anchor) - Math.log(m.oil)) + gauss(0, r.oilVol));
  m.gas = Math.exp(Math.log(m.gas) + 0.15 * (Math.log(ganchor) - Math.log(m.gas)) + gauss(0, r.gasVol) + 0.2 * (Math.log(m.oil) - Math.log(prevOil)));
  // Shocks
  const pShock = regime === 'proration' ? 0.02 : 0.03;
  if (chance(pShock)) {
    const s = pick(regime === 'proration' ? SHOCKS.proration : SHOCKS.later);
    if (s.oil) m.oil *= s.oil;
    if (s.gas && m.gasMarket) m.gas *= s.gas;
    if (s.diff) m.shocks.push({ diff: s.diff, until: state.month + s.months });
    if (s.diffFrac) m.shocks.push({ diff: s.diffFrac * anchor, until: state.month + s.months });
    log(s.text, 'market');
  }
  m.shocks = m.shocks.filter((s) => s.until > state.month);
  m.oil = clamp(m.oil, 0.6 * anchor, 1.6 * anchor); m.gas = clamp(m.gas, 0.5 * ganchor, 2 * ganchor);
  m.oilHistory.push(Math.round(m.oil * 100) / 100); m.gasHistory.push(Math.round(m.gas * 100) / 100);
  if (m.oilHistory.length > 240) { m.oilHistory.shift(); m.gasHistory.shift(); }
  // Hedge settlement (paid on hedged volume regardless of production)
  let settle = 0;
  for (const h of m.hedges) if (h.endMonth > state.month) settle += h.vol * (h.price - m.oil);
  m.hedges = m.hedges.filter((h) => h.endMonth > state.month);
  if (settle) { state.company.cash += settle; state.ledger.hedging += settle; }
  return settle;
}

// Differentials scale with the price of oil (trucking a barrel costs a share of what it is worth).
export function oilDifferential(state) {
  const m = state.market;
  const skill = roleSkill(state, 'marketing');
  const anchor = oilAnchor(state.month);
  let d = anchor * (m.oilPipeline ? 0.04 : 0.14);
  d -= anchor * 0.005 * (skill - 2);
  for (const s of m.shocks) d += s.diff;
  return Math.max(0.01 * anchor, d);
}
export function realizedOil(state) { return Math.max(0.2, state.market.oil - oilDifferential(state)); }
// Gas sells only once a pipeline company has a contract in the county AND you have built gathering to reach it.
export function sellsGas(state) { return !!(state.market.gasGathering && state.market.gasMarket); }
export function gasContractPrice(state) {
  const g = state.market.gasMarket; if (!g) return 0;
  if (state.month < g.until) return g.price * Math.pow(1 + g.escalator, (state.month - g.since) / 12);
  return state.market.gas * 0.85; // contract expired: spot, less gathering and compression
}
export function realizedGas(state) {
  if (!sellsGas(state)) return 0;
  const skill = roleSkill(state, 'marketing');
  return Math.max(0.01, gasContractPrice(state) * (1 + 0.01 * (skill - 2)));
}
export function createGasMarket(state, months = 240) {
  const price = Math.round(gasAnchor(state.month) * 0.6 * 1000) / 1000;
  state.market.gasMarket = { since: state.month, until: state.month + months, price, escalator: 0.01, company: 'Panhandle & Plains Pipe Line' };
  return state.market.gasMarket;
}

// Midstream. `base` is 1952 dollars; midstreamCost(state, key) gives today's price.
export const MIDSTREAM = {
  oilPipeline: { name: 'Crude pipeline connection', base: 60_000, desc: 'Replaces the truck and the tank-car. The differential drops from about 14% of the posted price to 4%, and the road complaints stop.' },
  gasGathering: { name: 'Gas gathering system', base: 40_000, desc: 'Lets you sell casinghead gas to the pipeline company instead of flaring it. Only useful once a pipeline company buys gas in the county.' },
  disposalWell: { name: 'Salt-water disposal well', base: 20_000, desc: 'Cuts produced-water disposal cost by three quarters. High injection volumes can wake up faults.' },
};
export function midstreamCost(state, key) { return inflate(state, MIDSTREAM[key].base); }

export function buyMidstream(state, key) {
  const item = MIDSTREAM[key];
  if (state.market[key]) return { ok: false, msg: 'Already built.' };
  if (key === 'gasGathering' && !state.market.gasMarket) return { ok: false, msg: 'No pipeline company buys gas in the county yet. There is nobody to sell it to.' };
  const cost = midstreamCost(state, key);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford it.' };
  state.company.cash -= cost; state.ledger.capex += cost;
  state.market[key] = true;
  return { ok: true, cost };
}

// Hedge a fixed monthly volume for `months` at a price the market will quote. Null until a futures market exists.
export function hedgeQuote(state, months) {
  if (!techAvailable(state, 'futures')) return null;
  const skill = roleSkill(state, 'marketing');
  const spot = state.market.oil, anchor = oilAnchor(state.month);
  const blend = spot * 0.6 + anchor * 0.4;
  return Math.round((blend * (0.93 + 0.008 * skill) - 0.002 * anchor * months) * 100) / 100;
}
export function addHedge(state, vol, months) {
  const price = hedgeQuote(state, months);
  if (price === null) return null;
  state.market.hedges.push({ vol, price, endMonth: state.month + months, startMonth: state.month });
  return price;
}
export function hedgedVolume(state) { return state.market.hedges.reduce((a, h) => a + h.vol, 0); }
