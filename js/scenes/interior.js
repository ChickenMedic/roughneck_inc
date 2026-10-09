// Generic room renderer: one 960x540 SVG with the room's background, its hotspots (dashed pencil
// outlines with a handwritten label) and its actors (sprite + nametag, bobbing by CSS). Everything is
// data-action driven so the delegated click handler in main.js does the rest. Also used by the field.
import { esc } from '../util.js';
import { spriteUrl } from './sprites.js';

export const ROOM_W = 960, ROOM_H = 540;

export function hotspotSvg(h, attrs = '') {
  const lx = h.lx ?? h.x + 4, ly = h.ly ?? h.y + h.h + 16;
  const data = h.goto ? `data-action="goto" data-screen="${esc(Array.isArray(h.goto) ? h.goto[0] : h.goto)}"` : `data-action="hotspot" data-id="${esc(h.id)}"`;
  return `<g class="hotspot${h.cls ? ' ' + h.cls : ''}" ${data} ${attrs} tabindex="0" role="button"><title>${esc(h.title || h.label)}</title>
    <rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="6"/>
    <text class="hand" x="${lx}" y="${ly}">${esc(h.label)}</text></g>`;
}

export function actorSvg(a, i = 0) {
  const scale = a.scale || 5, w = 12 * scale, h = 16 * scale;
  const delay = (-((i * 37) % 11) / 10).toFixed(1);
  return `<g class="actor" data-action="talk" data-id="${esc(a.talk)}" transform="translate(${a.x} ${a.y})" tabindex="0" role="button"><title>${esc(a.title || `Talk to ${a.name}`)}</title>
    <ellipse class="shadow" cx="0" cy="2" rx="${w * 0.42}" ry="${scale * 1.2}"/>
    <image href="${spriteUrl(a.sprite || 'clerk', a.name || '', a.dir || 'down', 0, scale)}" x="${-w / 2}" y="${-h}" width="${w}" height="${h}" style="animation-delay:${delay}s"/>
    ${a.badge ? `<g class="badge" transform="translate(${w / 2 - 6} ${-h - 4})"><circle r="9"/><text y="4">${esc(a.badge)}</text></g>` : ''}
    <g class="tag" transform="translate(0 ${scale * 2 + 8})"><rect x="${-(a.name.length * 3.6 + 8)}" y="-9" width="${a.name.length * 7.2 + 16}" height="15" rx="2"/><text y="2">${esc(a.name)}</text></g></g>`;
}

export function plateSvg(title, sub = '') {
  const w = Math.max(title.length * 8.4, sub.length * 6.2) + 24;
  return `<g class="plate" transform="translate(16 16)"><rect width="${w}" height="${sub ? 40 : 26}" rx="3"/><text x="12" y="18">${esc(title)}</text>${sub ? `<text class="sub" x="12" y="33">${esc(sub)}</text>` : ''}</g>`;
}

// room = { key, title, subtitle?(state), background(state, ui) -> svg, hotspots: [...], actors(state, ui) -> [...] }
export function renderInterior(state, ui, room, opts = {}) {
  const bg = room.background(state, ui);
  const hs = opts.empty ? '' : (room.hotspots || []).filter((h) => !h.when || h.when(state, ui)).map((h) => hotspotSvg(h)).join('');
  const actors = opts.empty ? [] : (room.actors ? room.actors(state, ui) : []).slice().sort((a, b) => a.y - b.y);
  const sub = typeof room.subtitle === 'function' ? room.subtitle(state, ui) : room.subtitle || '';
  return `<svg class="room room-${esc(room.key)}" viewBox="0 0 ${ROOM_W} ${ROOM_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(room.title)}">
    ${bg}${hs}${actors.map((a, i) => actorSvg(a, i)).join('')}${opts.empty ? '' : plateSvg(room.title, sub)}</svg>`;
}
