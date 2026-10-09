// Rival companies: starting acreage and wells, monthly leasing/drilling, and acreage purchases.
import { rnd, rand, randInt, pick, chance, gauss, lognorm } from './rng.js';
import { clamp, nextId, money } from './util.js';
import { COMPETITORS } from './data.js';
import { neighbours, poolPressure, updatePool } from './geology.js';
import { runSurvey, surfaceName } from './land.js';
import { inflate, yearOf, oilAnchor } from './era.js';
import { techAvailable } from './tech.js';
import { prorationMult } from './government.js';
import { reportStory } from './press.js';
import { recordCrime, addHeat, addDirt, discoverCrime, undiscoveredCrimes } from './law.js';
import { pushEvent, EVENTS } from './events.js';
import { roleSkill } from './staff.js';

// Ethics per company (1 = choirboy). Everything else about a rival's character starts from here.
const ETHICS = { 'Sooner State Oil': 0.5, 'Bar-K Drilling & Producing': 0.35, 'Prairie Royalty & Land': 0.3, 'Trans-Basin Exploration': 0.55 };
export function rivalCharacter(comp) { return { ethics: clamp((ETHICS[comp.name] ?? 0.5) + gauss(0, 0.1), 0.05, 0.95), standing: 55, heat: 0, hostility: 0, tricks: 0, exposed: 0, frozenUntil: -1 }; }

export function compByName(state, name) { return state.competitors.find((c) => c.name === name); }
export const isDormant = (comp) => !!comp.dormant;

function hold(state, comp, p, opts = {}) {
  const m = p.mineral;
  m.leasedBy = comp.name;
  m.owned = opts.owned ?? false;
  m.hbp = opts.hbp ?? false;
  m.leaseUntil = m.owned || m.hbp ? 1e9 : state.month + (opts.months ?? randInt(12, 48));
  comp.held.push(p.id);
}

function cluster(state, seed, n) {
  const out = [seed]; const open = [seed];
  while (out.length < n && open.length) {
    const cur = open.shift();
    for (const q of neighbours(state.parcels, cur)) {
      if (out.length >= n) break;
      if (q.drillable && !q.mineral.leasedBy && !out.includes(q) && chance(0.7)) { out.push(q); open.push(q); }
    }
  }
  return out;
}

function compWellRate(w, pool, state = null) {
  const arps = w.qi / Math.pow(1 + w.b * w.Di * w.t, 1 / w.b);
  const r = !pool ? arps : arps * poolPressure(pool) / poolPressure(pool, w.x0);
  return state ? r * prorationMult(state, null, r, state.parcels[w.parcelId]?.truth.sand.depth) : r;
}

function addCompWell(state, comp, p, target, ageMonths) {
  const g = p.truth[target];
  const pool = target === 'sand' && g.pool !== null ? state.pools.find((x) => x.id === g.pool) : null;
  let qi, Di, b, gasFree = 0;
  if (target === 'sand') {
    const kh = Math.max(0.1, g.perm * g.thickness);
    qi = 6 * Math.pow(kh, 0.5) * (g.oilSat / 0.6) * rand(0.7, 1.2);
    b = 0.4; Di = clamp(qi * 30.4 / (7758 * 160 * Math.max(1, g.thickness) * g.porosity * g.oilSat / 1.2 * 0.2 * 0.6), 0.008, 0.08);
  } else {
    const base = (150 + 950 * Math.pow(g.quality, 1.3)) * (0.6 + 0.4 * Math.min(1, g.thickness / 80));
    qi = base * 1.3 * rand(0.6, 1.2) * g.oilFrac; gasFree = base * 1.3 * (1 - g.oilFrac) * 6;
    Di = 0.09; b = 1.2;
  }
  const w = { id: nextId(state), owner: comp.name, parcelId: p.id, name: `${comp.tag} ${p.surface.name.split(' ')[0]} ${target === 'shale' ? 'H' : ''}${(p.competitorWells || 0) + 1}`, target, qi, Di, b, gasFree, t: 0, poolId: pool ? pool.id : null, x0: pool ? pool.x : 0, cum: 0 };
  // Back-fill history so the field is already depleted by the amount they have produced.
  for (let i = 0; i < ageMonths; i++) { const r = compWellRate(w, pool) * 30.4; w.cum += r; w.t++; if (pool) { pool.cum += r; updatePool(pool); } }
  if (pool && !pool.discovered) { pool.discovered = true; pool.discoveredMonth = -ageMonths; pool.discoveredBy = comp.name; }
  w.lastRate = compWellRate(w, pool);
  comp.wells.push(w);
  p.competitorWells = (p.competitorWells || 0) + 1;
  p.mineral.hbp = true; p.mineral.leaseUntil = 1e9;
  state.land.competitorWells++;
  return w;
}

function seedParcel(state, comp, free) {
  if (comp.style === 'conventional') {
    const inPool = free().filter((p) => p.truth.sand.pool !== null && p.truth.sand.pos > 0.3);
    return inPool.length ? pick(inPool) : pick(free());
  }
  if (comp.style === 'shale') {
    const good = free().filter((p) => p.truth.shale.quality > 0.5);
    return good.length ? pick(good) : pick(free());
  }
  return pick(free());
}
function clusterSize(comp) { return comp.style === 'land' ? randInt(6, 9) : comp.style === 'wildcat' ? randInt(2, 4) : randInt(3, 6); }

export function initCompetitors(state) {
  state.competitors = COMPETITORS.map((c) => ({ ...c, held: [], wells: [], acquired: 0, sold: 0, dormant: !!(c.activeYear && c.activeYear > yearOf(state)), arrived: false, ...rivalCharacter(c) }));
  const free = () => state.parcels.filter((p) => p.drillable && !p.mineral.leasedBy);
  for (const comp of state.competitors) {
    if (comp.dormant) continue;
    const seed = seedParcel(state, comp, free);
    for (const p of cluster(state, seed, clusterSize(comp))) hold(state, comp, p, { owned: chance(0.3) });
    // Legacy wells. Nobody has shale wells in 1952.
    if (comp.style === 'conventional' || comp.style === 'wildcat') {
      const targets = comp.held.map((id) => state.parcels[id]).filter((p) => p.truth.sand.pool !== null && p.truth.sand.thickness > 0);
      const nParcels = comp.style === 'wildcat' ? randInt(0, 1) : randInt(1, 3);
      for (const p of targets.slice(0, nParcels)) { const age = randInt(24, 140); for (let k = 0; k < randInt(1, 2); k++) addCompWell(state, comp, p, 'sand', age); }
    }
  }
  // A second, older cluster for one conventional company: an old field everyone knows about.
  const old = state.competitors.find((c) => c.style === 'conventional' && !c.dormant);
  const oldPool = state.pools.filter((p) => !p.discovered).sort((a, b) => b.ooip - a.ooip)[0];
  if (old && oldPool) {
    const ps = oldPool.parcels.map((id) => state.parcels[id]).filter((p) => p.drillable && !p.mineral.leasedBy).slice(0, 3);
    for (const p of ps) { hold(state, old, p, { owned: true }); addCompWell(state, old, p, 'sand', randInt(120, 300)); }
  }
  // Public records: everyone can see where the old wells are.
  for (const comp of state.competitors) for (const w of comp.wells) { const p = state.parcels[w.parcelId]; for (const q of [p, ...neighbours(state.parcels, p)]) if (q.survey.level < 1) runSurvey(state, q, 1, null, 0); }
}

export function compProduction(state, comp) { return comp.wells.reduce((a, w) => a + (w.lastRate || 0), 0); }

function wakeCompetitor(state, comp, log) {
  comp.dormant = false; comp.arrived = true;
  const free = () => state.parcels.filter((p) => p.drillable && !p.mineral.leasedBy);
  if (free().length) for (const p of cluster(state, seedParcel(state, comp, free), clusterSize(comp))) hold(state, comp, p, { months: randInt(36, 60) });
  log(`${comp.name} has opened an office over the bank. Their landmen are in the courthouse every morning; they leased ${comp.held.length} sections in a week.`, 'land');
}

export function tickCompetitors(state, log) {
  const hype = state.land.hype;
  const shaleEra = techAvailable(state, 'shale');
  for (const comp of state.competitors) {
    if (comp.dormant) { if (comp.activeYear && yearOf(state) >= comp.activeYear) wakeCompetitor(state, comp, log); else continue; }
    if (comp.shaleAfterUnlock && shaleEra && comp.style !== 'shale') { comp.style = 'shale'; log(`${comp.name} brought a horizontal rig into the county. Their landmen are asking about the Blackfork Shale.`, 'land'); }
    // Production (prorated like everyone else's; a prorated well declines slower)
    for (const w of comp.wells) {
      const pool = w.poolId !== null ? state.pools.find((x) => x.id === w.poolId) : null;
      const full = compWellRate(w, pool);
      const r = compWellRate(w, pool, state);
      w.lastRate = r; w.cum += r * 30.4; w.t += full > 0 ? r / full : 1;
      if (pool) pool.cum += r * 30.4;
    }
    if (comp.frozenUntil > state.month) continue; // indicted: the lawyers say lie low
    const scale = comp.scale || 1;
    // Leasing
    const pLease = Math.min(0.3, ((comp.style === 'land' ? 0.12 : comp.style === 'wildcat' ? 0.06 : 0.05) + hype / inflate(state, 100) * 0.04) * scale);
    if (chance(pLease)) {
      const open = state.parcels.filter((p) => p.drillable && !p.mineral.leasedBy && !p.mineral.auction);
      let target = null;
      if (comp.style === 'conventional') { const inPool = open.filter((p) => p.truth.sand.pool !== null && state.pools.find((x) => x.id === p.truth.sand.pool)?.discovered); target = inPool.length ? pick(inPool) : null; }
      else if (comp.style === 'shale') { const sample = Array.from({ length: 5 }, () => pick(open)).filter(Boolean); target = sample.sort((a, b) => b.truth.shale.quality - a.truth.shale.quality)[0]; }
      else target = open.length ? pick(open) : null;
      if (target) { hold(state, comp, target, { months: randInt(24, 48) }); log(`${comp.name} leased ${surfaceName(target)}.`, 'land'); }
    }
    // Drilling
    const pDrill = comp.style === 'land' ? 0.005 : Math.min(0.35, (0.05 + hype / inflate(state, 130) * 0.05) * scale);
    if (chance(pDrill)) {
      const held = comp.held.map((id) => state.parcels[id]).filter((p) => p.mineral.leasedBy === comp.name && (p.competitorWells || 0) < 2 && !p.compDry);
      // Conventional operators know their fields: they drill on-structure unless they are wildcatting. Bar-K wildcats a lot.
      const onStruct = held.filter((p) => p.truth.sand.onStructure && p.truth.sand.thickness > 0);
      const wildcatting = chance(comp.style === 'wildcat' ? 0.4 : 0.15);
      const pickFrom = comp.style === 'shale' ? held : onStruct.length && !wildcatting ? onStruct : held;
      if (pickFrom.length) {
        const p = comp.style === 'shale' ? pickFrom.sort((a, b) => b.truth.shale.quality - a.truth.shale.quality)[0] : pickFrom.sort((a, b) => b.truth.sand.pos - a.truth.sand.pos)[0];
        const target = comp.style === 'shale' ? 'shale' : 'sand';
        const g = p.truth.sand;
        if (target === 'sand' && (g.thickness <= 0 || chance(g.trapRisk))) {
          log(`${comp.name} drilled a dry hole at ${surfaceName(p)}. ${comp.style === 'wildcat' ? 'The promoter has left town.' : 'Their geologist has been "reassigned".'}`, 'land');
          p.compDry = true;
        } else {
          state.permits.rivalUsed++;
          const w = addCompWell(state, comp, p, target, 0);
          const pool = w.poolId !== null ? state.pools.find((x) => x.id === w.poolId) : null;
          if (pool && pool.discoveredMonth === 0) { pool.discoveredMonth = state.month; log(`DISCOVERY: ${comp.name} found a new field at ${surfaceName(p)}. They are calling it the ${pool.name}. Every landman in the county just got in his truck.`, 'land'); state.land.hype *= 1.15; }
          else log(`${comp.name} reports a ${Math.round(w.qi)} bbl/d IP on a ${target === 'shale' ? 'horizontal' : 'vertical'} well at ${surfaceName(p)}.`, 'land');
          if (target === 'shale' && g.quality > 0.6) state.land.hype *= 1.05;
        }
        for (const q of [p, ...neighbours(state.parcels, p)]) if (q.survey.level < 1) runSurvey(state, q, 1, null, 0);
      }
    }
    // Land-bankers sell to whoever is drilling (news flavour + hype)
    if (comp.style === 'land' && chance(0.02) && comp.held.length > 3) {
      const id = comp.held.pop(); const p = state.parcels[id];
      const drillers = state.competitors.filter((c) => !c.dormant && c !== comp && c.style !== 'land');
      const buyer = drillers.find((c) => c.style === 'shale') || (drillers.length ? pick(drillers) : null);
      if (p.mineral.leasedBy === comp.name && buyer) { p.mineral.leasedBy = buyer.name; buyer.held.push(id); comp.sold++; log(`${comp.name} flipped ${surfaceName(p)} to ${buyer.name} for an undisclosed sum, rumoured to be $${Math.round(hype * 3)}/acre.`, 'land'); }
      else if (p.mineral.leasedBy === comp.name) comp.held.push(id);
    }
  }
  // Expired competitor leases drop out of their holdings
  for (const comp of state.competitors) comp.held = comp.held.filter((id) => state.parcels[id].mineral.leasedBy === comp.name);
  tickRivalTricks(state, log);
}

// --- Dirty tricks -----------------------------------------------------------------------------
// Each active rival rolls once a month. Tricks leave evidence (a crime record flagged byRival) that your detective,
// the cafe, or a whistleblower can turn into dirt; dirt can be printed or handed to the sheriff.
const TRICKS = ['bribeCourthouse', 'plantStory', 'topLease', 'poach', 'tipSheriff', 'sabotage'];
export function tickRivalTricks(state, log) {
  if (state.founding && state.founding.phase !== 'done') return; // nobody plays tricks on a man with no company
  for (const comp of state.competitors) {
    if (comp.dormant || comp.frozenUntil > state.month) continue;
    if (comp.ethics === undefined) Object.assign(comp, rivalCharacter(comp));
    comp.hostility = Math.max(0, (comp.hostility || 0) - 1);
    // Exposure: enough heat on a rival and the grand jury names them.
    if (comp.heat > 40 && chance(0.15)) {
      comp.heat = 0; comp.exposed++; comp.frozenUntil = state.month + 12; comp.standing = clamp(comp.standing - 20, 0, 100);
      reportStory(state, 'rivalIndicted', { rival: comp.name, about: comp.name });
      log(`${comp.name}'s officers were named by the grand jury. Their landmen have left the courthouse and their rig is stacked for a year.`, 'land');
      continue;
    }
    comp.heat = Math.max(0, (comp.heat || 0) - 1);
    const p = 0.03 * (1 - comp.ethics) * (1 + (comp.hostility || 0) / 50);
    if (!chance(p)) continue;
    const trick = pick(TRICKS.filter((t) => t !== 'tipSheriff' || undiscoveredCrimes(state).length));
    comp.tricks = (comp.tricks || 0) + 1;
    const evidence = (kind, kindText, exposure = 0.3) => recordCrime(state, { kind, kindText, byRival: true, rival: comp.name, exposure, witnesses: 1 });
    if (trick === 'bribeCourthouse') {
      const judge = state.people?.[state.offices?.judge];
      if (state.permits.countyBudget > 1) { state.permits.countyBudget--; state.permits.rivalUsed++; state.permits.countyUsed = Math.min(state.permits.countyUsed, state.permits.countyBudget); }
      evidence('bribe', `paid ${judge ? judge.name : 'the county judge'} for a permit ahead of the line`, 0.4);
      if (judge) { judge.secrets.push({ kind: `an envelope from ${comp.name}`, strength: 0.7 }); judge.bribedByRival = (judge.bribedByRival || 0) + 1; }
      log(`${comp.name} got a permit the commission did not have to give. The county's allocation for the year is one thinner.`, 'gov');
    } else if (trick === 'plantStory') {
      const prSkill = roleSkill(state, 'pr');
      const s = reportStory(state, 'smear', { rival: state.company.name, about: 'player', truth: false, planted: comp.name, repHit: 6, headline: pick([`${state.company.name.toUpperCase()} ROYALTY CHEQUES LATE, OWNERS SAY`, `QUESTIONS RAISED ABOUT ${state.company.name.toUpperCase()} PITS`, `${state.company.name.toUpperCase()} WELLS "UNSAFE," FORMER HAND CLAIMS`]) });
      evidence('libel', `planted a false story about you in the Clarion`, 0.35);
      if (chance(0.1 + 0.06 * prSkill)) { s.status = 'killed'; addDirt(state, { personId: `comp:${comp.name}`, kind: 'planted a false story about you in the Clarion', strength: 0.6, source: 'editor' }); log(`The editor showed your community man a typed "tip" about the company. The typewriter belongs to ${comp.name}'s landman. The story died, and you have something on them.`, 'press'); }
    } else if (trick === 'topLease') {
      const cand = state.parcels.filter((q) => q.mineral.leasedBy === 'player' && q.mineral.lease && !q.mineral.topLease && !q.wells.length && q.mineral.lease.termEnd - state.month <= 18);
      if (cand.length) { const q = pick(cand); q.mineral.topLease = comp.name; log(`${comp.name} took a top lease on ${q.surface.name}: if your lease expires undrilled, theirs begins that morning.`, 'land'); }
      else { comp.tricks--; }
    } else if (trick === 'poach') {
      const cand = state.staff.filter((s) => !s.founder && !s.traits.includes('loyal') && ((s.loyalty ?? 60) < 50 || s.traits.includes('restless')));
      if (cand.length && !state.pending.length) { const s = pick(cand); pushEvent(state, 'poach', EVENTS.poach.params(state, { sid: s.id, rival: comp.name })); }
      else comp.tricks--;
    } else if (trick === 'tipSheriff') {
      const c = pick(undiscoveredCrimes(state));
      addHeat(state, 12);
      if (chance(0.5)) discoverCrime(state, c, 'rival', log);
      evidence('tip', 'sent an anonymous letter about you to the sheriff', 0.25);
      log(`The sheriff received a typed letter about ${state.company.name}. No signature.`, 'law');
    } else if (trick === 'sabotage') {
      const mine = state.wells.filter((w) => w.status === 'producing');
      if (mine.length) {
        const w = pick(mine); w.health = clamp(w.health - 30, 0, 100);
        const cost = inflate(state, 800); state.company.cash -= cost; state.ledger.opex += cost;
        evidence('sabotage', `sent a man to open the valves at ${w.name}`, 0.45);
        reportStory(state, 'sabotage', { well: w.name, repHit: 0 });
        log(`Somebody opened the valves at ${w.name} in the night and put sand in the pump. ${money(cost)} in repairs and a bad feeling.`, 'wells');
        if (chance(0.3)) { const c = state.crimes[state.crimes.length - 1]; c.discovered = true; addDirt(state, { personId: `comp:${comp.name}`, kind: c.kindText, strength: 0.7, source: 'witness' }); comp.heat = clamp(comp.heat + 20, 0, 100); log(`Your pumper recognised the truck. It belongs to ${comp.name}.`, 'wells'); }
      } else comp.tricks--;
    }
  }
}
// Tell the sheriff what you know about a rival. Dirt makes it stick; without it you are just a sore loser.
export function tipSheriffOn(state, compName, log) {
  const comp = compByName(state, compName); if (!comp) return { ok: false, msg: 'Nobody by that name.' };
  const sheriff = state.people?.[state.offices?.sheriff];
  const dirt = (state.dirt || []).find((d) => d.personId === `comp:${comp.name}` && !d.used);
  comp.hostility = clamp((comp.hostility || 0) + 20, 0, 100);
  if (dirt) { dirt.used = true; comp.heat = clamp((comp.heat || 0) + 25 + (sheriff ? 20 * sheriff.honesty : 10), 0, 100); const msg = `You told the sheriff that ${comp.name} ${dirt.kind}. He wrote it down and underlined it twice.`; log?.(msg, 'law'); return { ok: true, msg }; }
  comp.heat = clamp((comp.heat || 0) + 8, 0, 100);
  if (sheriff) sheriff.disposition = clamp(sheriff.disposition - 4, 0, 100);
  const msg = `You told the sheriff ${comp.name} was up to something. "Everybody's up to something," he said, and went back to his coffee.`;
  log?.(msg, 'law');
  return { ok: true, msg };
}
export function rivalSummary(state) { return state.competitors.map((c) => ({ name: c.name, tag: c.tag, dormant: c.dormant, ethics: c.ethics, standing: Math.round(c.standing ?? 55), heat: Math.round(c.heat || 0), hostility: Math.round(c.hostility || 0), frozen: c.frozenUntil > state.month, dirt: (state.dirt || []).filter((d) => d.personId === `comp:${c.name}` && !d.used).length, tricks: c.tricks || 0 })); }

// --- Buying acreage from a rival ------------------------------------------
export function acreageAsk(state, p) {
  const m = p.mineral; const comp = compByName(state, m.leasedBy);
  if (!comp) return null;
  if (m.hbp) return { forSale: false, reason: 'Producing acreage is not for sale.' };
  let mult = m.owned ? 4 : 2.2;
  const pool = p.truth.sand.pool !== null ? state.pools.find((x) => x.id === p.truth.sand.pool) : null;
  if (pool?.discovered && p.truth.sand.pos > 0.3) mult *= 2;
  if (techAvailable(state, 'shale') && p.truth.shale.quality > 0.6 && comp.style === 'shale') mult *= 1.8;
  if (comp.style === 'land') mult *= 0.85;
  const raw = state.land.hype * mult;
  const ask = raw >= 50 ? Math.round(raw / 10) * 10 : Math.max(1, Math.round(raw));
  return { forSale: true, askAcre: ask, total: ask * p.acres, owned: m.owned, comp };
}
export function offerAcreage(state, p, offerAcre, log) {
  const a = acreageAsk(state, p);
  if (!a || !a.forSale) return { ok: false, msg: a?.reason || 'Not available.' };
  const total = offerAcre * p.acres;
  if (state.company.cash - total < -state.company.creditLimit) return { ok: false, msg: 'You cannot cover that.' };
  const bust = state.market.oil < 0.85 * oilAnchor(state.month);
  const z = (offerAcre / a.askAcre - 1) * 6 + (a.comp.style === 'land' ? 0.9 : -0.2) + (bust ? 0.5 : 0);
  if (!chance(1 / (1 + Math.exp(-z)))) { p.mineral.refusals = (p.mineral.refusals || 0) + 1; return { ok: false, msg: `${a.comp.name} passes. "We like our position."` }; }
  state.company.cash -= total; state.ledger.land += total;
  const m = p.mineral;
  a.comp.held = a.comp.held.filter((id) => id !== p.id); a.comp.sold++; a.comp.hostility = clamp((a.comp.hostility || 0) + 5, 0, 100);
  m.lease = { bonusAcre: offerAcre, bonus: total, royalty: 0.1875, start: state.month, termEnd: m.owned ? state.month + 120 : Math.max(m.leaseUntil, state.month + 12), hbp: false, assigned: true };
  m.leasedBy = 'player'; m.owned = false; m.hbp = false; m.leaseUntil = -1;
  const msg = `${a.comp.name} assigned ${surfaceName(p)} to you for $${total.toLocaleString()} ($${offerAcre}/acre, 18.75% royalty burden).`;
  log(msg, 'land');
  return { ok: true, msg };
}
