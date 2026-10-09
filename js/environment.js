// Environmental score, agitation ("activism"), reputation, and incidents (spills, blowouts).
import { rnd, rand, chance, pick } from './rng.js';
import { clamp, money } from './util.js';
import { roleSkill } from './staff.js';
import { activeWells, producingWells } from './wells.js';
import { surfaceName } from './land.js';
import { neighbours } from './geology.js';
import { inflate, yearOf } from './era.js';
import { statute } from './government.js';
import { reportStory } from './press.js';
import { wellFireFrom } from './disasters.js';

export function initEnv() { return { score: 70, activism: 3, lawsuits: 0, campaigns: 0, spills: 0, blowouts: 0, communitySpend: 0, pledges: [], greenwash: 0, lastLawsuit: -99 }; }
// Nobody organised against oil in 1952. The floor rises from 1962 (Silent Spring) to 25 by 2012.
export function activismFloor(state) { const y = yearOf(state); return y < 1962 ? 0 : Math.min(25, (y - 1962) / 2); }

export const incidents = {
  blowout(state, well, parcel) {
    // The rig, the casing and the tanks. Putting the fire out is the wellFire event's bill.
    const cost = inflate(state, Math.round(5_000 + rand(0, 15_000)));
    state.company.cash -= cost; state.ledger.fines += cost; well.cost.spent += cost;
    well.status = 'blowout'; well.phaseEnd = state.month + 2;
    state.env.blowouts++;
    state.env.score = clamp(state.env.score - 18, 0, 100);
    state.company.reputation = clamp(state.company.reputation - 15, 0, 100);
    state.env.activism = clamp(state.env.activism + 22, 0, 100);
    parcel.surface.disposition = clamp(parcel.surface.disposition - 40, 0, 100);
    for (const q of neighbours(state.parcels, parcel)) q.surface.disposition = clamp(q.surface.disposition - 15, 0, 100);
    for (const o of ['judge', 'mayor']) { const q = state.people?.[state.offices?.[o]]; if (q) q.disposition = clamp(q.disposition - 10, 0, 100); }
    reportStory(state, 'blowout', { well: well.name, farm: parcel.surface.name });
    state.log(`BLOWOUT at ${well.name}. The derrick is on fire and visible from the county road. Cost so far: ${money(cost)} and a great deal of goodwill.`, 'env');
    wellFireFrom(state, well, parcel);
  },
  spill(state, well, parcel) {
    const size = pick([['a small', 300, 1.5, 2.5], ['a moderate', 1_500, 4, 5], ['a large', 6_000, 8, 10]].filter((s, i) => i === 0 || chance(0.5)));
    const [adj, base, env, rep] = size;
    const cost = inflate(state, base);
    const fine = Math.round(cost * 0.4 * state.gov.fineMult);
    state.company.cash -= cost + fine; state.ledger.fines += cost + fine; well.cost.spent += cost;
    state.env.spills++;
    state.env.score = clamp(state.env.score - env, 0, 100);
    state.company.reputation = clamp(state.company.reputation - rep * (state.env.greenwash > 0 ? 1.6 : 1), 0, 100);
    state.env.activism = clamp(state.env.activism + rep, 0, 100);
    parcel.surface.disposition = clamp(parcel.surface.disposition - rep * 2, 0, 100);
    if (state.env.greenwash > 0) state.env.greenwash = 0;
    if (adj !== 'a small' || chance(0.3)) reportStory(state, 'spill', { well: well.name, farm: parcel.surface.name, repHit: rep });
    state.log(`${adj[0].toUpperCase() + adj.slice(1)} salt-water spill at ${well.name} on ${surfaceName(parcel)}. Cleanup ${money(cost)}, fine ${money(fine)}.${adj === 'a large' ? ' The Clarion prints a photograph of dead cottonwoods.' : ''}`, 'env');
  },
};

export function tickEnv(state, log) {
  const e = state.env;
  const prSkill = roleSkill(state, 'pr');
  const green = state.staff.some((s) => s.traits.includes('green'));
  const wells = activeWells(state);
  // Environmental score
  let d = 0;
  // Small conventional wells are the norm in this county: the per-well burden is light, but fifty of them add up.
  d -= 0.01 * producingWells(state).length;
  d -= state.month_prod.flared / (statute(state, 'flaringLimited') ? 60_000 : 400_000);
  for (const w of state.wells) if (w.onlineMonth === state.month && w.target === 'shale' && w.design.water === 'fresh') { d -= 2; for (const q of neighbours(state.parcels, state.parcels[w.parcelId])) if (q.surface.type === 'farmer') q.surface.disposition = clamp(q.surface.disposition - 4, 0, 100); }
  if (state.market.disposalWell && state.month_prod.water > 150_000 && chance(0.04)) {
    const fine = inflate(state, 2_500) * state.gov.fineMult;
    state.company.cash -= fine; state.ledger.fines += fine; d -= 6;
    e.activism = clamp(e.activism + 8, 0, 100);
    reportStory(state, 'tremor', {});
    log(`An earth tremor rattled dishes in Dry Fork. The state geologist links it to your disposal well. Fine ${money(fine)}, and now everyone has a cracked chimney to blame on you.`, 'env');
  }
  d += (62 - e.score) * 0.035 + (green ? 0.2 : 0) + 0.05 * (prSkill - 2);
  e.score = clamp(e.score + d, 0, 100);
  // Activism: fades toward the era floor
  const floor = activismFloor(state);
  let a = (55 - e.score) / 40 + 0.01 * wells.length + 0.3 * state.parcels.filter((p) => p.surface.hostile).length;
  a -= 0.12 * (prSkill - 2);
  a -= (e.activism - floor) * 0.03;
  if (state.gov.party === 'reform') a += 0.2;
  e.activism = clamp(e.activism + a, 0, 100);
  // Consequences
  if (e.activism > 60 && chance(0.12) && state.month > (e.lastLawsuit ?? -99) + 6) {
    const cost = inflate(state, Math.round(rand(1_500, 8_000) / 100) * 100);
    state.company.cash -= cost; state.ledger.fines += cost; e.lawsuits++; e.lastLawsuit = state.month;
    state.gov.freezeUntil = state.month + 4;
    reportStory(state, 'lawsuit', {});
    log(`${yearOf(state) < 1970 ? 'A committee of Coyote Creek landowners' : 'Citizens for a Quiet Prairie'} filed suit over your permits. Legal costs ${money(cost)} and new permits are frozen for 4 months.`, 'env');
  }
  if (e.activism > 82 && chance(0.1)) {
    e.campaigns++;
    reportStory(state, 'magazine', {});
    for (const p of state.parcels) p.surface.disposition = clamp(p.surface.disposition - 8, 0, 100);
    log(yearOf(state) < 1975 ? `A magazine writer from back East calls you "the poisoner of the prairie" in a six-page spread. Landowners across the county stop answering your landman's knock.` : `A national campaign names you "Polluter of the Month". Landowners across the county stop answering your landman's calls.`, 'env');
  }
  // Pledges (e.g. promised gas gathering)
  e.pledges = e.pledges.filter((pl) => {
    if (state.month < pl.due) return true;
    if (pl.type === 'gathering' && !state.market.gasGathering) { reportStory(state, 'pledgeBroken', {}); log(`You promised to stop flaring within a year. You did not. The reporter kept the clipping.`, 'env'); }
    return false;
  });
  // Reputation drift: what gets printed, not what you did. The environmental score still drives agitation and inspections.
  const P = state.press || { goodwill: 0, notoriety: 0 };
  const target = 50 + P.goodwill - P.notoriety + 1.5 * (prSkill - 2) + Math.min(e.communitySpend / inflate(state, 1_000), 8) - 0.1 * e.activism;
  state.company.reputation = clamp(state.company.reputation + (target - state.company.reputation) * 0.05, 0, 100);
  if (e.greenwash > 0) e.greenwash--;
}

// Community programs. `base` is 1952 dollars; `when` gates programs that did not exist yet.
export const COMMUNITY_ACTIONS = {
  scholarship: { name: 'Fund the Dry Fork High scholarship', base: 500, desc: 'Reputation +3, landowner goodwill +4.', apply(state, log, cost) { state.company.reputation = clamp(state.company.reputation + 3, 0, 100); for (const p of state.parcels) p.surface.disposition = clamp(p.surface.disposition + 4, 0, 100); state.env.communitySpend += cost; reportStory(state, 'community', { what: 'HOMECOMING' }); log('You are now the "Presenting Sponsor" of the Dry Fork High Homecoming.', 'env'); } },
  waterTesting: { name: 'Hire the state college to test the farmers\' wells', base: 1_500, when: (s) => yearOf(s) >= 1962, desc: 'Environmental score +4, agitation -6. Farmers like a man in a lab coat.', apply(state, log, cost) { state.env.score = clamp(state.env.score + 4, 0, 100); state.env.activism = clamp(state.env.activism - 6, 0, 100); state.env.communitySpend += cost; log('A chemist from the state college now publishes monthly water tests for the wells around your leases. The results are dull, which is the point.', 'env'); } },
  restoration: { name: 'Level old pads and reseed the pasture', base: 3_000, desc: 'Environmental score +8, reputation +4.', apply(state, log, cost) { state.env.score = clamp(state.env.score + 8, 0, 100); state.company.reputation = clamp(state.company.reputation + 4, 0, 100); state.env.communitySpend += cost; reportStory(state, 'community', { what: 'PASTURE RESTORATION', repHit: -6 }); log('Your crews levelled the old pads and drilled in native grass. Antelope came back. The Clarion sent a photographer.', 'env'); } },
  greenwash: { name: 'Sponsor the "Oil Progress Week" parade and radio hour', base: 1_200, desc: 'Reputation +7 immediately. If a spill happens within a year, the backlash doubles.', apply(state, log, cost) { state.company.reputation = clamp(state.company.reputation + 7, 0, 100); state.env.greenwash = 12; log('Your name is on the float and the radio announcer says it twice an hour. Nothing about your operations has changed.', 'env'); } },
  astroturf: { name: 'Bankroll "Citizens for Prosperity"', base: 2_000, desc: 'Agitation -12. 25% chance the Clarion traces the money (reputation -12).', apply(state, log, cost) { state.env.activism = clamp(state.env.activism - 12, 0, 100); if (chance(0.25)) { reportStory(state, 'astroturf', {}); log('The Clarion discovered "Citizens for Prosperity" shares a post-office box with your bookkeeper.', 'env'); } else log('"Citizens for Prosperity" held a rally on the courthouse square. Twelve people came. The handbill said hundreds.', 'env'); } },
};
export function communityCost(state, key) { return inflate(state, COMMUNITY_ACTIONS[key].base); }
export function communityActionsFor(state) { return Object.entries(COMMUNITY_ACTIONS).filter(([, a]) => !a.when || a.when(state)).map(([k, a]) => [k, { ...a, cost: communityCost(state, k) }]); }
export function doCommunity(state, key, log) {
  const a = COMMUNITY_ACTIONS[key];
  if (!a) return { ok: false, msg: 'No such program.' };
  if (a.when && !a.when(state)) return { ok: false, msg: 'Nobody offers that yet.' };
  const cost = communityCost(state, key);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford it.' };
  state.company.cash -= cost; state.ledger.other += cost;
  a.apply(state, log, cost);
  return { ok: true, cost };
}
