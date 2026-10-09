// Geography determinism + plat map render check. Run: node test/geotest.mjs
import assert from 'node:assert/strict';
import { newGame } from '../js/sim.js';
import { generateGeography, riverParcels, riverPath } from '../js/geography.js';
import { renderPlatMap } from '../js/ui/platmap.js';
import { GRID_W, GRID_H } from '../js/data.js';

const a = newGame({ seed: 42, skipFounding: true }), b = newGame({ seed: 42, skipFounding: true });
const ga = a.geography || generateGeography(a), gb = b.geography || generateGeography(b);
assert.equal(JSON.stringify(ga), JSON.stringify(gb), 'geography must be deterministic for a seed');
assert.equal(JSON.stringify(generateGeography(a)), JSON.stringify(ga), 'regenerating gives the same geography');

const inGrid = (p) => p.x >= -1e-9 && p.x <= GRID_W + 1e-9 && p.y >= -1e-9 && p.y <= GRID_H + 1e-9;
for (const k of ['river', 'road', 'rail']) { assert.ok(ga[k].length >= 2, k + ' has points'); for (const p of ga[k]) assert.ok(inGrid(p), `${k} point ${JSON.stringify(p)} inside the grid`); }
assert.ok(ga.river.length >= 6 && ga.river.length <= 8, 'river has 6-8 control points');
assert.ok(inGrid(ga.depot), 'depot inside the grid');
assert.ok(ga.bridge && inGrid(ga.bridge), 'road crosses the river somewhere');
for (const p of riverPath(ga)) assert.ok(inGrid(p), 'smoothed river stays inside the grid');
const town = a.parcels.find((p) => p.surface.type === 'town');
assert.ok(Math.floor(ga.depot.x) === town.x && Math.floor(ga.depot.y) === town.y, 'depot is in the town parcel');
const rp = riverParcels(a);
assert.ok(rp.size >= 8, `river passes through >= 8 parcels (got ${rp.size})`);
const nearTown = [...rp].some((id) => { const p = a.parcels[id]; return Math.abs(p.x - town.x) <= 1 && Math.abs(p.y - town.y) <= 1; });
assert.ok(nearTown, 'river passes within a parcel of town');

// Several seeds: always a bridge, always serializable, road always through town.
for (const seed of [1, 7, 99, 1234, 31337, 2 ** 31 - 1]) {
  const s = newGame({ seed, skipFounding: true });
  const g = s.geography || generateGeography(s);
  assert.ok(g.bridge, `seed ${seed}: bridge exists`);
  assert.ok(riverParcels(s).size >= 8, `seed ${seed}: river >= 8 parcels`);
  const t = s.parcels.find((p) => p.surface.type === 'town');
  assert.ok(g.road.some((p) => Math.abs(p.x - (t.x + 0.5)) < 1e-9 && Math.abs(p.y - (t.y + 0.5)) < 1e-9), `seed ${seed}: road passes through the town centre`);
  JSON.parse(JSON.stringify(s));
}

// Plat map renders as a pure string, with one hit rect per parcel.
const svg = renderPlatMap(a, { selected: 3 });
assert.equal((svg.match(/data-action="select-parcel"/g) || []).length, 140, '140 hit rects');
assert.equal((svg.match(/class="plat"/g) || []).length, 1, 'one plat svg');
assert.ok(svg.includes('class="sel"'), 'selection drawn');
assert.ok(svg.includes('Coyote Creek'), 'river labelled');
assert.ok(svg.includes('FILE COPY'), 'frame stamp');
const svg2 = renderPlatMap(a, { selected: 3 });
assert.equal(svg, svg2, 'render is deterministic');
console.log(`geotest OK: river ${ga.river.length} pts through ${rp.size} parcels, bridge at (${ga.bridge.x.toFixed(2)}, ${ga.bridge.y.toFixed(2)}), svg ${(svg.length / 1024).toFixed(0)} KB`);
