// The Dry Fork overworld: a canvas scene the player walks around. Collision is a tile grid with
// axis-separated AABB moves; buildings are drawn as entities (procedural facades) so the player walks
// behind their awnings; the nearest door / townsperson / exit becomes a prompt; clicking walks there.
// The loop reads scene-local state and the shared key set only. It never touches the sim and never
// calls render(): screen changes triggered from here are deferred to a timeout outside the frame.
import { keys, moveAxis, MOVE_CODES } from '../ui/input.js';
import { startLoop, stopLoop, sizeCanvas, Camera } from './engine.js';
import { compile, prop, PROPS, drawText, textWidth, INK } from './sprites.js';
import { TILE as T, MAP_W, MAP_H, MAP, BUILDINGS, PROP_LIST, NPCS, SPAWN, spawnAt, doorOf, buildingByKey, sync as syncData } from './townData.js';
import { makeRng } from '../rng.js';

const SPEED = 72, NPC_ANIM = 6;
const WORLD_W = MAP_W * T, WORLD_H = MAP_H * T;
let sc = null, C = null;               // scene, ui context
let canvas = null, g = null, dpr = 1, scale = 3, active = false;

// ---------------- colours ----------------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

// ---------------- tiles ----------------
function renderTiles(snow) {
  const c = document.createElement('canvas'); c.width = WORLD_W; c.height = WORLD_H;
  const x = c.getContext('2d');
  const R = makeRng(77);
  const grass = snow ? '#e6e4da' : '#7c9c5a', tuft = snow ? '#cfd0c6' : '#5e7e3e', road = snow ? '#d6ccb6' : '#c9a877', rut = snow ? '#c4b9a2' : '#b28f62';
  const isVert = (tx, ty) => tx >= 22 && tx <= 24 && !(ty >= 12 && ty <= 14) && !(ty >= 21 && ty <= 23);
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const ch = MAP[ty][tx], px = tx * T, py = ty * T;
    x.fillStyle = grass; x.fillRect(px, py, T, T);
    if (ch === ',' || ch === '.' || ch === 'T') {
      if (ch === ',' || R.chance(0.08)) { x.fillStyle = tuft; const n = R.randInt(2, 4); for (let i = 0; i < n; i++) x.fillRect(px + R.randInt(1, 13), py + R.randInt(2, 13), 1, 2); }
    } else if (ch === '=' || ch === 'E') {
      x.fillStyle = road; x.fillRect(px, py, T, T);
      x.fillStyle = rut;
      if (isVert(tx, ty)) { for (let k = 0; k < T; k += 5) { x.fillRect(px + 5, py + k, 1, 3); x.fillRect(px + 10, py + k + 2, 1, 3); } }
      else for (let k = 0; k < T; k += 5) { x.fillRect(px + k, py + 5, 3, 1); x.fillRect(px + k + 2, py + 10, 3, 1); }
      if (R.chance(0.3)) { x.fillStyle = shade(road, -0.12); x.fillRect(px + R.randInt(0, 14), py + R.randInt(0, 14), 2, 1); }
      if (ch === 'E') { x.fillStyle = shade(road, -0.25); x.fillRect(px + 4, py + 7, 8, 2); x.fillRect(px + 10, py + 5, 2, 6); x.fillRect(px + 12, py + 7, 1, 2); }
    } else if (ch === '~') {
      x.fillStyle = '#4a7aa0'; x.fillRect(px, py, T, T);
      x.fillStyle = '#7aa4c4'; x.fillRect(px + 3, py + 4, 4, 1); x.fillRect(px + 9, py + 10, 4, 1); x.fillRect(px + 5, py + 13, 3, 1);
      x.fillStyle = '#c8b888';
      if (MAP[ty][tx + 1] !== '~') x.fillRect(px + 15, py, 1, T);
      if (MAP[ty][tx - 1] !== '~') x.fillRect(px, py, 1, T);
    } else if (ch === 'r') {
      x.fillStyle = '#6a4a2a'; for (let k = 1; k < T; k += 4) x.fillRect(px + k, py + 3, 2, 10);
      x.fillStyle = '#7a7a7a'; x.fillRect(px, py + 5, T, 1); x.fillRect(px, py + 10, T, 1);
    } else if (ch === 'w') {
      x.fillStyle = '#a88a5a'; x.fillRect(px, py, T, T);
      x.fillStyle = '#8a6a3a'; for (const k of [3, 7, 11, 15]) x.fillRect(px, py + k, T, 1);
      x.fillStyle = '#6a4a2a'; x.fillRect(px + 2, py + 1, 1, 1); x.fillRect(px + 13, py + 9, 1, 1);
    }
  }
  return c;
}

// ---------------- facades ----------------
function windowAt(x, y, w, h, arched, glass = '#a8c4d0', frame = '#3a2a1a') {
  g.fillStyle = frame; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = glass; g.fillRect(x, y, w, h);
  g.fillStyle = frame; g.fillRect(x + Math.floor(w / 2), y, 1, h); g.fillRect(x, y + Math.floor(h / 2), w, 1);
  if (arched) { g.fillStyle = frame; g.fillRect(x - 1, y - 3, w + 2, 2); g.fillRect(x, y - 4, w, 1); g.fillStyle = glass; g.fillRect(x + 1, y - 3, w - 2, 3); }
  g.fillStyle = '#efe4c8'; g.fillRect(x - 1, y + h + 1, w + 2, 1);
}
function doorAt(x, y, w, h, color = '#5a3a24') {
  g.fillStyle = '#2a1a10'; g.fillRect(x - 1, y - 1, w + 2, h + 1);
  g.fillStyle = color; g.fillRect(x, y, w, h);
  g.fillStyle = shade(color, 0.25); g.fillRect(x + 2, y + 2, w - 4, Math.floor(h / 2) - 2);
  g.fillStyle = '#e0c040'; g.fillRect(x + w - 3, y + Math.floor(h / 2) + 1, 1, 1);
}
function buildFacade(b, sign, snow) {
  const W = b.w * T, H = b.h * T;
  const extraTop = { stone: 22, church: 34, depot: 4, house: 10 }[b.style] || 0;
  const extraSide = b.style === 'depot' ? 6 : 0;
  const c = document.createElement('canvas'); c.width = W + extraSide * 2; c.height = H + extraTop + T;
  const saved = g; g = c.getContext('2d'); g.translate(extraSide, extraTop);
  const paint = b.paint, dark = shade(paint, -0.28), light = shade(paint, 0.22), trim = b.trim || dark;
  const doorX = Math.floor(W / 2) - 5;
  const signBoard = (x, y, w, bg, fg) => { g.fillStyle = bg; g.fillRect(x, y, w, 9); g.fillStyle = dark; g.fillRect(x, y, w, 1); g.fillRect(x, y + 8, w, 1); drawText(g, sign, x + Math.floor((w - textWidth(sign)) / 2), y + 2, fg); };
  const sideWindows = (y, w, h, arched, gap = 18) => { for (let x = 4; x + w < doorX - 4; x += gap) { windowAt(x, y, w, h, arched); windowAt(W - x - w, y, w, h, arched); } };
  if (b.style === 'wood') {
    g.fillStyle = paint; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(43,36,24,0.16)'; for (let y = 17; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.fillStyle = trim; g.fillRect(0, 0, W, 3); g.fillStyle = light; g.fillRect(0, 3, W, 1); g.fillStyle = trim; g.fillRect(0, 15, W, 1);
    g.fillStyle = trim; g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
    signBoard(4, 5, W - 8, '#efe4c8', INK);
    sideWindows(H - 30, 10, 12, false);
    doorAt(doorX, H - 17, 10, 17);
    if (b.awning) { for (let x = 0; x < W; x += 4) { g.fillStyle = b.awning[(x / 4) % 2]; g.fillRect(x, H, 4, 6); } }
    else { g.fillStyle = dark; g.fillRect(0, H, W, 6); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, H, W, 1); }
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, H + 6, W, 2);
    g.fillStyle = dark; g.fillRect(1, H + 6, 2, 10); g.fillRect(W - 3, H + 6, 2, 10);
  } else if (b.style === 'brick') {
    g.fillStyle = paint; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 6; y < H; y += 3) { g.fillRect(0, y, W, 1); for (let x = ((y / 3) % 2) * 4; x < W; x += 8) g.fillRect(x, y - 3, 1, 3); }
    g.fillStyle = dark; g.fillRect(0, 0, W, 4); g.fillStyle = light; for (let x = 2; x < W; x += 6) g.fillRect(x, 4, 3, 2);
    signBoard(4, 7, W - 8, '#d8c8a0', INK);
    sideWindows(H - 30, 10, 12, true);
    g.fillStyle = '#d8c8a0'; g.fillRect(doorX - 3, H - 21, 16, 3);
    doorAt(doorX, H - 18, 10, 18, '#3a2a1a');
    g.fillStyle = light; g.fillRect(doorX - 4, H, 18, 3); g.fillStyle = shade(paint, 0.4); g.fillRect(doorX - 7, H + 3, 24, 3);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(doorX - 7, H + 6, 24, 1);
  } else if (b.style === 'stone') {
    g.fillStyle = paint; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(43,36,24,0.18)'; for (let y = 10; y < H; y += 5) { g.fillRect(0, y, W, 1); for (let x = ((y / 5) % 2) * 5; x < W; x += 10) g.fillRect(x, y - 5, 1, 5); }
    const cx = Math.floor(W / 2);
    g.fillStyle = light; g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx, -14); g.lineTo(cx + 40, 0); g.closePath(); g.fill();
    g.fillStyle = dark; g.fillRect(cx - 40, 0, 80, 1); g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx, -14); g.lineTo(cx + 40, 0); g.stroke();
    g.fillStyle = '#efe8d8'; g.fillRect(cx - 5, -22, 10, 8); g.fillStyle = dark; g.fillRect(cx - 6, -23, 12, 1); g.fillRect(cx - 1, -21, 2, 5);
    g.fillStyle = INK; g.fillRect(cx + 5, -30, 1, 9); g.fillStyle = '#a8322a'; g.fillRect(cx + 6, -30, 5, 3);
    g.fillStyle = light; g.fillRect(cx - 42, 1, 84, 9); g.fillStyle = dark; g.fillRect(cx - 42, 10, 84, 1);
    drawText(g, sign, cx - Math.floor(textWidth(sign) / 2), 3, INK);
    for (const ox of [-30, -12, 12, 30]) { g.fillStyle = '#efe8d8'; g.fillRect(cx + ox - 2, 11, 4, H - 12); g.fillStyle = 'rgba(43,36,24,0.25)'; g.fillRect(cx + ox + 1, 11, 1, H - 12); g.fillStyle = light; g.fillRect(cx + ox - 3, 11, 6, 2); g.fillRect(cx + ox - 3, H - 3, 6, 2); }
    for (const x of [8, 22]) { windowAt(x, H - 30, 9, 14, true, '#9ab4c4'); windowAt(W - x - 9, H - 30, 9, 14, true, '#9ab4c4'); }
    doorAt(cx - 8, H - 19, 16, 19, '#3a2a1a'); g.fillStyle = '#2a1a10'; g.fillRect(cx, H - 19, 1, 19);
    g.fillStyle = light; g.fillRect(cx - 22, H, 44, 3); g.fillStyle = shade(paint, 0.35); g.fillRect(cx - 26, H + 3, 52, 3); g.fillStyle = shade(paint, 0.5); g.fillRect(cx - 30, H + 6, 60, 3);
  } else if (b.style === 'depot') {
    g.fillStyle = '#5a3a24'; g.fillRect(-6, -4, W + 12, 14); g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = -2; y < 10; y += 4) g.fillRect(-6, y, W + 12, 1);
    g.fillStyle = paint; g.fillRect(0, 10, W, H - 10); g.fillStyle = dark; for (let x = 3; x < W; x += 6) g.fillRect(x, 10, 1, H - 10);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-6, 10, W + 12, 2);
    g.fillStyle = '#5a3a24'; g.fillRect(Math.floor(W / 2) - 22, 13, 44, 9); drawText(g, sign, Math.floor(W / 2) - Math.floor(textWidth(sign) / 2), 15, '#f4efe2');
    for (const x of [6, 20]) { windowAt(x, H - 22, 8, 10, false); windowAt(W - x - 8, H - 22, 8, 10, false); }
    doorAt(doorX, H - 16, 10, 16);
    g.fillStyle = '#a88a5a'; g.fillRect(-6, H, W + 12, 16); g.fillStyle = '#8a6a3a'; for (const k of [3, 7, 11, 15]) g.fillRect(-6, H + k, W + 12, 1);
  } else if (b.style === 'church') {
    g.fillStyle = '#6a6a70'; g.fillRect(0, 0, W, 10);
    g.fillStyle = paint; g.fillRect(0, 10, W, H - 10); g.fillStyle = 'rgba(43,36,24,0.12)'; for (let y = 14; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.fillStyle = paint; g.fillRect(4, -14, 16, H + 14); g.fillStyle = dark; g.fillRect(4, -14, 1, H + 14); g.fillRect(19, -14, 1, H + 14);
    g.fillStyle = '#6a6a70'; g.beginPath(); g.moveTo(3, -14); g.lineTo(12, -30); g.lineTo(21, -14); g.closePath(); g.fill();
    g.fillStyle = INK; g.fillRect(11, -34, 2, 5); g.fillRect(10, -33, 4, 1);
    windowAt(9, -8, 6, 8, true, '#8ab0c0');
    doorAt(Math.floor(W / 2) - 5, H - 17, 10, 17, '#5a3a24');
    for (let x = 30; x + 8 < W - 4; x += 16) if (x + 8 < Math.floor(W / 2) - 7 || x > Math.floor(W / 2) + 7) windowAt(x, H - 30, 8, 16, true, '#c0a0c8');
    g.fillStyle = '#efe4c8'; g.fillRect(24, 12, W - 30, 9); g.fillStyle = dark; g.fillRect(24, 12, W - 30, 1); g.fillRect(24, 20, W - 30, 1);
    drawText(g, sign, 24 + Math.floor((W - 30 - textWidth(sign)) / 2), 14, INK);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, H, W, 2);
  } else if (b.style === 'yard') {
    // An open lot: packed dirt, a stack of pipe, the spudder standing behind a board fence with a gate.
    g.fillStyle = shade(paint, 0.35); g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(43,36,24,0.12)'; for (let i = 0; i < 40; i++) g.fillRect((i * 37) % W, (i * 23) % (H - 14), 2, 1);
    g.fillStyle = '#7a7a72'; for (let i = 0; i < 3; i++) g.fillRect(4, 8 + i * 4, 26, 3);
    g.drawImage(prop('tower', 0, 1), W - 26, -12);
    g.fillStyle = dark; g.fillRect(0, H - 14, W, 14); g.fillStyle = paint; for (let x = 0; x < W; x += 4) g.fillRect(x, H - 14, 3, 14);
    g.fillStyle = '#efe4c8'; g.fillRect(doorX - 1, H - 12, 12, 10); g.fillStyle = dark; g.fillRect(doorX + 4, H - 12, 1, 10); g.fillRect(doorX - 1, H - 7, 12, 1);
    signBoard(2, H - 24, W - 4, '#efe4c8', INK);
  } else { // house
    g.fillStyle = '#7a5a4a'; g.beginPath(); g.moveTo(-2, 12); g.lineTo(Math.floor(W / 2), -8); g.lineTo(W + 2, 12); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = -4; y < 12; y += 4) g.fillRect(2, y, W - 4, 1);
    g.fillStyle = paint; g.fillRect(0, 12, W, H - 12); g.fillStyle = 'rgba(43,36,24,0.14)'; for (let y = 16; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.fillStyle = INK; g.fillRect(W - 10, -4, 4, 12);
    doorAt(Math.floor(W / 2) - 4, H - 14, 8, 14);
    windowAt(4, H - 24, 8, 8, false); windowAt(W - 12, H - 24, 8, 8, false);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, H, W, 2);
  }
  if (snow) { g.fillStyle = 'rgba(244,244,240,0.92)'; g.fillRect(-extraSide, -extraTop, W + extraSide * 2, 3); if (b.style === 'wood' || b.style === 'depot') g.fillRect(-extraSide, H, W + extraSide * 2, 2); }
  g = saved;
  return { canvas: c, ox: -extraSide, oy: -extraTop };
}

// ---------------- scene ----------------
function tileSolidFromBase(kind, tx, ty, out) {
  const p = PROPS[kind]; if (!p || !p.base.w) return;
  const x0 = Math.floor((tx * T + p.base.x) / T), x1 = Math.floor((tx * T + p.base.x + p.base.w - 1) / T);
  const y0 = Math.floor((ty * T + p.base.y) / T), y1 = Math.floor((ty * T + p.base.y + p.base.h - 1) / T);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) out[y * MAP_W + x] = 1;
}
function makeNpc(def, extra = false) {
  return { ...def, extra, px: def.x * T + 8, py: def.y * T + 14, hx: def.x * T + 8, hy: def.y * T + 14, dir: 'down', frame: 0, anim: 0, moving: false, wait: Math.random() * 2, tx: null, ty: null, stuck: 0, side: 1 };
}
function makeScene(state) {
  const data = syncData(state);
  const solid = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (MAP[y][x] === '~' || MAP[y][x] === 'T') solid[y * MAP_W + x] = 1;
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) solid[y * MAP_W + x] = 1;
  const props = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (MAP[y][x] === 'T') props.push({ kind: 'tree', x, y, tree: true });
  for (const p of PROP_LIST) { props.push({ ...p }); tileSolidFromBase(p.kind, p.x, p.y, solid); }
  const s = {
    seed: state.seed, solid, props, npcs: NPCS.map((n) => makeNpc(n)), extras: { npcs: [], props: [] }, snow: null, tiles: null, facades: new Map(),
    player: { px: SPAWN.x * T + 8, py: SPAWN.y * T + 14, dir: 'down', frame: 0, anim: 0, moving: false },
    cam: new Camera(), path: null, autoEnter: null, prompt: null, promptKey: '', t: 0, dynSolid: new Uint8Array(MAP_W * MAP_H), signs: {},
  };
  applyData(s, state, data);
  return s;
}
function applyData(s, state, data) {
  if (s.snow !== data.snow) { s.snow = data.snow; s.tiles = renderTiles(data.snow); s.facades.clear(); s.mini = null; }
  s.season = data.season;
  s.marks = data.marks || {};
  // replace the state-driven extras; keep positions of extras that persist between renders
  const keep = new Map(s.extras.npcs.map((n) => [n.id, n]));
  s.extras.npcs = data.npcs.map((n) => keep.get(n.id) || makeNpc(n, true));
  s.extras.props = data.props.map((p) => ({ ...p, extra: true }));
  s.dynSolid.fill(0);
  for (const p of s.extras.props) tileSolidFromBase(p.kind, p.x, p.y, s.dynSolid);
  for (const b of BUILDINGS) { const sign = typeof b.sign === 'function' ? b.sign(state) : (b.sign || ''); if (s.signs[b.key] !== sign) { s.signs[b.key] = sign; s.facades.delete(b.key); } }
}
const isSolid = (tx, ty) => tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || sc.solid[ty * MAP_W + tx] === 1 || sc.dynSolid[ty * MAP_W + tx] === 1;
function boxHits(x, y, hw = 4, hh = 5) {
  const x0 = Math.floor((x - hw) / T), x1 = Math.floor((x + hw - 1) / T), y0 = Math.floor((y - hh) / T), y1 = Math.floor((y - 1) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(tx, ty)) return true;
  return false;
}
function moveEntity(e, dx, dy) {
  let moved = false;
  if (dx) { const nx = e.px + dx; if (!boxHits(nx, e.py)) { e.px = nx; moved = true; } }
  if (dy) { const ny = e.py + dy; if (!boxHits(e.px, ny)) { e.py = ny; moved = true; } }
  return moved;
}
const facing = (dx, dy, cur) => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy ? (dy < 0 ? 'up' : 'down') : cur);
const tileOf = (e) => ({ x: Math.floor(e.px / T), y: Math.floor((e.py - 3) / T) });
const centreOf = (tx, ty) => ({ x: tx * T + 8, y: ty * T + 12 });

// Breadth-first path over walkable tiles; if the target is solid, walks to the nearest open tile.
function bfs(from, to) {
  const key = (x, y) => y * MAP_W + x;
  const open = (x, y) => !isSolid(x, y);
  if (!open(to.x, to.y)) {
    let best = null, bd = 1e9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = to.x + dx, y = to.y + dy; if (open(x, y)) { const d = Math.abs(dx) + Math.abs(dy); if (d < bd) { bd = d; best = { x, y }; } } }
    if (!best) return null; to = best;
  }
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const q = [key(from.x, from.y)]; prev[q[0]] = q[0];
  const goal = key(to.x, to.y);
  for (let i = 0; i < q.length && i < 4000; i++) {
    const k = q[i]; if (k === goal) break;
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!open(nx, ny)) continue; const nk = key(nx, ny); if (prev[nk] !== -1) continue; prev[nk] = k; q.push(nk); }
  }
  if (prev[goal] === -1) return null;
  const path = []; let k = goal;
  while (k !== key(from.x, from.y)) { path.push(centreOf(k % MAP_W, Math.floor(k / MAP_W))); k = prev[k]; if (path.length > 2000) return null; }
  return path.reverse();
}

// ---------------- update ----------------
function updateNpc(n, dt) {
  n.wait -= dt;
  if (n.tx === null && n.wait <= 0) {
    if (n.march) { n.side = -n.side; n.tx = n.hx + n.side * 28; n.ty = n.hy; }
    else { const a = Math.random() * Math.PI * 2, r = Math.random() * n.radius; n.tx = Math.round(n.hx + Math.cos(a) * r); n.ty = Math.round(n.hy + Math.sin(a) * r * 0.6); }
    n.stuck = 0;
  }
  if (n.tx !== null) {
    const dx = n.tx - n.px, dy = n.ty - n.py, d = Math.hypot(dx, dy);
    if (d < 1.5) { n.tx = null; n.wait = n.march ? 0.4 : 1.5 + Math.random() * 3; n.moving = false; }
    else {
      const sp = n.speed || 24;
      const ok = moveEntity(n, (dx / d) * sp * dt, (dy / d) * sp * dt);
      n.dir = facing(dx, dy, n.dir); n.moving = true;
      if (!ok) { n.stuck += dt; if (n.stuck > 0.4) { n.tx = null; n.wait = 0.5; n.moving = false; } }
    }
  }
  if (n.moving) { n.anim += dt * NPC_ANIM; n.frame = [0, 1, 0, 2][Math.floor(n.anim) % 4]; } else { n.anim = 0; n.frame = 0; }
}
function allNpcs() { return sc.npcs.concat(sc.extras.npcs); }
function allProps() { return sc.props.concat(sc.extras.props); }

function updatePrompt() {
  const p = sc.player;
  let best = null, bd = 1e9;
  for (const b of BUILDINGS) {
    if (b.enterable === false) continue;
    const d = doorOf(b), dx = d.x * T + 8 - p.px, dy = d.y * T + 8 - p.py, dist = Math.hypot(dx, dy);
    if (dist < 20 && dist < bd) { bd = dist; best = { kind: 'enter', key: b.key, label: `ENTER ${b.sign === undefined ? b.name : (typeof b.sign === 'function' ? 'OFFICE' : b.sign)}`, text: `Enter ${b.key === 'office' ? (sc.signs.office === 'FOR RENT' ? 'the rooms to let' : 'your office') : b.name}` }; }
  }
  for (const n of allNpcs()) {
    if (!n.talk) continue;
    const dist = Math.hypot(n.px - p.px, n.py - p.py);
    if (dist < 24 && dist < bd) { bd = dist; best = { kind: 'talk', talk: n.talk, name: n.name, label: `TALK: ${n.name}`, text: `Talk to ${n.name}` }; }
  }
  const t = tileOf(p);
  if (!best && MAP[t.y] && MAP[t.y][t.x] === 'E') best = { kind: 'exit', label: 'OUT TO THE LEASES', text: 'Walk out to the leases' };
  const key = best ? `${best.kind}:${best.key || best.talk || ''}` : '';
  if (key !== sc.promptKey) {
    sc.promptKey = key; sc.prompt = best;
    const el = document.getElementById('prompt');
    if (el) { el.hidden = !best; if (best) el.textContent = best.text; }
  }
}
function update(dt) {
  sc.t += dt;
  const p = sc.player;
  const ax = moveAxis();
  let vx = 0, vy = 0;
  if (ax.x || ax.y) { sc.path = null; sc.autoEnter = null; const n = Math.hypot(ax.x, ax.y); vx = (ax.x / n) * SPEED; vy = (ax.y / n) * SPEED; }
  else if (sc.path && sc.path.length) {
    const w = sc.path[0], dx = w.x - p.px, dy = w.y - p.py, d = Math.hypot(dx, dy);
    if (d < 1.5) { p.px = w.x; p.py = w.y; sc.path.shift(); if (!sc.path.length) pathDone(); }
    else { vx = (dx / d) * SPEED; vy = (dy / d) * SPEED; }
  }
  if (vx || vy) {
    const ok = moveEntity(p, vx * dt, vy * dt);
    p.dir = facing(vx, vy, p.dir); p.moving = true;
    if (!ok && sc.path) { sc.stuck = (sc.stuck || 0) + dt; if (sc.stuck > 0.6) { sc.path = null; sc.autoEnter = null; sc.stuck = 0; } } else sc.stuck = 0;
    p.anim += dt * 8; p.frame = [0, 1, 0, 2][Math.floor(p.anim) % 4];
  } else { p.moving = false; p.anim = 0; p.frame = 0; }
  for (const n of allNpcs()) updateNpc(n, dt);
  const vw = canvas.width / dpr / scale, vh = canvas.height / dpr / scale;
  sc.cam.aim(p.px, p.py - 8, vw, vh, WORLD_W, WORLD_H); sc.cam.step(dt);
  updatePrompt();
}
function pathDone() {
  const key = sc.autoEnter; sc.autoEnter = null;
  if (!key) return;
  updatePrompt();
  if (sc.prompt && sc.prompt.kind === 'enter' && sc.prompt.key === key) setTimeout(() => { if (active && sc && sc.prompt && sc.prompt.key === key) enterBuilding(key); }, 0);
}

// ---------------- draw ----------------
function drawBubble(text, x, y) {
  const w = textWidth(text) + 6, h = 9;
  const bx = Math.round(x - w / 2), by = Math.round(y);
  g.fillStyle = 'rgba(27,24,18,0.85)'; g.fillRect(bx - 1, by - 1, w + 2, h + 2);
  g.fillStyle = '#f7f0dd'; g.fillRect(bx, by, w, h);
  g.fillRect(Math.round(x) - 1, by + h, 3, 1); g.fillRect(Math.round(x), by + h + 1, 1, 1);
  drawText(g, text, bx + 3, by + 2, INK);
}
function draw() {
  const W = canvas.width / dpr, H = canvas.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#2f4a2d'; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  const cx = sc.cam.ix, cy = sc.cam.iy;
  g.setTransform(dpr * scale, 0, 0, dpr * scale, -cx * dpr * scale, -cy * dpr * scale);
  g.drawImage(sc.tiles, 0, 0);
  const ents = [];
  for (const b of BUILDINGS) {
    let f = sc.facades.get(b.key); if (!f) { f = buildFacade(b, sc.signs[b.key] || '', sc.snow); sc.facades.set(b.key, f); }
    ents.push({ y: (b.y + b.h) * T + 6, draw: () => g.drawImage(f.canvas, b.x * T + f.ox, b.y * T + f.oy) });
  }
  for (const p of allProps()) {
    const def = PROPS[p.kind]; if (!def) continue;
    const frame = p.kind === 'pumpjack' ? Math.floor(sc.t * 1.6) % 2 : 0;
    const img = prop(p.tree && sc.snow ? 'treeSnow' : p.kind, frame, 1, p.pal || null);
    const px = p.x * T + (p.tree ? 0 : 0), py = p.y * T + (p.tree ? -8 : 0);
    ents.push({ y: py + def.base.y + def.base.h, draw: () => { g.drawImage(img, px, py); if (p.label) drawBubble(p.label, px + def.w / 2, py - 12); } });
  }
  for (const n of allNpcs()) ents.push({ y: n.py, draw: () => { g.drawImage(compile(n.sprite, n.dir, n.frame, n.name, 1), Math.round(n.px) - 6, Math.round(n.py) - 16); if (n.talk && sc.prompt?.kind === 'talk' && sc.prompt.name === n.name) { g.fillStyle = '#a8322a'; g.fillRect(Math.round(n.px) - 1, Math.round(n.py) - 21 + Math.round(Math.sin(sc.t * 6)), 2, 3); } } });
  const p = sc.player;
  ents.push({ y: p.py, draw: () => g.drawImage(compile('ceo', p.dir, p.frame, C.state?.company?.name || 'you', 1), Math.round(p.px) - 6, Math.round(p.py) - 16) });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.draw();
  for (const b of BUILDINGS) { const mk = sc.marks && sc.marks[b.key]; if (mk) { const f = sc.facades.get(b.key); drawBubble(mk, b.x * T + (b.w * T) / 2, b.y * T + (f ? f.oy : 0) - 14 + Math.round(Math.sin(sc.t * 3) * 1.5)); } }
  if (sc.prompt) drawBubble(sc.prompt.label, p.px, p.py - 30);
  if (sc.path && sc.path.length) { const w = sc.path[sc.path.length - 1]; g.fillStyle = 'rgba(168,50,42,0.7)'; g.fillRect(w.x - 2, w.y - 2, 4, 1); g.fillRect(w.x - 2, w.y + 1, 4, 1); g.fillRect(w.x - 2, w.y - 1, 1, 2); g.fillRect(w.x + 1, w.y - 1, 1, 2); }
  drawMini();
}

// ---------------- minimap ----------------
// 2 px per tile, cached: the tiles scaled down plus a block per building. Drawn in screen space in the
// top-right corner with the camera's view rectangle, the founders' bubbles, and the player as a red dot.
const MINI = 2, MINI_SCALE = 2, MINI_PAD = 10;
function buildMini() {
  const c = document.createElement('canvas'); c.width = MAP_W * MINI; c.height = MAP_H * MINI;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.drawImage(sc.tiles, 0, 0, c.width, c.height);
  for (const b of BUILDINGS) {
    x.fillStyle = b.paint || '#b89a6a'; x.fillRect(b.x * MINI, b.y * MINI, b.w * MINI, b.h * MINI);
    x.fillStyle = 'rgba(27,24,18,0.55)'; x.fillRect(b.x * MINI, (b.y + b.h) * MINI - 1, b.w * MINI, 1);
  }
  return c;
}
// Screen rectangle (CSS px) the minimap occupies; null when the stage is too small for it.
function miniRect() {
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const mw = MAP_W * MINI * MINI_SCALE, mh = MAP_H * MINI * MINI_SCALE;
  if (W < mw * 2.2 || H < mh * 2.5) return null;
  return { x: W - mw - MINI_PAD, y: MINI_PAD, w: mw, h: mh };
}
function drawMini() {
  const r = miniRect(); if (!r) return;
  if (!sc.mini) sc.mini = buildMini();
  const k = MINI * MINI_SCALE;                        // screen px per tile
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = 'rgba(27,24,18,0.75)'; g.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8 + 13);
  g.fillStyle = '#f7f0dd'; g.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4 + 13);
  g.drawImage(sc.mini, r.x, r.y, r.w, r.h);
  // the view
  const vw = canvas.width / dpr / scale, vh = canvas.height / dpr / scale;
  g.strokeStyle = 'rgba(247,240,221,0.95)'; g.lineWidth = 1;
  g.strokeRect(r.x + (sc.cam.ix / T) * k + 0.5, r.y + (sc.cam.iy / T) * k + 0.5, (vw / T) * k - 1, (vh / T) * k - 1);
  // founders waiting (gold), the player (red, blinking)
  for (const b of BUILDINGS) if (sc.marks && sc.marks[b.key]) { g.fillStyle = '#e0c040'; g.fillRect(r.x + (b.x + b.w / 2) * k - 2, r.y + (b.y + b.h / 2) * k - 2, 4, 4); }
  const p = sc.player;
  if (Math.floor(sc.t * 3) % 2 === 0) { g.fillStyle = '#a8322a'; g.fillRect(r.x + (p.px / T) * k - 2, r.y + (p.py / T) * k - 2, 4, 4); }
  g.fillStyle = '#f7f0dd'; g.fillRect(r.x + (p.px / T) * k - 1, r.y + (p.py / T) * k - 1, 2, 2);
  drawText(g, 'DRY FORK', r.x + 2, r.y + r.h + 4, INK, 2);
}
// A click on the minimap walks there (to the door, if it is a building).
function miniClick(cx, cy) {
  const r = miniRect(); if (!r || cx < r.x || cy < r.y || cx >= r.x + r.w || cy >= r.y + r.h) return false;
  const k = MINI * MINI_SCALE;
  const tx = Math.floor((cx - r.x) / k), ty = Math.floor((cy - r.y) / k);
  const b = BUILDINGS.find((b) => tx >= b.x && tx < b.x + b.w && ty >= b.y - 1 && ty <= b.y + b.h);
  const path = bfs(tileOf(sc.player), b ? doorOf(b) : { x: tx, y: ty });
  if (path) { sc.path = path; sc.autoEnter = b && b.enterable !== false ? b.key : null; sc.stuck = 0; }
  return true;
}

// ---------------- interaction ----------------
function enterBuilding(key) {
  if (key === 'office') C.goto('office');
  else C.goto('interior', { place: key });
}
function defaultParcel(state, ui) {
  if (ui.selected !== null && ui.selected !== undefined && state.parcels[ui.selected]) return ui.selected;
  const mine = state.parcels.find((p) => p.mineral.leasedBy === 'player');
  if (mine) return mine.id;
  const town = state.parcels.find((p) => p.surface.type === 'town') || state.parcels[0];
  const east = state.parcels.find((p) => p.y === town.y && p.x === town.x + 1) || state.parcels.find((p) => p.drillable);
  return east.id;
}
export function interact(ctx) {
  const pr = sc?.prompt; if (!pr) return false;
  if (pr.kind === 'enter') enterBuilding(pr.key);
  else if (pr.kind === 'exit') ctx.goto('field', { selected: defaultParcel(ctx.state, ctx.ui) });
  else if (pr.kind === 'talk') ctx.openTalk(pr.talk, { npc: pr.name });
  return true;
}
export function onKey(e, ctx) {
  if (MOVE_CODES.has(e.code)) return true; // movement is read from the key set each frame; swallow so the page never scrolls
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') { interact(ctx); return true; }
  return false;
}
function onClick(ev) {
  if (!sc || !active) return;
  const r = canvas.getBoundingClientRect();
  if (miniClick(ev.clientX - r.left, ev.clientY - r.top)) return;
  const wx = (ev.clientX - r.left) / scale + sc.cam.ix, wy = (ev.clientY - r.top) / scale + sc.cam.iy;
  const p = sc.player;
  const n = allNpcs().find((n) => n.talk && Math.abs(wx - n.px) < 8 && wy > n.py - 18 && wy < n.py + 3);
  if (n && Math.hypot(n.px - p.px, n.py - p.py) < 26) { C.openTalk(n.talk, { npc: n.name }); return; }
  const b = BUILDINGS.find((b) => wx >= b.x * T && wx < (b.x + b.w) * T && wy >= b.y * T - 24 && wy < (b.y + b.h + 1) * T);
  const target = b ? doorOf(b) : { x: Math.floor(wx / T), y: Math.floor(wy / T) };
  const path = bfs(tileOf(p), target);
  if (path) { sc.path = path; sc.autoEnter = b && b.enterable !== false ? b.key : null; sc.stuck = 0; }
}
function resize() {
  if (!canvas) return;
  const st = canvas.parentElement.getBoundingClientRect();
  scale = st.width < 900 ? 2 : 3;
  dpr = sizeCanvas(canvas, st.width, st.height);
  if (sc) sc.cam.snapNext = true;
}

// ---------------- screen API ----------------
export function enter(ctx, opts = {}) {
  C = ctx; canvas = document.getElementById('overworld'); g = canvas.getContext('2d');
  const state = ctx.state;
  if (!sc || sc.seed !== state.seed) sc = makeScene(state); else applyData(sc, state, syncData(state));
  const from = opts.from ? buildingByKey(opts.from) : null;
  if (from || opts.spawn) { const d = from ? doorOf(from) : spawnAt(typeof opts.spawn === 'string' ? opts.spawn : null); sc.player.px = d.x * T + 8; sc.player.py = d.y * T + 14; sc.player.dir = 'down'; }
  sc.path = null; sc.autoEnter = null; sc.promptKey = ''; sc.prompt = null; sc.cam.snapNext = true;
  active = true;
  resize(); window.addEventListener('resize', resize); canvas.addEventListener('click', onClick);
  startLoop(update, draw);
}
export function exit() {
  active = false; stopLoop();
  window.removeEventListener('resize', resize);
  if (canvas) canvas.removeEventListener('click', onClick);
  const el = document.getElementById('prompt'); if (el) el.hidden = true;
  keys.clear();
}
// Called by render() on the town screen: refresh the state-driven extras without touching positions.
export function sync(state) {
  if (!sc) return;
  if (sc.seed !== state.seed) { sc = makeScene(state); sc.cam.snapNext = true; return; }
  applyData(sc, state, syncData(state));
}
export const townScene = () => sc;
