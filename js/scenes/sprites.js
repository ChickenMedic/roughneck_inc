// Pixel-array sprites for the town and the interiors: 12x16 walkers assembled from parts (hat, head,
// torso, legs) so every archetype gets three facings and a walk cycle; props; 24x24 portraits; a 3x5
// pixel font for signs. Palettes vary per person by hashStr(name). Presentation only: no sim state,
// no sim RNG. Canvases are compiled lazily and cached, so importing this module in Node is harmless.
import { hashStr } from '../rng.js';

export const SW = 12, SH = 16;
export const INK = '#1b1812', WHITE = '#f4efe2';
export const SKIN = ['#efc9a0', '#e2b48c', '#d09a70', '#b07a52', '#8a5a3a', '#6a4028'];
export const HAIR = ['#2b2418', '#4a2f1a', '#7a4a22', '#b08a4a', '#d8b870', '#8f8f8a', '#e8e0d0'];

// Grid letters: S skin, H hair, T hat, C coat/shirt, V vest, A accent (tie, badge, bag), P trousers,
// B boots, N apron/white cloth, K ink, W white, Y straw.
export const ARCHETYPES = {
  ceo:       { hat: 'fedora', T: ['#3a3430', '#4a3a2a'], coat: 'suit', C: ['#2e3240', '#3a3040', '#4a3a30', '#3a4438'], A: ['#a8322a', '#2f4f7f', '#b58a2f'], P: 'C', B: INK },
  farmer:    { hat: 'straw', T: ['#d8c25a', '#c8b060'], coat: 'bib', C: ['#7a8aa0', '#9a8a70', '#a0a8b0', '#c8b08a'], P: ['#3b4a6b', '#2f3f5a'], B: '#4a3020' },
  rancher:   { hat: 'cowboy', T: ['#6a4a2a', '#8a6a3a', '#c8b898'], coat: 'vest', C: ['#c8b48a', '#a0b0c0', '#b8a090'], V: ['#5a3a24', '#3a3a3a'], P: ['#4a5a7a', '#5a4a3a'], B: '#5a3a24' },
  banker:    { hat: 'bowler', T: [INK], coat: 'vest', C: ['#f0e8d8'], V: ['#3a3a44', '#4a3a3a'], A: [INK], P: ['#3a3a44'], B: INK, hairIdx: 5 },
  mayor:     { hat: 'cowboy', T: ['#e8e0c8'], coat: 'suit', C: ['#c8b89a', '#d8d0c0'], A: ['#a8322a'], P: 'C', B: '#4a3020', wide: true },
  sheriff:   { hat: 'cowboy', T: ['#5a3a24', '#3a3a3a'], coat: 'shirt', C: ['#b8a070', '#a89868'], A: ['#e0c040'], badge: true, P: ['#4a4a3a', '#3a3a4a'], B: '#3a2a1a' },
  reporter:  { hat: 'fedora', T: ['#6a6a72', '#4a4a52'], coat: 'suit', C: ['#6a6a72', '#7a6a5a'], A: ['#8a3a3a'], press: true, camera: true, P: 'C', B: INK },
  clerk:     { hat: 'visor', T: ['#3f7a4d'], coat: 'shirt', C: ['#f0e8d8', '#e8e0f0'], garters: true, A: [INK], P: ['#5a5a5a', '#4a4a5a'], B: INK },
  roughneck: { hat: 'hardhat', T: ['#c8c0b0', '#b0a898'], coat: 'coveralls', C: ['#6a5a48', '#5a5a5a', '#7a6a50'], P: 'C', B: INK },
  geologist: { hat: 'straw', T: ['#b0a070', '#9a8a60'], coat: 'shirt', C: ['#8a9a7a', '#a0a080'], bag: true, A: ['#5a3a24'], P: ['#8a7a5a'], B: '#4a3020' },
  landman:   { hat: 'fedora', T: ['#5a4a3a', '#3a3430'], coat: 'suit', C: ['#5a4a3a', '#6a5a4a', '#4a4a5a'], A: ['#2f4f7f', '#a8322a'], briefcase: true, P: 'C', B: INK },
  waitress:  { hat: 'none', coat: 'dress', C: ['#e08090', '#7aa0c0', '#c8a040', '#8ab090'], N: WHITE, skirt: true, P: 'C', B: INK },
  oldtimer:  { hat: 'straw', T: ['#8a7a5a'], coat: 'bib', C: ['#8a8a80', '#a09080'], P: ['#4a4a5a'], B: '#3a2a1a', beard: true, cane: true, hairIdx: 6 },
  widow:     { hat: 'none', coat: 'dress', C: ['#2b2430', '#3a2a3a', '#2a2a3a'], N: '#d8d0c8', skirt: true, P: 'C', B: INK, hairIdx: 5 },
  lady:      { hat: 'none', coat: 'dress', C: ['#7a8a6a', '#6a7a9a', '#9a7a6a', '#8a8a7a'], N: WHITE, skirt: true, bag: true, A: ['#5a3a24'], P: 'C', B: '#4a3020' },
  picketer:  { hat: 'sign', coat: 'shirt', C: ['#a05050', '#5070a0', '#70a060', '#a08050'], P: ['#4a4a5a', '#5a4a3a'], B: '#3a2a1a' },
};
export const ARCH_KEYS = Object.keys(ARCHETYPES);

function hatRows(hat) {
  switch (hat) {
    case 'fedora': return ['....TTTT....', '...TTTTTT...', '..TTTTTTTT..'];
    case 'bowler': return ['....TTTT....', '....TTTT....', '...TTTTTT...'];
    case 'cowboy': return ['....TTTT....', '...TTTTTT...', '.TTTTTTTTTT.'];
    case 'straw':  return ['....TTTT....', '....TTTT....', '.TTTTTTTTTT.'];
    case 'hardhat': return ['....TTTT....', '...TTTTTT...', '..TTTTTTTT..'];
    case 'visor':  return ['............', '....HHHH....', '..TTTTTTTT..'];
    case 'cap':    return ['............', '....TTTT....', '...TTTTTTT..'];
    case 'sign':   return ['.WWWWWWWWWW.', '.WKWKKWKKWW.', '.....KK.....'];
    default:       return ['............', '....HHHH....', '...HHHHHH...'];
  }
}
function headRows(dir, a) {
  if (dir === 'up') return ['...HHHHHH...', '...HHHHHH...', '...HHHHHH...', '....SSSS....'];
  if (dir === 'left') return a.beard ? ['...SSSHHH...', '...KSSHHH...', '...WWWWHH...', '....WWWW....'] : ['...SSSHHH...', '...KSSHHH...', '...SSSSHH...', '....SSSS....'];
  return a.beard ? ['...HSSSSH...', '...SKSSKS...', '...WWWWWW...', '....WWWW....'] : ['...HSSSSH...', '...SKSSKS...', '...SSSSSS...', '....SSSS....'];
}
const set = (s, i, chars) => s.slice(0, i) + chars + s.slice(i + chars.length);
function torsoRows(dir, a) {
  if (dir === 'left') {
    const r = ['....CSSC....', '...CCCCCC...', '...CCCCCC...', '...CCSCCC...', '...PPPPPP...'];
    if (a.coat === 'vest') { r[1] = '...CVVVCC...'; r[2] = '...CVVVCC...'; r[3] = '...CVSCCC...'; }
    if (a.coat === 'bib') { r[1] = '...CPPPCC...'; r[2] = '...CPPPCC...'; r[3] = '...CPSPCC...'; }
    if (a.coat === 'suit') { r[1] = '...CACCCC...'; r[2] = '...CACCCC...'; }
    if (a.coat === 'dress') { r[2] = '...NNNCCC...'; r[3] = '...NNSCCC...'; r[4] = '...NNNCCC...'; }
    if (a.coat === 'coveralls') r[4] = '...KKKKKK...';
    if (a.badge) r[1] = '...CACCCC...';
    return r;
  }
  const r = a.wide
    ? ['..CCCSSCCC..', 'CCCCCCCCCCCC', 'CCCCCCCCCCCC', 'SCCCCCCCCCCS', '..PPPPPPPP..']
    : ['..CCCSSCCC..', '.CCCCCCCCCC.', '.CCCCCCCCCC.', '.SCCCCCCCCS.', '..PPPPPPPP..'];
  if (dir === 'down') {
    if (a.coat === 'suit') { r[0] = set(r[0], 4, 'WSSW'); r[1] = set(r[1], 5, 'AA'); r[2] = set(r[2], 5, 'AA'); }
    if (a.coat === 'bib') { r[0] = '..CCPSSPCC..'; r[1] = '.CCCPPPPCCC.'; r[2] = '.CCCPPPPCCC.'; r[3] = '.SCCPPPPCCS.'; }
    if (a.coat === 'vest') { r[1] = '.CVVCCCCVVC.'; r[2] = '.CVVCCCCVVC.'; r[3] = '.SVVCCCCVVS.'; }
    if (a.coat === 'dress') { r[2] = '.CCCNNNNCCC.'; r[3] = '.SCCNNNNCCS.'; r[4] = '..CCNNNNCC..'; }
    if (a.garters) r[1] = '.ACCCCCCCCA.';
    if (a.badge) r[1] = set(r[1], 3, 'A');
    if (a.coat === 'coveralls') r[4] = '..KKKKKKKK..';
  } else {
    if (a.coat === 'vest') { r[1] = '.CVVVVVVVVC.'; r[2] = '.CVVVVVVVVC.'; r[3] = '.SVVVVVVVVS.'; }
    if (a.coat === 'bib') { r[1] = '.CCCPCCPCCC.'; r[2] = '.CCCPCCPCCC.'; }
    if (a.coat === 'dress') { r[2] = '.CCCCNNCCCC.'; r[4] = '..CCCCCCCC..'; }
    if (a.coat === 'coveralls') r[4] = '..KKKKKKKK..';
  }
  return r;
}
function legRows(dir, frame, a) {
  const f = frame % 3;
  if (dir === 'left') {
    if (a.skirt) return [['...CCCCCC...', '...CCCCCC...', '....SS.S....', '...BBB.B....'], ['...CCCCCC...', '...CCCCCC...', '...SS..SS...', '..BBB..BB...'], ['...CCCCCC...', '...CCCCCC...', '....S.SS....', '...BB.BBB...']][f];
    return [['....PPPP....', '....PPPP....', '....PPPP....', '...BBBB.....'], ['....PPPP....', '...PPP.PP...', '..PP....PP..', '.BB......BB.'], ['....PPPP....', '...PP.PPP...', '...PP..PP...', '..BB...BB...']][f];
  }
  if (a.skirt) return [['..CCCCCCCC..', '..CCCCCCCC..', '...SS..SS...', '...BB..BB...'], ['..CCCCCCCC..', '..CCCCCCCC..', '...BB..SS...', '.......BB...'], ['..CCCCCCCC..', '..CCCCCCCC..', '...SS..BB...', '...BB.......']][f];
  return [['...PP..PP...', '...PP..PP...', '...PP..PP...', '...BB..BB...'], ['...PP..PP...', '...PP..PP...', '...BB..PP...', '.......BB...'], ['...PP..PP...', '...PP..PP...', '...PP..BB...', '...BB.......']][f];
}
function put(rows, x, y, ch) { if (y >= 0 && y < rows.length && x >= 0 && x < rows[y].length) rows[y][x] = ch; }
function accessories(rows, dir, a) {
  if (dir === 'down') {
    if (a.press) { put(rows, 8, 1, 'W'); put(rows, 9, 1, 'W'); }
    if (a.camera) { put(rows, 5, 8, 'K'); put(rows, 6, 8, 'K'); put(rows, 5, 9, 'W'); put(rows, 6, 9, 'K'); }
    if (a.bag) { put(rows, 9, 9, 'A'); put(rows, 10, 9, 'A'); put(rows, 9, 10, 'A'); put(rows, 10, 10, 'A'); put(rows, 9, 11, 'A'); put(rows, 10, 11, 'A'); }
    if (a.briefcase) { put(rows, 0, 11, 'K'); put(rows, 1, 11, 'K'); put(rows, 0, 12, 'K'); put(rows, 1, 12, 'K'); }
    if (a.cane) for (let y = 10; y <= 14; y++) put(rows, 10, y, 'K');
  } else if (dir === 'left') {
    if (a.camera) { put(rows, 3, 9, 'K'); put(rows, 4, 9, 'K'); }
    if (a.briefcase) { put(rows, 1, 11, 'K'); put(rows, 2, 11, 'K'); put(rows, 1, 12, 'K'); put(rows, 2, 12, 'K'); }
    if (a.cane) for (let y = 10; y <= 14; y++) put(rows, 2, y, 'K');
    if (a.bag) { put(rows, 8, 10, 'A'); put(rows, 8, 11, 'A'); }
  } else if (a.cane) for (let y = 10; y <= 14; y++) put(rows, 1, y, 'K');
}
const norm = (r) => (r + '............').slice(0, SW);

// 16 rows of 12 characters for one archetype, facing, walk frame (0 stand, 1/2 strides).
export function frameGrid(key, dir = 'down', frame = 0) {
  const a = ARCHETYPES[key] || ARCHETYPES.ceo;
  const d = dir === 'right' ? 'left' : dir;
  const rows = [...hatRows(a.hat), ...headRows(d, a), ...torsoRows(d, a), ...legRows(d, frame, a)].map((r) => norm(r).split(''));
  accessories(rows, d, a);
  let out = rows.map((r) => r.join(''));
  if (dir === 'right') out = out.map((r) => r.split('').reverse().join(''));
  return out;
}

export function paletteFor(key, name = '') {
  const a = ARCHETYPES[key] || ARCHETYPES.ceo;
  const h = hashStr(`${key}:${name}`);
  const pick = (v, salt) => (Array.isArray(v) ? v[((h >>> salt) & 0xff) % v.length] : v);
  const C = pick(a.C, 4);
  return {
    S: SKIN[(h >>> 2) % SKIN.length], H: HAIR[a.hairIdx ?? ((h >>> 9) % 5)], T: pick(a.T, 12) || C, C,
    V: pick(a.V, 16) || C, A: pick(a.A, 20) || '#a8322a', P: a.P === 'C' ? C : (pick(a.P, 24) || C),
    B: a.B || INK, N: a.N || WHITE, K: INK, W: WHITE, Y: '#d8c25a',
  };
}

// Draw a grid of palette letters onto a fresh canvas at an integer scale.
export function rasterize(rows, pal, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x]; if (ch === '.' || ch === ' ') continue;
    const col = pal[ch]; if (!col) continue;
    g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale);
  }
  return c;
}

const cache = new Map();
function cached(key, make) { let c = cache.get(key); if (!c) { c = make(); cache.set(key, c); } return c; }
export function compile(key, dir = 'down', frame = 0, name = '', scale = 1) {
  return cached(`w|${key}|${dir}|${frame}|${name}|${scale}`, () => rasterize(frameGrid(key, dir, frame), paletteFor(key, name), scale));
}
export function spriteUrl(key, name = '', dir = 'down', frame = 0, scale = 5) {
  return cached(`wu|${key}|${dir}|${frame}|${name}|${scale}`, () => compile(key, dir, frame, name, scale).toDataURL());
}
// 24x24 portrait: hat + head + shoulders at 2x, centred.
export function portraitGrid(key, name = '') {
  const src = frameGrid(key, 'down', 0).slice(0, 9);
  const out = Array.from({ length: 24 }, () => Array(24).fill('.'));
  for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { const ch = src[y][x]; if (ch === '.') continue; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) out[3 + y * 2 + dy][x * 2 + dx] = ch; }
  return out.map((r) => r.join(''));
}
export function portrait(key, name = '', scale = 4) {
  return cached(`p|${key}|${name}|${scale}`, () => rasterize(portraitGrid(key, name), paletteFor(key, name), scale));
}
export function portraitUrl(key, name = '', scale = 4) {
  return cached(`pu|${key}|${name}|${scale}`, () => portrait(key, name, scale).toDataURL());
}

// ---------------- props ----------------
function grid(w, h, fill = '.') { return Array.from({ length: h }, () => Array(w).fill(fill)); }
function line(gr, x0, y0, x1, y1, ch) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let i = 0; i < 200; i++) {
    put(gr, x, y, ch);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function rect(gr, x, y, w, h, ch) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(gr, i, j, ch); }
function pumpjackFrame(tilt) {
  const gr = grid(24, 20);
  rect(gr, 0, 19, 24, 1, 'K'); rect(gr, 2, 18, 20, 1, 'K');
  for (let y = 7; y <= 17; y++) { const half = Math.round((y - 7) * 0.32); rect(gr, 12 - half, y, half * 2 + 1, 1, 'G'); }
  const yl = 7 - 3 * tilt, yr = 7 + 3 * tilt;
  line(gr, 3, yl, 20, yr, 'R'); line(gr, 3, yl + 1, 20, yr + 1, 'R');
  rect(gr, 0, yl - 1, 3, 4, 'K');                    // horsehead
  for (let y = yl + 3; y <= 17; y++) put(gr, 1, y, 'K'); // polished rod
  rect(gr, 0, 16, 3, 3, 'K');                        // wellhead
  rect(gr, 16, 13, 7, 6, 'H');                       // engine house
  rect(gr, 16, 12, 7, 1, 'K');
  line(gr, 20, yr + 2, 19, 15, 'K');                 // pitman
  rect(gr, 18, 14, 3, 3, 'W');                       // counterweight
  put(gr, 19, 15, 'K');
  return gr.map((r) => r.join(''));
}
const TREE = [
  '......GGGG......', '....GGGGGGGG....', '...GGggGGGGGG...', '..GGggGGGGGGGG..', '..GGGGGGGGgGGG..', '.GGGGGGGGGggGGG.', '.GGGgGGGGGGGGGG.', '.GGGGGGGGGGGGGG.',
  '..GGGGGgGGGGGG..', '..GGGGGGGGGGGG..', '...GGGGGGGGGG...', '....GGGGGGGG....', '.....GGGGGG.....', '......KKKK......', '......KKKK......', '......KKKK......',
  '......KKKK......', '......KKKK......', '......KKKK......', '......KKKK......', '.....KKKKKK.....', '....KKKKKKKK....', '................', '................',
];
const TRUCK = [
  '........................', '........KKKKKKKK........', '.......KWWWKWWWK........', '......KKKKKKKKKKKKKKKKK.', '.....KRRRRRRRRRRRRRRRRK.', '....KRRRRRRRRRRRRRRRRRK.',
  '...KRRRRRRRRRRRRRRRRRRK.', '..KKKKKKKKKKKKKKKKKKKKKK', '..KRRRRRRRRRRRRRRRRRRRRK', '..KKKKKKKKKKKKKKKKKKKKKK', '....KKK..........KKK....', '...KKWKK........KKWKK...',
  '...KKWKK........KKWKK...', '....KKK..........KKK....',
];
const SIGNPOST = ['.WWWWWWWW.', '.WKK.K..W.', '.WKKKKK.W.', '.WKK.K..W.', '.WWWWWWWW.', '....KK....', '....KK....', '....KK....', '....KK....', '....KK....', '....KK....', '....KK....', '....KK....', '....KK....', '....KK....', '...KKKK...'];
const TOWER = [
  '.......KKKKKK.......', '.....KKKKKKKKKK.....', '...KKKKKKKKKKKKKK...', '..CCCCCCCCCCCCCCCC..', '..CCCCCCCCCCCCCCCC..', '..KKKKKKKKKKKKKKKK..', '..CCCCCCCCCCCCCCCC..', '..CCCCCCCCCCCCCCCC..',
  '..CCCCCCCCCCCCCCCC..', '..KKKKKKKKKKKKKKKK..', '..CCCCCCCCCCCCCCCC..', '..CCCCCCCCCCCCCCCC..', '..KKKKKKKKKKKKKKKK..', '...K............K...', '...K............K...', '...KK..........KK...',
  '...K.K........K.K...', '...K..K......K..K...', '...K...K....K...K...', '...K....K..K....K...', '...K.....KK.....K...', '...K....K..K....K...', '...K...K....K...K...', '...K..K......K..K...',
  '...K.K........K.K...', '...KK..........KK...', '...K............K...', '...K............K...', '..KKK..........KKK..', '..KKK..........KKK..', '....................', '....................',
];
const BENCH = ['BBBBBBBBBBBBBB', 'B............B', 'BBBBBBBBBBBBBB', 'B............B', 'BBBBBBBBBBBBBB', 'B............B', 'B............B', 'BB..........BB'];
const BARREL = ['.KKKKKK.', 'KRRRRRRK', 'KKKKKKKK', 'KRRRRRRK', 'KRRRRRRK', 'KKKKKKKK', 'KRRRRRRK', 'KRRRRRRK', 'KKKKKKKK', '.KKKKKK.'];
const PICKET = ['WWWWWWWWWWWW', 'WKWKKWKWWKKW', 'WKKWKWKKWKKW', 'WWWWWWWWWWWW', '.....KK.....', '.....KK.....', '.....KK.....', '.....KK.....'];

export const PROPS = {
  tree: { frames: [TREE], pal: { G: '#4b6b3a', g: '#6a8a48', K: '#5a3a24' }, w: 16, h: 24, base: { x: 6, y: 20, w: 4, h: 3 } },
  treeSnow: { frames: [TREE], pal: { G: '#7a8a70', g: '#e8e6dc', K: '#5a3a24' }, w: 16, h: 24, base: { x: 6, y: 20, w: 4, h: 3 } },
  truck: { frames: [TRUCK], pal: { K: INK, W: '#c8dce8', R: '#7a3f3f' }, w: 24, h: 14, base: { x: 2, y: 8, w: 22, h: 6 } },
  pumpjack: { frames: [pumpjackFrame(-1), pumpjackFrame(1)], pal: { K: INK, G: '#6a6a6a', R: '#a8322a', H: '#8a7a5a', W: '#c8c0b0' }, w: 24, h: 20, base: { x: 0, y: 14, w: 24, h: 6 } },
  signpost: { frames: [SIGNPOST], pal: { K: INK, W: WHITE }, w: 10, h: 16, base: { x: 4, y: 14, w: 2, h: 2 } },
  tower: { frames: [TOWER], pal: { K: '#4a3a2a', C: '#b0a898' }, w: 20, h: 32, base: { x: 2, y: 26, w: 16, h: 6 } },
  bench: { frames: [BENCH], pal: { B: '#6a4a2a' }, w: 14, h: 8, base: { x: 0, y: 2, w: 14, h: 6 } },
  barrel: { frames: [BARREL], pal: { K: '#3a2a1a', R: '#8a5a3a' }, w: 8, h: 10, base: { x: 0, y: 6, w: 8, h: 4 } },
  picket: { frames: [PICKET], pal: { K: INK, W: WHITE }, w: 12, h: 8, base: { x: 0, y: 0, w: 0, h: 0 } },
};
export function prop(kind, frame = 0, scale = 1, palOverride = null) {
  const p = PROPS[kind]; if (!p) return null;
  const pk = palOverride ? JSON.stringify(palOverride) : '';
  return cached(`pr|${kind}|${frame}|${scale}|${pk}`, () => rasterize(p.frames[frame % p.frames.length], { ...p.pal, ...(palOverride || {}) }, scale));
}

// ---------------- 3x5 pixel font ----------------
export const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'], M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '.#.', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '.#.'], V: ['#.#', '#.#', '#.#', '.#.', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '.': ['...', '...', '...', '...', '.#.'], ',': ['...', '...', '...', '.#.', '#..'], '-': ['...', '...', '###', '...', '...'], "'": ['.#.', '.#.', '...', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['###', '..#', '.##', '...', '.#.'], '/': ['..#', '..#', '.#.', '#..', '#..'], ' ': ['...', '...', '...', '...', '...'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
};
export const textWidth = (t) => Math.max(0, t.length * 4 - 1);
export function drawText(g, text, x, y, color = INK, scale = 1) {
  g.fillStyle = color;
  const s = String(text).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const gl = FONT[s[i]] || FONT['?'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (gl[r][c] === '#') g.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
  }
}
