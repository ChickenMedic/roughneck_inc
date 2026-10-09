// Hand-drawn 1950s county plat map as an SVG string. Pure function of (state, ui): no DOM access,
// so it can be rendered in Node for tests. Static layers (paper, terrain, water, roads, section
// lines, labels) are memoised by seed; ownership, structures, wells and selection are rebuilt each call.
import { makeRng, hashStr } from '../rng.js';
import { esc, dateStr } from '../util.js';
import { GRID_W, GRID_H, OWNER_TYPES } from '../data.js';
import { generateGeography, riverPath } from '../geography.js';

export const VIEW_W = 1520, VIEW_H = 1180;
const OX = 60, OY = 110, S = 100;
const px = (x) => OX + x * S, py = (y) => OY + y * S;
const f1 = (v) => Math.round(v * 10) / 10;

const INK = '#2b2418', INK2 = '#5a4d38', PAPER = '#efe4c8', PAPER2 = '#e6d7b3', BLUE = '#2f4f7f', RED = '#a8322a', GREEN = '#4b6b3a', GOLD = '#b58a2f';
const PLAYER_COLOR = '#3f7a4d';

const SNAKE = (x, y) => y * GRID_W + (y % 2 === 0 ? GRID_W - x : x + 1); // PLSS-style boustrophedon numbering

// Slightly wobbly line: a quadratic with a jittered control point.
function wline(x1, y1, x2, y2, R, amt = 1.2) {
  const mx = (x1 + x2) / 2 + R.rand(-amt, amt), my = (y1 + y2) / 2 + R.rand(-amt, amt);
  return `M${f1(x1 + R.rand(-0.6, 0.6))} ${f1(y1 + R.rand(-0.6, 0.6))}Q${f1(mx)} ${f1(my)} ${f1(x2 + R.rand(-0.6, 0.6))} ${f1(y2 + R.rand(-0.6, 0.6))}`;
}
const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(px(p.x))} ${f1(py(p.y))}`).join('');

// Split a name into at most two lines for a 100px-wide parcel.
function twoLines(name) {
  if (name.length <= 13) return [name];
  const i = name.lastIndexOf(' ', 14);
  if (i < 3) return [name.slice(0, 13), name.slice(13)];
  return [name.slice(0, i), name.slice(i + 1)];
}

// ---------------- defs ----------------
function defs(seed) {
  return `<defs>
  <filter id="pm-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed % 977}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.14  0 0 0 0.22 0"/></filter>
  <filter id="pm-wobble" x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${(seed >> 3) % 977}" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter>
  <radialGradient id="pm-stain" r="0.5"><stop offset="70%" stop-color="#8b6a2e" stop-opacity="0"/><stop offset="88%" stop-color="#8b6a2e" stop-opacity="0.16"/><stop offset="100%" stop-color="#8b6a2e" stop-opacity="0"/></radialGradient>
  <symbol id="s-house" viewBox="0 0 12 10"><path d="M1 5L6 1L11 5V9H1Z" fill="${PAPER2}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/><rect x="8" y="1.6" width="1.4" height="2.6" fill="${INK}"/><rect x="5" y="6" width="2" height="3" fill="${INK}"/></symbol>
  <symbol id="s-barn" viewBox="0 0 14 10"><path d="M1 4.5L7 1L13 4.5V9H1Z" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/><path d="M4 9V5.5H10V9" fill="none" stroke="${INK}" stroke-width="0.7"/></symbol>
  <symbol id="s-tree" viewBox="0 0 10 12"><path d="M5 1C7.5 1 8.8 3 8.6 5.2C8.4 7.6 6.8 8.6 5 8.6C3.2 8.6 1.6 7.6 1.4 5.2C1.2 3 2.5 1 5 1Z" fill="none" stroke="${INK}" stroke-width="0.9"/><path d="M5 8.6V12M4 10.5L5 9.5L6 10.5" stroke="${INK}" stroke-width="0.9" fill="none"/></symbol>
  <symbol id="s-pine" viewBox="0 0 10 12"><path d="M5 0.5L8.5 5H6.8L9.5 9H5.6V12H4.4V9H0.5L3.2 5H1.5Z" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/></symbol>
  <symbol id="s-tuft" viewBox="0 0 10 6"><path d="M1 6L3 1.5M5 6V0M9 6L7 1.5M3.2 6L4 3M6.8 6L6 3" stroke="${INK}" stroke-width="0.7" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="s-cow" viewBox="0 0 12 8"><path d="M2 7V4Q2 2 4 2H9Q11 2 11 4V7M4 7V5M9 7V5M2 3L1 2M11 3L12 2" stroke="${INK}" stroke-width="0.8" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="s-derrick" viewBox="0 0 12 24"><path d="M1 23L4.5 1H7.5L11 23M2.2 16H9.8M3.1 10.5H8.9M4 5.5H8M1 23H11" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M2.2 16L9.8 10.5M9.8 16L2.2 10.5M3.1 10.5L8.9 5.5M8.9 10.5L3.1 5.5" stroke="currentColor" stroke-width="0.6"/></symbol>
  <symbol id="s-well-loc" viewBox="-6 -6 12 12"><circle r="4" fill="${PAPER}" stroke="currentColor" stroke-width="1.3"/></symbol>
  <symbol id="s-well-oil" viewBox="-6 -6 12 12"><circle r="4.2" fill="currentColor"/></symbol>
  <symbol id="s-well-shutin" viewBox="-6 -6 12 12"><circle r="4" fill="${PAPER}" stroke="currentColor" stroke-width="1.3"/><path d="M0 -4A4 4 0 0 1 0 4Z" fill="currentColor"/></symbol>
  <symbol id="s-well-dry" viewBox="-6 -6 12 12"><circle r="3.2" fill="${PAPER}" stroke="currentColor" stroke-width="1.2"/><path d="M-2.3 -2.3L-5 -5M2.3 -2.3L5 -5M-2.3 2.3L-5 5M2.3 2.3L5 5" stroke="currentColor" stroke-width="1.2"/></symbol>
  <symbol id="s-well-plugged" viewBox="-6 -6 12 12"><circle r="3.2" fill="currentColor"/><path d="M-2.3 -2.3L-5 -5M2.3 -2.3L5 -5M-2.3 2.3L-5 5M2.3 2.3L5 5" stroke="currentColor" stroke-width="1.2"/></symbol>
  <symbol id="s-well-gas" viewBox="-6 -6 12 12"><circle r="3" fill="${PAPER}" stroke="currentColor" stroke-width="1.2"/><path d="M0 -3V-6M0 3V6M-3 0H-6M3 0H6" stroke="currentColor" stroke-width="1.2"/></symbol>
  <symbol id="s-well-blowout" viewBox="-7 -7 14 14"><path d="M0 -6.5L1.6 -2.2L6 -3.5L3 0L6 3.5L1.6 2.2L0 6.5L-1.6 2.2L-6 3.5L-3 0L-6 -3.5L-1.6 -2.2Z" fill="${RED}" stroke="${INK}" stroke-width="0.6"/></symbol>
  </defs>`;
}

// ---------------- static layers ----------------
function paper(seed) {
  const R = makeRng(hashStr(`${seed}:paper`));
  const stains = [];
  for (let i = 0; i < 2; i++) {
    const cx = R.rand(200, VIEW_W - 200), cy = R.rand(150, VIEW_H - 150), r = R.rand(40, 90);
    stains.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="url(#pm-stain)"/>`);
  }
  return `<g class="paper"><rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="${PAPER}"/>
  <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" filter="url(#pm-grain)" opacity="0.9"/>
  ${stains.join('')}
  <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" fill="none" stroke="#b9a67d" stroke-width="18" opacity="0.35"/></g>`;
}

function terrain(state, geo) {
  const town = state.parcels.find((p) => p.surface.type === 'town');
  let g = '';
  for (const p of state.parcels) {
    const R = makeRng(hashStr(`${state.seed}:terrain:${p.id}`));
    const x = px(p.x), y = py(p.y), t = p.surface.type;
    let s = '';
    const use = (id, ux, uy, w, h, extra = '') => `<use href="#${id}" x="${f1(ux)}" y="${f1(uy)}" width="${w}" height="${h}" ${extra}/>`;
    if (t === 'farmer') {
      const vert = R.chance(0.5), n = R.randInt(5, 7);
      s += `<g opacity="0.32" stroke="${INK}" stroke-width="0.8" fill="none">`;
      for (let i = 0; i < n; i++) {
        const o = 18 + (i / (n - 1)) * 40 + R.rand(-2, 2);
        s += vert ? `<path d="${wline(x + o, y + 30, x + o, y + 90, R, 1.5)}"/>` : `<path d="${wline(x + 10, y + 30 + (o - 18) * 1.4, x + 70, y + 30 + (o - 18) * 1.4, R, 1.5)}"/>`;
      }
      s += `</g>`;
      s += use('s-barn', x + 70 + R.rand(-8, 6), y + 34 + R.rand(-4, 4), 15, 11) + use('s-house', x + 76 + R.rand(-6, 6), y + 62 + R.rand(-4, 8), 12, 10);
    } else if (t === 'rancher') {
      const n = R.randInt(7, 11);
      s += `<g opacity="0.55">`;
      for (let i = 0; i < n; i++) s += use('s-tuft', x + R.rand(8, 86), y + R.rand(24, 90), 11, 7);
      s += `</g>`;
      if (R.chance(0.6)) s += use('s-cow', x + R.rand(15, 70), y + R.rand(45, 85), 12, 8);
      s += use('s-house', x + R.rand(60, 78), y + R.rand(36, 48), 12, 10);
      // a stretch of fence along one edge
      const fy = y + 96 - R.rand(0, 2);
      s += `<g stroke="${INK}" stroke-width="0.7" opacity="0.45"><path d="${wline(x + 8, fy, x + 92, fy, R, 0.6)}" fill="none"/>${[...Array(6)].map((_, i) => `<path d="M${f1(x + 12 + i * 15)} ${f1(fy - 3)}v5"/>`).join('')}</g>`;
    } else if (t === 'homes') {
      const ox = x + 14, oy = y + 34;
      s += `<path d="${wline(ox - 4, oy + 14, ox + 70, oy + 14, R, 0.6)}" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.6"/>`;
      s += `<path d="${wline(ox - 4, oy + 40, ox + 70, oy + 40, R, 0.6)}" stroke="${INK}" stroke-width="0.9" fill="none" opacity="0.6"/>`;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) s += use('s-house', ox + c * 17 + R.rand(-1, 1), oy + r * 26 + (r ? 18 : 0) + R.rand(-1, 1), 11, 9);
    } else if (t === 'preserve') {
      const n = R.randInt(12, 16);
      for (let i = 0; i < n; i++) s += use(R.chance(0.5) ? 's-tree' : 's-pine', x + R.rand(6, 86), y + R.rand(22, 86), 11, 13);
      s += `<path d="M${f1(x + 30)} ${f1(y + 70)}c8 -8 24 -8 34 -2c8 5 4 12 -8 12c-14 0 -30 -2 -26 -10z" fill="${BLUE}" opacity="0.18"/>`;
    } else if (t === 'state' || t === 'federal') {
      const n = R.randInt(3, 5);
      s += `<g opacity="0.45">`;
      for (let i = 0; i < n; i++) s += use('s-tuft', x + R.rand(8, 86), y + R.rand(56, 90), 11, 7);
      s += `</g>`;
    } else if (t === 'town') {
      // street grid
      s += `<g stroke="${INK}" stroke-width="1" fill="none" opacity="0.8">`;
      for (const o of [30, 52, 74]) s += `<path d="M${f1(x + o)} ${f1(y + 8)}V${f1(y + 92)}"/><path d="M${f1(x + 8)} ${f1(y + o)}H${f1(x + 92)}"/>`;
      s += `</g>`;
      const bx = [12, 36, 58, 80], by = [12, 36, 58, 80];
      for (const ax of bx) for (const ay of by) {
        if (R.chance(0.25)) continue;
        s += `<rect x="${f1(x + ax + R.rand(0, 3))}" y="${f1(y + ay + R.rand(0, 3))}" width="${f1(R.rand(9, 13))}" height="${f1(R.rand(7, 11))}" fill="${PAPER2}" stroke="${INK}" stroke-width="0.8"/>`;
      }
      // church + water tower
      s += `<path d="M${f1(x + 22)} ${f1(y + 40)}l4 -6l4 6M${f1(x + 26)} ${f1(y + 34)}v-5M${f1(x + 24)} ${f1(y + 31)}h4" stroke="${INK}" stroke-width="0.9" fill="none"/>`;
      s += `<path d="M${f1(x + 88)} ${f1(y + 22)}m-4 0h8l-1 5h-6zM${f1(x + 85)} ${f1(y + 27)}l-1 9M${f1(x + 91)} ${f1(y + 27)}l1 9" stroke="${INK}" stroke-width="0.9" fill="none"/>`;
    }
    if (s) g += `<g class="tp tp-${t}">${s}</g>`;
  }
  return `<g class="terrain">${g}</g>`;
}

function water(state, geo) {
  const dense = riverPath(geo);
  const d = pathOf(dense);
  return `<g class="water"><defs><path id="pm-riverpath" d="${d}"/></defs>
  <use href="#pm-riverpath" fill="none" stroke="${BLUE}" stroke-width="16" stroke-opacity="0.12" stroke-linejoin="round" stroke-linecap="round"/>
  <use href="#pm-riverpath" fill="none" stroke="${BLUE}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round" stroke-linecap="round"/>
  <use href="#pm-riverpath" fill="none" stroke="${BLUE}" stroke-width="1.4" stroke-opacity="0.9" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="14 5"/>
  <text class="hand river-label" font-size="24" fill="${BLUE}" dy="-9"><textPath href="#pm-riverpath" startOffset="24%">${esc(geo.names?.river || 'Coyote Creek')}</textPath></text>
  <text class="hand river-label" font-size="20" fill="${BLUE}" dy="-8"><textPath href="#pm-riverpath" startOffset="70%">${esc(geo.names?.river || 'Coyote Creek')}</textPath></text></g>`;
}

function roadLabels(geo) {
  // Cumulative length along the road polyline; label the middle of the two longest horizontal stretches.
  const segs = []; let acc = 0;
  for (let i = 0; i < geo.road.length - 1; i++) { const a = geo.road[i], b = geo.road[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y); segs.push({ start: acc, len, horiz: Math.abs(a.y - b.y) < 1e-9 }); acc += len; }
  const name = esc(geo.names?.road || 'COUNTY ROAD').toUpperCase();
  return segs.filter((s) => s.horiz && s.len >= 2.5).sort((a, b) => b.len - a.len).slice(0, 2)
    .map((s) => `<text class="type" font-size="11" fill="${INK}" letter-spacing="1.5" dy="-6" text-anchor="middle"><textPath href="#pm-roadpath" startOffset="${f1((s.start + s.len / 2) * S)}">${name}</textPath></text>`).join('');
}
function roadsRail(state, geo) {
  const rd = pathOf(geo.road), rl = pathOf(geo.rail);
  let g = `<g class="roads"><defs><path id="pm-roadpath" d="${rd}"/><path id="pm-railpath" d="${rl}"/></defs>
  <use href="#pm-roadpath" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
  <use href="#pm-roadpath" fill="none" stroke="${PAPER}" stroke-width="4" stroke-linejoin="round"/>
  ${roadLabels(geo)}
  <use href="#pm-railpath" fill="none" stroke="${INK}" stroke-width="11" stroke-dasharray="1.6 8"/>
  <use href="#pm-railpath" fill="none" stroke="${INK}" stroke-width="2.2"/>
  <text class="type" font-size="11" fill="${INK}" letter-spacing="1.5" dy="-8"><textPath href="#pm-railpath" startOffset="8%">${esc(geo.names?.rail || 'RAILROAD').toUpperCase()}</textPath></text>
  <text class="type" font-size="11" fill="${INK}" letter-spacing="1.5" dy="-8"><textPath href="#pm-railpath" startOffset="62%">${esc(geo.names?.rail || 'RAILROAD').toUpperCase()}</textPath></text>`;
  // bridge
  if (geo.bridge) {
    const b = geo.bridge;
    const seg = geo.road.findIndex((p, i) => i < geo.road.length - 1 && Math.abs((p.x - b.x) * (geo.road[i + 1].y - b.y) - (p.y - b.y) * (geo.road[i + 1].x - b.x)) < 1e-3 && b.x >= Math.min(p.x, geo.road[i + 1].x) - 1e-6 && b.x <= Math.max(p.x, geo.road[i + 1].x) + 1e-6 && b.y >= Math.min(p.y, geo.road[i + 1].y) - 1e-6 && b.y <= Math.max(p.y, geo.road[i + 1].y) + 1e-6);
    const vertical = seg >= 0 && Math.abs(geo.road[seg].x - geo.road[seg + 1].x) < 1e-6;
    g += `<g transform="translate(${f1(px(b.x))} ${f1(py(b.y))}) rotate(${vertical ? 90 : 0})"><rect x="-13" y="-7" width="26" height="14" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/><path d="M-13 -7L-17 -12M13 -7L17 -12M-13 7L-17 12M13 7L17 12" stroke="${INK}" stroke-width="1.6"/><path d="M-13 0H13" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3"/></g>`;
  }
  if (geo.railBridge) {
    const b = geo.railBridge, a = Math.atan2(geo.rail[1].y - geo.rail[0].y, geo.rail[1].x - geo.rail[0].x) * 180 / Math.PI;
    g += `<g transform="translate(${f1(px(b.x))} ${f1(py(b.y))}) rotate(${f1(a)})"><path d="M-14 -7H14M-14 7H14" stroke="${INK}" stroke-width="1.6"/><path d="M-14 -7L-14 7M-7 -7L0 7M0 -7L7 7M7 -7L14 7M14 -7V7" stroke="${INK}" stroke-width="0.8"/></g>`;
  }
  // depot
  const d = geo.depot;
  g += `<g transform="translate(${f1(px(d.x))} ${f1(py(d.y))})"><rect x="-11" y="-5" width="22" height="10" fill="${PAPER2}" stroke="${INK}" stroke-width="1.1"/><text class="type" font-size="7" fill="${INK}" text-anchor="middle" y="2.6" letter-spacing="0.5">DEPOT</text></g>`;
  return g + `</g>`;
}

function sectionLines(state) {
  const R = makeRng(hashStr(`${state.seed}:lines`));
  let g = `<g class="sections" fill="none" stroke="${INK}" stroke-width="1" opacity="0.75">`;
  for (let x = 0; x <= GRID_W; x++) g += `<path d="${wline(px(x), py(0), px(x), py(GRID_H), R, 1.8)}"/>`;
  for (let y = 0; y <= GRID_H; y++) g += `<path d="${wline(px(0), py(y), px(GRID_W), py(y), R, 1.8)}"/>`;
  g += `</g><rect x="${OX}" y="${OY}" width="${GRID_W * S}" height="${GRID_H * S}" fill="none" stroke="${INK}" stroke-width="2.6"/>`;
  // section numbers (PLSS snake)
  g += `<g class="secnum type" font-size="10" fill="${INK}" opacity="0.7">`;
  for (const p of state.parcels) g += `<text x="${px(p.x) + 5}" y="${py(p.y) + 13}">${SNAKE(p.x, p.y)}</text>`;
  g += `</g>`;
  return g;
}

// Public land gets a pale wash so the sections you can only win at auction read at a glance.
function publicWash(state) {
  let g = `<g class="publicwash">`;
  for (const p of state.parcels) {
    const t = p.surface.type;
    if (t === 'state') g += `<rect x="${px(p.x) + 1}" y="${py(p.y) + 1}" width="98" height="98" fill="${BLUE}" opacity="0.09"/>`;
    else if (t === 'federal') g += `<rect x="${px(p.x) + 1}" y="${py(p.y) + 1}" width="98" height="98" fill="${GOLD}" opacity="0.13"/>`;
  }
  return g + `</g>`;
}
function labels(state) {
  let g = `<g class="labels">`;
  for (const p of state.parcels) {
    const R = makeRng(hashStr(`${state.seed}:label:${p.id}`));
    const x = px(p.x), y = py(p.y), t = p.surface.type;
    const rot = R.rand(-3.5, 3.5);
    if (t === 'state') g += `<text class="type" x="${x + 50}" y="${y + 44}" font-size="11" letter-spacing="2" text-anchor="middle" fill="${INK2}" transform="rotate(${f1(rot)} ${x + 50} ${y + 44})">STATE<tspan x="${x + 50}" dy="13">TRUST</tspan></text>`;
    else if (t === 'federal') g += `<text class="type" x="${x + 50}" y="${y + 44}" font-size="13" letter-spacing="3" text-anchor="middle" fill="${INK2}" transform="rotate(${f1(rot)} ${x + 50} ${y + 44})">U.S.<tspan x="${x + 50}" dy="13" font-size="9" letter-spacing="1">B.L.M.</tspan></text>`;
    else if (t === 'town') g += `<text class="serif" x="${x + 50}" y="${y + 55}" font-size="15" letter-spacing="2" text-anchor="middle" fill="${INK}" font-weight="700" paint-order="stroke" stroke="${PAPER}" stroke-width="5" stroke-linejoin="round">DRY FORK</text>`;
    else if (t === 'preserve') g += `<text class="hand" x="${x + 50}" y="${y + 20}" font-size="14" text-anchor="middle" fill="${GREEN}" font-weight="600" transform="rotate(${f1(rot)} ${x + 50} ${y + 20})">Coyote Creek<tspan x="${x + 50}" dy="15">Preserve</tspan></text>`;
    else {
      const lines = twoLines(p.surface.name);
      const size = lines.length > 1 ? 16 : 17;
      g += `<text class="hand" x="${x + 50}" y="${y + (lines.length > 1 ? 36 : 42)}" font-size="${size}" text-anchor="middle" fill="${INK}" font-weight="600" transform="rotate(${f1(rot)} ${x + 50} ${y + 40})">${esc(lines[0])}${lines[1] ? `<tspan x="${x + 50}" dy="16">${esc(lines[1])}</tspan>` : ''}</text>`;
    }
  }
  return g + `</g>`;
}

const memo = { key: null, html: '' };
function staticLayers(state, geo) {
  const key = `${state.seed}`;
  if (memo.key === key) return memo.html;
  const html = defs(state.seed >>> 0) + paper(state.seed) + `<g class="static-ink" filter="url(#pm-wobble)">` + terrain(state, geo) + water(state, geo) + roadsRail(state, geo) + sectionLines(state) + `</g>` + publicWash(state) + labels(state);
  memo.key = key; memo.html = html;
  return html;
}

// ---------------- dynamic layers ----------------
function ownerOf(state, name) { return (state.competitors || []).find((c) => c.name === name); }

function stamp(x, y, text, color, opts = {}) {
  const w = opts.w ?? Math.max(26, text.length * 7.2 + 10), h = opts.h ?? 15, rot = opts.rot ?? -6, fs = opts.fs ?? 10;
  return `<g class="stamp" transform="translate(${f1(x)} ${f1(y)}) rotate(${rot})" opacity="${opts.op ?? 0.85}"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="2" fill="none" stroke="${color}" stroke-width="1.4"/><text class="type" font-size="${fs}" fill="${color}" text-anchor="middle" y="${fs * 0.36}" letter-spacing="0.8" font-weight="700">${esc(text)}</text></g>`;
}

function ownership(state) {
  const comps = state.competitors || [];
  const angles = [45, -45, 0, 90, 30, -30];
  let d = `<defs><pattern id="h-player" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><path d="M0 0V10" stroke="${PLAYER_COLOR}" stroke-width="1.6"/></pattern>`;
  comps.forEach((c, i) => { d += `<pattern id="h-c${i}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(${angles[i % angles.length]})"><path d="M0 0V10" stroke="${c.color}" stroke-width="1.3"/></pattern>`; });
  d += `</defs>`;
  let g = `<g class="ownership">`;
  for (const p of state.parcels) {
    const m = p.mineral, s = p.surface, x = px(p.x), y = py(p.y);
    const comp = m.leasedBy && m.leasedBy !== 'player' ? ownerOf(state, m.leasedBy) : null;
    const ci = comp ? comps.indexOf(comp) : -1;
    if (m.leasedBy === 'player') g += `<rect x="${x + 3}" y="${y + 3}" width="94" height="94" fill="url(#h-player)" opacity="0.28"/><rect x="${x + 3}" y="${y + 3}" width="94" height="94" fill="none" stroke="${PLAYER_COLOR}" stroke-width="2.2" opacity="0.85"/>`;
    else if (comp) g += `<rect x="${x + 3}" y="${y + 3}" width="94" height="94" fill="url(#h-c${ci})" opacity="0.22"/><rect x="${x + 3}" y="${y + 3}" width="94" height="94" fill="none" stroke="${comp.color}" stroke-width="1.6" opacity="0.8"/>`;
    // holder stamp bottom-right
    if (m.leasedBy === 'player') g += stamp(x + 78, y + 86, 'YOU', PLAYER_COLOR, { w: 30 });
    else if (comp) g += stamp(x + 78, y + 86, comp.tag, comp.color, { w: 30 });
    if (m.leasedBy && (m.hbp || (m.lease && m.lease.hbp))) g += `<text class="type" x="${x + 94}" y="${y + 72}" font-size="7.5" text-anchor="end" fill="${m.leasedBy === 'player' ? PLAYER_COLOR : comp ? comp.color : INK}" letter-spacing="0.5">H.B.P.</text>`;
    else if (comp && m.owned) g += `<text class="type" x="${x + 94}" y="${y + 72}" font-size="7.5" text-anchor="end" fill="${comp.color}" letter-spacing="0.5">FEE</text>`;
    if (m.split) g += `<text class="type" x="${x + 6}" y="${y + 96}" font-size="6.5" fill="${INK2}" letter-spacing="0.4">MIN. SEVERED</text>`;
    // situational stamps across the middle
    if (s.hostile) g += stamp(x + 50, y + 60, 'NO TRESPASSING', RED, { w: 92, h: 16, rot: -8, fs: 9 });
    else if (m.holdoutUntil > state.month && !m.leasedBy) g += stamp(x + 50, y + 60, 'NO CALLS', RED, { w: 62, rot: 8 });
    else if (m.auction) g += stamp(x + 50, y + 60, 'BID FILED', BLUE, { w: 66, rot: -5 });
  }
  return d + g + `</g>`;
}

function structures(state) {
  let g = `<g class="structures">`;
  const pools = state.pools || [];
  for (const pool of pools) {
    const cx = px(pool.cx), cy = py(pool.cy), rx = pool.rx * S, ry = pool.ry * S, deg = (pool.rot * 180) / Math.PI;
    if (pool.discovered) {
      g += `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${f1(deg)})" fill="none" stroke="${INK}"><ellipse rx="${f1(rx)}" ry="${f1(ry)}" stroke-width="2" stroke-dasharray="9 5"/><ellipse rx="${f1(rx * 0.66)}" ry="${f1(ry * 0.66)}" stroke-width="1.1" stroke-dasharray="6 4" opacity="0.8"/><ellipse rx="${f1(rx * 0.33)}" ry="${f1(ry * 0.33)}" stroke-width="1" stroke-dasharray="4 3" opacity="0.7"/></g>`;
      g += `<text class="type" x="${f1(cx)}" y="${f1(cy - 8)}" font-size="12" letter-spacing="2.5" text-anchor="middle" fill="${INK}" font-weight="700" paint-order="stroke" stroke="${PAPER}" stroke-width="5" stroke-linejoin="round" >${esc(pool.name.toUpperCase())}</text>`;
    } else {
      const known = state.parcels.filter((p) => p.survey.est && p.survey.est.sand.onStructure === true && p.survey.est.sand.pool === pool.id);
      if (!known.length) continue;
      const clip = known.map((p) => `<rect x="${px(p.x)}" y="${py(p.y)}" width="${S}" height="${S}"/>`).join('');
      g += `<clipPath id="clip-pool-${pool.id}">${clip}</clipPath><g clip-path="url(#clip-pool-${pool.id})" transform="translate(${f1(cx)} ${f1(cy)}) rotate(${f1(deg)})" fill="${BLUE}" fill-opacity="0.06" stroke="${BLUE}"><ellipse rx="${f1(rx)}" ry="${f1(ry)}" stroke-width="1.8" stroke-dasharray="7 5"/><ellipse rx="${f1(rx * 0.6)}" ry="${f1(ry * 0.6)}" stroke-width="1" stroke-dasharray="4 4" fill="none"/></g>`;
      const kx = known.reduce((a, p) => a + px(p.x) + 50, 0) / known.length, ky = known.reduce((a, p) => a + py(p.y) + 50, 0) / known.length;
      g += `<text class="hand" x="${f1(kx)}" y="${f1(ky + 22)}" font-size="16" text-anchor="middle" fill="${BLUE}" font-weight="600" paint-order="stroke" stroke="${PAPER}" stroke-width="4" stroke-linejoin="round" transform="rotate(-6 ${f1(kx)} ${f1(ky)})">closure?</text>`;
    }
  }
  // per-parcel seismic notes
  for (const p of state.parcels) {
    const e = p.survey.est; if (!e || e.sand.onStructure === null) continue;
    const x = px(p.x), y = py(p.y);
    if (e.sand.onStructure === false) g += `<text class="hand" x="${x + 50}" y="${y + 70}" font-size="13" text-anchor="middle" fill="${BLUE}" opacity="0.85" transform="rotate(-5 ${x + 50} ${y + 70})">wet</text>`;
    else if (e.sand.pool === null) g += `<text class="hand" x="${x + 50}" y="${y + 70}" font-size="13" text-anchor="middle" fill="${BLUE}" opacity="0.9" transform="rotate(-5 ${x + 50} ${y + 70})">closure?</text>`;
  }
  return g + `</g>`;
}

function surveyMarks(state) {
  let g = `<g class="surveys" fill="none" stroke="${BLUE}" stroke-width="1">`;
  for (const p of state.parcels) {
    const lvl = p.survey.level; if (!lvl) continue;
    const x = px(p.x), y = py(p.y);
    if (lvl === 1) g += `<g><rect x="${x + 72}" y="${y + 6}" width="22" height="10" rx="1.5" stroke="${INK2}" opacity="0.7"/><text class="type" x="${x + 83}" y="${y + 13.5}" font-size="7" text-anchor="middle" fill="${INK2}" stroke="none" letter-spacing="0.6">REC</text></g>`;
    else {
      // 2-D shot line with shot-point ticks
      g += `<path d="M${x + 24} ${y + 21}H${x + 94}"/>${[...Array(8)].map((_, i) => `<path d="M${x + 28 + i * 9} ${y + 18.5}v5"/>`).join('')}`;
      if (lvl >= 3) g += `<path d="M${x + 78} ${y + 6}V${y + 34}"/>${[...Array(3)].map((_, i) => `<path d="M${x + 75.5} ${y + 9 + i * 9}h5"/>`).join('')}`;
      g += `<text class="type" x="${x + 24}" y="${y + 15}" font-size="6.5" fill="${BLUE}" stroke="none" letter-spacing="0.4">${lvl >= 3 ? '3-D' : '2-D'} L-${p.id}</text>`;
    }
  }
  return g + `</g>`;
}

const SYM = { permit: 's-well-loc', drill: 's-derrick', complete: 's-derrick', producing: 's-well-oil', shutin: 's-well-shutin', workover: 's-well-shutin', dry: 's-well-dry', plugged: 's-well-plugged', blowout: 's-well-blowout' };
function wellGlyph(x, y, status, color, title) {
  const t = title ? `<title>${esc(title)}</title>` : '';
  if (status === 'drill' || status === 'complete') return `<g style="color:${color}">${t}<use href="#s-derrick" x="${f1(x - 6)}" y="${f1(y - 25)}" width="12" height="24"/><use href="#s-well-loc" x="${f1(x - 6)}" y="${f1(y - 6)}" width="12" height="12"/></g>`;
  if (status === 'producing') return `<g style="color:${color}">${t}<use href="#s-derrick" x="${f1(x - 5)}" y="${f1(y - 23)}" width="10" height="20" opacity="0.8"/><use href="#s-well-oil" x="${f1(x - 6)}" y="${f1(y - 6)}" width="12" height="12"/></g>`;
  return `<g style="color:${color}">${t}<use href="#${SYM[status] || 's-well-loc'}" x="${f1(x - 7)}" y="${f1(y - 7)}" width="14" height="14"/></g>`;
}

function wells(state) {
  let g = `<g class="wells">`;
  for (const p of state.parcels) {
    const x = px(p.x), y = py(p.y);
    const mine = p.wells.map((id) => state.wells.find((w) => w.id === id)).filter(Boolean);
    const comp = p.mineral.leasedBy && p.mineral.leasedBy !== 'player' ? ownerOf(state, p.mineral.leasedBy) : null;
    const items = [];
    for (const w of mine) items.push({ status: w.status, color: INK, title: `${w.name}: ${w.status}${w.lastMonth ? `, ${Math.round(w.lastMonth.rate || 0)} bbl/d` : ''}` });
    const rc = comp ? comp.color : INK2, rn = comp ? comp.name : 'Rival';
    for (let i = 0; i < (p.competitorWells || 0); i++) items.push({ status: 'producing', color: rc, title: `${rn} well` });
    if (p.compDry) items.push({ status: 'dry', color: rc, title: `${rn}: dry hole` });
    if (!items.length) continue;
    const shown = items.slice(0, 4);
    shown.forEach((it, i) => { g += wellGlyph(x + 13 + i * 15, y + 86, it.status, it.color, it.title); });
    if (items.length > 4) g += `<text class="type" x="${x + 13 + 4 * 15 - 4}" y="${y + 90}" font-size="9" fill="${INK}">+${items.length - 4}</text>`;
  }
  return g + `</g>`;
}

function selection(state, ui) {
  const p = state.parcels[ui?.selected ?? -1]; if (!p) return '';
  const R = makeRng(hashStr(`sel:${p.id}`));
  const x = px(p.x), y = py(p.y);
  const d = `${wline(x + 1, y + 1, x + 99, y + 1, R, 1.5)} ${wline(x + 99, y + 1, x + 99, y + 99, R, 1.5)} ${wline(x + 99, y + 99, x + 1, y + 99, R, 1.5)} ${wline(x + 1, y + 99, x + 1, y + 1, R, 1.5)}`;
  return `<g class="sel" fill="none" stroke="${RED}" stroke-linecap="round"><path d="${d}" stroke-width="3.2" opacity="0.85"/><path d="${d}" stroke-width="1.2" opacity="0.6" transform="translate(1.5 1.5)"/><path d="M${x + 86} ${y - 6}l8 8m0 -8l-8 8" stroke-width="2" opacity="0.7"/></g>`;
}

function parcelTitle(state, p) {
  const m = p.mineral, s = p.surface;
  const comp = m.leasedBy && m.leasedBy !== 'player' ? ownerOf(state, m.leasedBy) : null;
  const est = p.survey.est;
  const knownOn = est && est.sand.onStructure === true;
  const pool = p.truth?.sand?.pool !== null && p.truth?.sand?.pool !== undefined ? (state.pools || []).find((x) => x.id === p.truth.sand.pool) : null;
  const holding = comp ? ` — held by ${comp.name}${m.owned ? ' (owns the minerals)' : m.hbp ? ' (held by production)' : ''}` : m.leasedBy === 'player' ? ' — your lease' : '';
  return `Sec. ${SNAKE(p.x, p.y)}: ${s.name} (${OWNER_TYPES[s.type]?.name || s.type})${m.split ? ' · minerals: ' + m.name : ''}${holding}${knownOn && pool?.discovered ? ' · ' + pool.name : ''}${p.survey.level ? ` · survey ${p.survey.level}` : ''}`;
}
function hits(state) {
  let g = `<g class="hits">`;
  for (const p of state.parcels) g += `<rect class="hit" data-action="select-parcel" data-id="${p.id}" x="${px(p.x)}" y="${py(p.y)}" width="${S}" height="${S}"><title>${esc(parcelTitle(state, p))}</title></rect>`;
  return g + `</g>`;
}

function compass(cx, cy) {
  return `<g class="compass" transform="translate(${cx} ${cy})" fill="${INK}" stroke="${INK}">
  <circle r="30" fill="none" stroke-width="1"/><circle r="24" fill="none" stroke-width="0.6" stroke-dasharray="2 3"/>
  <path d="M0 -30L5 0L0 30L-5 0Z" fill="${PAPER}" stroke-width="1"/><path d="M0 -30L5 0H-5Z" fill="${INK}"/>
  <path d="M-30 0L0 5L30 0L0 -5Z" fill="${PAPER}" stroke-width="1"/><path d="M-30 0L0 -5V5Z" fill="${INK}" opacity="0.6"/>
  <text class="serif" y="-34" text-anchor="middle" font-size="14" font-weight="700" stroke="none">N</text></g>`;
}

function frame(state) {
  const revised = dateStr(state.month);
  let g = `<g class="frame" fill="${INK}">
  <rect x="20" y="20" width="${VIEW_W - 40}" height="${VIEW_H - 40}" fill="none" stroke="${INK}" stroke-width="3"/>
  <rect x="28" y="28" width="${VIEW_W - 56}" height="${VIEW_H - 56}" fill="none" stroke="${INK}" stroke-width="0.8"/>
  <text class="serif" x="${OX}" y="66" font-size="34" letter-spacing="5" font-weight="700">PLAT OF DRY FORK COUNTY</text>
  <text class="type" x="${OX + 2}" y="90" font-size="13" letter-spacing="2">OIL &amp; GAS LEASE OWNERSHIP · REVISED ${esc(revised.toUpperCase())} · SCALE 1 IN. = ½ MI.</text>
  <text class="type" x="${VIEW_W - 130}" y="52" font-size="10" text-anchor="end" letter-spacing="1">SHEET 1 OF 1</text>
  <text class="type" x="${VIEW_W - 130}" y="68" font-size="10" text-anchor="end" letter-spacing="1">T.12 N., R.8 W.</text>
  <text class="type" x="${VIEW_W - 130}" y="84" font-size="10" text-anchor="end" letter-spacing="1">DRAWN: CO. SURVEYOR</text>
  ${compass(VIEW_W - 92, 66)}`;
  // scale bar
  const sx = OX, sy = VIEW_H - 44;
  g += `<g class="scalebar"><rect x="${sx}" y="${sy}" width="50" height="7" fill="${INK}"/><rect x="${sx + 50}" y="${sy}" width="50" height="7" fill="${PAPER}" stroke="${INK}" stroke-width="1"/><rect x="${sx + 100}" y="${sy}" width="100" height="7" fill="${INK}"/><rect x="${sx}" y="${sy}" width="200" height="7" fill="none" stroke="${INK}" stroke-width="1"/>
  <text class="type" x="${sx}" y="${sy - 5}" font-size="9" text-anchor="middle">0</text><text class="type" x="${sx + 100}" y="${sy - 5}" font-size="9" text-anchor="middle">½</text><text class="type" x="${sx + 200}" y="${sy - 5}" font-size="9" text-anchor="middle">1 MILE</text></g>`;
  // legend
  const comps = state.competitors || [];
  let lx = 320, ly = VIEW_H - 44;
  const item = (glyph, label, w) => { const s = `<g transform="translate(${lx} ${ly})">${glyph}<text class="type" x="16" y="8" font-size="9.5" letter-spacing="0.6">${esc(label)}</text></g>`; lx += w; return s; };
  g += `<g class="legend">`;
  g += item(`<rect x="0" y="0" width="12" height="12" fill="url(#h-player)" stroke="${PLAYER_COLOR}" stroke-width="1.4"/>`, 'YOUR LEASE', 88);
  g += item(`<rect x="0" y="0" width="12" height="12" fill="${BLUE}" opacity="0.18" stroke="${INK2}" stroke-width="0.8"/>`, 'STATE TRUST (AUCTION)', 136);
  g += item(`<rect x="0" y="0" width="12" height="12" fill="${GOLD}" opacity="0.25" stroke="${INK2}" stroke-width="0.8"/>`, 'U.S. LAND (AUCTION)', 126);
  comps.forEach((c, i) => { g += item(`<rect x="0" y="0" width="12" height="12" fill="url(#h-c${i})" stroke="${c.color}" stroke-width="1.2"/>`, `${c.tag} ${c.name.toUpperCase()}`, 60 + c.name.length * 6.6); });
  lx = 320; ly = VIEW_H - 24;
  g += item(`<use href="#s-well-oil" width="12" height="12"/>`, 'PRODUCING', 84);
  g += item(`<use href="#s-derrick" x="1" y="-6" width="10" height="18"/>`, 'DRILLING', 76);
  g += item(`<use href="#s-well-loc" width="12" height="12"/>`, 'LOCATION', 78);
  g += item(`<use href="#s-well-shutin" width="12" height="12"/>`, 'SHUT IN', 70);
  g += item(`<use href="#s-well-dry" width="12" height="12"/>`, 'DRY HOLE', 78);
  g += item(`<use href="#s-well-plugged" width="12" height="12"/>`, 'PLUGGED', 74);
  g += item(`<use href="#s-well-blowout" width="12" height="12"/>`, 'BLOWOUT', 76);
  g += item(`<g fill="none" stroke="${INK}" stroke-dasharray="4 2"><ellipse cx="6" cy="6" rx="6" ry="4"/></g>`, 'CLOSURE (FIELD)', 108);
  g += item(`<g stroke="${BLUE}" fill="none"><path d="M0 6H12"/><path d="M2 4v4M6 4v4M10 4v4"/></g>`, 'SEISMIC LINE', 90);
  g += item(`<rect x="0" y="1" width="12" height="10" rx="1.5" fill="none" stroke="${INK2}"/>`, 'REC = COUNTY RECORDS', 130);
  g += `</g>`;
  // FILE COPY stamp
  g += `<g transform="translate(${VIEW_W - 170} ${VIEW_H - 56}) rotate(-11)" opacity="0.75"><rect x="-80" y="-20" width="160" height="40" rx="3" fill="none" stroke="${RED}" stroke-width="3"/><text class="type" text-anchor="middle" y="6" font-size="22" fill="${RED}" letter-spacing="4" font-weight="700">FILE COPY</text><text class="type" text-anchor="middle" y="17" font-size="7" fill="${RED}" letter-spacing="1">COUNTY CLERK · DRY FORK</text></g>`;
  return g + `</g>`;
}

export function renderPlatMap(state, ui = {}) {
  const geo = state.geography || (state.geography = generateGeography(state));
  return `<svg class="plat" viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plat of Dry Fork County">`
    + staticLayers(state, geo)
    + ownership(state)
    + structures(state)
    + surveyMarks(state)
    + wells(state)
    + selection(state, ui)
    + frame(state)
    + hits(state)
    + `</svg>`;
}
