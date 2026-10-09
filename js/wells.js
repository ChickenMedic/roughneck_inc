// Well design, cost, estimation, drilling/completion lifecycle, production and maintenance.
// Dollar constants are 1952 bases run through inflate()/inflateSvc(); shale-era formulas are in ~2020 dollars scaled by shaleScale().
import { rnd, rand, randInt, pick, chance, gauss, lognorm } from './rng.js';
import { clamp, nextId, sum, money } from './util.js';
import { effSkill, roleSkill, assignTask, riskMult, speedMult, makeContractor } from './staff.js';
import { realizedOil, realizedGas, sellsGas } from './market.js';
import { revealTruth, surfaceName } from './land.js';
import { poolPressure, updatePool, RECOVERY } from './geology.js';
import { inflate, inflateSvc, shaleScale, calMonth } from './era.js';
import { techAvailable, validateDesign } from './tech.js';
import { statute, requestPermit, prorationMult } from './government.js';
import { onStrike } from './labor.js';
import { inDrought } from './disasters.js';
import { reportStory } from './press.js';

export const WELL_CAP = { sand: 4, shale: 3 };
export const PROPPANT_PRICE = { sand: 0.06, rcs: 0.13, ceramic: 0.30 }; // $/lb, 2020 dollars (scaled by shaleScale)
export const LIFT_CAPEX = { none: 0, rod: 4_000, esp: 12_000, gaslift: 6_000 }; // 1952 dollars
export const LIFT_OPEX = { none: 0, rod: 80, esp: 300, gaslift: 160 };          // 1952 dollars per month
export const liftCapex = (state, lift) => inflate(state, LIFT_CAPEX[lift] || 0);
export const liftOpex = (state, lift) => inflate(state, LIFT_OPEX[lift] || 0);

export function defaultDesign(target, state = null) {
  const slick = state ? techAvailable(state, 'slickwater') : true;
  return target === 'shale'
    ? { target, lateral: 7500, spacing: 200, proppant: 'sand', intensity: 2000, fluid: slick ? 'slickwater' : 'gel', casing: 'standard', water: 'fresh', lift: 'none' }
    : { target, vfrac: false, casing: 'standard', water: 'fresh', lift: 'rod' };
}

export function stagesFor(d) { return Math.round(d.lateral / d.spacing); }

// Cost estimate. skills: { driller }
// Sandoval's rusty cable-tool rig (state.flags.ownRig): cheaper, slower, riskier, and only for the first two shallow sand wells.
export function usesOwnRig(state, geo, d) {
  const r = state.flags?.ownRig;
  return !!(r && r.wellsLeft > 0 && d.target === 'sand' && geo.sand.depth <= (r.depthLimit || 4000));
}
export function wellCost(state, geo, d, drillerSkill = 5, ownRig = false) {
  const mult = 1.15 - 0.03 * drillerSkill;
  const shortage = state.flags?.steelShortage ? 1.25 : 1;
  let drill, complete, breakdown = {};
  const g = geo[d.target];
  if (d.target === 'sand') {
    drill = inflateSvc(state, 8_000 + g.depth * 8) * mult * shortage * (ownRig ? 0.7 : 1);
    if (d.casing === 'premium') drill += inflate(state, 4_000);
    if (inDrought(state)) drill += inflate(state, 1_000); // water hauled from the next county
    breakdown = { 'Drilling (cable/rotary, casing)': drill, 'Completion, perfs & acid': inflate(state, 3_500), 'Hydraulic frac': d.vfrac ? inflateSvc(state, 6_000) : 0, 'Pad, tanks, road': inflate(state, 2_500), 'Artificial lift': liftCapex(state, d.lift) };
  } else {
    const k = shaleScale(state);
    const stages = stagesFor(d);
    drill = (900_000 + g.depth * 150 + d.lateral * 250) * k * mult * (d.casing === 'premium' ? 1.12 : 1);
    const prop = d.lateral * d.intensity * PROPPANT_PRICE[d.proppant] * k;
    const waterBbl = d.lateral * 15 * (d.fluid === 'gel' ? 0.6 : 1);
    const water = waterBbl * (d.water === 'fresh' ? 1.0 : 3.2) * (d.fluid === 'gel' ? 2.5 : d.fluid === 'hybrid' ? 1.6 : 1) * k;
    const pump = stages * 55_000 * k * shortage;
    breakdown = { 'Drilling (vertical + lateral)': drill, 'Frac pumping (stages)': pump, 'Proppant': prop, 'Frac fluid & water': water, 'Pad, tanks, facilities': 450_000 * k, 'Artificial lift': liftCapex(state, d.lift) };
  }
  complete = sum(Object.entries(breakdown).filter(([k]) => !k.startsWith('Drilling')), ([, v]) => v);
  return { drill: Math.round(drill), complete: Math.round(complete), total: Math.round(drill + complete), breakdown };
}

// Performance model. geo may be an estimate or the truth. Returns initial rates and decline params.
export function wellPerformance(geo, d, completionsSkill = 5, interference = 0, poolP = 1) {
  const g = geo[d.target];
  let qi, Di, b, gasPerBbl, gasFree = 0, wc0, dryRisk = 0, notes = [];
  if (d.target === 'sand') {
    const kh = Math.max(0.1, g.perm * g.thickness);
    qi = 6 * Math.pow(kh, 0.5) * (g.oilSat / 0.6) * (0.7 + 0.3 * g.depth / 4500);
    if (d.vfrac) { const f = g.perm < 20 ? 1.5 : 1.1; qi *= f; notes.push(g.perm < 20 ? 'A frac helps a lot in tight sand.' : 'A frac adds little in permeable sand.'); }
    qi *= 0.9 + 0.02 * completionsSkill;
    qi *= Math.pow(poolP, 0.8);
    if (g.thickness <= 0) { qi = 0; notes.push('Sandstone appears absent here.'); }
    if (g.onStructure === false) { qi *= 0.12; notes.push('Seismic puts this parcel off-structure: the sand is wet. Expect a dry hole or a water well.'); }
    if (g.onStructure === null) notes.push('No seismic here. Structure unknown; the dry-hole risk shown is a regional guess.');
    if (g.onStructure && g.pos !== null && g.pos < 0.33) notes.push('Close to the oil-water contact: expect early water.');
    if (poolP < 0.7) notes.push(`The field is ${Math.round((1 - poolP) * 100)}% pressure-depleted. Rates will be lower than virgin wells.`);
    // Volumetric reserves for a 160-acre drainage area set how fast the well must decline (the pool handles shared depletion).
    const ooip = 7758 * 160 * Math.max(1, g.thickness) * g.porosity * g.oilSat / 1.2;
    const eur = ooip * (g.waterDrive ? 0.28 : 0.2);
    b = 0.4;
    Di = clamp((qi * 30.4) / (eur * (1 - b)), 0.008, 0.1);
    if (Di > 0.05) notes.push('Small reservoir: rates will fall quickly.');
    gasPerBbl = g.gor / 1000; // mcf per bbl
    wc0 = g.waterDrive ? 0.3 : 0.12;
    dryRisk = g.onStructure === false ? Math.max(g.trapRisk, 0.95) : g.trapRisk;
  } else {
    const thickF = 0.6 + 0.4 * Math.min(1, g.thickness / 80);
    const pressF = 0.7 + 0.6 * clamp((g.pressureGrad - 0.43) / 0.35, 0, 1);
    const base = (150 + 950 * Math.pow(g.quality, 1.3)) * thickF * pressF;
    let f = Math.pow(d.lateral / 5000, 0.85);
    f *= { 300: 0.85, 200: 1.0, 150: 1.08 }[d.spacing];
    f *= { 1000: 0.86, 2000: 1.0, 3000: 1.09 }[d.intensity];
    const deep = g.depth > 9500 || g.pressureGrad > 0.65;
    if (deep) { f *= { sand: 0.86, rcs: 0.96, ceramic: 1.05 }[d.proppant]; if (d.proppant === 'sand') notes.push('Sand crushes at these pressures. Consider ceramic.'); }
    else if (d.proppant === 'ceramic') notes.push('Ceramic is overkill at this depth. Money down the hole.');
    const brittle = g.brittleness > 0.5;
    if (d.fluid === 'slickwater') { f *= brittle ? 1.06 : 0.88; if (!brittle) notes.push('Slickwater struggles in ductile rock. Gel carries more sand.'); }
    if (d.fluid === 'gel') { f *= brittle ? 0.9 : 1.05; if (brittle) notes.push('Gel damages the fracture network in brittle rock. Slickwater is better here.'); }
    if (d.fluid === 'hybrid') f *= 0.99;
    f *= 0.8 + 0.04 * completionsSkill;
    qi = base * f;
    Di = 0.09; b = 1.2;
    gasPerBbl = 0.9;
    gasFree = qi * (1 - g.oilFrac) * 6; // mcf/d of gas from the gas-window fraction
    qi = qi * g.oilFrac; // oil bbl/d
    wc0 = 0.35;
    if (g.sour && d.casing !== 'premium') notes.push('Sour gas with standard casing: corrosion will eat this well.');
  }
  qi *= Math.max(0.5, 1 - 0.12 * interference);
  return { qiOil: qi, gasPerBbl, gasFree, Di, b, wc0, dryRisk, notes };
}

export function rateAt(perf, t) { return perf.qiOil / Math.pow(1 + perf.b * perf.Di * t, 1 / perf.b); }
// Instantaneous decline capped by a terminal decline (avoids infinite b>1 tails)
export function forecast(perf, months = 360) {
  const out = []; let q = perf.qiOil; const term = 0.006;
  for (let t = 0; t < months; t++) {
    const qh = rateAt(perf, t);
    const dInst = perf.Di / (1 + perf.b * perf.Di * t);
    if (dInst > term) q = qh; else q = q * (1 - term);
    out.push(q * 30.4);
  }
  return out;
}

export function liftFactor(d, t, q) {
  switch (d.lift) {
    case 'none': return t < 9 ? 1 : 0.7;
    case 'rod': return q < 400 ? 1 : 0.85;
    case 'esp': return 1.0;
    case 'gaslift': return 0.95;
  }
  return 1;
}

export function waterCut(well, t) {
  const p = well.perf;
  if (well.target === 'sand') { const tau = well.waterDrive ? 36 : 120; return p.wc0 + (0.92 - p.wc0) * (1 - Math.exp(-t / tau)); }
  if (t < 3) return 0.75; // flowback
  return clamp(p.wc0 + 0.004 * t, 0, 0.85);
}

export function disposalRate(state) { return inflate(state, state.market.disposalWell ? 0.015 : 0.06); }
export function maintenanceCost(state) { return inflate(state, 40); }
export function monthlyOpex(state, well, oil, water, gas) {
  const prodSkill = roleSkill(state, 'production');
  const fixed = (well.target === 'sand' ? inflate(state, 250) : 16_000 * shaleScale(state)) * (1.2 - 0.04 * prodSkill);
  const lift = liftOpex(state, well.design.lift);
  const disposal = water * disposalRate(state);
  const maint = state.policy.maintenance === 'preventive' ? maintenanceCost(state) : 0;
  return { fixed: Math.round(fixed), lift, disposal: Math.round(disposal), maint, total: Math.round(fixed + lift + disposal + maint) };
}

// Full economic estimate for the designer.
export function estimateWell(state, parcel, design, staff = {}) {
  const geo = parcel.survey.est || parcel.truth; // if never surveyed the designer uses a regional guess (level 0)
  const level = parcel.survey.level;
  const dSkill = staff.driller ? effSkill(state, staff.driller, { target: design.target }) : 4;
  const cSkill = staff.completions ? effSkill(state, staff.completions, { target: design.target }) : 4;
  const gSkill = roleSkill(state, 'geologist', { target: design.target });
  const interference = parcel.wells.filter((id) => { const w = state.wells.find((w) => w.id === id); return w && w.target === design.target && !['dry', 'plugged'].includes(w.status); }).length;
  const ownRig = usesOwnRig(state, geo, design);
  const cost = wellCost(state, geo, design, dSkill, ownRig);
  const pool = poolFor(state, parcel);
  const perf = wellPerformance(geo, design, cSkill, interference, pool ? pool.pressure : 1);
  const dry = design.target === 'sand' ? clamp(perf.dryRisk * (1 - 0.12 * level) * (1.15 - 0.03 * gSkill), 0.02, 0.9) : 0.01;
  const fc = forecast(perf, 240);
  const oilP = realizedOil(state), gasP = realizedGas(state);
  const roy = parcel.mineral.lease?.royalty ?? 0.125, sev = state.gov.severance;
  let npv = -cost.total, cum = -cost.total, payout = null, eurOil = 0, eurGas = 0, prorated = false;
  const disc = Math.pow(1.10, 1 / 12);
  for (let t = 0; t < fc.length; t++) {
    const allow = prorationMult(state, null, fc[t] / 30.4, geo.sand.depth); if (allow < 1) prorated = true;
    const oil = fc[t] * liftFactor(design, t, fc[t] / 30.4) * allow;
    const wc = design.target === 'sand' ? clamp(perf.wc0 + (0.92 - perf.wc0) * (1 - Math.exp(-t / (geo.sand.waterDrive ? 36 : 120))), 0, 1) : (t < 3 ? 0.75 : clamp(perf.wc0 + 0.004 * t, 0, 0.85));
    const water = oil * wc / (1 - wc);
    const gas = oil * perf.gasPerBbl + perf.gasFree * 30.4 / Math.pow(1 + perf.b * perf.Di * t, 1 / perf.b);
    const rev = (oil * oilP + gas * gasP) * (1 - roy - sev);
    const opex = monthlyOpex(state, { target: design.target, design }, oil, water, gas).total;
    const cf = rev - opex;
    eurOil += oil; eurGas += gas;
    cum += cf; if (payout === null && cum >= 0) payout = t + 1;
    npv += cf / Math.pow(disc, t + 1);
    if (oil < 40 && t > 24) break; // economic limit
  }
  const ev = npv * (1 - dry) - cost.drill * dry;
  const valid = validateDesign(state, design);
  const notes = valid.ok ? perf.notes : [valid.msg, ...perf.notes];
  if (prorated) notes.push(`The commission's allowable (${Math.round((state.permits?.allowable ?? 1) * 100)} percent) will hold this well below capacity; it will last longer for it.`);
  if (ownRig) notes.push(`Drilled with ${state.flags.ownRig.name || 'your own rig'}: 30 percent cheaper, a month slower, and a spudder kicks more often.`);
  return { cost, perf, dry, eurOil, eurGas, npv, ev, payout, level, months: drillMonths(design, geo, staff.driller, ownRig), notes, ip: perf.qiOil, gasIp: perf.qiOil * perf.gasPerBbl + perf.gasFree, valid: valid.ok, ownRig };
}

// The pool a parcel sits in, if the field has been discovered (otherwise you don't know it exists).
export function poolFor(state, parcel) {
  const id = parcel.truth.sand.pool;
  if (id === null) return null;
  const pool = state.pools.find((x) => x.id === id);
  return pool && pool.discovered ? pool : null;
}
export function poolOf(state, well) { return well.poolId === null || well.poolId === undefined ? null : state.pools.find((x) => x.id === well.poolId); }

export function waterfloodCost(pool, state = null) { const base = 30_000 + 6_000 * pool.parcels.length; return state ? inflate(state, base) : base; }
export function waterflood(state, pool, log) {
  if (pool.waterflood) return { ok: false, msg: 'Already flooding.' };
  if (!techAvailable(state, 'waterflood')) return { ok: false, msg: 'The commission has not approved secondary recovery yet.' };
  const mine = state.wells.filter((w) => w.status === 'producing' && w.target === 'sand' && w.poolId === pool.id).length;
  if (!mine) return { ok: false, msg: 'You need a producing well in the field to run a waterflood.' };
  const cost = waterfloodCost(pool, state);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: `A waterflood here costs ${money(cost)}. You cannot afford it.` };
  state.company.cash -= cost; state.ledger.capex += cost;
  pool.waterflood = true; pool.recoverable += RECOVERY.flood * pool.ooip; updatePool(pool);
  state.env.score = clamp(state.env.score + 2, 0, 100);
  log(`Waterflood started on the ${pool.name}: injectors converted, produced water going back downhole. Pressure support should lift every well in the field.`, 'wells');
  return { ok: true, cost };
}

export function drillMonths(d, geo, driller, ownRig = false) {
  let m = d.target === 'sand' ? 1 : d.lateral >= 10000 ? 2 : 1;
  if (driller) m = Math.max(1, Math.round(m * speedMult(driller)));
  if (ownRig) m += 1; // a spudder is slow
  return m;
}

export function wellName(state, parcel, design) {
  const n = parcel.wells.length + 1;
  return `${parcel.surface.name.split(' ')[0]} #${n}${design.target === 'shale' ? 'H' : ''}`;
}

// Create the well and put it into permitting. Charges the permit fee now; capex charged when phases start.
export function startWell(state, parcel, design, driller, completions, log) {
  const valid = validateDesign(state, design);
  if (!valid.ok) return { ok: false, msg: valid.msg };
  if (parcel.restricted === 'church') return { ok: false, msg: 'Under the terms of Widow Hargrove\'s investment nobody drills on the church section, and she reads the permit notices.', needs: 'restricted' };
  if (!parcel.mineral.lease || parcel.mineral.leasedBy !== 'player') return { ok: false, msg: 'You need a mineral lease first.' };
  if (!parcel.surface.agreement) return { ok: false, msg: 'You need a surface damage agreement first.' };
  const same = parcel.wells.filter((id) => { const w = state.wells.find((w) => w.id === id); return w && w.target === design.target && w.status !== 'dry'; }).length;
  const cap = parcel.surface.type === 'homes' && statute(state, 'setbacks') ? 1 : WELL_CAP[design.target];
  if (same >= cap) return { ok: false, msg: `No room for another ${design.target} well here (${cap} max).` };
  if (design.target === 'shale' && parcel.surface.agreement.conditions.noFresh && design.water === 'fresh') return { ok: false, msg: 'Your surface agreement forbids fresh water. Use recycled water.' };
  if (onStrike(state)) return { ok: false, msg: 'The crews are on strike. Nobody is spudding anything.', needs: 'strike' };
  const est = estimateWell(state, parcel, design, { driller, completions });
  const fee = state.gov.permitFee;
  if (state.company.cash - fee - est.cost.total < -state.company.creditLimit) return { ok: false, msg: `Not enough cash + credit to fund this well (${money(est.cost.total)}).` };
  const pr = requestPermit(state, parcel, design);
  if (!pr.ok) return { ok: false, msg: pr.msg, needs: pr.needs };
  state.company.cash -= fee; state.ledger.taxes += fee;
  const permit = pr.months;
  const wid = nextId(state);
  const dr = driller || makeContractor(state, 'driller');
  const co = completions || makeContractor(state, 'completions');
  const well = {
    id: wid, parcelId: parcel.id, name: wellName(state, parcel, design), target: design.target, design: { ...design },
    status: 'permit', phaseEnd: state.month + permit, startedMonth: state.month, spudMonth: null, onlineMonth: null,
    cost: { est: est.cost.total, spent: fee }, estimate: { ip: est.ip, eurOil: est.eurOil, npv: est.npv },
    crew: { driller: { name: dr.name, skill: effSkill(state, dr, { target: design.target }), traits: dr.traits, contractor: !!dr.contractor, fee: dr.fee || 0, id: dr.id },
            completions: { name: co.name, skill: effSkill(state, co, { target: design.target }), traits: co.traits, contractor: !!co.contractor, fee: co.fee || 0, id: co.id } },
    perf: null, cumOil: 0, cumGas: 0, cumWater: 0, cumFlared: 0, prodMonths: 0, declineT: 0, health: 100, lastMonth: null, log: [], revenue: 0, opexTotal: 0,
    waterDrive: false, sour: false, prorated: 1, ownRig: !!est.ownRig,
  };
  if (well.ownRig) state.flags.ownRig.wellsLeft--;
  const months = drillMonths(design, est.perf, driller, well.ownRig);
  if (driller) assignTask(state, driller, `Drilling ${well.name}`, permit + months);
  if (completions) assignTask(state, completions, `Completing ${well.name}`, permit + months + 1);
  if (dr.contractor) { state.company.cash -= dr.fee; state.ledger.salaries += dr.fee; }
  if (co.contractor) { state.company.cash -= co.fee; state.ledger.salaries += co.fee; }
  state.wells.push(well); parcel.wells.push(wid);
  log(`Permit filed with the commission for ${well.name} at ${surfaceName(parcel)}. Expected approval in ${permit} month${permit > 1 ? 's' : ''}.`, 'wells');
  return { ok: true, well };
}

function spend(state, well, amt, cat = 'capex') { state.company.cash -= amt; state.ledger[cat] += amt; well.cost.spent += amt; }

export function tickWells(state, log, incidents) {
  const oilP = realizedOil(state), gasP = realizedGas(state);
  const strike = onStrike(state);
  for (const well of state.wells) {
    const parcel = state.parcels[well.parcelId];
    const truth = parcel.truth;
    if (strike && ['drill', 'complete'].includes(well.status) && state.month >= well.phaseEnd) { well.phaseEnd += 1; continue; }
    if (well.status === 'permit' && state.month >= well.phaseEnd) {
      // Permit granted -> drill. Inspection/holdup chance under strict regimes.
      if (state.env.activism > 70 && chance(0.3)) { well.phaseEnd += 1; log(`Picketers blocked the gate at ${parcel.surface.name}. ${well.name} delayed a month.`, 'env'); continue; }
      const cost = wellCost(state, truth, well.design, well.crew.driller.skill, !!well.ownRig);
      const overrun = lognorm(0.14 * (1.3 - 0.05 * well.crew.driller.skill));
      well.actualDrill = Math.round(cost.drill * overrun);
      if (state.flags.rigCredits > 0 && !well.ownRig) { well.actualDrill = Math.round(well.actualDrill * 0.8); state.flags.rigCredits--; }
      spend(state, well, well.actualDrill);
      const harvest = parcel.surface.agreement.conditions.harvestPause && [6, 7, 8, 9].includes(calMonth(state)) ? 1 : 0;
      well.status = 'drill'; well.spudMonth = state.month;
      well.phaseEnd = state.month + drillMonths(well.design, truth, null, !!well.ownRig) + harvest + (well.crew.driller.traits?.includes('bythebook') ? 1 : 0);
      log(`Spudded ${well.name}${well.ownRig ? ` with ${state.flags.ownRig?.name || 'your own rig'}` : ''}. Drilling cost ${overrun > 1.1 ? 'ran over budget' : overrun < 0.92 ? 'came in under budget' : 'is on budget'} at ${money(well.actualDrill)}.${harvest ? ' Harvest-season clause adds a month.' : ''}`, 'wells');
      continue;
    }
    if (well.status === 'drill' && state.month >= well.phaseEnd) {
      // blowout / kick risk
      const g = truth[well.target];
      const press = well.target === 'shale' ? clamp((g.pressureGrad - 0.43) / 0.35, 0, 1) : 0.2;
      let pBlow = 0.004 + 0.03 * press;
      pBlow *= well.design.casing === 'premium' ? 0.4 : 1;
      pBlow *= 1.2 - 0.07 * well.crew.driller.skill;
      if (well.crew.driller.traits?.includes('cowboy')) pBlow *= 1.5;
      if (well.crew.driller.traits?.includes('bythebook')) pBlow *= 0.6;
      if (well.ownRig) pBlow *= 1.3; // the spudder has caught fire twice already
      if (state.labor?.drunkUntil > state.month) pBlow *= 2;
      if (chance(clamp(pBlow, 0.002, 0.3))) { incidents.blowout(state, well, parcel); continue; }
      // dry hole (sand only)
      if (well.target === 'sand') {
        const gSkill = roleSkill(state, 'geologist', { target: 'sand' });
        const pDry = clamp(g.trapRisk * (1 - 0.12 * Math.min(parcel.survey.level, 3)) * (1.15 - 0.03 * gSkill), 0.02, 0.9);
        if (g.thickness <= 0 || chance(pDry)) {
          well.status = 'dry'; revealTruth(state, parcel);
          log(`${well.name} is a dry hole. ${g.thickness <= 0 ? 'The sand pinched out.' : 'The trap leaked long ago.'} ${money(well.cost.spent)} in the ground.`, 'wells');
          continue;
        }
      }
      const cost = wellCost(state, truth, well.design, well.crew.driller.skill);
      well.actualComplete = Math.round(cost.complete * lognorm(0.08));
      spend(state, well, well.actualComplete);
      well.status = 'complete'; well.phaseEnd = state.month + 1 + (well.crew.completions.traits?.includes('bythebook') ? 1 : 0);
      log(`${well.name} reached total depth. ${well.target === 'shale' ? 'Frac crew mobilising.' : well.design.vfrac ? 'Casing set; the frac truck is on its way.' : 'Casing set; perforating gun and acid truck on the way.'}`, 'wells');
      continue;
    }
    if (well.status === 'complete' && state.month >= well.phaseEnd) {
      const interference = parcel.wells.filter((id) => { const w = state.wells.find((w) => w.id === id); return w && w !== well && w.target === well.target && ['producing', 'shutin', 'workover'].includes(w.status); }).length;
      const truePool = well.target === 'sand' && truth.sand.pool !== null ? state.pools.find((x) => x.id === truth.sand.pool) : null;
      const perf = wellPerformance(truth, well.design, well.crew.completions.skill, interference, truePool ? truePool.pressure : 1);
      well.poolId = truePool ? truePool.id : null; well.x0 = truePool ? truePool.x : 0; well.pos = truth.sand.pos;
      if (truePool && !truePool.discovered) { truePool.discovered = true; truePool.discoveredMonth = state.month; truePool.discoveredBy = 'player'; state.land.hype *= 1.2; reportStory(state, 'discovery', { well: well.name, farm: parcel.surface.name, ip: perf.qiOil }); log(`DISCOVERY: ${well.name} found a new field. Your geologist names it the ${truePool.name} and estimates ${Math.round(truePool.ooip / 1e6 * lognorm(0.3))} million barrels in place. Every landman in the county just got in his truck.`, 'wells'); }
      // execution luck, screenouts
      let luck = lognorm(0.22 * (1.3 - 0.05 * well.crew.completions.skill));
      const pScreen = well.target === 'shale' ? (0.12 - 0.008 * well.crew.completions.skill) * (well.design.intensity === 3000 ? 1.6 : 1) * (well.design.fluid === 'slickwater' && well.design.proppant === 'ceramic' ? 1.4 : 1) : 0.02;
      if (chance(clamp(pScreen, 0.01, 0.5))) { luck *= 0.7; const extra = Math.round(well.actualComplete * 0.15); spend(state, well, extra); log(`${well.target === 'shale' ? 'Screenout' : 'Sanded up'} on ${well.name}: ${money(extra)} in cleanout. Production will suffer.`, 'wells'); }
      perf.qiOil *= luck;
      well.perf = perf; well.waterDrive = truth.sand.waterDrive; well.sour = truth.shale.sour && well.target === 'shale';
      well.status = 'producing'; well.onlineMonth = state.month; well.prodMonths = 0;
      revealTruth(state, parcel);
      const ip = Math.round(perf.qiOil);
      const vsEst = ip / Math.max(1, well.estimate.ip);
      log(`${well.name} online: ${ip} bbl/d oil${perf.gasFree > 50 ? ` + ${Math.round(perf.gasFree)} mcf/d gas` : ''}. ${vsEst > 1.25 ? 'Beat the estimate handily.' : vsEst < 0.7 ? 'Well below the estimate. Someone has explaining to do.' : 'Roughly as estimated.'}`, 'wells');
      continue;
    }
    if (well.status === 'blowout' && state.month >= well.phaseEnd) { well.status = 'plugged'; revealTruth(state, parcel); log(`${well.name} was killed and plugged. The well is a total loss; the lease is still yours.`, 'wells'); continue; }
    if (well.status === 'workover' && state.month >= well.phaseEnd) { well.status = 'producing'; well.health = 90; log(`${well.name} back on the pump after workover.`, 'wells'); }
    if (well.status === 'producing') produceMonth(state, well, parcel, oilP, gasP, log, incidents);
  }
}

function produceMonth(state, well, parcel, oilP, gasP, log, incidents) {
  if (well.declineT === undefined) well.declineT = well.prodMonths;
  const t = well.declineT;
  const perf = well.perf;
  const dInst = perf.Di / (1 + perf.b * perf.Di * t);
  const qh = rateAt(perf, t);
  well.qTerm = dInst > 0.006 ? qh : (well.qTerm ?? qh) * (1 - 0.006 * Math.max(0.2, state.permits?.allowable ?? 1));
  let oil = well.qTerm * 30.4 * liftFactor(well.design, t, well.qTerm);
  const healthF = well.health < 40 ? 0.6 + well.health / 100 : 1;
  oil *= healthF * (well.sour && well.design.casing !== 'premium' ? 0.9 : 1);
  // Proration: the commission's allowable caps the rate, and a well produced slowly declines slowly.
  const allow = prorationMult(state, well, well.qTerm, parcel.truth.sand.depth);
  oil *= allow; well.prorated = allow;
  if (state.flags.stormMonth === state.month) oil *= 0.7;
  if (onStrike(state)) oil *= 0.4;
  if (state.disasters?.floodUntil > state.month && state.disasters.floodParcels?.includes(well.parcelId)) oil *= 0.5;
  if (well.tankFireUntil > state.month) oil *= 0;
  const pool = poolOf(state, well);
  if (pool) oil *= poolPressure(pool) / poolPressure(pool, well.x0);
  const wc = pool ? clamp(perf.wc0 + (0.95 - perf.wc0) * Math.pow(pool.x, 1.3) + 0.3 * (1 - (well.pos ?? 0.5)) * pool.x, 0, 0.95) : waterCut(well, t);
  const water = oil * wc / (1 - wc);
  const gas = oil * perf.gasPerBbl + perf.gasFree * 30.4 / Math.pow(1 + perf.b * perf.Di * t, 1 / perf.b);
  const roy = parcel.mineral.lease?.royalty ?? 0.125;
  const sev = state.gov.severance;
  const gross = oil * oilP + gas * gasP;
  const royalty = gross * roy, severance = gross * sev;
  const opex = monthlyOpex(state, well, oil, water, gas);
  const net = gross - royalty - severance - opex.total;
  state.company.cash += net;
  state.ledger.revenue += gross; state.ledger.royalties += royalty; state.ledger.taxes += severance; state.ledger.opex += opex.total;
  well.cumOil += oil; well.cumGas += gas; well.cumWater += water; well.revenue += gross; well.opexTotal += opex.total;
  if (pool) pool.cum += oil;
  const sold = sellsGas(state);
  if (!sold) well.cumFlared += gas;
  well.lastMonth = { oil, gas, water, gross, royalty, severance, opex: opex.total, net, flared: sold ? 0 : gas, rate: oil / 30.4, allowable: allow };
  well.prodMonths++; well.declineT += allow;
  state.month_prod.oil += oil; state.month_prod.gas += gas; state.month_prod.water += water; state.month_prod.flared += sold ? 0 : gas; state.month_prod.net += net;
  // wear & tear
  const prodSkill = roleSkill(state, 'production');
  let decay = (well.target === 'sand' ? 1.0 : 1.6) * (1.3 - 0.06 * prodSkill);
  if (well.design.lift === 'esp') decay *= 1.8;
  if (state.policy.maintenance === 'preventive') decay *= 0.5;
  if (well.sour && well.design.casing !== 'premium') decay *= 2;
  if (well.design.casing === 'premium') decay *= 0.85;
  well.health = clamp(well.health - decay * rand(0.7, 1.3), 0, 100);
  const pFail = well.health < 55 ? ((55 - well.health) / 55) * 0.18 : 0.004;
  if (chance(pFail)) {
    const cost = Math.round(inflate(state, 2_000 + rand(0, 5_000)) * (well.design.lift === 'esp' ? 1.5 : 1) * (well.target === 'shale' ? 12 : 1));
    const reason = pick(['pump failure', 'tubing leak', 'paraffin plugging', 'downhole corrosion', 'sanded-up pump', 'stuck rods']);
    if (state.policy.autoWorkover && state.company.cash - cost > -state.company.creditLimit) {
      spend(state, well, cost, 'opex'); well.status = 'workover'; well.phaseEnd = state.month + 1;
      log(`${well.name} down: ${reason}. Pulling unit called (${money(cost)}).`, 'wells');
    } else {
      well.status = 'shutin'; well.workoverCost = cost;
      log(`${well.name} shut in: ${reason}. Needs a ${money(cost)} workover.`, 'wells');
    }
  }
  // spills / integrity incidents
  let pSpill = 0.0035 * (well.design.casing === 'premium' ? 0.5 : 1) * (well.health < 50 ? 1.8 : 1) * (well.sour ? 1.6 : 1) * (1.15 - 0.03 * prodSkill);
  if (chance(pSpill)) incidents.spill(state, well, parcel);
}

export function doWorkover(state, well, log) {
  const cost = well.workoverCost || inflate(state, 3_000);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford the workover.' };
  spend(state, well, cost, 'opex'); well.status = 'workover'; well.phaseEnd = state.month + 1;
  log(`Pulling unit dispatched to ${well.name}.`, 'wells');
  return { ok: true };
}
export function serviceCost(state) { return inflate(state, 800); }
export function preventiveService(state, well, log) {
  const cost = serviceCost(state);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford it.' };
  spend(state, well, cost, 'opex'); well.health = clamp(well.health + 30, 0, 100);
  return { ok: true };
}
export function plugCost(state, well) { return well.target === 'sand' ? inflate(state, 1_500) : Math.round(180_000 * shaleScale(state)); }
export function plugWell(state, well, log) {
  const cost = plugCost(state, well);
  spend(state, well, cost, 'opex'); well.status = 'plugged';
  state.env.score = clamp(state.env.score + 1, 0, 100);
  log(`${well.name} plugged and abandoned. Site restored.`, 'wells');
  return { ok: true };
}

export function producingWells(state) { return state.wells.filter((w) => w.status === 'producing'); }
export function activeWells(state) { return state.wells.filter((w) => !['dry', 'plugged'].includes(w.status)); }
export function statusLabel(w) {
  return { permit: 'Permitting', drill: 'Drilling', complete: 'Completing', producing: 'Producing', shutin: 'Shut in', workover: 'Workover', dry: 'Dry hole', plugged: 'Plugged', blowout: 'Blowout' }[w.status] || w.status;
}
