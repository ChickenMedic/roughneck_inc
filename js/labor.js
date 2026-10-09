// Labor: morale, strikes, the union, deaths on the rig, drinkers, hot oil, loyalty and whistleblowers.
import { rnd, rand, randInt, pick, chance } from './rng.js';
import { clamp, money } from './util.js';
import { inflate, yearOf } from './era.js';
import { roleSkill, riskMult } from './staff.js';
import { reportStory } from './press.js';
import { pushEvent } from './events.js';
import { producingWells } from './wells.js';

export function initLabor() { return { morale: 65, union: false, strikeUntil: -1, strikes: 0, wageMult: 1, deaths: 0, safetySpend: 0, safetyUntil: -1, lastDeath: -99, drunkUntil: -1, drunkStaffId: null, hotOilUntil: -1, lastStrike: -99, lastEvent: -99 }; }
export const onStrike = (state) => !!(state.labor && state.labor.strikeUntil > state.month);

export function tickLabor(state, log) {
  const Lb = state.labor; if (!Lb) return;
  const $ = (v) => inflate(state, v);
  const prSkill = roleSkill(state, 'pr');
  const drilling = state.wells.filter((w) => ['drill', 'complete'].includes(w.status));
  // Morale drifts toward a target set by wages, the union, deaths, late paychecks and the mood of the county.
  let target = 52 + (Lb.wageMult - 1) * 160 + (Lb.union === 'recognised' ? 8 : Lb.union === 'busted' ? -10 : 0) + 0.6 * (prSkill - 2);
  if (state.company.cash < 0) target -= 10;
  if (state.month - Lb.lastDeath < 12) target -= 12;
  if (Lb.safetyUntil > state.month) target += 6;
  if (state.env.activism > 60) target -= 5;
  if (Lb.strikeUntil > state.month) target -= 5;
  Lb.morale = clamp(Lb.morale + (target - Lb.morale) * 0.08 + rand(-1.5, 1.5), 0, 100);
  // Loyalty per head drifts toward morale, seniority and the union.
  for (const s of state.staff) {
    if (s.loyalty === undefined) s.loyalty = 60;
    const lt = 35 + 0.4 * Lb.morale + Math.min(10, (state.month - (s.hiredMonth || 0)) / 12) + (s.traits.includes('loyal') ? 25 : 0) - (s.traits.includes('restless') ? 15 : 0) + (Lb.union === 'busted' ? -8 : 0);
    s.loyalty = clamp(s.loyalty + (lt - s.loyalty) * 0.1, 0, 100);
  }
  // Strike ends.
  if (Lb.strikeUntil > 0 && Lb.strikeUntil === state.month) { log(`The men are back at work. Nobody says who won.`, 'staff'); Lb.morale = clamp(Lb.morale + 8, 0, 100); }
  // Wildcat strike.
  if (Lb.morale < 35 && state.staff.length >= 3 && Lb.strikeUntil < state.month && state.month - Lb.lastStrike > 12 && chance(0.25) && !state.pending.length) {
    Lb.lastStrike = state.month; Lb.strikes++;
    reportStory(state, 'strike', {});
    pushEvent(state, 'wildcatStrike', { raise: 0.1, scabs: $(1_200) });
  }
  // Deaths on the rig: per drilling month, more likely with cowboys, low morale, no safety programme.
  for (const w of drilling) {
    if (state.pending.length) break;
    const risk = (w.crew?.driller?.traits?.includes('cowboy') ? 1.5 : w.crew?.driller?.traits?.includes('bythebook') ? 0.6 : 1);
    let p = 0.004 * risk * (Lb.morale < 40 ? 1.5 : 1) * (Lb.safetyUntil > state.month ? 0.6 : 1) * (Lb.drunkUntil > state.month ? 2 : 1) * (Lb.union === 'recognised' ? 0.8 : 1);
    if (chance(p)) {
      Lb.deaths++; Lb.lastDeath = state.month;
      const worker = `${pick(['Dub', 'Shorty', 'Red', 'Slim', 'Junior', 'Tiny', 'Cotton', 'Buck'])} ${pick(['Coker', 'Pate', 'Hensley', 'Vance', 'Riggs', 'Tull', 'Bledsoe', 'Meeks'])}`;
      pushEvent(state, 'workerDeath', { wellId: w.id, well: w.name, farm: state.parcels[w.parcelId].surface.name, worker, widow: $(2_500), funeral: $(300) });
      break;
    }
  }
  // Drinkers on tour.
  const drinker = state.staff.find((s) => s.traits.includes('drinker') && ['driller', 'production', 'completions'].includes(s.role) && s.awayUntil <= state.month);
  if (drinker && drilling.length && Lb.drunkUntil <= state.month && chance(0.08) && !state.pending.length && state.month - Lb.lastEvent > 6) {
    Lb.lastEvent = state.month;
    pushEvent(state, 'drunkOnTour', { sid: drinker.id, name: drinker.name, well: drilling[0].name, cure: $(400) });
  }
  // Hot oil (proration years): a truck at night, a purchaser who does not ask.
  if (yearOf(state) <= 1972 && producingWells(state).length >= 2 && Lb.hotOilUntil <= state.month && chance(0.02) && !state.pending.length && state.month - Lb.lastEvent > 6) {
    Lb.lastEvent = state.month;
    const bbl = Math.round(state.month_prod.oil * 0.4);
    pushEvent(state, 'hotOil', { bbl, offer: Math.round(bbl * state.market.oil * 0.7) });
  }
  // Pumpers steal a little when they are unhappy.
  if (Lb.morale < 40 && producingWells(state).length && state.month_prod.oil > 200 && chance(0.06)) { const loss = Math.round(state.month_prod.oil * 0.05 * state.market.oil); state.company.cash -= loss; state.ledger.other += loss; log(`Run tickets do not match the tank gauges this month. About ${money(loss)} of crude left the leases in somebody else's truck.`, 'staff'); }
  if (Lb.safetyUntil > 0 && Lb.safetyUntil === state.month) Lb.safetyUntil = -1;
}

export function safetyProgramCost(state) { return inflate(state, 800); }
export function fundSafety(state, log) {
  const cost = safetyProgramCost(state);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford it.' };
  state.company.cash -= cost; state.ledger.opex += cost; state.labor.safetySpend += cost; state.labor.safetyUntil = state.month + 12;
  state.labor.morale = clamp(state.labor.morale + 5, 0, 100);
  log?.('Hard hats, a safety man on every tour, and a bonus for a month without a lost-time accident. The men grumble and wear the hats.', 'staff');
  return { ok: true, cost };
}
export function giveRaise(state, frac, log) {
  state.labor.wageMult = Math.round((state.labor.wageMult + frac) * 100) / 100;
  state.labor.morale = clamp(state.labor.morale + frac * 150, 0, 100);
  log?.(`Wages up ${Math.round(frac * 100)} percent across the payroll.`, 'staff');
  return { ok: true };
}
export function laborSummary(state) {
  const Lb = state.labor;
  return { morale: Math.round(Lb.morale), union: Lb.union, striking: onStrike(state), strikeUntil: Lb.strikeUntil, wageMult: Lb.wageMult, deaths: Lb.deaths, safety: Lb.safetyUntil > state.month, drunk: Lb.drunkUntil > state.month, loyalty: state.staff.map((s) => ({ id: s.id, name: s.name, loyalty: Math.round(s.loyalty ?? 60) })) };
}
