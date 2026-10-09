// Dry Fork as tiles: a 48x28 map of 16px tiles, the buildings along Main and Second Street, the props,
// the ambient townsfolk, and sync(state) which adds the state-driven extras (picketers, a reporter, a
// rival's truck, snow). The map is built once from a few strokes and exported as ASCII rows so it can be
// read and hand-edited; MAP legend: . grass  , grass with a tuft  = street  ~ creek  r railroad
// w boardwalk/platform  T tree  E east exit to the field.
import { makeRng } from '../rng.js';
import { calMonth } from '../util.js';
import { season } from '../era.js';
import { isFounding, foundersAt } from '../founding.js';

export const TILE = 16, MAP_W = 48, MAP_H = 28;

function buildMap() {
  const g = Array.from({ length: MAP_H }, () => Array(MAP_W).fill('.'));
  const R = makeRng(1952);
  const paint = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) g[y][x] = ch; };
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (R.chance(0.14)) g[y][x] = ',';
  paint(1, 0, 2, MAP_H - 1, '~');                 // Coyote Creek along the west edge
  paint(0, 2, MAP_W - 1, 2, 'r');                 // the Rock Island line
  paint(4, 12, MAP_W - 1, 14, '=');               // Main Street
  paint(4, 21, 47, 23, '=');                      // Second Street, out to the rig yard
  paint(22, 7, 24, 27, '=');                      // Courthouse Street (north-south)
  paint(18, 6, 29, 6, 'w');                       // depot platform
  paint(46, 12, 47, 14, 'E');                     // east exit toward the leases
  const trees = [[4, 0], [8, 1], [13, 0], [17, 1], [31, 0], [36, 1], [40, 0], [45, 1], [47, 4], [46, 8], [4, 9], [5, 4], [9, 4], [15, 4], [33, 4], [38, 4], [42, 4], [5, 25], [14, 26], [19, 25], [27, 26], [33, 25], [46, 24], [4, 17], [35, 8], [26, 9]];
  for (const [x, y] of trees) g[y][x] = 'T';
  return g.map((r) => r.join(''));
}
export const MAP = buildMap();

// Buildings. Doors are the street tile below the footprint's middle; the player enters by standing there.
export const BUILDINGS = [
  { key: 'bank', name: 'First State Bank', sign: 'FIRST STATE BANK', x: 6, y: 7, w: 6, h: 5, style: 'brick', paint: '#9a4a3a' },
  { key: 'office', name: 'Your office', sign: (state) => (state && (isFounding(state) || state.founding?.failed) ? 'FOR RENT' : (state?.company?.name || 'OFFICE').toUpperCase().slice(0, 19)), x: 13, y: 7, w: 5, h: 5, style: 'wood', paint: '#c8a878', trim: '#a8322a' },
  { key: 'hotel', name: 'Dry Fork Hotel', sign: 'HOTEL', x: 18, y: 7, w: 4, h: 5, style: 'brick', paint: '#b08a5a' },
  { key: 'courthouse', name: 'County Courthouse', sign: 'COUNTY COURTHOUSE', x: 27, y: 6, w: 9, h: 6, style: 'stone', paint: '#c8c0b0' },
  { key: 'clarion', name: 'The Dry Fork Clarion', sign: 'THE CLARION', x: 38, y: 7, w: 6, h: 5, style: 'wood', paint: '#9aa0a8', trim: '#2b2418' },
  { key: 'store', name: 'Hargrove Mercantile & Land Office', sign: 'MERCANTILE & LAND OFFICE', x: 6, y: 16, w: 8, h: 5, style: 'wood', paint: '#b89a6a', awning: ['#3f7a4d', '#efe4c8'] },
  { key: 'cafe', name: 'Bluebonnet Cafe', sign: 'BLUEBONNET CAFE', x: 15, y: 16, w: 6, h: 5, style: 'wood', paint: '#efe8d8', awning: ['#a8322a', '#efe4c8'], trim: '#2f4f7f' },
  { key: 'sheriff', name: "Sheriff's Office and County Jail", sign: 'SHERIFF', x: 27, y: 16, w: 6, h: 5, style: 'brick', paint: '#7a5a4a' },
  { key: 'church', name: 'First Methodist Church', sign: 'FIRST METHODIST', x: 36, y: 16, w: 7, h: 5, style: 'church', paint: '#f0ece0' },
  { key: 'rigyard', name: "Sandoval's rig yard", sign: 'RIG YARD', x: 44, y: 16, w: 4, h: 4, style: 'yard', paint: '#8a6a48' },
  { key: 'depot', name: 'Rock Island Depot', sign: 'DRY FORK', x: 20, y: 3, w: 8, h: 3, style: 'depot', paint: '#c8a040' },
  { key: 'house1', name: 'Mabry house', x: 40, y: 24, w: 4, h: 3, style: 'house', paint: '#d8c8a8', enterable: false },
  { key: 'house2', name: 'Cobb house', x: 8, y: 24, w: 4, h: 3, style: 'house', paint: '#b8c8c0', enterable: false },
  { key: 'house3', name: 'Yoder house', x: 30, y: 25, w: 4, h: 3, style: 'house', paint: '#c8b8a0', enterable: false },
];
export const doorOf = (b) => ({ x: b.x + Math.floor(b.w / 2), y: b.y + b.h });
export const buildingByKey = (key) => BUILDINGS.find((b) => b.key === key);

// Fixed props (tile coordinates of the top-left corner).
export const PROP_LIST = [
  { kind: 'pumpjack', x: 37, y: 25, label: 'HOLLISTER NO. 1' },
  { kind: 'bench', x: 21, y: 20 },
  { kind: 'barrel', x: 14, y: 20 }, { kind: 'barrel', x: 14, y: 19 },
  { kind: 'signpost', x: 45, y: 10, label: 'FIELD >' },
  { kind: 'bench', x: 30, y: 6 },
];

// Where the player stands when the town first loads: on the office doorstep (or wherever spawnAt says).
export const SPAWN = doorOf(buildingByKey('office'));
export const spawnAt = (key) => { const b = key && buildingByKey(key); return b ? doorOf(b) : SPAWN; };
// Bubble labels over the buildings where a founder is waiting, during the founding year.
const FOUNDER_TAGS = { pruitt: 'DOC PRUITT', cobb: 'MISS COBB', sandoval: 'SANDOVAL', jessup: 'JESSUP BROS', whitlock: 'WHITLOCK', cravens: 'CRAVENS', hargrove: 'MRS HARGROVE', ellison: 'THE BANKER', preacher: 'THE PASTOR' };

// Ambient townsfolk: tile position of their feet, a wander radius in px, walking speed in px/s.
export const NPCS = [
  { id: 'oldtimer', sprite: 'oldtimer', name: 'Old Ezra', x: 20, y: 22, radius: 20, speed: 12, talk: 'oldtimer' },
  { id: 'farmer1', sprite: 'farmer', name: 'Farmer', x: 33, y: 13, radius: 130, speed: 26 },
  { id: 'rancher1', sprite: 'rancher', name: 'Rancher', x: 12, y: 22, radius: 90, speed: 24 },
  { id: 'roughneck1', sprite: 'roughneck', name: 'Roughneck', x: 26, y: 6, radius: 60, speed: 30 },
  { id: 'clerk1', sprite: 'clerk', name: 'Townsman', x: 36, y: 13, radius: 50, speed: 22 },
];

function rivalLeasedThisMonth(state) {
  const comps = state.competitors || [];
  const hit = (state.news || []).filter((n) => n.month === state.month && n.kind === 'land').find((n) => comps.some((c) => n.text.includes(c.name)));
  if (!hit) return null;
  return comps.find((c) => hit.text.includes(c.name)) || null;
}

// State-driven extras. Pure: reads state, returns plain data. Called from render(), never from the loop.
export function sync(state) {
  const cm = calMonth(state.month);
  const out = { season: season(state), snow: cm === 11 || cm <= 1, npcs: [], props: [], month: state.month };
  if ((state.env?.activism ?? 0) > 45) for (let i = 0; i < 3; i++) out.npcs.push({ id: `picket${i}`, sprite: 'picketer', name: 'Picketer', x: 29 + i * 2, y: 13, radius: 40, speed: 18, march: true, talk: 'picketer' });
  const journalist = (state.pending || []).some((e) => e.id === 'journalist') || state.eventHistory?.journalist === state.month;
  if (journalist) out.npcs.push({ id: 'reporter', sprite: 'reporter', name: 'Clarion reporter', x: 43, y: 13, radius: 30, speed: 20, talk: 'reporter' });
  const rival = rivalLeasedThisMonth(state);
  if (rival) out.props.push({ kind: 'truck', x: 8, y: 13, pal: { R: rival.color }, label: rival.tag, title: `${rival.name}'s truck` });
  out.marks = {};
  if (isFounding(state)) for (const b of BUILDINGS) { const fs = foundersAt(state, b.key).filter((f) => f.status !== 'gone'); if (fs.length) out.marks[b.key] = fs.map((f) => `${f.status === 'signed' ? '✓' : '$'} ${FOUNDER_TAGS[f.id] || f.name.toUpperCase()}`).join('  '); }
  return out;
}
