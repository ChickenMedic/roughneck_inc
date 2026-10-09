// Room definitions: the office and the seven town interiors, as data. Backgrounds are SVG strings
// composed from a small furniture kit; hotspots open drawer tabs, modals or screens; actors read the
// state for who is in the room (staff at their desks, candidates at the cafe tables, the banker...).
import { esc, dateStr, monthName, money } from '../util.js';
import { season } from '../era.js';
import { ROLES, PARTIES } from '../data.js';
import { isPublic } from '../land.js';
import { acreageAsk } from '../competitors.js';
import { permitSummary } from '../government.js';
import { lawSummary } from '../law.js';
import { holder, portraitFor } from '../people.js';
import { isFounding, foundersAt, FOUNDERS, canForm, foundingSummary } from '../founding.js';
import { isAbsent } from '../sim.js';
import { ROLE_SPRITE } from './talk.js';

const INK = '#2b2418', PAPER = '#efe4c8';
const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))); return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const SKY = { winter: ['#c8d4dc', '#e8ecf0'], spring: ['#8ab8dc', '#d8e8f0'], summer: ['#6aa4dc', '#cfe4f4'], fall: ['#b8a888', '#e8dcc0'] };
const LAND = { winter: '#d8d4c8', spring: '#7c9c5a', summer: '#a8a060', fall: '#b89858' };

// ---------- kit ----------
const K = {
  wall(color, wainscot = '#7a5a3a', stripes = false) {
    let s = `<rect width="960" height="360" fill="${color}"/>`;
    if (stripes) { s += `<g fill="${shade(color, -0.06)}">`; for (let x = 0; x < 960; x += 40) s += `<rect x="${x}" y="0" width="14" height="300"/>`; s += '</g>'; }
    s += `<rect y="296" width="960" height="64" fill="${wainscot}"/><rect y="294" width="960" height="4" fill="${shade(wainscot, -0.35)}"/><g fill="${shade(wainscot, -0.2)}">`;
    for (let x = 0; x < 960; x += 32) s += `<rect x="${x}" y="304" width="2" height="48"/>`;
    return s + `</g><rect y="356" width="960" height="4" fill="${shade(wainscot, -0.45)}"/>`;
  },
  floorBoards(color = '#a07848') {
    let s = `<rect y="360" width="960" height="180" fill="${color}"/><g stroke="${shade(color, -0.3)}" stroke-width="2">`;
    for (let y = 380; y < 540; y += 22) s += `<line x1="0" x2="960" y1="${y}" y2="${y}"/>`;
    for (let i = 0; i < 40; i++) { const x = (i * 137) % 960, y = 380 + ((i * 53) % 7) * 22; s += `<line x1="${x}" x2="${x}" y1="${y}" y2="${y + 22}"/>`; }
    return s + '</g>';
  },
  floorTile(a = '#d8d0b8', b = '#8a7a68') {
    let s = `<rect y="360" width="960" height="180" fill="${a}"/><g fill="${b}">`;
    for (let y = 360; y < 540; y += 40) for (let x = (y / 40) % 2 ? 40 : 0; x < 960; x += 80) s += `<rect x="${x}" y="${y}" width="40" height="40"/>`;
    return s + '</g>';
  },
  rug(x, y, w, h, c1 = '#8a3a3a', c2 = '#c8a060') { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c1}"/><rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" fill="none" stroke="${c2}" stroke-width="4"/><rect x="${x + 20}" y="${y + 20}" width="${w - 40}" height="${h - 40}" fill="none" stroke="${c2}" stroke-width="2" stroke-dasharray="6 6"/>`; },
  window(x, y, w, h, state, view = 'prairie') {
    const s = season(state), [top, bot] = SKY[s], land = LAND[s];
    const id = `sky${x}${y}`;
    let inner = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>`;
    const hz = y + h * 0.62;
    inner += `<rect x="${x}" y="${hz}" width="${w}" height="${y + h - hz}" fill="${land}"/><path d="M${x} ${hz + 4}Q${x + w * 0.3} ${hz - 6} ${x + w * 0.55} ${hz + 2}T${x + w} ${hz - 3}V${y + h}H${x}Z" fill="${shade(land, -0.1)}"/>`;
    if (view === 'prairie') inner += `<path d="M${x + w * 0.7} ${hz}l4 -30h4l4 30zM${x + w * 0.7 + 1} ${hz - 10}h10M${x + w * 0.7 + 2} ${hz - 20}h8" stroke="${INK}" stroke-width="1.2" fill="none"/><circle cx="${x + w * 0.2}" cy="${y + 26}" r="10" fill="${s === 'winter' ? '#f0eee6' : '#f8e8a0'}" opacity="0.9"/>`;
    if (view === 'rails') inner += `<path d="M${x} ${hz + 14}H${x + w}M${x} ${hz + 22}H${x + w}" stroke="#5a5a5a" stroke-width="2"/><g stroke="#6a4a2a" stroke-width="3">${[...Array(Math.floor(w / 14))].map((_, i) => `<line x1="${x + 4 + i * 14}" x2="${x + 4 + i * 14}" y1="${hz + 10}" y2="${hz + 26}"/>`).join('')}</g>`;
    inner += `<g stroke="${INK}" stroke-width="3" fill="none"><rect x="${x}" y="${y}" width="${w}" height="${h}"/><line x1="${x + w / 2}" x2="${x + w / 2}" y1="${y}" y2="${y + h}"/><line x1="${x}" x2="${x + w}" y1="${y + h / 2}" y2="${y + h / 2}"/></g>`;
    inner += `<rect x="${x - 10}" y="${y - 8}" width="${w + 20}" height="8" fill="#5a3a24"/><rect x="${x - 14}" y="${y + h}" width="${w + 28}" height="6" fill="#5a3a24"/>`;
    return inner;
  },
  curtain(x, y, w, h, color = '#8a3a3a') { return `<path d="M${x} ${y}h${w}v${h}q-${w / 2} -20 -${w} 0z" fill="${color}"/><path d="M${x} ${y}v${h}" stroke="${shade(color, -0.3)}" stroke-width="2"/>`; },
  desk(x, y, w, h = 40, color = '#6a4a2a') { return `<rect x="${x + 6}" y="${y + h - 8}" width="8" height="${h + 20}" fill="${shade(color, -0.3)}"/><rect x="${x + w - 14}" y="${y + h - 8}" width="8" height="${h + 20}" fill="${shade(color, -0.3)}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/><rect x="${x - 4}" y="${y - 6}" width="${w + 8}" height="10" fill="${shade(color, 0.25)}"/><rect x="${x + 10}" y="${y + 10}" width="${w * 0.3}" height="${h - 20}" fill="${shade(color, -0.2)}" rx="2"/><rect x="${x + w * 0.62}" y="${y + 10}" width="${w * 0.3}" height="${h - 20}" fill="${shade(color, -0.2)}" rx="2"/>`; },
  paper(x, y, w = 40, h = 30, rot = 0) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f0dd" stroke="${INK}" stroke-width="1" transform="rotate(${rot} ${x} ${y})"/><g stroke="${INK}" stroke-width="1" opacity="0.5" transform="rotate(${rot} ${x} ${y})"><line x1="${x + 5}" x2="${x + w - 5}" y1="${y + 8}" y2="${y + 8}"/><line x1="${x + 5}" x2="${x + w - 10}" y1="${y + 14}" y2="${y + 14}"/><line x1="${x + 5}" x2="${x + w - 7}" y1="${y + 20}" y2="${y + 20}"/></g>`; },
  cabinet(x, y, w = 60, h = 140, color = '#6a6a5a') { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" stroke="${shade(color, -0.4)}" stroke-width="2"/>`; const n = 4, dh = (h - 12) / n; for (let i = 0; i < n; i++) s += `<rect x="${x + 6}" y="${y + 6 + i * dh}" width="${w - 12}" height="${dh - 4}" fill="${shade(color, 0.08)}" stroke="${shade(color, -0.3)}"/><rect x="${x + w / 2 - 8}" y="${y + 6 + i * dh + dh / 2 - 3}" width="16" height="5" fill="#b58a2f"/><rect x="${x + 10}" y="${y + 6 + i * dh + 4}" width="18" height="8" fill="#f7f0dd"/>`; return s; },
  shelf(x, y, w, rows = 3, kind = 'books') {
    let s = `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${rows * 44 + 10}" fill="#5a3a24"/>`;
    const cols = ['#8a3a3a', '#2f4f7f', '#4b6b3a', '#b58a2f', '#6b4a7a', '#a05050', '#3a3a44', '#c8a060'];
    for (let r = 0; r < rows; r++) {
      const sy = y + r * 44;
      s += `<rect x="${x}" y="${sy}" width="${w}" height="36" fill="#3a2a1a"/><rect x="${x - 6}" y="${sy + 36}" width="${w + 12}" height="6" fill="#7a5a3a"/>`;
      let cx = x + 4;
      while (cx < x + w - 10) {
        const i = Math.floor((cx * 7 + r * 13) / 9) % cols.length;
        if (kind === 'books') { const bw = 8 + ((cx + r) % 3) * 4, bh = 24 + ((cx * 3 + r) % 3) * 4; s += `<rect x="${cx}" y="${sy + 36 - bh}" width="${bw}" height="${bh}" fill="${cols[i]}"/>`; cx += bw + 2; }
        else if (kind === 'goods') { const bw = 14 + ((cx + r) % 3) * 6, bh = 16 + ((cx * 3 + r) % 3) * 6; s += `<rect x="${cx}" y="${sy + 36 - bh}" width="${bw}" height="${bh}" fill="${cols[i]}" rx="2"/><rect x="${cx + 3}" y="${sy + 36 - bh + 4}" width="${bw - 6}" height="6" fill="#f7f0dd"/>`; cx += bw + 6; }
        else { s += `<rect x="${cx}" y="${sy + 8}" width="20" height="28" fill="#8a8a7a"/><rect x="${cx + 2}" y="${sy + 12}" width="16" height="20" fill="#2b2418"/>`; cx += 26; }
      }
    }
    return s;
  },
  door(x, y, label = '', w = 74, h = 160) { return `<rect x="${x - 8}" y="${y - 10}" width="${w + 16}" height="${h + 10}" fill="#5a3a24"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#8a6a48"/><rect x="${x + 10}" y="${y + 12}" width="${w - 20}" height="${h * 0.38}" fill="#a8c4d0" stroke="#5a3a24" stroke-width="3"/><rect x="${x + 10}" y="${y + h * 0.55}" width="${w - 20}" height="${h * 0.36}" fill="#7a5a3a" stroke="#5a3a24" stroke-width="3"/><circle cx="${x + w - 14}" cy="${y + h * 0.5}" r="4" fill="#b58a2f"/>${label ? `<rect x="${x - 6}" y="${y - 34}" width="${w + 12}" height="20" fill="${PAPER}" stroke="${INK}"/><text class="type" x="${x + w / 2}" y="${y - 20}" text-anchor="middle" font-size="11" fill="${INK}" letter-spacing="2">${esc(label)}</text>` : ''}`; },
  plat(x, y, w, h) {
    let s = `<rect x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" fill="#3a2a1a"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}"/><g stroke="${INK}" stroke-width="1" opacity="0.6">`;
    for (let i = 1; i < 7; i++) s += `<line x1="${x + (w / 7) * i}" x2="${x + (w / 7) * i}" y1="${y}" y2="${y + h}"/>`;
    for (let i = 1; i < 5; i++) s += `<line x1="${x}" x2="${x + w}" y1="${y + (h / 5) * i}" y2="${y + (h / 5) * i}"/>`;
    s += `</g><path d="M${x} ${y + h * 0.3}C${x + w * 0.3} ${y + h * 0.1} ${x + w * 0.5} ${y + h * 0.8} ${x + w} ${y + h * 0.6}" stroke="#2f4f7f" stroke-width="3" fill="none"/><text class="serif" x="${x + w / 2}" y="${y + 16}" text-anchor="middle" font-size="12" letter-spacing="3" fill="${INK}" font-weight="700">DRY FORK COUNTY</text><path d="M${x + w * 0.42} ${y + h * 0.5}l12 12m0 -12l-12 12" stroke="#a8322a" stroke-width="3"/><circle cx="${x + w * 0.7}" cy="${y + h * 0.4}" r="18" fill="none" stroke="${INK}" stroke-dasharray="4 3"/>`;
    return s;
  },
  poster(x, y, w, h, lines, color = '#a8322a', bg = '#f7f0dd') { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}" stroke="${INK}" stroke-width="2"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" fill="none" stroke="${color}" stroke-width="2"/>${lines.map((l, i) => `<text class="serif" x="${x + w / 2}" y="${y + 28 + i * 22}" text-anchor="middle" font-size="${i === 0 ? 15 : 11}" font-weight="700" fill="${i === 0 ? color : INK}">${esc(l)}</text>`).join('')}`; },
  calendar(x, y, state) { const [m, yr] = dateStr(state.month).split(' '); return `<rect x="${x}" y="${y}" width="90" height="110" fill="#f7f0dd" stroke="${INK}" stroke-width="2"/><rect x="${x}" y="${y}" width="90" height="26" fill="#a8322a"/><text class="type" x="${x + 45}" y="${y + 18}" text-anchor="middle" font-size="13" fill="#f7f0dd" letter-spacing="3">${esc(m.toUpperCase())}</text><text class="type" x="${x + 45}" y="${y + 74}" text-anchor="middle" font-size="30" font-weight="700" fill="${INK}">${esc(yr)}</text><circle cx="${x + 45}" cy="${y - 6}" r="3" fill="${INK}"/><text class="hand" x="${x + 45}" y="${y + 98}" text-anchor="middle" font-size="12" fill="#2f4f7f">next month ↷</text>`; },
  radio(x, y) { return `<path d="M${x} ${y + 50}V${y + 24}Q${x} ${y} ${x + 30} ${y}Q${x + 60} ${y} ${x + 60} ${y + 24}V${y + 50}Z" fill="#5a3a24"/><path d="M${x + 8} ${y + 44}V${y + 24}Q${x + 8} ${y + 8} ${x + 30} ${y + 8}Q${x + 52} ${y + 8} ${x + 52} ${y + 24}V${y + 44}Z" fill="#c8a060"/><g stroke="#5a3a24" stroke-width="2">${[0, 1, 2, 3, 4].map((i) => `<line x1="${x + 14 + i * 8}" x2="${x + 14 + i * 8}" y1="${y + 14}" y2="${y + 34}"/>`).join('')}</g><circle cx="${x + 30}" cy="${y + 42}" r="4" fill="#efe4c8"/>`; },
  phone(x, y) { return `<rect x="${x + 8}" y="${y + 30}" width="24" height="6" fill="${INK}"/><rect x="${x + 17}" y="${y + 6}" width="6" height="26" fill="${INK}"/><circle cx="${x + 20}" cy="${y + 4}" r="6" fill="${INK}"/><path d="M${x} ${y + 8}q20 -12 40 0" stroke="${INK}" stroke-width="5" fill="none"/>`; },
  rolodex(x, y) { return `<rect x="${x}" y="${y + 14}" width="44" height="22" fill="#3a3a44"/><path d="M${x + 4} ${y + 14}a18 18 0 0 1 36 0z" fill="#f7f0dd" stroke="${INK}"/><g stroke="${INK}" stroke-width="1">${[0, 1, 2, 3].map((i) => `<line x1="${x + 8 + i * 8}" x2="${x + 8 + i * 8}" y1="${y + 2}" y2="${y + 14}"/>`).join('')}</g>`; },
  lamp(x, y) { return `<rect x="${x + 14}" y="${y + 20}" width="4" height="22" fill="#b58a2f"/><rect x="${x + 6}" y="${y + 40}" width="20" height="4" fill="#b58a2f"/><path d="M${x} ${y + 20}h32l-6 -18h-20z" fill="#3f7a4d"/>`; },
  counter(x, y, w, h = 70, color = '#5a3a24', grille = true) { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/><rect x="${x - 4}" y="${y - 8}" width="${w + 8}" height="12" fill="${shade(color, 0.3)}"/><g fill="${shade(color, -0.2)}">${[...Array(Math.floor(w / 60))].map((_, i) => `<rect x="${x + 10 + i * 60}" y="${y + 12}" width="40" height="${h - 24}" rx="2"/>`).join('')}</g>`; if (grille) { s += `<g stroke="#b58a2f" stroke-width="3">`; for (let gx = x + 10; gx < x + w - 6; gx += 14) s += `<line x1="${gx}" x2="${gx}" y1="${y - 120}" y2="${y - 10}"/>`; s += `<line x1="${x}" x2="${x + w}" y1="${y - 122}" y2="${y - 122}"/><line x1="${x}" x2="${x + w}" y1="${y - 60}" y2="${y - 60}"/></g>`; } return s; },
  vault(x, y, r = 80) { return `<circle cx="${x}" cy="${y}" r="${r + 10}" fill="#3a3a44"/><circle cx="${x}" cy="${y}" r="${r}" fill="#6a6a7a" stroke="#2b2418" stroke-width="4"/><circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="none" stroke="#b58a2f" stroke-width="6"/><g stroke="#b58a2f" stroke-width="6" stroke-linecap="round">${[0, 60, 120].map((a) => `<line x1="${x}" x2="${x}" y1="${y - r * 0.55}" y2="${y + r * 0.55}" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g><circle cx="${x}" cy="${y}" r="10" fill="#2b2418"/>`; },
  bars(x, y, w, h) { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#4a4a4a" opacity="0.25"/><g stroke="#3a3a3a" stroke-width="6">`; for (let bx = x + 8; bx < x + w; bx += 20) s += `<line x1="${bx}" x2="${bx}" y1="${y}" y2="${y + h}"/>`; s += `<line x1="${x}" x2="${x + w}" y1="${y + 30}" y2="${y + 30}"/><line x1="${x}" x2="${x + w}" y1="${y + h - 40}" y2="${y + h - 40}"/></g>`; s += `<rect x="${x + 20}" y="${y + h - 70}" width="${w - 60}" height="24" fill="#8a8a7a"/><rect x="${x + 20}" y="${y + h - 46}" width="8" height="30" fill="#5a5a5a"/><rect x="${x + w - 48}" y="${y + h - 46}" width="8" height="30" fill="#5a5a5a"/>`; return s; },
  press(x, y) { return `<rect x="${x}" y="${y + 120}" width="300" height="80" fill="#3a3a3a"/><rect x="${x + 30}" y="${y + 40}" width="200" height="90" fill="#4a4a4a" stroke="#2b2418" stroke-width="3"/><rect x="${x + 50}" y="${y}" width="120" height="50" fill="#5a5a5a" stroke="#2b2418" stroke-width="3"/><circle cx="${x + 270}" cy="${y + 110}" r="46" fill="#3a3a3a" stroke="#2b2418" stroke-width="4"/><circle cx="${x + 270}" cy="${y + 110}" r="30" fill="none" stroke="#8a8a8a" stroke-width="4"/><g stroke="#8a8a8a" stroke-width="4">${[0, 45, 90, 135].map((a) => `<line x1="${x + 270}" x2="${x + 270}" y1="${y + 70}" y2="${y + 150}" transform="rotate(${a} ${x + 270} ${y + 110})"/>`).join('')}</g><rect x="${x + 60}" y="${y + 90}" width="140" height="30" fill="#f7f0dd"/><g stroke="${INK}" stroke-width="1">${[0, 1, 2].map((i) => `<line x1="${x + 70}" x2="${x + 190}" y1="${y + 98 + i * 7}" y2="${y + 98 + i * 7}"/>`).join('')}</g>`; },
  stackOfPapers(x, y, n = 5) { let s = ''; for (let i = 0; i < n; i++) s += `<rect x="${x + (i % 2) * 3}" y="${y - i * 6}" width="60" height="8" fill="#f7f0dd" stroke="${INK}" stroke-width="1"/>`; return s; },
  table(x, y, r = 34) { return `<rect x="${x - 4}" y="${y}" width="8" height="46" fill="#5a3a24"/><rect x="${x - 26}" y="${y + 42}" width="52" height="6" fill="#5a3a24"/><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.42}" fill="#efe4c8" stroke="#8a3a3a" stroke-width="3"/><ellipse cx="${x}" cy="${y}" rx="${r * 0.7}" ry="${r * 0.3}" fill="none" stroke="#8a3a3a" stroke-width="2"/><rect x="${x - r - 20}" y="${y - 10}" width="12" height="40" fill="#5a3a24"/><rect x="${x + r + 8}" y="${y - 10}" width="12" height="40" fill="#5a3a24"/>`; },
  stools(x, y, n = 4) { let s = ''; for (let i = 0; i < n; i++) { const sx = x + i * 60; s += `<rect x="${sx - 3}" y="${y}" width="6" height="40" fill="#8a8a8a"/><ellipse cx="${sx}" cy="${y}" rx="18" ry="8" fill="#a8322a" stroke="#6a1a1a" stroke-width="2"/><ellipse cx="${sx}" cy="${y + 40}" rx="14" ry="5" fill="#8a8a8a"/>`; } return s; },
  pieCase(x, y) { return `<rect x="${x}" y="${y}" width="80" height="60" fill="#c8dce8" stroke="${INK}" stroke-width="2" opacity="0.9"/><line x1="${x}" x2="${x + 80}" y1="${y + 30}" y2="${y + 30}" stroke="${INK}"/><path d="M${x + 12} ${y + 26}a12 8 0 0 1 24 0z" fill="#c8a060"/><path d="M${x + 44} ${y + 26}a12 8 0 0 1 24 0z" fill="#8a3a3a"/><path d="M${x + 28} ${y + 56}a12 8 0 0 1 24 0z" fill="#e0c040"/>`; },
  jukebox(x, y) { return `<path d="M${x} ${y + 140}V${y + 40}Q${x} ${y} ${x + 50} ${y}Q${x + 100} ${y} ${x + 100} ${y + 40}V${y + 140}Z" fill="#5a3a24"/><path d="M${x + 10} ${y + 60}V${y + 40}Q${x + 10} ${y + 12} ${x + 50} ${y + 12}Q${x + 90} ${y + 12} ${x + 90} ${y + 40}V${y + 60}Z" fill="#e0c040"/><rect x="${x + 12}" y="${y + 66}" width="76" height="30" fill="#a8322a"/><rect x="${x + 20}" y="${y + 104}" width="60" height="26" fill="#2f4f7f"/><g fill="#f7f0dd">${[0, 1, 2, 3].map((i) => `<rect x="${x + 24 + i * 14}" y="${y + 72}" width="8" height="18"/>`).join('')}</g>`; },
  sacks(x, y) { return `<path d="M${x} ${y + 50}q0 -40 30 -44q30 4 30 44z" fill="#c8b088" stroke="#8a6a3a" stroke-width="2"/><path d="M${x + 36} ${y + 54}q0 -36 28 -40q28 4 28 40z" fill="#b8a078" stroke="#8a6a3a" stroke-width="2"/><text class="type" x="${x + 30}" y="${y + 36}" text-anchor="middle" font-size="9" fill="#5a3a24">FEED</text>`; },
  barrels(x, y) { let s = ''; for (let i = 0; i < 3; i++) { const bx = x + i * 44; s += `<rect x="${bx}" y="${y}" width="36" height="52" rx="4" fill="#8a5a3a" stroke="#3a2a1a" stroke-width="2"/><line x1="${bx}" x2="${bx + 36}" y1="${y + 14}" y2="${y + 14}" stroke="#3a2a1a" stroke-width="3"/><line x1="${bx}" x2="${bx + 36}" y1="${y + 38}" y2="${y + 38}" stroke="#3a2a1a" stroke-width="3"/>`; } return s; },
  flag(x, y) { return `<rect x="${x}" y="${y}" width="4" height="200" fill="#b58a2f"/><rect x="${x + 4}" y="${y + 6}" width="90" height="60" fill="#a8322a"/><g fill="#f7f0dd">${[0, 1, 2, 3].map((i) => `<rect x="${x + 4}" y="${y + 6 + 8 + i * 15}" width="90" height="7"/>`).join('')}</g><rect x="${x + 4}" y="${y + 6}" width="40" height="32" fill="#2f4f7f"/><circle cx="${x + 2}" cy="${y}" r="5" fill="#b58a2f"/>`; },
  seal(x, y, r = 46) { return `<circle cx="${x}" cy="${y}" r="${r}" fill="#b58a2f" stroke="#5a3a24" stroke-width="4"/><circle cx="${x}" cy="${y}" r="${r - 10}" fill="none" stroke="#5a3a24" stroke-width="2"/><path d="M${x - 14} ${y + 10}l6 -24h16l6 24z" fill="#5a3a24"/><text class="type" x="${x}" y="${y - r + 2}" text-anchor="middle" font-size="9" letter-spacing="2" fill="#5a3a24" transform="rotate(0)">DRY FORK</text><text class="type" x="${x}" y="${y + r - 6}" text-anchor="middle" font-size="8" letter-spacing="2" fill="#5a3a24">COUNTY</text>`; },
  bench(x, y, w = 160) { return `<rect x="${x}" y="${y}" width="${w}" height="14" fill="#5a3a24"/><rect x="${x}" y="${y - 40}" width="${w}" height="10" fill="#5a3a24"/><rect x="${x}" y="${y - 24}" width="${w}" height="8" fill="#5a3a24"/><rect x="${x + 6}" y="${y + 14}" width="8" height="30" fill="#3a2a1a"/><rect x="${x + w - 14}" y="${y + 14}" width="8" height="30" fill="#3a2a1a"/>`; },
  clock(x, y) { return `<circle cx="${x}" cy="${y}" r="30" fill="#f7f0dd" stroke="#5a3a24" stroke-width="6"/><line x1="${x}" x2="${x}" y1="${y}" y2="${y - 20}" stroke="${INK}" stroke-width="3"/><line x1="${x}" x2="${x + 14}" y1="${y}" y2="${y + 8}" stroke="${INK}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3" fill="${INK}"/>`; },
  board(x, y, w, h, lines, title = '') { return `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" fill="#5a3a24"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2f3a2f"/>${title ? `<text class="hand" x="${x + w / 2}" y="${y + 28}" text-anchor="middle" font-size="22" fill="#f7f0dd">${esc(title)}</text>` : ''}${lines.map((l, i) => `<text class="hand" x="${x + 14}" y="${y + (title ? 58 : 30) + i * 26}" font-size="18" fill="#e8e4d0">${esc(l)}</text>`).join('')}`; },
  safe(x, y) { return `<rect x="${x}" y="${y}" width="90" height="110" fill="#3a3a44" stroke="#2b2418" stroke-width="3"/><rect x="${x + 10}" y="${y + 10}" width="70" height="90" fill="none" stroke="#b58a2f" stroke-width="3"/><circle cx="${x + 45}" cy="${y + 55}" r="14" fill="#b58a2f"/><text class="serif" x="${x + 45}" y="${y + 28}" text-anchor="middle" font-size="9" fill="#e0c040" font-weight="700">MOSLER</text>`; },
  stove(x, y) { return `<rect x="${x + 22}" y="${y - 80}" width="16" height="70" fill="#2b2418"/><ellipse cx="${x + 30}" cy="${y + 10}" rx="34" ry="12" fill="#2b2418"/><rect x="${x}" y="${y}" width="60" height="70" rx="20" fill="#3a3a3a" stroke="#2b2418" stroke-width="3"/><rect x="${x + 18}" y="${y + 30}" width="24" height="18" fill="#a8322a"/><rect x="${x + 8}" y="${y + 70}" width="44" height="8" fill="#2b2418"/><path d="M${x + 6} ${y + 78}l-6 14M${x + 54} ${y + 78}l6 14" stroke="#2b2418" stroke-width="4"/>`; },
  gunRack(x, y) { return `<rect x="${x}" y="${y}" width="150" height="120" fill="#5a3a24"/><g stroke="#2b2418" stroke-width="5" stroke-linecap="round">${[0, 1, 2].map((i) => `<line x1="${x + 30 + i * 40}" x2="${x + 30 + i * 40}" y1="${y + 10}" y2="${y + 110}"/>`).join('')}</g><g fill="#8a6a48">${[0, 1, 2].map((i) => `<rect x="${x + 26 + i * 40}" y="${y + 70}" width="8" height="30"/>`).join('')}</g><rect x="${x}" y="${y + 40}" width="150" height="6" fill="#3a2a1a"/><rect x="${x}" y="${y + 100}" width="150" height="6" fill="#3a2a1a"/>`; },
  telegraph(x, y) { return `<rect x="${x}" y="${y}" width="50" height="14" fill="#5a3a24"/><rect x="${x + 10}" y="${y - 10}" width="22" height="10" fill="#b58a2f"/><circle cx="${x + 40}" cy="${y - 6}" r="5" fill="#2b2418"/>`; },
  scale(x, y) { return `<rect x="${x}" y="${y + 80}" width="120" height="20" fill="#3a3a44"/><rect x="${x + 50}" y="${y}" width="20" height="80" fill="#3a3a44"/><rect x="${x + 20}" y="${y}" width="80" height="24" fill="#f7f0dd" stroke="#2b2418" stroke-width="2"/><path d="M${x + 60} ${y + 20}l-20 -14m20 14l6 -16" stroke="#a8322a" stroke-width="2"/><rect x="${x + 10}" y="${y + 60}" width="100" height="20" fill="#5a5a5a"/>`; },
  hardware(x, y) { let s = `<rect x="${x}" y="${y}" width="150" height="200" fill="#8a6a48"/>`; for (let i = 0; i < 6; i++) { const hx = x + 14 + (i % 3) * 46, hy = y + 16 + Math.floor(i / 3) * 90; s += `<line x1="${hx + 10}" x2="${hx + 10}" y1="${hy}" y2="${hy + 60}" stroke="#5a3a24" stroke-width="5"/><rect x="${hx}" y="${hy}" width="20" height="10" fill="#5a5a5a"/>`; } return s; },
  pews(x, y, n = 3) { let s = ''; for (let i = 0; i < n; i++) { const py = y + i * 42; s += `<rect x="${x}" y="${py}" width="220" height="14" fill="#6a4a2a"/><rect x="${x}" y="${py - 26}" width="220" height="8" fill="#5a3a24"/><rect x="${x + 4}" y="${py + 14}" width="8" height="26" fill="#3a2a1a"/><rect x="${x + 208}" y="${py + 14}" width="8" height="26" fill="#3a2a1a"/>`; } return s; },
  pulpit(x, y) { return `<rect x="${x}" y="${y}" width="70" height="90" fill="#5a3a24"/><rect x="${x - 8}" y="${y - 10}" width="86" height="14" fill="#6a4a2a"/><rect x="${x + 20}" y="${y + 20}" width="30" height="40" fill="none" stroke="#b58a2f" stroke-width="3"/><rect x="${x + 6}" y="${y - 22}" width="58" height="14" fill="#f7f0dd" stroke="${INK}"/>`; },
  stained(x, y, w, h) { const cols = ['#a8322a', '#2f4f7f', '#b58a2f', '#4b6b3a', '#6b4a7a']; let s = `<path d="M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z" fill="#e8e0c8" stroke="${INK}" stroke-width="3"/>`; for (let i = 0; i < 12; i++) { const cx = x + 8 + (i % 3) * ((w - 16) / 3), cy = y + 30 + Math.floor(i / 3) * ((h - 40) / 4); s += `<rect x="${cx}" y="${cy}" width="${(w - 16) / 3 - 4}" height="${(h - 40) / 4 - 4}" fill="${cols[(i * 7) % cols.length]}" opacity="0.85"/>`; } return s + `<path d="M${x + w / 2} ${y + 6}V${y + h}M${x} ${y + h / 2}H${x + w}" stroke="${INK}" stroke-width="2"/>`; },
  thermometer(x, y, frac, title = 'BUILDING FUND') { const h = 160, f = Math.max(0, Math.min(1, frac)); return `<rect x="${x - 30}" y="${y - 30}" width="70" height="${h + 60}" fill="#f7f0dd" stroke="${INK}" stroke-width="2"/><text class="type" x="${x + 5}" y="${y - 12}" text-anchor="middle" font-size="8" fill="${INK}" letter-spacing="1">${esc(title)}</text><rect x="${x}" y="${y}" width="10" height="${h}" fill="#e8e0c8" stroke="${INK}"/><rect x="${x}" y="${y + h * (1 - f)}" width="10" height="${h * f}" fill="#a8322a"/><circle cx="${x + 5}" cy="${y + h + 8}" r="12" fill="#a8322a" stroke="${INK}"/>`; },
  gauge(x, y, w, h, frac, title, sub = '', color = '#a8322a') { const f = Math.max(0, Math.min(1, frac)); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f0dd" stroke="${INK}" stroke-width="2"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" fill="none" stroke="${color}" stroke-width="2"/><text class="serif" x="${x + w / 2}" y="${y + 30}" text-anchor="middle" font-size="16" font-weight="700" fill="${color}">${esc(title)}</text><rect x="${x + 14}" y="${y + 42}" width="${w - 28}" height="16" fill="#e8e0c8" stroke="${INK}"/><rect x="${x + 14}" y="${y + 42}" width="${(w - 28) * f}" height="16" fill="${color}"/>${sub.split('|').map((l, i) => `<text class="type" x="${x + w / 2}" y="${y + 76 + i * 14}" text-anchor="middle" font-size="9" fill="${INK}">${esc(l)}</text>`).join('')}`; },
  rig(x, y, h = 220) { let s = `<g transform="translate(${x} ${y})"><rect x="-44" y="-14" width="88" height="14" fill="#8a7a5a" stroke="${INK}"/><polygon points="-20,-14 20,-14 7,${-h} -7,${-h}" fill="none" stroke="#4a3a2a" stroke-width="3"/>`; for (let i = 1; i < 8; i++) { const t = i / 8, hw = 20 - 13 * t, yy = -14 - (h - 14) * t; s += `<line x1="${-hw}" y1="${yy}" x2="${hw}" y2="${yy}" stroke="#4a3a2a" stroke-width="1.5"/>`; } s += `<rect x="-9" y="${-h - 8}" width="18" height="8" fill="#4a3a2a"/><circle cx="-70" cy="-30" r="26" fill="none" stroke="#4a3a2a" stroke-width="6"/><circle cx="-70" cy="-30" r="4" fill="#4a3a2a"/><rect x="-110" y="-4" width="80" height="4" fill="#4a3a2a"/><rect x="50" y="-40" width="70" height="40" fill="#6a5a48" stroke="${INK}"/><rect x="60" y="-32" width="14" height="10" fill="#c8dce8"/><path d="M-70 -56q0 -40 40 -40" stroke="#2b2418" stroke-width="2" fill="none"/></g>`; return s; },
  pipeStack(x, y) { let s = ''; for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) s += `<rect x="${x + i * 22 + r * 11}" y="${y - r * 14}" width="140" height="12" rx="6" fill="#7a7a72" stroke="${INK}"/>`; return s; },
  boardFence(x, y, w, h = 70) { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#8a6a48"/>`; for (let bx = x; bx < x + w; bx += 18) s += `<rect x="${bx}" y="${y}" width="16" height="${h}" fill="${shade('#8a6a48', (bx / 18) % 2 ? 0.08 : -0.06)}"/>`; return s + `<rect x="${x}" y="${y + 12}" width="${w}" height="6" fill="#5a3a24"/><rect x="${x}" y="${y + h - 18}" width="${w}" height="6" fill="#5a3a24"/>`; },
  keyboard(x, y) { let s = `<rect x="${x}" y="${y}" width="160" height="110" fill="#5a3a24"/>`; for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) s += `<rect x="${x + 8 + c * 25}" y="${y + 8 + r * 25}" width="20" height="20" fill="${(r * 6 + c) % 5 === 1 ? '#8a7a5a' : '#3a2a1a'}"/><rect x="${x + 12 + c * 25}" y="${y + 20 + r * 25}" width="6" height="6" fill="#b58a2f"/>`; return s; },
  chair(x, y, color = '#6b4a3a') { return `<rect x="${x}" y="${y}" width="56" height="40" rx="6" fill="${color}"/><rect x="${x + 4}" y="${y - 30}" width="48" height="34" rx="8" fill="${shade(color, 0.1)}"/><rect x="${x + 6}" y="${y + 40}" width="6" height="16" fill="#3a2a1a"/><rect x="${x + 44}" y="${y + 40}" width="6" height="16" fill="#3a2a1a"/>`; },
  crate(x, y) { return `<rect x="${x}" y="${y}" width="70" height="50" fill="#b89a6a" stroke="#5a3a24" stroke-width="2"/><path d="M${x} ${y}l70 50M${x + 70} ${y}l-70 50" stroke="#5a3a24" stroke-width="2"/>`; },
  sign(x, y, w, h, lines, color = '#a8322a') { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f7f0dd" stroke="${INK}" stroke-width="2" transform="rotate(-2 ${x} ${y})"/>${lines.map((l, i) => `<text class="serif" x="${x + w / 2}" y="${y + 24 + i * 22}" text-anchor="middle" font-size="${i === 0 ? 18 : 12}" font-weight="700" fill="${i === 0 ? color : INK}" transform="rotate(-2 ${x} ${y})">${esc(l)}</text>`).join('')}`; },
  outdoors(state, ground = '#b8a078') { const s = season(state), [top, bot] = SKY[s]; return `<defs><linearGradient id="yardsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs><rect width="960" height="300" fill="url(#yardsky)"/><rect y="300" width="960" height="240" fill="${s === 'winter' ? '#d8d4c8' : ground}"/><g fill="#ffffff" opacity="0.8"><ellipse cx="240" cy="70" rx="70" ry="16"/><ellipse cx="700" cy="110" rx="90" ry="20"/></g><path d="M0 300Q160 270 320 292T640 286T960 296V302H0Z" fill="${LAND[s]}" opacity="0.8"/>`; },
};


function ownerSprite(p) { return { farmer: 'farmer', rancher: 'rancher', homes: 'ceo', state: 'clerk', federal: 'clerk' }[p.surface.type] || 'farmer'; }
// An officeholder as an actor: name and portrait from the roster, Phase 2 fallbacks otherwise.
function official(state, office, talk, fallbackName, fallbackSprite, x, y) { const p = holder(state, office); return { talk, name: p ? p.name : fallbackName, sprite: p ? portraitFor(p) : fallbackSprite, x, y, title: p ? `${p.name}, ${p.title}` : undefined }; }
// The founders who are in this place during the founding year (the banker and the pastor are their own actors).
function founderActors(state, place, spots) {
  if (!isFounding(state)) return [];
  return foundersAt(state, place).filter((f) => !FOUNDERS[f.id].person && f.status !== 'gone').slice(0, spots.length).map((f, i) => ({ talk: `founder:${f.id}`, name: f.name.replace(/, Esq\.$/, ''), sprite: f.portrait, x: spots[i][0], y: spots[i][1], badge: f.status === 'signed' ? '✓' : '$', title: `${f.name}: ${f.terms}${f.leavesIn !== null && f.status !== 'signed' ? ` (leaves town in ${f.leavesIn} months)` : ''}` }));
}
const absentNotice = (state) => K.sign(360, 300, 240, 96, ['CLOSED', `Mr. President away until ${dateStr(state.law.absentUntil)}`, 'Ring the bell for Dot']);

export const ROOMS = {
  office: {
    key: 'office', title: 'Your office', subtitle: (s) => (isAbsent(s) ? `${s.company.name}: the caretaker months` : `${s.company.name}, over the Mercantile, Main Street`),
    background(state) {
      const away = isAbsent(state);
      return K.wall('#c9b58c', '#6a4a2a', true) + K.floorBoards('#9a7040') + K.rug(300, 400, 380, 120)
        + K.door(20, 190, 'STREET') + K.window(130, 60, 200, 180, state) + K.curtain(120, 52, 30, 190) + K.curtain(320, 52, 30, 190)
        + K.plat(370, 50, 260, 180) + K.poster(660, 60, 104, 140, ['VOTE', PARTIES[state.gov?.party || 'ring'].name.toUpperCase().split(' ')[0], PARTIES[state.gov?.party || 'ring'].name.toUpperCase().split(' ').slice(1).join(' '), 'FOR THE COUNTY'], PARTIES[state.gov?.party || 'ring'].color)
        + K.calendar(790, 60, state) + K.cabinet(890, 216) + K.shelf(690, 236, 120, 1)
        + K.radio(700, 254)
        + K.desk(330, 380, 300, 60) + K.phone(350, 338) + K.rolodex(560, 344) + K.lamp(440, 332) + (away ? absentNotice(state) : K.paper(470, 388, 46, 30, -6) + K.paper(390, 392, 40, 26, 8))
        + K.desk(60, 400, 180, 44, '#7a5a3a') + K.paper(80, 406, 40, 26, 4)
        + K.desk(700, 430, 220, 44, '#7a5a3a') + K.paper(740, 436, 40, 26, -3) + K.paper(830, 438, 40, 26, 6);
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 12, y: 180, w: 90, h: 180, goto: 'town', ly: 372, when: (s) => !isAbsent(s) },
      { id: 'window', label: 'The county outside', x: 130, y: 60, w: 200, h: 180, tab: 'community' },
      { id: 'plat', label: 'The land map', x: 362, y: 42, w: 276, h: 196, goto: 'map' },
      { id: 'poster', label: 'Election poster', x: 660, y: 60, w: 104, h: 140, tab: 'gov' },
      { id: 'calendar', label: 'Calendar: next month', x: 790, y: 60, w: 90, h: 110, action: 'next' },
      { id: 'cabinet', label: 'Well files', x: 890, y: 216, w: 60, h: 140, tab: 'wells' },
      { id: 'radio', label: 'Radio: the markets', x: 696, y: 250, w: 68, h: 56, tab: 'market' },
      { id: 'phone', label: 'Telephone: the staff', x: 344, y: 330, w: 56, h: 50, tab: 'staff' },
      { id: 'rolodex', label: 'Rolodex: the people', x: 556, y: 336, w: 54, h: 46, tab: 'people' },
      { id: 'desk', label: 'Your desk: the books', x: 330, y: 380, w: 300, h: 60, tab: 'company', ly: 456 },
    ],
    actors(state) {
      const spots = [[760, 500], [880, 505], [600, 520], [680, 470]];
      const staff = isAbsent(state) ? [] : state.staff.slice(0, 4).map((s, i) => ({ talk: `staff:${s.id}`, name: s.name, sprite: ROLE_SPRITE[s.role] || 'clerk', x: spots[i][0], y: spots[i][1], badge: s.busyUntil > state.month ? '…' : '' }));
      return [{ talk: 'dot', name: 'Dot', sprite: 'clerk', x: 160, y: 500, dir: 'down' }, ...staff];
    },
  },
  // The office before there is a company: rooms to let over the Mercantile.
  storefront: {
    key: 'storefront', title: 'Rooms to let, over the Mercantile', subtitle: (s) => (canForm(s).ok ? 'The papers are ready to sign' : 'Ask at the bank'),
    background(state) {
      const f = foundingSummary(state);
      const lines = f ? [f.geologist ? '✓ a geologist' : '✗ a geologist', f.rig ? '✓ a rig' : '✗ a rig', `${f.capital >= f.minCapital ? '✓' : '✗'} ${money(f.capital)} of ${money(f.minCapital)}`, `${f.monthsLeft} months of hotel money`] : [];
      return K.wall('#c9b58c', '#6a4a2a', true) + K.floorBoards('#9a7040')
        + K.door(20, 190, 'STREET') + K.window(130, 60, 200, 180, state) + K.sign(150, 90, 160, 64, ['FOR RENT', 'inquire First State Bank'])
        + K.plat(370, 50, 260, 180) + K.board(660, 60, 240, 170, lines, 'BEFORE YOU SIGN')
        + K.crate(330, 420) + K.crate(720, 440) + K.stackOfPapers(420, 470, 4)
        + K.desk(330, 380, 300, 60, '#8a6a48') + (canForm(state).ok ? K.paper(440, 386, 70, 44, -4) + K.lamp(360, 332) : '');
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 12, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'plat', label: 'The land map', x: 362, y: 42, w: 276, h: 196, goto: 'map' },
      { id: 'board', label: 'What is still missing', x: 654, y: 54, w: 252, h: 182, open: 'sign' },
      { id: 'papers', label: 'Sign the papers', x: 430, y: 376, w: 100, h: 60, open: 'sign', when: (s) => canForm(s).ok },
    ],
    actors() { return []; },
  },
  bank: {
    key: 'bank', title: 'First State Bank of Dry Fork', subtitle: 'Sound counsel since 1911',
    background(state) {
      return K.wall('#d8d0b8', '#5a4a3a') + K.floorTile('#d8d0b8', '#8a7a68')
        + K.door(30, 190, 'STREET') + K.board(140, 60, 220, 150, ['Production loans . . . 5%', 'Savings . . . . . . . 2%', 'Safe deposit  $3/yr'], 'RATES')
        + K.clock(480, 90) + K.window(560, 60, 160, 150, state) + K.vault(850, 200, 80)
        + K.counter(200, 300, 560, 70) + K.paper(420, 292, 60, 36, -4) + K.lamp(640, 262)
        + K.desk(40, 400, 200, 50, '#5a4a3a') + K.paper(70, 408, 44, 28, 5) + K.safe(60, 470);
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'rates', label: 'Posted rates', x: 134, y: 54, w: 232, h: 162, tab: 'market' },
      { id: 'ledger', label: 'The ledger', x: 400, y: 282, w: 110, h: 60, tab: 'company' },
      { id: 'vault', label: 'The vault: your position', x: 760, y: 110, w: 180, h: 180, tab: 'company' },
    ],
    actors(state) {
      const b = official(state, 'banker', 'banker', 'H. Fenwick', 'banker', 150, 490);
      if (isFounding(state)) b.badge = state.founding?.founders?.ellison?.status === 'signed' ? '✓' : '$';
      return [b, { talk: 'teller', name: 'Miss Okafor', sprite: 'clerk', x: 820, y: 480 }];
    },
  },
  courthouse: {
    key: 'courthouse', title: 'Dry Fork County Courthouse', subtitle: (s) => `${PARTIES[s.gov?.party || 'ring'].name} in the courthouse`,
    background(state) {
      const P = state.permits ? permitSummary(state) : null;
      const lines = P ? [`Drilling permits, ${P.year}:`, `${P.used} of ${P.budget} issued${P.bonus ? ` (${P.bonus} by arrangement)` : ''}`, `Allowable ${Math.round(P.allowable * 100)}%`, P.frozenUntil > state.month ? `FROZEN until ${dateStr(P.frozenUntil)}` : `Severance ${((state.gov?.severance || 0.046) * 100).toFixed(1)}%`] : ['Drilling permits, Room 2'];
      return K.wall('#8a6a4a', '#5a3a24', false) + K.floorBoards('#7a5030')
        + K.door(30, 190, 'SQUARE') + K.flag(130, 60) + K.board(250, 60, 240, 180, lines, 'PERMIT BOARD')
        + K.seal(720, 110) + K.window(800, 60, 130, 150, state)
        + K.desk(560, 260, 340, 100, '#5a3a24') + K.paper(600, 270, 50, 30, -5) + K.lamp(800, 212) + K.paper(720, 272, 44, 28, 6)
        + K.counter(300, 320, 240, 60, '#6a4a2a', false) + K.paper(360, 312, 50, 30, 3);
    },
    hotspots: [
      { id: 'door', label: 'Out to the square', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'notices', label: 'Permit board', x: 244, y: 54, w: 252, h: 192, tab: 'gov' },
      { id: 'seal', label: 'The county', x: 670, y: 60, w: 100, h: 100, tab: 'people' },
      { id: 'bench', label: 'The bench: a word with the judge', x: 560, y: 254, w: 340, h: 106, talk: 'judge' },
    ],
    actors(state) {
      return [
        official(state, 'mayor', 'mayor', 'Mayor Bellweather', 'mayor', 200, 500),
        { talk: 'clerk', name: 'Ida Quintero', sprite: 'clerk', x: 430, y: 470 },
        official(state, 'judge', 'judge', 'Judge Thibodeaux', 'mayor', 760, 500),
        official(state, 'inspector', 'inspector', 'The field man', 'clerk', 880, 470),
        ...founderActors(state, 'courthouse', [[560, 520]]),
      ];
    },
  },
  sheriff: {
    key: 'sheriff', title: "Sheriff's Office and County Jail",
    background(state) {
      const L = state.law ? lawSummary(state) : { heat: 0, investigations: [], crimes: [], convictions: 0 };
      const known = L.crimes.filter((c) => c.discovered).length;
      const inv = L.investigations.length ? L.investigations.map((i) => `${i.by === 'sheriff' ? 'County' : i.by === 'state' ? 'State' : 'Federal'} file: ${i.months} mo, evidence ${i.evidence}`) : ['No file open on you'];
      return K.wall('#b8b0a0', '#6a5a4a') + K.floorBoards('#8a7a6a')
        + K.door(30, 190, 'STREET') + K.gunRack(140, 60)
        + K.gauge(330, 60, 130, 150, L.heat / 100, 'WANTED?', `Heat ${L.heat}/100|${known} crime${known === 1 ? '' : 's'} on record|${L.convictions} conviction${L.convictions === 1 ? '' : 's'}`, L.heat > 60 ? '#a8322a' : L.heat > 30 ? '#b58a2f' : '#4b6b3a')
        + K.board(480, 60, 200, 150, inv, 'OPEN FILES')
        + K.stove(600, 250) + K.bars(700, 40, 240, 320) + K.clock(640, 110)
        + K.desk(100, 380, 300, 60, '#5a4a3a') + K.paper(140, 388, 50, 30, -4) + K.phone(320, 340) + K.lamp(220, 332)
        + K.paper(440, 300, 56, 34, 4) + `<text class="type" x="468" y="322" text-anchor="middle" font-size="7" fill="${INK}" transform="rotate(4 440 300)">UNDERHILL, ATTY.</text>`;
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'wanted', label: 'The heat', x: 330, y: 60, w: 130, h: 150, tab: 'company' },
      { id: 'files', label: 'Open files', x: 474, y: 54, w: 212, h: 162, tab: 'company' },
      { id: 'phone', label: 'Telephone: hire a detective', x: 312, y: 330, w: 60, h: 52, talk: 'detective' },
      { id: 'card', label: "A lawyer's card", x: 436, y: 292, w: 64, h: 48, talk: 'lawyer' },
      { id: 'cell', label: 'The cell', x: 700, y: 40, w: 240, h: 320, tab: 'company' },
    ],
    actors(state) { return [official(state, 'sheriff', 'sheriff', 'Sheriff Trask', 'sheriff', 250, 490)]; },
  },
  clarion: {
    key: 'clarion', title: 'The Dry Fork Clarion', subtitle: (s) => (s.press?.owned ? 'Your newspaper, Thursdays, 5 cents' : 'All the news that fits, Thursdays, 5 cents'),
    background(state) {
      const clip = state.press?.clippings?.at(-1);
      const head = (clip ? clip.headline : (state.news.at(-1)?.text || 'NEWS')).toUpperCase();
      return K.wall('#c8c0a8', '#5a4a3a') + K.floorBoards('#8a6a48')
        + K.door(30, 190, 'STREET') + K.shelf(140, 60, 180, 3, 'type') + K.poster(350, 50, 200, 190, ['THE CLARION', head.slice(0, 18), head.slice(18, 36) || 'VOL. XLI', dateStr(state.month).toUpperCase()], INK)
        + K.window(590, 60, 140, 150, state) + K.press(600, 190) + K.clock(800, 90)
        + K.desk(300, 380, 240, 60, '#6a4a2a') + K.paper(340, 388, 50, 30, -6) + K.phone(470, 340) + K.stackOfPapers(90, 430) + K.stackOfPapers(160, 440, 8) + K.stackOfPapers(110, 500, 6);
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'morgue', label: 'Clippings', x: 134, y: 54, w: 192, h: 148, tab: 'press' },
      { id: 'front', label: 'This week’s front page', x: 350, y: 50, w: 200, h: 190, tab: 'press' },
      { id: 'press', label: 'The press: advertising, or buy the paper', x: 600, y: 190, w: 320, h: 200, tab: 'press' },
    ],
    actors(state) {
      return [official(state, 'editor', 'editor', 'Beatrix Duvall', 'reporter', 420, 500), { talk: 'reporter', name: 'Wes Iverson', sprite: 'reporter', x: 780, y: 480 }];
    },
  },
  cafe: {
    key: 'cafe', title: 'Bluebonnet Cafe', subtitle: 'Chicken fried steak 65¢, open till midnight for rig crews',
    background(state) {
      return K.wall('#e8d8b0', '#8a3a3a') + K.floorTile('#e8e0c8', '#8a3a3a')
        + K.door(30, 190, 'STREET') + K.window(140, 60, 150, 140, state) + K.curtain(132, 52, 26, 150, '#a8322a') + K.curtain(280, 52, 26, 150, '#a8322a')
        + K.board(560, 60, 220, 160, ['Blue plate . . . 65¢', 'Pecan pie . . . 15¢', 'Coffee . . . . . 5¢', 'HELP WANTED: ask Pearl'], 'BLUEBONNET')
        + K.jukebox(840, 200) + K.pieCase(320, 226) + K.clock(460, 100)
        + K.counter(60, 300, 460, 70, '#8a3a3a', false) + K.stools(120, 392, 5)
        + K.table(620, 440) + K.table(840, 470) + K.table(200, 500);
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'menu', label: 'Help wanted', x: 554, y: 54, w: 232, h: 172, tab: 'staff' },
      { id: 'pies', label: 'Pie case', x: 316, y: 220, w: 90, h: 70, talk: 'waitress' },
    ],
    actors(state, ui) {
      const spots = [[560, 490], [700, 470], [860, 500], [150, 505], [930, 470], [440, 500]];
      const out = [official(state, 'saloon', 'waitress', 'Pearl', 'waitress', 290, 470)];
      const guests = founderActors(state, 'cafe', [[560, 490]]);
      const sel = state.parcels[ui?.selected ?? -1];
      const owners = state.parcels.filter((p) => p.drillable && !isPublic(p) && p.surface.type !== 'town' && (p === sel || p.mineral.failedRounds > 0 || (p.mineral.leasedBy === 'player' && !p.surface.agreement)));
      if (sel && sel.drillable && !isPublic(sel) && !owners.includes(sel)) owners.unshift(sel);
      for (const p of owners.slice(0, 2)) guests.push({ talk: `owner:${p.id}`, name: p.surface.ownerPerson, sprite: ownerSprite(p), title: `${p.surface.ownerPerson} of ${p.surface.name}` });
      for (const c of state.candidates.slice(0, 3)) guests.push({ talk: `candidate:${c.id}`, name: c.name, sprite: ROLE_SPRITE[c.role] || 'clerk', title: `${c.name}, ${ROLES[c.role].name} looking for work`, badge: '?' });
      for (const comp of state.competitors.filter((c) => !c.dormant && c.held.some((id) => acreageAsk(state, state.parcels[id])?.forSale)).slice(0, 1)) guests.push({ talk: `rival:${comp.name}`, name: `${comp.tag} landman`, sprite: 'landman', title: `${comp.name}'s landman` });
      guests.slice(0, spots.length).forEach((g, i) => { g.x = spots[i][0]; g.y = spots[i][1]; out.push(g); });
      return out;
    },
  },
  store: {
    key: 'store', title: 'Hargrove Mercantile & Land Office', subtitle: 'Work boots, khakis, hard hats, dynamite by permit',
    background(state) {
      return K.wall('#c8a878', '#6a4a2a') + K.floorBoards('#9a7040')
        + K.door(30, 190, 'STREET') + K.shelf(140, 50, 260, 3, 'goods') + K.hardware(440, 60)
        + K.poster(620, 60, 120, 60, ['LAND OFFICE'], '#2f4f7f') + K.plat(640, 140, 200, 120) + K.window(860, 60, 80, 150, state)
        + K.counter(60, 320, 360, 60, '#6a4a2a', false) + K.paper(120, 312, 50, 30, 4) + K.sacks(440, 400) + K.barrels(470, 470)
        + K.desk(620, 300, 280, 60, '#5a4a3a') + K.paper(660, 308, 50, 30, -5) + K.paper(760, 310, 50, 30, 7) + K.lamp(840, 252);
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'goods', label: 'Oilfield supply', x: 134, y: 44, w: 272, h: 148, tab: 'wells' },
      { id: 'hardware', label: 'Hardware', x: 440, y: 60, w: 150, h: 200, tab: 'wells' },
      { id: 'plat', label: 'The land map', x: 632, y: 132, w: 216, h: 136, goto: 'map' },
      { id: 'landdesk', label: 'Land office: the selected section', x: 620, y: 294, w: 280, h: 66, talk: 'landoffice' },
    ],
    actors(state) {
      const land = state.staff.some((s) => s.founderId === 'whitlock') ? 'Ed Baca' : 'Vernon Whitlock';
      return [{ talk: 'storekeeper', name: 'Mrs. Hargrove', sprite: 'clerk', x: 240, y: 480 }, { talk: 'landoffice', name: land, sprite: 'landman', x: 760, y: 480 }, { talk: 'survey', name: 'Gus, seismograph crew', sprite: 'geologist', x: 560, y: 500 }, ...founderActors(state, 'store', [[380, 470]])];
    },
  },
  depot: {
    key: 'depot', title: 'Rock Island Depot', subtitle: 'Eastbound 6:10, westbound 4:40, freight when it comes',
    background(state) {
      return K.wall('#c8a040', '#6a4a2a', true) + K.floorBoards('#8a6a48')
        + K.door(30, 190, 'PLATFORM') + K.counter(130, 300, 200, 70, '#5a3a24', true) + K.telegraph(200, 292)
        + K.board(380, 60, 260, 180, ['EASTBOUND  6:10  OKC', 'WESTBOUND  4:40  Amarillo', `CRUDE (Cushing)  $${(state.market?.oil ?? 2.53).toFixed(2)}`, 'TANK CARS: ask agent'], 'ROCK ISLAND LINES')
        + K.window(700, 60, 220, 150, state, 'rails') + K.clock(360, 300)
        + K.scale(760, 260) + K.bench(560, 430, 200) + K.bench(80, 460, 160) + K.stackOfPapers(880, 440, 6);
    },
    hotspots: [
      { id: 'door', label: 'Out to the platform', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'schedule', label: 'Schedule and posted prices', x: 374, y: 54, w: 272, h: 192, tab: 'market' },
      { id: 'scale', label: 'Freight scale: pipelines and gathering', x: 750, y: 250, w: 150, h: 120, tab: 'market' },
      { id: 'window', label: 'Ticket window', x: 130, y: 170, w: 200, h: 200, talk: 'agent' },
    ],
    actors(state) { return [{ talk: 'agent', name: 'Amos Petrov', sprite: 'clerk', x: 230, y: 480 }, { talk: 'roughneck', name: 'A roughneck', sprite: 'roughneck', x: 660, y: 495, title: 'waiting on the westbound' }, ...founderActors(state, 'depot', [[860, 500]])]; },
  },
  church: {
    key: 'church', title: 'First Methodist Church', subtitle: 'Sunday 10 AM. Wildcatters welcome. Tithing encouraged.',
    background(state) {
      const gw = state.press?.goodwill || 0;
      return K.wall('#e8e0c8', '#7a5a3a') + K.floorBoards('#a08050')
        + K.door(30, 190, 'STREET') + K.stained(400, 40, 160, 240) + K.stained(640, 70, 100, 200)
        + K.thermometer(860, 90, Math.min(1, 0.3 + gw / 80), 'BUILDING FUND')
        + K.pulpit(440, 300) + K.pews(120, 420, 3) + K.pews(600, 420, 3) + K.clock(260, 100)
        + K.poster(150, 60, 110, 130, ['SUNDAY', 'THE PARABLE', 'OF THE', 'TALENTS'], '#2f4f7f');
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'fund', label: 'The building fund', x: 826, y: 56, w: 76, h: 232, talk: 'preacher' },
      { id: 'pulpit', label: 'The pulpit', x: 430, y: 276, w: 90, h: 118, talk: 'preacher' },
    ],
    actors(state) { return [official(state, 'preacher', 'preacher', 'Rev. Stroud', 'oldtimer', 520, 470), ...founderActors(state, 'church', [[300, 500]])]; },
  },
  rigyard: {
    key: 'rigyard', title: "Sandoval's rig yard", subtitle: (s) => (s.flags?.ownRig ? `${s.flags.ownRig.name}, paid for` : 'Pipe, bits, and one cable-tool spudder'),
    background(state) {
      return K.outdoors(state, '#a8906a') + K.rig(560, 330, 230) + K.pipeStack(80, 330) + K.barrels(760, 300) + K.crate(860, 330)
        + K.boardFence(0, 460, 960, 70) + K.sign(380, 466, 200, 58, ['SANDOVAL DRILLING', 'cable tool · footage or day rate'])
        + `<rect x="440" y="470" width="80" height="60" fill="#3a2a1a" opacity="0.15"/>`;
    },
    hotspots: [
      { id: 'gate', label: 'Back to the street', x: 420, y: 462, w: 120, h: 70, goto: 'town', ly: 520 },
      { id: 'rig', label: 'The spudder', x: 440, y: 90, w: 260, h: 250, talk: 'yardhand' },
    ],
    actors(state) { return [{ talk: 'yardhand', name: 'Chuy', sprite: 'roughneck', x: 200, y: 430, title: 'yard hand' }, ...founderActors(state, 'rigyard', [[620, 420]])]; },
  },
  hotel: {
    key: 'hotel', title: 'Dry Fork Hotel', subtitle: (s) => (isFounding(s) ? `Room 4, ${money(s.founding.livingCost)} a month, bill on the first` : 'Steam heat. Travelling men welcome.'),
    background(state) {
      return K.wall('#d8c8a8', '#6a4a2a', true) + K.floorTile('#e0d4b8', '#8a5a4a') + K.rug(320, 400, 360, 120, '#2f4f7f', '#c8a060')
        + K.door(30, 190, 'STREET') + K.keyboard(140, 60) + K.clock(400, 90) + K.window(560, 60, 160, 150, state)
        + K.poster(760, 60, 120, 150, ['ROOMS', '$4 A NIGHT', 'STEAM HEAT', 'BATH DOWN HALL'], '#2f4f7f')
        + K.counter(120, 300, 300, 70, '#5a3a24', false) + K.paper(200, 292, 50, 30, 3) + K.lamp(360, 252)
        + K.chair(560, 430) + K.chair(760, 460) + K.table(680, 470, 28) + K.stackOfPapers(660, 462, 3);
    },
    hotspots: [
      { id: 'door', label: 'Out to the street', x: 22, y: 180, w: 90, h: 180, goto: 'town', ly: 372 },
      { id: 'desk', label: 'The desk', x: 120, y: 180, w: 300, h: 190, talk: 'hotelclerk' },
    ],
    actors(state) {
      const out = [{ talk: 'hotelclerk', name: 'Nell', sprite: 'waitress', x: 260, y: 480 }, ...founderActors(state, 'hotel', [[600, 500]])];
      if (state.law?.detectiveUntil > state.month) out.push({ talk: 'detective', name: 'The man from Tulsa', sprite: 'landman', x: 860, y: 500, title: 'your detective, Room 6' });
      if ((state.law?.investigations || []).some((i) => i.status === 'open' && i.by === 'state')) out.push({ talk: 'statemen', name: 'Two men in grey', sprite: 'landman', x: 740, y: 520, title: "the state attorney general's men" });
      return out;
    },
  },
};
