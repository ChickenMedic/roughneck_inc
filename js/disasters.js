// Acts of God, by season: tornado, flood, ice storm, drought, lightning, prairie fire. Plus the well fire after a blowout,
// and the insurance policy that pays seventy cents on the dollar.
import { rnd, rand, randInt, pick, chance } from './rng.js';
import { clamp, money } from './util.js';
import { inflate, calMonth, yearOf } from './era.js';
import { neighbours } from './geology.js';
import { riverParcels } from './geography.js';
import { activeWells, producingWells } from './wells.js';
import { reportStory } from './press.js';
import { pushEvent } from './events.js';

export function initDisasters() { return { count: 0, byKind: {}, droughtUntil: -1, floodUntil: -1, floodParcels: [], last: -99, premiumsPaid: 0, claimsPaid: 0, log: [] }; }
export const inDrought = (state) => !!(state.disasters && state.disasters.droughtUntil > state.month);
export function insurancePremium(state) { return inflate(state, 15) * activeWells(state).length; }

function record(state, kind, cost) {
  const D = state.disasters;
  D.count++; D.byKind[kind] = (D.byKind[kind] || 0) + 1; D.last = state.month;
  D.log.push({ month: state.month, kind, cost }); if (D.log.length > 40) D.log.shift();
}
// Charge the company for damage; the policy refunds 70% next month (immediately here, for simplicity).
export function damage(state, amount, what, log) {
  amount = Math.round(amount);
  if (amount <= 0) return 0;
  state.company.cash -= amount; state.ledger.fines += amount;
  if (state.policy?.insured) { const refund = Math.round(amount * 0.7); state.company.cash += refund; state.ledger.fines -= refund; state.disasters.claimsPaid += refund; log?.(`The Hartford paid ${money(refund)} on the ${what} claim.`, 'company'); return amount - refund; }
  return amount;
}

export function tickDisasters(state, log) {
  const D = state.disasters; if (!D) return;
  const $ = (v) => inflate(state, v);
  const cm = calMonth(state);
  const mine = activeWells(state);
  const prod = producingWells(state);
  // Insurance premium.
  if (state.policy?.insured && mine.length) { const prem = insurancePremium(state); state.company.cash -= prem; state.ledger.opex += prem; D.premiumsPaid += prem; }
  // Drought runs its course.
  if (D.droughtUntil > 0 && D.droughtUntil === state.month) { log('Rain. Three inches in a night, and the stock tanks are full again. The drought is over.', 'env'); D.droughtUntil = -1; }
  if (D.floodUntil > 0 && D.floodUntil <= state.month) { D.floodParcels = []; D.floodUntil = -1; }
  if (state.pending.length || state.month - D.last < 2) return; // one calamity at a time
  // Tornado: April to June.
  if (cm >= 3 && cm <= 5 && chance(0.025)) {
    const hit = mine.length && chance(0.7) ? state.parcels[pick(mine).parcelId] : pick(state.parcels);
    const wellsHit = mine.filter((w) => w.parcelId === hit.id || neighbours(state.parcels, hit).some((q) => q.id === w.parcelId));
    let cost = 0;
    for (const w of wellsHit) { w.health = clamp(w.health - 40, 0, 100); if (w.status === 'producing' && chance(0.5)) { w.status = 'shutin'; w.workoverCost = $(2_000 + rand(0, 3_000)); } if (['drill', 'complete'].includes(w.status)) { w.phaseEnd += 1; cost += $(4_000); } cost += $(1_500); }
    const town = hit.surface.type === 'town' || neighbours(state.parcels, hit).some((q) => q.surface.type === 'town');
    record(state, 'tornado', cost);
    reportStory(state, 'tornado', { farm: hit.surface.name, what: wellsHit.length ? 'DERRICKS' : 'BARNS' });
    log(`TORNADO. A twister came down ${town ? 'at the edge of town' : `on ${hit.surface.name}`} and walked ${pick(['north', 'northeast', 'east'])} for four miles. ${wellsHit.length ? `${wellsHit.length} of your wells are damaged; tanks and derricks are in the next county.` : 'Your leases were spared.'}${town ? ' The school lost its roof.' : ''}`, 'env');
    pushEvent(state, 'tornadoResponse', { cost, town, wells: wellsHit.length, help: $(800), farm: hit.surface.name });
    return;
  }
  // Flood: March to June, along Coyote Creek and one parcel either side.
  if (cm >= 2 && cm <= 5 && chance(0.02)) {
    const river = riverParcels(state);
    const flooded = new Set();
    for (const id of river) { flooded.add(id); for (const q of neighbours(state.parcels, state.parcels[id])) flooded.add(q.id); }
    D.floodParcels = [...flooded]; D.floodUntil = state.month + 2;
    const wellsHit = mine.filter((w) => flooded.has(w.parcelId));
    let cost = 0, spill = false;
    for (const w of wellsHit) { w.health = clamp(w.health - 10, 0, 100); cost += $(600); if (w.status === 'producing' && chance(0.25)) { spill = true; state.env.score = clamp(state.env.score - 3, 0, 100); state.env.spills++; } }
    record(state, 'flood', cost);
    reportStory(state, 'flood', { farm: wellsHit.length ? state.parcels[wellsHit[0].parcelId].surface.name : 'THE BOTTOMS' });
    log(`FLOOD. Coyote Creek is out of its banks from the county line to the bridge. ${wellsHit.length ? `${wellsHit.length} of your wells are under water and will pump half for two months.` : 'Your leases sit high and dry.'}${spill ? ' A tank battery went over; there is a slick on the water.' : ''}`, 'env');
    pushEvent(state, 'floodResponse', { cost, wells: wellsHit.length, spill, help: $(600) });
    return;
  }
  // Ice storm: December to February.
  if ((cm <= 1 || cm === 11) && prod.length && chance(0.03)) {
    const cost = Math.round(prod.length * $(80));
    for (const w of prod) w.health = clamp(w.health - 5, 0, 100);
    state.flags.stormMonth = state.month;
    record(state, 'iceStorm', cost);
    reportStory(state, 'iceStorm', {});
    pushEvent(state, 'iceStorm', { cost, crews: Math.round(prod.length * $(150)) });
    return;
  }
  // Drought: begins June to August, lasts six to eighteen months.
  if (cm >= 5 && cm <= 7 && D.droughtUntil < state.month && chance(0.015)) {
    D.droughtUntil = state.month + randInt(6, 18);
    record(state, 'drought', 0);
    reportStory(state, 'drought', {});
    log(`DROUGHT. No rain since April. The creek is a string of pools and every farmer in the county is looking at the water truck on your lease. Water costs triple until it breaks.`, 'env');
    for (const p of state.parcels) if (p.surface.type === 'farmer') p.surface.disposition = clamp(p.surface.disposition - 3, 0, 100);
    return;
  }
  // Lightning tank fire: June to September.
  if (cm >= 5 && cm <= 8 && prod.length && chance(0.015)) {
    const w = pick(prod); const p = state.parcels[w.parcelId];
    const cost = damage(state, $(2_000 + rand(0, 2_000)), 'tank fire', log);
    w.tankFireUntil = state.month + 1;
    record(state, 'tankFire', cost);
    reportStory(state, 'tankFire', { farm: p.surface.name, well: w.name });
    log(`Lightning struck the tank battery at ${w.name}. It burned all night and the crude with it. ${money(cost)} out of pocket and a month's production lost.`, 'env');
    return;
  }
  // Prairie fire: July to October, from a flare or a spark.
  if (cm >= 6 && cm <= 9 && prod.length && chance(0.01 + (inDrought(state) ? 0.02 : 0))) {
    const w = pick(prod); const p = state.parcels[w.parcelId];
    const cost = damage(state, $(1_500 + rand(0, 2_500)), 'prairie fire', log);
    for (const q of [p, ...neighbours(state.parcels, p)]) q.surface.disposition = clamp(q.surface.disposition - 10, 0, 100);
    state.env.score = clamp(state.env.score - 4, 0, 100); state.env.activism = clamp(state.env.activism + 4, 0, 100);
    record(state, 'prairieFire', cost);
    reportStory(state, 'prairieFire', { farm: p.surface.name });
    log(`A prairie fire started at the ${w.name} flare and burned four sections of pasture before the wind turned. ${money(cost)} in damages and every neighbour of ${p.surface.name} has a grievance.`, 'env');
  }
}

// After a blowout the well is on fire; somebody has to put it out.
export function wellFireFrom(state, well, parcel) {
  const $ = (v) => inflate(state, v);
  if (state.pending.some((e) => e.id === 'wellFire')) return;
  reportStory(state, 'wellFire', { well: well.name, farm: parcel.surface.name });
  pushEvent(state, 'wellFire', { wellId: well.id, well: well.name, farm: parcel.surface.name, famous: $(25_000), local: $(6_000) });
}

export function setInsurance(state, on, log) {
  state.policy.insured = !!on;
  log?.(on ? `Policy bound with the Hartford: ${money(inflate(state, 15))} per well per month, seventy cents on the dollar for fire, wind and water.` : 'Policy cancelled. You are self-insured, which is a way of saying you are not.', 'company');
  return { ok: true };
}
export function disasterSummary(state) { const D = state.disasters; return { count: D.count, byKind: D.byKind, drought: inDrought(state), flooded: D.floodUntil > state.month, insured: !!state.policy?.insured, premium: insurancePremium(state), premiumsPaid: D.premiumsPaid, claimsPaid: D.claimsPaid, recent: D.log.slice(-8) }; }
