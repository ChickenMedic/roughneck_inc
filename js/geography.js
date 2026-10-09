// County geography for the plat map: river, county road, railroad, depot, bridge.
// Pure geometry in parcel units (x 0..GRID_W, y 0..GRID_H), JSON-serializable, DOM-free.
// Uses its own seeded generator so the simulation's RNG stream is never touched.
import { makeRng } from './rng.js';
import { GRID_W, GRID_H } from './data.js';

export const RIVER_NAME = 'Coyote Creek';
export const ROAD_NAME = 'County Road 12';
export const RAIL_NAME = 'C.R.I. & P. R.R.';

const clampf = (v, a, b) => Math.max(a, Math.min(b, v));

// Catmull-Rom smoothing of a control polyline into a dense polyline.
export function smoothPath(pts, per = 10) {
  if (!pts || pts.length < 2) return pts ? pts.slice() : [];
  const out = [];
  const P = (i) => pts[clampf(i, 0, pts.length - 1)];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

function segIntersect(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}
function polylineCrossing(A, B) {
  for (let i = 0; i < A.length - 1; i++) for (let j = 0; j < B.length - 1; j++) {
    const hit = segIntersect(A[i], A[i + 1], B[j], B[j + 1]);
    if (hit) return hit;
  }
  return null;
}

export function townParcel(state) {
  return state.parcels.find((p) => p.surface.type === 'town') || { x: Math.floor(GRID_W / 2), y: Math.floor(GRID_H / 2) };
}

export function generateGeography(state) {
  const R = makeRng(((state.seed >>> 0) ^ 0x5eed) >>> 0);
  const town = townParcel(state);
  const tx = town.x + 0.5, ty = town.y + 0.5;

  // --- River: 6-8 control points from the top or the left edge to the opposite edge,
  // with one point pulled to within a parcel of town.
  const fromTop = R.chance(0.55);
  const n = R.randInt(6, 8);
  const river = [];
  const side = R.chance(0.5) ? 1 : -1;
  if (fromTop) {
    const near = tx + side * R.rand(0.7, 1.3);
    let x = clampf(near + R.rand(-2.5, 2.5), 0.6, GRID_W - 0.6);
    for (let i = 0; i < n; i++) {
      const y = (i / (n - 1)) * GRID_H;
      if (i > 0 && i < n - 1) x = clampf(x + R.rand(-1.6, 1.6), 0.5, GRID_W - 0.5);
      river.push({ x, y });
    }
    // pull the control point closest to the town row toward it
    let bi = 1, bd = 1e9;
    for (let i = 1; i < n - 1; i++) { const d = Math.abs(river[i].y - ty); if (d < bd) { bd = d; bi = i; } }
    river[bi] = { x: clampf(near, 0.5, GRID_W - 0.5), y: clampf(ty + R.rand(-0.4, 0.4), 0.5, GRID_H - 0.5) };
  } else {
    const near = ty + side * R.rand(0.7, 1.3);
    // Start above the town row and end below it (or vice versa) so the river must cross the county road.
    const dir = R.chance(0.5) ? 1 : -1;
    let y = clampf(ty - dir * R.rand(1.5, 3.5), 0.6, GRID_H - 0.6);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * GRID_W;
      if (i > 0 && i < n - 1) y = clampf(y + R.rand(-1.4, 1.4), 0.5, GRID_H - 0.5);
      river.push({ x, y });
    }
    let bi = 1, bd = 1e9;
    for (let i = 1; i < n - 1; i++) { const d = Math.abs(river[i].x - tx); if (d < bd) { bd = d; bi = i; } }
    river[bi] = { x: clampf(tx + R.rand(-0.4, 0.4), 0.5, GRID_W - 0.5), y: clampf(near, 0.5, GRID_H - 0.5) };
    river[n - 1].y = clampf(ty + dir * R.rand(1.5, 3.5), 0.6, GRID_H - 0.6);
  }

  // --- County road: west edge -> town centre -> east edge with one jog along a section line.
  const jogSide = R.chance(0.5) ? 1 : -1; // which side of town the jog happens
  const jogX = jogSide > 0 ? R.randInt(Math.min(town.x + 2, GRID_W - 1), GRID_W - 1) : R.randInt(1, Math.max(1, town.x - 1));
  const jogDy = (town.y <= 0 ? 1 : town.y >= GRID_H - 1 ? -1 : (R.chance(0.5) ? 1 : -1));
  const ty2 = ty + jogDy;
  const road = jogSide > 0
    ? [{ x: 0, y: ty }, { x: tx, y: ty }, { x: jogX, y: ty }, { x: jogX, y: ty2 }, { x: GRID_W, y: ty2 }]
    : [{ x: 0, y: ty2 }, { x: jogX, y: ty2 }, { x: jogX, y: ty }, { x: tx, y: ty }, { x: GRID_W, y: ty }];

  // --- Railroad: a shallow diagonal that skirts the town parcel's north or south edge.
  const railSide = -jogDy; // opposite side from the road jog so the town is framed between them
  const slope = (R.chance(0.5) ? 1 : -1) * R.rand(0.12, 0.38);
  const py = ty + railSide * 0.42;
  const rail = [];
  // intersect y = py + slope*(x - tx) with the grid box
  const cand = [];
  const yAt = (x) => py + slope * (x - tx), xAt = (y) => tx + (y - py) / slope;
  if (yAt(0) >= 0 && yAt(0) <= GRID_H) cand.push({ x: 0, y: yAt(0) });
  if (yAt(GRID_W) >= 0 && yAt(GRID_W) <= GRID_H) cand.push({ x: GRID_W, y: yAt(GRID_W) });
  if (xAt(0) >= 0 && xAt(0) <= GRID_W) cand.push({ x: xAt(0), y: 0 });
  if (xAt(GRID_H) >= 0 && xAt(GRID_H) <= GRID_W) cand.push({ x: xAt(GRID_H), y: GRID_H });
  cand.sort((a, b) => a.x - b.x);
  rail.push(cand[0], cand[cand.length - 1]);

  // --- Depot: inside the town parcel, on the town side of the rail.
  const depot = { x: tx + R.rand(-0.22, 0.22), y: py - railSide * 0.13 };

  // --- Bridge: where the smoothed river crosses the road.
  const dense = smoothPath(river, 12);
  const bridge = polylineCrossing(dense, road);
  const railBridge = polylineCrossing(dense, rail);

  return { river, road, rail, depot, bridge, railBridge, names: { river: RIVER_NAME, road: ROAD_NAME, rail: RAIL_NAME } };
}

// Dense polyline of the river in parcel units.
export function riverPath(geo) { return smoothPath(geo.river, 12); }

// Set of parcel ids the river passes through.
export function riverParcels(state) {
  const geo = state.geography || generateGeography(state);
  const ids = new Set();
  for (const p of riverPath(geo)) {
    const x = clampf(Math.floor(p.x), 0, GRID_W - 1), y = clampf(Math.floor(p.y), 0, GRID_H - 1);
    ids.add(y * GRID_W + x);
  }
  return ids;
}
