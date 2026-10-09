// Screen state machine. Each screen is {enter?, exit?, render, onKey?}; goto() swaps them, stopping and
// starting the town loop as needed; back() is what Escape does. render() in main.js calls the active
// screen's render after the chrome (topbar, ticker, news, drawer) has been redrawn.
import { renderPlatMap } from './platmap.js';
import { renderInterior } from '../scenes/interior.js';
import { ROOMS } from '../scenes/rooms.js';
import { renderField } from '../scenes/field.js';
import * as town from '../scenes/town.js';
import { isFounding } from '../founding.js';

let ctx = null;
const $ = (s) => document.querySelector(s);
function showCanvas(on) { $('#overworld').hidden = !on; $('#screen').hidden = on; }
function talkDefault(room, e, c) {
  if (e.code !== 'Space' && e.code !== 'Enter') return false;
  const a = room?.actors?.(c.state, c.ui)?.[0];
  if (a) c.openTalk(a.talk, { npc: a.name });
  return true;
}

export const SCREENS = {
  title: {
    enter() { showCanvas(false); },
    render(state, ui) { $('#screen').innerHTML = renderInterior(state, ui, ROOMS.office, { empty: true }); },
    onKey() { return true; },
  },
  office: {
    enter(c) { showCanvas(false); c.ui.place = 'office'; },
    render(state, ui) { $('#screen').innerHTML = renderInterior(state, ui, isFounding(state) ? ROOMS.storefront : ROOMS.office); },
  },
  map: {
    enter() { showCanvas(false); },
    render(state, ui) { $('#screen').innerHTML = `<div id="map">${renderPlatMap(state, ui)}</div>`; },
  },
  town: {
    enter(c, opts) { showCanvas(true); town.enter(c, opts); },
    exit() { town.exit(); },
    render(state) { town.sync(state); },
    onKey: town.onKey,
  },
  interior: {
    enter(c, opts) { showCanvas(false); if (!ROOMS[c.ui.place]) c.ui.place = 'bank'; },
    render(state, ui) { $('#screen').innerHTML = renderInterior(state, ui, ROOMS[ui.place] || ROOMS.bank); },
    onKey(e, c) { return talkDefault(ROOMS[c.ui.place], e, c); },
  },
  field: {
    enter() { showCanvas(false); },
    render(state, ui) { $('#screen').innerHTML = renderField(state, ui); },
    onKey(e, c) {
      if (e.code === 'Space' || e.code === 'Enter') { const p = c.state.parcels[c.ui.selected ?? -1]; if (p && p.surface.type !== 'town' && p.surface.type !== 'preserve') c.openTalk(`owner:${p.id}`); return true; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { c.actions['field-nav']({ dataset: { dir: e.code === 'ArrowLeft' ? '-1' : '1' } }, c.state); return true; }
      return false;
    },
  },
};

export const HINTS = {
  title: '',
  office: '<kbd>N</kbd> next month <kbd>M</kbd> the land map <kbd>T</kbd> walk into town <kbd>Esc</kbd> put the files away · click the desk, the phone, the rolodex, the door',
  map: 'click a section <kbd>N</kbd>/<kbd>Space</kbd> next month <kbd>O</kbd> office <kbd>T</kbd> town <kbd>Esc</kbd> back to the office',
  town: '<kbd>←↑→↓</kbd>/<kbd>WASD</kbd> walk <kbd>Space</kbd> enter / talk · click to walk there <kbd>N</kbd> next month <kbd>O</kbd> office <kbd>M</kbd> land map',
  interior: 'click a person to talk, a thing to open it <kbd>Space</kbd> talk <kbd>Esc</kbd> back to the street <kbd>N</kbd> next month',
  field: 'click the owner or a well <kbd>←</kbd> <kbd>→</kbd> neighbouring sections <kbd>Esc</kbd> back to the land map <kbd>N</kbd> next month',
};

export function initScreens(c) { ctx = c; }

export function goto(screen, opts = {}) {
  if (!SCREENS[screen]) screen = 'office';
  const ui = ctx.ui, prev = ui.screen;
  if (screen === 'town' && opts.from === undefined && opts.spawn === undefined && (prev === 'interior' || prev === 'office')) opts = { ...opts, from: prev === 'office' ? 'office' : ui.place };
  if (prev && prev !== screen && SCREENS[prev]?.exit) SCREENS[prev].exit(ctx);
  ui.screen = screen;
  if (opts.place !== undefined) ui.place = opts.place;
  if (opts.selected !== undefined && opts.selected !== null) ui.selected = opts.selected;
  if (screen !== 'map') ui.drawer = false;
  const st = document.getElementById('stage'); if (st) st.dataset.screen = screen;
  SCREENS[screen].enter?.(ctx, opts);
  ctx.render();
}

export function back() {
  const ui = ctx.ui;
  if (ui.drawer && ui.screen !== 'map') { ui.drawer = false; ctx.render(); return true; }
  switch (ui.screen) {
    case 'interior': goto('town', { from: ui.place }); return true;
    case 'field': goto('map'); return true;
    case 'map': case 'town': goto('office'); return true;
  }
  return false;
}
