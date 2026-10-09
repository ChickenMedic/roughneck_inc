// The Field: an SVG landscape of the selected section. Sky by season, land use by surface owner, the
// creek if Coyote Creek crosses it, the county road with a mailbox and a gate, and the wells as they
// stand (rocking pumpjacks, a derrick, a flare, a scorched pad, a capped pipe). The owner waits at
// the gate; the toolpusher is on site while a rig is up. Pure function of (state, ui).
import { esc, fmt, dateStr } from '../util.js';
import { season } from '../era.js';
import { riverParcels } from '../geography.js';
import { OWNER_TYPES, GRID_W } from '../data.js';
import { statusLabel } from '../wells.js';
import { isPublic } from '../land.js';
import { actorSvg, plateSvg } from './interior.js';

const INK = '#2b2418';
const SKY = { winter: ['#b8c8d4', '#e8ecf0'], spring: ['#7ab0dc', '#d8e8f0'], summer: ['#5a9cdc', '#cfe4f4'], fall: ['#b0a080', '#ecdcc0'] };
const LAND = { winter: '#d8d4c8', spring: '#7c9c5a', summer: '#a8a060', fall: '#b89858' };
const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ownerSprite = (p) => ({ farmer: 'farmer', rancher: 'rancher', homes: 'ceo', state: 'clerk', federal: 'clerk', preserve: 'geologist' }[p.surface.type] || 'farmer');

function hs(action, data, label, x, y, w, h, title = '') {
  const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ');
  return `<g class="hotspot" data-action="${action}" ${attrs} tabindex="0" role="button"><title>${esc(title || label)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text class="hand" x="${x + 8}" y="${y + h - 10}">${esc(label)}</text></g>`;
}

// ---------- structures ----------
function pumpjack(x, y, s = 1, moving = true, color = '#a8322a') {
  const anim = moving && !reduced() ? `<animateTransform attributeName="transform" type="rotate" values="-7 0 -56;7 0 -56;-7 0 -56" dur="${(2.4 + (x % 7) / 10).toFixed(1)}s" repeatCount="indefinite"/>` : '';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-56" y="-6" width="112" height="6" fill="${INK}"/><polygon points="-8,-6 8,-6 0,-58" fill="#6a6a6a" stroke="${INK}" stroke-width="1.5"/>
    <g>${anim}<rect x="-54" y="-60" width="100" height="6" fill="${color}" stroke="${INK}" stroke-width="1"/><path d="M-54 -64l-14 4v16l14 4z" fill="${INK}"/><line x1="-60" y1="-46" x2="-60" y2="-6" stroke="${INK}" stroke-width="2"/><line x1="42" y1="-56" x2="38" y2="-20" stroke="${INK}" stroke-width="2"/></g>
    <rect x="18" y="-30" width="44" height="26" fill="#8a7a5a" stroke="${INK}"/><circle cx="40" cy="-20" r="11" fill="#c8c0b0" stroke="${INK}" stroke-width="1.5"/><rect x="-66" y="-16" width="12" height="10" fill="${INK}"/></g>`;
}
function tanks(x, y) { return `<g transform="translate(${x} ${y})"><rect x="0" y="-40" width="34" height="40" fill="#8a8a7a" stroke="${INK}"/><ellipse cx="17" cy="-40" rx="17" ry="5" fill="#a8a898" stroke="${INK}"/><rect x="40" y="-40" width="34" height="40" fill="#8a8a7a" stroke="${INK}"/><ellipse cx="57" cy="-40" rx="17" ry="5" fill="#a8a898" stroke="${INK}"/><rect x="-6" y="0" width="86" height="4" fill="#6a5a48"/></g>`; }
function derrick(x, y) {
  let s = `<g transform="translate(${x} ${y})"><rect x="-40" y="-16" width="80" height="16" fill="#8a7a5a" stroke="${INK}"/><polygon points="-18,-16 18,-16 6,-150 -6,-150" fill="none" stroke="${INK}" stroke-width="2.5"/>`;
  for (let i = 1; i < 7; i++) { const t = i / 7, hw = 18 - 12 * t, yy = -16 - 134 * t, hw2 = 18 - 12 * (i + 1) / 7, yy2 = -16 - 134 * (i + 1) / 7; s += `<line x1="${-hw}" y1="${yy}" x2="${hw}" y2="${yy}" stroke="${INK}" stroke-width="1.2"/><line x1="${-hw}" y1="${yy}" x2="${hw2}" y2="${yy2}" stroke="${INK}" stroke-width="0.8"/><line x1="${hw}" y1="${yy}" x2="${-hw2}" y2="${yy2}" stroke="${INK}" stroke-width="0.8"/>`; }
  s += `<rect x="-8" y="-158" width="16" height="8" fill="${INK}"/><rect x="50" y="-40" width="60" height="40" fill="#6a5a48" stroke="${INK}"/><rect x="60" y="-34" width="12" height="10" fill="#c8dce8"/><ellipse cx="-90" cy="0" rx="36" ry="9" fill="#5a4a3a" stroke="${INK}"/><rect x="-100" y="-30" width="28" height="30" fill="#8a3a3a" stroke="${INK}"/></g>`;
  return s;
}
function stake(x, y) { return `<g transform="translate(${x} ${y})"><rect x="-2" y="-50" width="4" height="50" fill="#8a6a48"/><polygon points="2,-50 30,-42 2,-34" fill="#a8322a"/><rect x="-30" y="-22" width="60" height="16" fill="#f7f0dd" stroke="${INK}"/><text class="type" x="0" y="-10" text-anchor="middle" font-size="9" letter-spacing="1" fill="${INK}">LOCATION</text></g>`; }
function capped(x, y, label) { return `<g transform="translate(${x} ${y})"><rect x="-5" y="-26" width="10" height="26" fill="#5a5a5a" stroke="${INK}"/><rect x="-14" y="-32" width="28" height="8" fill="#8a3a3a" stroke="${INK}"/><rect x="-24" y="-4" width="48" height="4" fill="#6a6a5a"/><rect x="14" y="-40" width="44" height="14" fill="#f7f0dd" stroke="${INK}"/><text class="type" x="36" y="-29" text-anchor="middle" font-size="9" fill="${INK}">${esc(label)}</text></g>`; }
function scorched(x, y) {
  const a = reduced() ? '' : '<animate attributeName="opacity" values="0.9;0.5;0.9" dur="0.6s" repeatCount="indefinite"/>';
  return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="0" rx="90" ry="16" fill="#2b2418" opacity="0.8"/><polygon points="-14,-8 10,-8 22,-110 4,-118" fill="none" stroke="${INK}" stroke-width="2.5"/><path d="M-20 -10q10 -60 30 -40q-4 30 20 20q10 40 -30 40q-40 0 -20 -20z" fill="#e0742a">${a}</path><path d="M-6 -20q8 -40 20 -26q-2 20 8 16q6 26 -18 26q-24 0 -10 -16z" fill="#f0c040">${a}</path><g fill="#6a6a6a" opacity="0.7"><ellipse cx="20" cy="-120" rx="30" ry="14">${reduced() ? '' : '<animate attributeName="cy" values="-110;-150" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="3s" repeatCount="indefinite"/>'}</ellipse><ellipse cx="-10" cy="-150" rx="40" ry="18">${reduced() ? '' : '<animate attributeName="cy" values="-140;-190" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0" dur="4s" repeatCount="indefinite"/>'}</ellipse></g></g>`;
}
function flare(x, y) {
  const a = reduced() ? '' : '<animate attributeName="opacity" values="1;0.6;1" dur="0.5s" repeatCount="indefinite"/>';
  return `<g transform="translate(${x} ${y})"><rect x="-3" y="-70" width="6" height="70" fill="#5a5a5a" stroke="${INK}"/><path d="M-8 -70q4 -30 8 -34q4 8 12 34z" fill="#e0742a">${a}</path><path d="M-3 -70q2 -16 3 -20q2 6 5 20z" fill="#f0c040">${a}</path></g>`;
}
function mailbox(x, y, name) { return `<g transform="translate(${x} ${y})"><rect x="-2" y="-40" width="4" height="40" fill="#5a3a24"/><rect x="-16" y="-54" width="32" height="16" rx="6" fill="#3a3a44" stroke="${INK}"/><rect x="12" y="-64" width="3" height="14" fill="#a8322a"/><text class="hand" x="0" y="-60" text-anchor="middle" font-size="16" fill="${INK}" font-weight="600" paint-order="stroke" stroke="#f7f0dd" stroke-width="4">${esc(name)}</text></g>`; }
function fence(y, gateX = 440, gateW = 80) {
  let s = `<g stroke="#5a3a24">`;
  for (let x = 20; x < 960; x += 60) { if (x > gateX - 20 && x < gateX + gateW + 20) continue; s += `<rect x="${x - 2}" y="${y - 30}" width="4" height="34" fill="#5a3a24"/>`; }
  s += `<line x1="0" x2="${gateX - 10}" y1="${y - 24}" y2="${y - 24}" stroke-width="1.2"/><line x1="0" x2="${gateX - 10}" y1="${y - 12}" y2="${y - 12}" stroke-width="1.2"/><line x1="${gateX + gateW + 10}" x2="960" y1="${y - 24}" y2="${y - 24}" stroke-width="1.2"/><line x1="${gateX + gateW + 10}" x2="960" y1="${y - 12}" y2="${y - 12}" stroke-width="1.2"/>`;
  s += `<rect x="${gateX - 14}" y="${y - 40}" width="6" height="44" fill="#5a3a24"/><rect x="${gateX + gateW + 8}" y="${y - 40}" width="6" height="44" fill="#5a3a24"/><g transform="translate(${gateX - 8} ${y - 34}) skewY(12)"><rect x="0" y="0" width="60" height="30" fill="none" stroke="#5a3a24" stroke-width="3"/><line x1="0" y1="15" x2="60" y2="15" stroke-width="2"/><line x1="0" y1="0" x2="60" y2="30" stroke-width="1.5"/></g></g>`;
  return s;
}
function landUse(p, sea) {
  const t = p.surface.type, land = LAND[sea];
  let s = '';
  if (t === 'farmer') {
    s += `<g stroke="${sea === 'winter' ? '#b8b4a8' : '#8a7040'}" stroke-width="2" opacity="0.7">`;
    for (let i = 0; i < 22; i++) { const x0 = 480 + (i - 11) * 24, x1 = 480 + (i - 11) * 110; s += `<line x1="${x0}" y1="312" x2="${x1}" y2="440"/>`; }
    s += `</g><g transform="translate(760 250)"><polygon points="0,60 0,20 40,0 80,20 80,60" fill="#8a3a3a" stroke="${INK}"/><rect x="30" y="34" width="20" height="26" fill="#3a2a1a"/><rect x="100" y="30" width="28" height="30" fill="#f0e8d8" stroke="${INK}"/><polygon points="96,30 114,16 132,30" fill="#6a6a70"/></g>`;
    if (sea === 'summer' || sea === 'fall') s += `<g fill="#c8a040" opacity="0.5">${[...Array(30)].map((_, i) => `<rect x="${(i * 97) % 940}" y="${330 + (i * 37) % 90}" width="3" height="10"/>`).join('')}</g>`;
  } else if (t === 'rancher') {
    s += `<g fill="${sea === 'winter' ? '#c8c4b8' : '#5e7e3e'}" opacity="0.8">${[...Array(40)].map((_, i) => `<path d="M${(i * 131) % 950} ${330 + (i * 53) % 100}l3 -9l3 9M${(i * 131) % 950 + 3} ${330 + (i * 53) % 100}v-12" stroke="${sea === 'winter' ? '#c8c4b8' : '#5e7e3e'}" fill="none"/>`).join('')}</g>`;
    s += `<g fill="${INK}">${[[150, 340], [210, 352], [700, 345]].map(([x, y]) => `<path d="M${x} ${y}h30v-14h-30zM${x + 2} ${y}v8M${x + 26} ${y}v8M${x + 30} ${y - 12}l8 -4v8z" stroke="${INK}" stroke-width="2"/>`).join('')}</g>`;
    s += `<g transform="translate(860 240)"><rect x="-2" y="0" width="4" height="80" fill="#5a5a5a"/><g stroke="#5a5a5a" stroke-width="3">${[0, 45, 90, 135].map((a) => `<line x1="0" y1="-18" x2="0" y2="18" transform="rotate(${a})"/>`).join('')}</g><rect x="-16" y="80" width="32" height="6" fill="#5a5a5a"/></g>`;
  } else if (t === 'homes') {
    for (let i = 0; i < 5; i++) { const x = 60 + i * 190; s += `<g transform="translate(${x} 300)"><rect x="0" y="0" width="90" height="50" fill="${['#f0e8d8', '#c8dce8', '#e8d8b0', '#d8c8c8', '#c8d8c0'][i]}" stroke="${INK}"/><polygon points="-6,0 45,-30 96,0" fill="#6a6a70" stroke="${INK}"/><rect x="36" y="24" width="16" height="26" fill="#3a2a1a"/><rect x="10" y="14" width="14" height="14" fill="#a8c4d0" stroke="${INK}"/><rect x="66" y="14" width="14" height="14" fill="#a8c4d0" stroke="${INK}"/></g>`; }
    s += `<path d="M0 372H960" stroke="#c8a878" stroke-width="10"/>`;
  } else if (t === 'state' || t === 'federal') {
    s += `<g fill="${sea === 'winter' ? '#c8c4b8' : '#5e7e3e'}" opacity="0.7">${[...Array(30)].map((_, i) => `<path d="M${(i * 173) % 950} ${340 + (i * 61) % 90}l3 -9l3 9" stroke="${sea === 'winter' ? '#c8c4b8' : '#5e7e3e'}" fill="none"/>`).join('')}</g>`;
    s += `<g transform="translate(120 330)"><rect x="-3" y="0" width="6" height="70" fill="#5a3a24"/><rect x="-60" y="-40" width="120" height="44" fill="#f7f0dd" stroke="${INK}" stroke-width="2"/><text class="type" x="0" y="-22" text-anchor="middle" font-size="10" letter-spacing="1" fill="${INK}">${t === 'state' ? 'STATE TRUST LAND' : 'U.S. PUBLIC LAND'}</text><text class="type" x="0" y="-8" text-anchor="middle" font-size="8" fill="${INK}">LEASE BY SEALED BID ONLY</text></g>`;
  } else if (t === 'preserve') {
    for (let i = 0; i < 14; i++) { const x = (i * 71) % 940, y = 300 + (i * 41) % 110, h = 60 + (i % 3) * 20; s += `<g transform="translate(${x} ${y})"><rect x="-3" y="-10" width="6" height="14" fill="#5a3a24"/><ellipse cx="0" cy="${-h / 2 - 8}" rx="${22 + (i % 3) * 4}" ry="${h / 2}" fill="${sea === 'winter' ? '#8a9a80' : '#4b6b3a'}" stroke="${INK}"/></g>`; }
  } else if (t === 'town') {
    for (let i = 0; i < 8; i++) { const x = 20 + i * 118; s += `<g transform="translate(${x} 300)"><rect x="0" y="0" width="100" height="${40 + (i % 3) * 14}" fill="${['#c8a878', '#9a4a3a', '#efe8d8', '#9aa0a8'][i % 4]}" stroke="${INK}"/><rect x="40" y="${20 + (i % 3) * 14}" width="20" height="${20}" fill="#3a2a1a"/></g>`; }
  }
  return s;
}

export function renderField(state, ui) {
  const p = state.parcels[ui.selected ?? -1];
  if (!p) return `<svg class="room field" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid meet"><rect width="960" height="540" fill="#7c9c5a"/>${plateSvg('No section selected', 'Pick one on the land map')}${hs('goto', { screen: 'map' }, 'Back to the land map', 720, 16, 220, 44)}</svg>`;
  const sea = season(state), [top, bot] = SKY[sea], land = LAND[sea];
  const river = riverParcels(state).has(p.id);
  const wells = p.wells.map((id) => state.wells.find((w) => w.id === id)).filter(Boolean);
  const rivals = p.competitorWells || 0;
  const ot = OWNER_TYPES[p.surface.type] || { name: p.surface.type };
  let s = `<defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>`;
  s += `<rect width="960" height="300" fill="url(#fsky)"/>`;
  s += `<circle cx="${sea === 'winter' ? 780 : 160}" cy="${sea === 'summer' ? 60 : 90}" r="${sea === 'winter' ? 22 : 30}" fill="${sea === 'winter' ? '#f4f2ea' : '#f8e8a0'}" opacity="0.95"/>`;
  s += `<g fill="#ffffff" opacity="${sea === 'fall' ? 0.7 : 0.85}"><ellipse cx="300" cy="80" rx="70" ry="18"/><ellipse cx="340" cy="70" rx="40" ry="16"/><ellipse cx="620" cy="120" rx="90" ry="20"/><ellipse cx="660" cy="108" rx="50" ry="18"/></g>`;
  s += `<path d="M0 300Q120 262 260 286T520 280T760 288T960 296V300Z" fill="${sea === 'winter' ? '#b8b8b0' : '#8a9a70'}" opacity="0.8"/>`;
  s += `<rect y="300" width="960" height="240" fill="${land}"/>`;
  // rival wells on the horizon
  for (let i = 0; i < Math.min(rivals, 4); i++) s += pumpjack(120 + i * 140, 304, 0.42, true, '#5a5a5a');
  s += landUse(p, sea);
  if (river) s += `<path d="M0 340Q160 322 320 344T640 340T960 350V378Q800 366 640 380T320 372T0 384Z" fill="#4a7aa0" opacity="0.85"/><path d="M0 352Q160 334 320 356T640 352T960 362" stroke="#7aa4c4" stroke-width="2" fill="none"/><g stroke="#4b6b3a" stroke-width="2">${[...Array(16)].map((_, i) => `<line x1="${i * 62 + 10}" y1="${386 - (i % 2) * 6}" x2="${i * 62 + 12}" y2="${360 - (i % 3) * 5}"/>`).join('')}</g><text class="hand" x="880" y="336" font-size="16" fill="#2f4f7f" text-anchor="end">Coyote Creek</text>`;
  // wells
  const spots = [220, 400, 620, 800];
  wells.slice(0, 4).forEach((w, i) => {
    const x = spots[i], y = 400;
    let glyph = '';
    if (w.status === 'producing' || w.status === 'shutin' || w.status === 'workover') { glyph = pumpjack(x, y, 1, w.status === 'producing'); glyph += tanks(x + 80, y); if (w.lastMonth?.flared > 0) glyph += flare(x + 190, y); }
    else if (w.status === 'drill' || w.status === 'complete') glyph = derrick(x, y);
    else if (w.status === 'permit') glyph = stake(x, y);
    else if (w.status === 'blowout') glyph = scorched(x, y);
    else glyph = capped(x, y, w.status === 'dry' ? 'DRY' : 'P&A');
    s += `<g class="hotspot well" data-action="well-detail" data-id="${w.id}" tabindex="0" role="button"><title>${esc(`${w.name}: ${statusLabel(w)}${w.lastMonth ? `, ${fmt(w.lastMonth.rate)} bbl/d` : ''}`)}</title>${glyph}<text class="hand" x="${x}" y="${y + 18}" text-anchor="middle" font-size="15" fill="${INK}" paint-order="stroke" stroke="#f7f0dd" stroke-width="4">${esc(w.name)} · ${esc(statusLabel(w))}</text></g>`;
  });
  // road, fence, gate, mailbox
  s += fence(456);
  s += `<rect y="470" width="960" height="44" fill="${sea === 'winter' ? '#d6ccb6' : '#c9a877'}"/><g stroke="${sea === 'winter' ? '#c4b9a2' : '#b28f62'}" stroke-width="2" stroke-dasharray="14 10"><line x1="0" y1="482" x2="960" y2="482"/><line x1="0" y1="500" x2="960" y2="500"/></g>`;
  s += `<rect y="514" width="960" height="26" fill="${land}"/>`;
  s += mailbox(600, 468, p.surface.type === 'state' ? 'State of Oklahoma' : p.surface.type === 'federal' ? 'U.S. Government' : p.surface.type === 'town' ? 'Dry Fork' : p.surface.ownerPerson);
  // hotspots
  s += hs('goto', { screen: 'map' }, 'Back to the land map', 720, 16, 220, 44);
  if (p.x > 0) s += hs('field-nav', { dir: -1 }, '< west', 8, 200, 90, 120, `West: ${state.parcels[p.id - 1].surface.name}`);
  if (p.x < GRID_W - 1) s += hs('field-nav', { dir: 1 }, 'east >', 862, 200, 90, 120, `East: ${state.parcels[p.id + 1].surface.name}`);
  s += hs('tab', { id: 'parcel' }, 'The parcel file', 720, 66, 220, 44);
  // actors
  const actors = [];
  if (p.surface.type !== 'town' && p.surface.type !== 'preserve') actors.push({ talk: `owner:${p.id}`, name: isPublic(p) ? (p.surface.type === 'state' ? 'Land agent' : 'BLM ranger') : p.surface.ownerPerson, sprite: ownerSprite(p), x: 470, y: 512, title: isPublic(p) ? 'The agency man at the gate' : `${p.surface.ownerPerson} at the gate` });
  const rig = wells.find((w) => w.status === 'drill' || w.status === 'complete');
  if (rig) { const i = wells.indexOf(rig); actors.push({ talk: `toolpusher:${rig.id}`, name: 'Toolpusher', sprite: 'roughneck', x: spots[Math.min(i, 3)] + 130, y: 448, scale: 4 }); }
  s += actors.sort((a, b) => a.y - b.y).map((a, i) => actorSvg(a, i)).join('');
  const sub = `${ot.name}, ${p.acres} acres · ${p.mineral.leasedBy === 'player' ? 'your lease' : p.mineral.leasedBy ? `held by ${p.mineral.leasedBy}` : 'unleased'}${p.surface.agreement ? ' · surface signed' : ''} · ${dateStr(state.month)}`;
  s += plateSvg(`${p.surface.name} — Sec. ${p.id}`, sub);
  return `<svg class="room field" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(p.surface.name)}">${s}</svg>`;
}
