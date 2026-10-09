// Permits and the county budget for them, proration allowables, Rule 37 spacing, taxes, inspections, and the statutes
// that arrive with the decades. Elections and dispositions live in people.js; lobby() is kept as a wrapper over approach().
import { rnd, rand, chance, pick } from './rng.js';
import { clamp, money } from './util.js';
import { PARTIES } from './data.js';
import { roleSkill } from './staff.js';
import { activeWells } from './wells.js';
import { inflate, yearOf, calMonth, yearFrac } from './era.js';
import { reportStory } from './press.js';
import { approach } from './people.js';

// Era statutes: the year each rule arrives, whoever is in the courthouse.
export const STATUTES = {
  pitsBanned:     { year: 1969, name: 'Unlined salt-water pits banned' },
  flaringLimited: { year: 1972, name: 'Routine flaring limited' },
  setbacks:       { year: 1985, name: 'Setbacks from dwellings' },
  waterRules:     { year: 2010, name: 'Fresh-water rules for fracturing' },
};
export function statute(state, key) { return yearOf(state) >= STATUTES[key].year; }

export function initGov(state) {
  const g = { party: chance(0.6) ? 'ring' : 'reform', monthsToElection: 26, relations: 50, mood: 0, lobbyingTotal: 0, scandals: 0, freezeUntil: -1, taxCredits: 0, donations: { ring: 0, reform: 0 } };
  applyParty(g, state);
  return g;
}
// Party numbers plus this year's statutes and prices. Called at init, on election, and every tick (inflation).
export function applyParty(g, state) {
  const p = PARTIES[g.party];
  const yr = yearOf(state);
  g.severance = p.severance; g.permitMonths = p.permitMonths; g.permitBudget = p.permitBudget;
  g.permitFee = inflate(state, p.permitFee);
  g.inspection = p.inspection + (yr > 1970 ? 0.01 * (yr - 1970) / 10 : 0);
  g.fineMult = p.fineMult;
  // Mirrors of the statutes so panels can keep reading gov.flaring / setbacks / waterRules.
  g.flaring = statute(state, 'flaringLimited') ? 'limited' : 'allowed';
  g.setbacks = statute(state, 'setbacks');
  g.waterRules = statute(state, 'waterRules');
  g.pitsBanned = statute(state, 'pitsBanned');
}

// --- Permits and proration ---------------------------------------------------------------
// Market-demand proration: the commission sets the fraction of capacity a well may produce. Texas ran about 55% in 1952,
// bottomed near 28% in 1962, and went to 100% in March 1972 when spare capacity was gone.
export function allowableAt(yf) {
  if (yf <= 1952) return 0.55;
  if (yf <= 1962) return 0.55 + (0.28 - 0.55) * (yf - 1952) / 10;
  if (yf <= 1972.2) return 0.28 + (1.0 - 0.28) * (yf - 1962) / 10.2;
  return 1.0;
}
export const STRIPPER_BBL = 10;
// The commission's "yardstick": a top allowable per well by depth (bbl/d at 100 percent). The market-demand factor
// (allowable) scales it. A well that cannot make its yardstick anyway is not restricted; strippers are exempt.
export function yardstick(depth) { return 100 + (depth || 4000) / 30; }
export function initPermits(state) {
  const P = { year: yearOf(state), countyBudget: 0, countyUsed: 0, rivalUsed: 0, bonus: 0, freezeUntil: -1, allowable: allowableAt(yearFrac(state)), exemptions: [], spacingWaivers: [], history: [] };
  P.countyBudget = permitBudgetFor(state);
  return P;
}
function permitBudgetFor(state) {
  const party = PARTIES[state.gov.party];
  let b = party.permitBudget;
  const judge = state.people?.[state.offices?.judge], mayor = state.people?.[state.offices?.mayor];
  if (judge && judge.disposition > 65) b += 1; if (mayor && mayor.disposition > 65) b += 1;
  if (judge && judge.disposition > 85) b += 1;
  if ((judge && judge.hostile) || (mayor && mayor.hostile)) b -= 1;
  if (state.env.activism > 60) b -= 1;
  if (yearOf(state) >= 1972) b += 2; // proration is over; the commission wants wells
  return Math.max(1, b);
}
export function tickPermits(state, log) {
  const P = state.permits;
  P.allowable = allowableAt(yearFrac(state));
  if (yearOf(state) !== P.year) {
    P.history.push({ year: P.year, budget: P.countyBudget, used: P.countyUsed, rivals: P.rivalUsed });
    if (P.history.length > 40) P.history.shift();
    P.year = yearOf(state); P.countyBudget = permitBudgetFor(state); P.countyUsed = 0; P.rivalUsed = 0; P.bonus = 0;
    if (state.month > 0) log(`The commission's ${P.year} permit allocation is in: the county will issue ${P.countyBudget} drilling permit${P.countyBudget > 1 ? 's' : ''} to an operator of your size without a conversation at the courthouse. Allowable is ${Math.round(P.allowable * 100)} percent.`, 'gov');
  }
  P.exemptions = P.exemptions.filter((e) => e.until > state.month);
  P.spacingWaivers = P.spacingWaivers.filter((e) => e.until > state.month);
}
export function hasSpacingWaiver(state, parcelId) { return yearOf(state) >= 1972 || state.permits.spacingWaivers.some((w) => w.parcelId === parcelId && w.until > state.month); }
export function isExempt(state, well) { return state.permits.exemptions.some((e) => e.until > state.month && (e.wellId === null || e.wellId === well.id)); }
// Proration multiplier for a well that could make `rate` bbl/d: min(rate, yardstick x allowable) / rate.
export function prorationMult(state, well, rate, depth = 4000) {
  const P = state.permits; if (!P) return 1;
  if (P.allowable >= 1) return 1;
  if (rate < STRIPPER_BBL) return 1;
  if (well && isExempt(state, well)) return 1;
  const cap = Math.max(STRIPPER_BBL, yardstick(depth) * P.allowable);
  return rate <= cap ? 1 : cap / rate;
}
export function permitsLeft(state) { return Math.max(0, state.permits.countyBudget - state.permits.countyUsed); }

// The gate startWell goes through. Returns {ok, months, msg, needs}. Consumes a permit when ok.
export function requestPermit(state, parcel, design) {
  const P = state.permits, g = state.gov;
  if (state.law?.absentUntil > state.month) return { ok: false, msg: 'Nobody can file a permit while you are away.', needs: 'absent' };
  if (P.freezeUntil > state.month) return { ok: false, msg: `The commission has suspended your permits for ${P.freezeUntil - state.month} more month${P.freezeUntil - state.month > 1 ? 's' : ''}.`, needs: 'freeze' };
  if (g.freezeUntil > state.month) return { ok: false, msg: `Permits are frozen by the landowners' suit for ${g.freezeUntil - state.month} more month${g.freezeUntil - state.month > 1 ? 's' : ''}.`, needs: 'freeze' };
  const same = parcel.wells.filter((id) => { const w = state.wells.find((w) => w.id === id); return w && w.target === design.target && !['dry', 'plugged'].includes(w.status); }).length;
  if (design.target === 'sand' && same >= 1 && !hasSpacingWaiver(state, parcel.id)) return { ok: false, msg: `Rule 37: one well to the section unless the commission's field agent grants a spacing exception for ${parcel.surface.name}.`, needs: 'spacing' };
  if (P.countyUsed >= P.countyBudget) return { ok: false, msg: `The county has issued its ${P.countyBudget} permit${P.countyBudget > 1 ? 's' : ''} for ${P.year}. The judge could find room on the docket, if he were asked the right way.`, needs: 'permit' };
  const govSkill = roleSkill(state, 'govaffairs');
  let months = g.permitMonths - (govSkill >= 7 ? 1 : 0) - (g.relations > 75 ? 1 : 0) + (state.env.activism > 65 ? 1 : 0);
  months = clamp(months, 1, 5);
  P.countyUsed++;
  return { ok: true, months, msg: `Permit ${P.countyUsed} of ${P.countyBudget} for ${P.year}.` };
}

// Kept for the current UI: a donation to the county judge through approach().
export function lobby(state, amount, log) {
  if (state.company.cash - amount < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford it.' };
  const r = approach(state, 'judge', 'donate', { amount });
  if (r.text) log(r.text, 'gov');
  return { ok: r.ok, msg: r.ok ? `Relations improved by ${(r.gain || 0).toFixed(1)}.` : r.text };
}

export function tickGov(state, log) {
  const g = state.gov;
  const skill = roleSkill(state, 'govaffairs');
  const statutesBefore = [g.pitsBanned, g.flaring, g.setbacks, g.waterRules].join();
  applyParty(g, state);
  if ([g.pitsBanned, g.flaring, g.setbacks, g.waterRules].join() !== statutesBefore && state.month > 0) {
    for (const [k, s] of Object.entries(STATUTES)) if (s.year === yearOf(state) && statute(state, k)) log(`NEW RULE: ${s.name}. The state commission's field men have a new form.`, 'gov');
  }
  if (state.law) state.law.statutes = Object.fromEntries(Object.keys(STATUTES).map((k) => [k, statute(state, k)]));
  // Relations are what the judge and the mayor think of you, nudged by a courthouse man.
  const judge = state.people?.[state.offices?.judge], mayor = state.people?.[state.offices?.mayor];
  if (judge && mayor) {
    const nudge = (skill - 4) * 0.15;
    judge.disposition = clamp(judge.disposition + nudge, 0, 100); mayor.disposition = clamp(mayor.disposition + nudge, 0, 100);
    g.relations = clamp(0.5 * (judge.disposition + mayor.disposition), 0, 100);
  } else { g.relations += (50 - g.relations) * 0.03 + (skill - 4) * 0.15; g.relations = clamp(g.relations, 0, 100); }
  tickPermits(state, log);
  // Inspections
  const wells = activeWells(state);
  const inspector = state.people?.[state.offices?.inspector];
  let fines = 0;
  for (const w of wells) {
    let rate = g.inspection;
    const parcel = state.parcels[w.parcelId];
    if (parcel.surface.hostile) rate *= 2.5;
    if (state.env.activism > 60) rate *= 1.5;
    if (g.relations > 70) rate *= 0.7;
    if (inspector) rate *= inspector.bought ? 0.5 : inspector.hostile ? 2 : 1;
    if (!chance(rate)) continue;
    const found = [];
    if (w.lastMonth?.flared > 3000 && g.flaring === 'limited') found.push(['flaring beyond the permitted volume', 2_000]);
    if (w.health < 35) found.push(['well integrity deficiencies', 1_500]);
    if (w.sour && w.design.casing !== 'premium') found.push(['hydrogen sulphide monitoring failures', 1_000]);
    if (parcel.surface.agreement?.forced && chance(0.5)) found.push(['a surface-owner complaint about unrestored roads', 600]);
    if (w.cumWater > 400_000 && !state.market.disposalWell && g.pitsBanned && chance(0.3)) found.push(['salt-water pit violations', 1_200]);
    if (state.labor?.hotOilUntil > state.month && chance(0.4)) found.push(['run tickets that do not match the tank gauges', 2_500]);
    if (!found.length) { if (chance(0.3)) log(`The commission's field man visited ${w.name}. Clean report, though he took a long look at the pit.`, 'gov'); continue; }
    const [what, base] = pick(found);
    const fine = Math.round(inflate(state, base) * g.fineMult * (1.1 - 0.05 * skill) * rand(0.8, 1.4) / 10) * 10;
    fines += fine;
    log(`The field man cited ${w.name} for ${what}. Fine: ${money(fine)}.`, 'gov');
    reportStory(state, 'citation', { well: w.name, what, fine, repHit: what.includes('run tickets') ? 8 : 3 });
    state.env.score = clamp(state.env.score - 1.5, 0, 100);
  }
  if (fines) { state.company.cash -= fines; state.ledger.fines += fines; }
  // Perks
  if (g.relations > 78 && chance(0.06)) { const credit = inflate(state, 3_000 + Math.round(rand(0, 4_000) / 100) * 100); state.company.cash += credit; state.ledger.other -= credit; g.taxCredits += credit; log(`The county abated your ad valorem taxes under a "Producer Relief" resolution nobody remembers voting on. You receive ${money(credit)}.`, 'gov'); }
}

export function partyName(state) { return PARTIES[state.gov.party].name; }
export function permitSummary(state) { const P = state.permits; return { year: P.year, budget: P.countyBudget, used: P.countyUsed, left: permitsLeft(state), bonus: P.bonus, rivalUsed: P.rivalUsed, allowable: P.allowable, frozenUntil: Math.max(P.freezeUntil, state.gov.freezeUntil), exemptions: P.exemptions.length, waivers: P.spacingWaivers.length }; }
