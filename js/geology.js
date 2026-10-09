// Basin generation, conventional oil fields (pools), surveys, and estimate-vs-truth handling.
import { rnd, rand, randInt, pick, gauss, chance, lognorm } from './rng.js';
import { clamp } from './util.js';
import { GRID_W, GRID_H, PARCEL_ACRES, FIELD_NAMES } from './data.js';
import { inflate } from './era.js';
import { techAvailable } from './tech.js';

// Smooth 2D field in [0,1] via bilinear interpolation of a coarse lattice + jitter.
function field(cell = 3, jitter = 0.08) {
  const cw = Math.ceil(GRID_W / cell) + 2, ch = Math.ceil(GRID_H / cell) + 2;
  const lat = [];
  for (let j = 0; j < ch; j++) { lat[j] = []; for (let i = 0; i < cw; i++) lat[j][i] = rnd(); }
  const out = [];
  for (let y = 0; y < GRID_H; y++) {
    out[y] = [];
    for (let x = 0; x < GRID_W; x++) {
      const fx = x / cell + 0.5, fy = y / cell + 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = lat[y0][x0] * (1 - sx) + lat[y0][x0 + 1] * sx;
      const b = lat[y0 + 1][x0] * (1 - sx) + lat[y0 + 1][x0 + 1] * sx;
      out[y][x] = clamp(a * (1 - sy) + b * sy + gauss(0, jitter), 0, 1);
    }
  }
  return out;
}

export const RECOVERY = { solution: 0.18, water: 0.34, flood: 0.15 };

// Conventional fields are elliptical closures. Inside the closure the sand is oil-bearing; outside it is wet.
function makePools() {
  const pools = [];
  const names = [...FIELD_NAMES];
  const n = randInt(5, 7);
  for (let i = 0; i < n; i++) {
    let cx, cy, tries = 0;
    do { cx = rand(1, GRID_W - 2); cy = rand(1, GRID_H - 2); tries++; } while (tries < 20 && pools.some((p) => Math.hypot(p.cx - cx, p.cy - cy) < 3.5));
    const big = i === 0; // one large old-style field, the rest modest
    pools.push({
      id: i, name: `${names.splice(randInt(0, names.length - 1), 1)[0]} Field`, cx, cy,
      rx: big ? rand(1.8, 2.4) : rand(0.8, 1.7), ry: big ? rand(1.2, 1.7) : rand(0.6, 1.2), rot: rand(0, Math.PI), waterDrive: chance(0.45),
      parcels: [], ooip: 0, recoverable: 0, cum: 0, discovered: false, discoveredMonth: -1, waterflood: false, pressure: 1, x: 0,
    });
  }
  return pools;
}
function poolDistance(pool, x, y) {
  const dx = x + 0.5 - pool.cx, dy = y + 0.5 - pool.cy;
  const c = Math.cos(pool.rot), s = Math.sin(pool.rot);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.sqrt((u / pool.rx) ** 2 + (v / pool.ry) ** 2);
}

export function generateBasin() {
  const f = {};
  for (const k of ['sDepth', 'sThick', 'sPoro', 'sPerm', 'sSat', 'sWater', 'hDepth', 'hThick', 'hQual', 'hBrit', 'hPress', 'hSour', 'hQual2']) f[k] = field(k.startsWith('h') ? 4 : 3);
  const pools = makePools();
  const geo = [];
  for (let y = 0; y < GRID_H; y++) {
    geo[y] = [];
    for (let x = 0; x < GRID_W; x++) {
      // Which closure (if any) is this parcel inside?
      let best = null, bestD = 1;
      for (const p of pools) { const d = poolDistance(p, x, y); if (d < bestD) { bestD = d; best = p; } }
      const on = !!best;
      const pos = on ? 1 - bestD : 0; // 1 = crest, 0 = edge (oil-water contact)
      const stray = !on && chance(0.05); // small stratigraphic trap, one parcel
      const thickness = Math.round(f.sThick[y][x] < 0.18 ? 0 : 6 + 90 * Math.pow(f.sThick[y][x], 1.4));
      const porosity = 0.06 + 0.2 * f.sPoro[y][x];
      const sand = {
        depth: Math.round(3000 + 3000 * f.sDepth[y][x] - (on ? 400 * pos : 0)),
        thickness, porosity,
        perm: Math.pow(10, -0.5 + 3 * f.sPerm[y][x] * (0.5 + 0.5 * f.sPoro[y][x])),
        oilSat: on ? clamp(0.5 + 0.3 * pos + gauss(0, 0.04), 0.3, 0.85) : stray ? clamp(0.45 + gauss(0, 0.08), 0.3, 0.7) : clamp(0.08 + 0.15 * f.sSat[y][x], 0.02, 0.3),
        trapRisk: on ? clamp(0.04 + 0.35 * (1 - pos) ** 2, 0.03, 0.5) : stray ? 0.45 : 0.97,
        waterDrive: on ? best.waterDrive : f.sWater[y][x] > 0.6,
        gor: Math.round(300 + 1200 * f.sPerm[y][x]),
        pool: on ? best.id : null, pos, onStructure: on || stray,
      };
      if (on && thickness > 0) {
        // Only the part of the sand above the oil-water contact holds oil: thicker column at the crest, thin at the edge.
        const column = thickness * (0.15 + 0.5 * pos);
        const ooip = 7758 * PARCEL_ACRES * column * porosity * sand.oilSat / 1.2;
        best.parcels.push(y * GRID_W + x); best.ooip += ooip;
      }
      const hDepth = Math.round(6500 + 4500 * f.hDepth[y][x]);
      const qual = clamp(0.6 * f.hQual[y][x] + 0.4 * f.hQual2[y][x], 0, 1);
      const shale = {
        depth: hDepth,
        thickness: Math.round(20 + 130 * f.hThick[y][x]),
        quality: Math.pow(qual, 1.1),
        brittleness: f.hBrit[y][x],
        oilFrac: clamp((10600 - hDepth) / 4200 + gauss(0, 0.05), 0.05, 0.95),
        pressureGrad: 0.43 + 0.35 * f.hPress[y][x],
        sour: f.hSour[y][x] > 0.86,
      };
      geo[y][x] = { sand, shale };
    }
  }
  for (const p of pools) p.recoverable = p.ooip * (p.waterDrive ? RECOVERY.water : RECOVERY.solution);
  return { geo, pools: pools.filter((p) => p.parcels.length > 0) };
}

// Pool depletion: x = cum / recoverable. Pressure support depends on drive mechanism and waterflood.
export function poolPressure(pool, x = pool.x) {
  const k = pool.waterflood ? 0.35 : pool.waterDrive ? 0.5 : 1.0;
  return clamp(1 - k * x, 0.05, 1);
}
export function updatePool(pool) {
  pool.x = pool.recoverable > 0 ? pool.cum / pool.recoverable : 1;
  pool.pressure = poolPressure(pool);
}

// Survey levels: 0 none (regional guess), 1 county records / scouting, 2 2D reflection seismic, 3 3D seismic + core, 4 drilled (truth)
// Costs are 1952 bases; use surveysFor(state) for what is on offer this year, at this year's prices.
export const SURVEYS = [
  { level: 1, name: 'County records & scouting', cost: 300, months: 0, desc: 'Courthouse records, scout tickets and the neighbours\' well logs. Cheap, vague.' },
  { level: 2, name: '2D reflection seismic', cost: 6_000, months: 1, desc: 'A shot line across the section: is this parcel inside a closure? Depths, thickness, trap risk.' },
  { level: 3, name: '3D seismic + core', cost: 150_000, months: 2, desc: 'Rock quality, brittleness, pressure. The full picture short of drilling.', tech: 'seismic3d' },
];
export function surveysFor(state) {
  return SURVEYS.filter((sv) => !sv.tech || techAvailable(state, sv.tech)).map((sv) => ({ ...sv, cost: inflate(state, sv.cost) }));
}
const SIGMA = [0.55, 0.38, 0.30, 0.10, 0];

export function surveySigma(level, geoSkill, state = null) {
  let base = SIGMA[clamp(level, 0, 4)];
  if (level === 2 && state && !techAvailable(state, 'seismicDigital')) base = 0.42; // paper-record seismic
  return base * (1.25 - 0.05 * clamp(geoSkill, 0, 10));
}

function noisy(v, sigma) { return v * lognorm(sigma); }
function noisyFrac(v, sigma) { return clamp(v + gauss(0, sigma * 0.5), 0.01, 0.99); }

export function makeEstimate(truth, level, geoSkill, state = null) {
  const s = surveySigma(level, geoSkill, state);
  const { sand, shale } = truth;
  // Structure is only visible with seismic (level >= 2). Below that you get a regional prior.
  const seesStructure = level >= 2;
  const structCorrect = level >= 4 || chance(level === 3 ? 0.97 : 0.85 + 0.01 * geoSkill);
  const onStructure = seesStructure ? (structCorrect ? sand.onStructure : !sand.onStructure) : null;
  return {
    level, sigma: s,
    sand: {
      depth: Math.round(noisy(sand.depth, s * 0.2)),
      thickness: Math.round(sand.thickness === 0 ? (chance(0.7 - s) ? 0 : noisy(8, s)) : noisy(sand.thickness, s)),
      porosity: noisyFrac(sand.porosity, s * 0.4),
      perm: noisy(sand.perm, s * 1.6),
      oilSat: seesStructure ? noisyFrac(sand.oilSat, s) : clamp(0.35 + gauss(0, 0.12), 0.05, 0.8),
      trapRisk: seesStructure ? noisyFrac(sand.trapRisk, s) : clamp(0.55 + gauss(0, 0.12), 0.2, 0.9),
      waterDrive: chance(1 - s) ? sand.waterDrive : !sand.waterDrive,
      gor: Math.round(noisy(sand.gor, s)),
      onStructure, pos: seesStructure ? clamp(sand.pos + gauss(0, s * 0.5), 0, 1) : null, pool: seesStructure && onStructure ? sand.pool : null,
    },
    shale: {
      depth: Math.round(noisy(shale.depth, s * 0.15)),
      thickness: Math.round(noisy(shale.thickness, s * 0.8)),
      quality: noisyFrac(shale.quality, s * 1.2),
      brittleness: noisyFrac(shale.brittleness, s * 1.2),
      oilFrac: noisyFrac(shale.oilFrac, s * 0.8),
      pressureGrad: clamp(noisy(shale.pressureGrad, s * 0.4), 0.4, 0.85),
      sour: level >= 3 || chance(0.6) ? shale.sour : !shale.sour,
    },
  };
}

// Human-readable descriptors for the parcel panel.
export function describeQuality(q) { return q < 0.25 ? 'poor' : q < 0.45 ? 'marginal' : q < 0.65 ? 'decent' : q < 0.82 ? 'good' : 'sweet spot'; }
export function describeBrittle(b) { return b < 0.35 ? 'ductile (clay-rich)' : b < 0.65 ? 'mixed' : 'brittle (silica/carbonate)'; }
export function describePressure(p) { return p < 0.5 ? 'normal' : p < 0.65 ? 'mildly overpressured' : 'strongly overpressured'; }
export function describePerm(k) { return k < 1 ? 'tight' : k < 10 ? 'low' : k < 100 ? 'moderate' : 'high'; }
export function describeOilFrac(o) { return o > 0.75 ? 'oil window' : o > 0.45 ? 'volatile oil / condensate' : o > 0.2 ? 'wet gas' : 'dry gas'; }
export function describeStructure(est) {
  if (est.onStructure === null) return 'unknown — needs seismic';
  if (!est.onStructure) return 'off-structure: sand is probably water-bearing';
  return est.pos > 0.66 ? 'on the crest of a closed structure' : est.pos > 0.33 ? 'on the flank of a closure' : 'near the edge of a closure (close to the oil-water contact)';
}

export function neighbours(parcels, p) {
  return parcels.filter((q) => q !== p && Math.abs(q.x - p.x) <= 1 && Math.abs(q.y - p.y) <= 1);
}
