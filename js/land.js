// Parcels, mineral rights, surface owners, negotiations, competitors.
import { rnd, rand, randInt, pick, chance, gauss } from './rng.js';
import { clamp, nextId, money } from './util.js';
import { GRID_W, GRID_H, PARCEL_ACRES, FARM_NAMES, MINERAL_COS, FIRST, LAST, OWNER_TYPES } from './data.js';
import { makeEstimate, neighbours } from './geology.js';
import { available, effSkill, roleSkill } from './staff.js';
import { inflate, oilAnchor, yearOf } from './era.js';
import { statute } from './government.js';
import { reportStory } from './press.js';

export function generateParcels(state, geo) {
  const parcels = [];
  const farms = [...FARM_NAMES];
  const townX = randInt(1, GRID_W - 2), townY = randInt(1, GRID_H - 2);
  const presX = randInt(0, GRID_W - 1), presY = randInt(0, GRID_H - 1);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    let type;
    const dTown = Math.abs(x - townX) + Math.abs(y - townY);
    if (x === townX && y === townY) type = 'town';
    else if (x === presX && y === presY) type = 'preserve';
    else if (dTown === 1 && chance(0.6)) type = 'homes';
    // School-land style: two trust sections in every six-by-six block, plus a scatter of others.
    else if ((x % 6 === 3 && y % 6 === 2) || (x % 6 === 0 && y % 6 === 5)) type = 'state';
    else { const r = rnd(); type = r < 0.38 ? 'farmer' : r < 0.66 ? 'rancher' : r < 0.84 ? 'state' : r < 0.94 ? 'federal' : 'homes'; }
    const isPublic = type === 'state' || type === 'federal';
    const name = type === 'farmer' || type === 'rancher' ? (farms.length ? farms.splice(randInt(0, farms.length - 1), 1)[0] : `${pick(LAST)} Place`)
      : type === 'homes' ? `${pick(['Prairie View', 'Quail Run', 'Cottonwood', 'Heritage Hills', 'Sagebrush'])} Addition`
      : type === 'state' ? 'State Trust Section' : type === 'federal' ? 'U.S. Tract' : type === 'town' ? 'Town of Dry Fork' : 'Coyote Creek Preserve';
    const split = !isPublic && type !== 'town' && type !== 'preserve' && chance(0.3);
    const mineralOwnerType = isPublic ? type : split ? pick(['heirs', 'company']) : type;
    const mineralName = isPublic ? name : split ? pick(MINERAL_COS) : name;
    const greed = clamp(gauss(1, 0.25), 0.55, 1.7);
    parcels.push({
      id: y * GRID_W + x, x, y, acres: PARCEL_ACRES,
      drillable: OWNER_TYPES[type].drillable,
      surface: { type, name, disposition: isPublic ? 60 : clamp(Math.round(gauss(type === 'homes' ? 40 : 58, 15)), 5, 95), agreement: null, hostile: false, ownerPerson: type === 'state' ? 'State Land Office' : type === 'federal' ? 'Bureau of Land Management' : `${pick(FIRST)} ${pick(LAST)}` },
      mineral: { split, ownerType: mineralOwnerType, name: mineralName, greed, failedRounds: 0, holdoutUntil: -1, lease: null, leasedBy: null, leaseUntil: -1, auction: null, owned: false, hbp: false },
      survey: { level: 0, est: null, month: -1 },
      wells: [],
      truth: geo[y][x],
      contested: false,
    });
  }
  return parcels;
}

export function parcelAt(state, x, y) { return state.parcels[y * GRID_W + x]; }
export const surfaceName = (p) => p.surface.name;
export const surfaceIcon = (p) => OWNER_TYPES[p.surface.type].icon;

// --- Regional lease hype ($/acre bonus the market expects) -------------------
export const HYPE_BASE = 4;
export function tickHype(state) {
  const l = state.land;
  const goodWells = state.wells.filter((w) => w.status === 'producing' && w.perf.qiOil > 100).length + l.competitorWells;
  const target = HYPE_BASE * Math.pow(state.market.oil / 2.5, 1.1) * (1 + 0.12 * Math.min(goodWells, 12));
  l.hype = l.hype * 0.94 + target * 0.06;
}

// --- Mineral leases -------------------------------------------------------
export function isPublic(p) { return p.mineral.ownerType === 'state' || p.mineral.ownerType === 'federal'; }
export const PRIMARY_TERM = 60;
export function maxRoyalty(state) { return yearOf(state) < 1975 ? 0.1875 : 0.25; }

export function leaseAsk(state, p) {
  const m = p.mineral;
  const near = neighbours(state.parcels, p).filter((q) => q.wells.some((id) => { const w = state.wells.find((w) => w.id === id); return w && w.status === 'producing'; })).length;
  const localHype = 1 + 0.2 * near + (m.failedRounds * 0.12);
  const raw = state.land.hype * m.greed * localHype;
  const bonusAcre = raw >= 20 ? Math.round(raw / 5) * 5 : Math.max(1, Math.round(raw));
  const royalty = isPublic(p) ? (m.ownerType === 'state' ? 0.1667 : 0.125) : clamp(0.125 + 0.1 * (m.greed - 0.7) + 0.02 * near, 0.125, maxRoyalty(state));
  return { bonusAcre, royalty, term: PRIMARY_TERM };
}

export function negotiateLease(state, p, offerBonusAcre, offerRoyalty, landman) {
  const m = p.mineral;
  if (m.leasedBy) return { ok: false, msg: 'Already leased.' };
  if (m.holdoutUntil > state.month) return { ok: false, msg: `${m.name} is not returning your calls until ${m.holdoutUntil - state.month} more months pass.` };
  const ask = leaseAsk(state, p);
  const skill = landman ? effSkill(state, landman) : 2;
  const rep = state.company.reputation;
  const value = (offerBonusAcre / ask.bonusAcre) * 0.55 + (offerRoyalty / ask.royalty) * 0.45;
  let z = 0.6 + (value - 1) * 7 + (skill - 5) * 0.28 + (rep - 50) / 45;
  if (m.ownerType === 'heirs') z -= 0.4; // 17 heirs never agree on anything
  const pAccept = 1 / (1 + Math.exp(-z));
  const total = Math.round(offerBonusAcre * p.acres);
  if (state.company.cash - total < -state.company.creditLimit) return { ok: false, msg: 'You cannot cover that bonus payment.' };
  if (chance(pAccept)) {
    state.company.cash -= total; state.ledger.land += total;
    m.lease = { bonusAcre: offerBonusAcre, bonus: total, royalty: offerRoyalty, start: state.month, termEnd: state.month + ask.term, hbp: false };
    m.leasedBy = 'player'; m.failedRounds = 0;
    return { ok: true, msg: `${m.name} signed: ${p.acres} acres at $${offerBonusAcre}/acre (${(offerRoyalty * 100).toFixed(1)}% royalty, ${ask.term / 12}-year primary term).`, pAccept };
  }
  m.failedRounds++;
  if (m.failedRounds >= 3) { m.holdoutUntil = state.month + 8; m.failedRounds = 0; return { ok: false, msg: `${m.name} is insulted by your lowballing and has stopped talking to you for a while.`, pAccept }; }
  return { ok: false, msg: pick([`${m.name} laughs and says the neighbours got more.`, `${m.name} says they'll "study on it" and shows you the door.`, `${m.name} mentions another outfit's landman was by last week.`]), pAccept };
}

// Public land auction: nominate now, resolves next month against competitor bids.
export function nominateAuction(state, p, bidAcre) {
  const m = p.mineral;
  if (m.leasedBy || m.auction) return { ok: false, msg: 'Not available.' };
  const total = bidAcre * p.acres;
  if (state.company.cash - total < -state.company.creditLimit) return { ok: false, msg: 'You cannot cover that bid.' };
  m.auction = { bidAcre, resolveMonth: state.month + 1 };
  return { ok: true, msg: `Sealed bid of $${bidAcre}/acre submitted for the ${m.name}. Results next month.` };
}

function resolveAuctions(state, log) {
  for (const p of state.parcels) {
    const m = p.mineral;
    if (!m.auction || m.auction.resolveMonth > state.month) continue;
    const ask = leaseAsk(state, p);
    const rival = ask.bonusAcre * rand(0.45, 1.5) * (state.gov.relations > 70 ? 0.8 : 1);
    const total = Math.round(m.auction.bidAcre * p.acres);
    if (m.auction.bidAcre >= rival && state.company.cash - total >= -state.company.creditLimit) {
      state.company.cash -= total; state.ledger.land += total;
      m.lease = { bonusAcre: m.auction.bidAcre, bonus: total, royalty: ask.royalty, start: state.month, termEnd: state.month + PRIMARY_TERM, hbp: false };
      m.leasedBy = 'player';
      grantAgencySurface(state, p);
      log(`You won the ${m.name} sale at $${m.auction.bidAcre}/acre. Runner-up bid: $${Math.round(rival)}/acre. The lease carries surface access on the agency's standard terms.`, 'land');
    } else {
      const active = state.competitors.filter((c) => !c.dormant);
      const comp = pick(active.length ? active : state.competitors); m.leasedBy = comp.name; m.leaseUntil = state.month + PRIMARY_TERM; comp.held.push(p.id);
      log(`Lost the ${m.name} sale to ${m.leasedBy}, who bid about $${Math.round(rival)}/acre.`, 'land');
    }
    m.auction = null;
  }
}

// --- Surface agreements ---------------------------------------------------
// Public land: the agency owns both estates, so the lease itself carries the right to use the surface on
// standard terms (restoration bond, the water rule when the statute says). There is nobody else to sign.
export function grantAgencySurface(state, p) {
  if (!isPublic(p) || p.surface.agreement) return;
  const ask = surfaceAsk(state, p);
  p.surface.agreement = { damages: 0, conditions: ask.conditions, month: state.month, forced: false, agency: true };
}
export function surfaceAsk(state, p) {
  const s = p.surface;
  if (s.type === 'state' || s.type === 'federal') return { damages: inflate(state, 150), conditions: { noFresh: statute(state, 'waterRules'), harvestPause: false, restorationBond: true }, mandatory: true };
  const mood = (100 - s.disposition) / 100;
  const damages = Math.round(inflate(state, 200 + 800 * mood * mood) * (s.hostile ? 3 : 1) / 10) * 10;
  const conditions = {
    noFresh: s.type === 'farmer' && (s.disposition < 55 || statute(state, 'waterRules')),
    harvestPause: s.type === 'farmer' && s.disposition < 70,
    restorationBond: s.disposition < 80 || s.type === 'homes',
  };
  return { damages, conditions, mandatory: false };
}

export function negotiateSurface(state, p, offerDamages, acceptConditions, landman) {
  const s = p.surface;
  if (s.agreement) return { ok: false, msg: 'Already have an agreement.' };
  const ask = surfaceAsk(state, p);
  const skill = landman ? effSkill(state, landman) : 2;
  const ratio = offerDamages / ask.damages;
  let z = 0.8 + (ratio - 1) * 6 + (skill - 5) * 0.2 + (s.disposition - 50) / 25 + (state.company.reputation - 50) / 50;
  if (!acceptConditions) z -= 1.6;
  if (ask.mandatory) z = ratio >= 1 && acceptConditions ? 99 : -99;
  const pAccept = 1 / (1 + Math.exp(-z));
  if (state.company.cash - offerDamages < -state.company.creditLimit) return { ok: false, msg: 'Cannot pay that.' };
  if (chance(pAccept)) {
    state.company.cash -= offerDamages; state.ledger.land += offerDamages;
    s.agreement = { damages: offerDamages, conditions: acceptConditions ? ask.conditions : { noFresh: false, harvestPause: false, restorationBond: false }, month: state.month, forced: false };
    s.disposition = clamp(s.disposition + (ratio >= 1 ? 8 : 0) + (acceptConditions ? 5 : -10), 0, 100);
    return { ok: true, msg: `${s.name} signed a surface damage agreement for ${money(offerDamages)}.` };
  }
  s.disposition = clamp(s.disposition - 2, 0, 100);
  return { ok: false, msg: pick([`${s.ownerPerson} of ${s.name} says no. "My granddad broke this ground."`, `${s.ownerPerson} wants to know what happens to the windmill water. You don't have a good answer.`, `${s.ownerPerson} says the number is "insulting".`]) };
}

// Split-estate: the mineral estate is dominant. You can force access. Everyone will hate you.
export function forceAccessCost(state) { return inflate(state, 2_500); }
export function forceAccess(state, p) {
  const s = p.surface;
  if (!p.mineral.split && !['state', 'federal'].includes(p.mineral.ownerType)) return { ok: false, msg: 'Only possible when the mineral estate is severed from the surface.' };
  const legal = forceAccessCost(state);
  state.company.cash -= legal; state.ledger.land += legal;
  s.agreement = { damages: 0, conditions: { noFresh: false, harvestPause: false, restorationBond: false }, month: state.month, forced: true };
  s.hostile = true; s.disposition = 0;
  state.company.reputation = clamp(state.company.reputation - 9, 0, 100);
  state.env.activism = clamp(state.env.activism + 10, 0, 100);
  for (const q of neighbours(state.parcels, p)) q.surface.disposition = clamp(q.surface.disposition - 12, 0, 100);
  reportStory(state, 'forcedAccess', { farm: s.name, person: s.ownerPerson });
  return { ok: true, msg: `The district judge confirms the mineral estate is dominant. Your bulldozer arrives at ${s.name} with a court order and a deputy. The Clarion runs a photograph of ${s.ownerPerson} at the gate.` };
}

// --- Surveys ---------------------------------------------------------------
export function runSurvey(state, p, level, geologist, cost) {
  const skill = geologist ? effSkill(state, geologist) : 3;
  p.survey = { level: Math.max(level, p.survey.level), est: makeEstimate(p.truth, Math.max(level, p.survey.level), skill, state), month: state.month, by: geologist ? geologist.name : 'contractor' };
}
export function revealTruth(state, p) {
  p.survey = { level: 4, est: makeEstimate(p.truth, 4, 10, state), month: state.month, by: 'drilling' };
  for (const q of neighbours(state.parcels, p)) if (q.survey.level < 2) runSurvey(state, q, 1, null, 0), q.survey.level = Math.max(q.survey.level, 1);
}

// --- Monthly ---------------------------------------------------------------
export function tickLand(state, log) {
  tickHype(state);
  resolveAuctions(state, log);
  const rep = state.company.reputation;
  for (const p of state.parcels) {
    const m = p.mineral, s = p.surface;
    // disposition drifts toward a reputation-based baseline
    if (!s.hostile) { const base = 20 + rep * 0.6; s.disposition += (base - s.disposition) * 0.03; }
    // player lease expiry / HBP
    if (m.leasedBy === 'player' && m.lease) {
      const active = p.wells.some((id) => { const w = state.wells.find((w) => w.id === id); return w && ['producing', 'shutin', 'workover', 'drill', 'complete', 'permit'].includes(w.status); });
      if (active) m.lease.hbp = true;
      else if (state.month >= m.lease.termEnd) {
        m.lease = null; m.leasedBy = null; m.failedRounds = 0;
        if (m.topLease) { const comp = state.competitors.find((c) => c.name === m.topLease); if (comp) { m.leasedBy = comp.name; m.leaseUntil = state.month + PRIMARY_TERM; comp.held.push(p.id); } log(`Your lease on ${m.name} (${s.name}) expired undrilled and ${m.topLease}'s top lease took effect the same morning.`, 'land'); m.topLease = null; }
        else log(`Your lease on ${m.name} (${s.name}) expired undrilled. The bonus you paid is gone.`, 'land');
      }
    }
    if (m.leasedBy && m.leasedBy !== 'player' && state.month >= m.leaseUntil) { m.leasedBy = null; }
  }
}
