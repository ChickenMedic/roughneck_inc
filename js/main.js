// Bootstrap and router: owns the state, the ui object, the chrome (topbar, ticker, news, drawer),
// modals and toasts, save/load, and the render() router that hands off to the active screen.
// The actions table lives in ui/actions.js; screens in ui/screens.js; keys in ui/input.js.
import { newGame, advanceMonth, log as slog, migrateState, isAbsent } from './sim.js';
import { isFounding } from './founding.js';
import { getRngState, setRngState, hashStr } from './rng.js';
import { money, pct, dateStr } from './util.js';
import { hedgeQuote } from './market.js';
import { acreageAsk } from './competitors.js';
import { renderTicker } from './ui/ticker.js';
import { renderTopbar, renderTabs, renderPanel, renderNews } from './ui/panels.js';
import * as M from './ui/modals.js';
import { makeActions } from './ui/actions.js';
import { SCREENS, HINTS, initScreens, goto, back } from './ui/screens.js';
import { initInput } from './ui/input.js';
import { openDialogue, closeDialogue, isDialogueOpen } from './ui/dialogue.js';
import { talkTree, eventTree } from './scenes/talk.js';
import { stepLoop } from './scenes/engine.js';
import { renderGuide, monthSummary } from './ui/guide.js';
import { clockText } from './ui/panels.js';

const SAVE_KEY = 'wildcat-ceo-save-v2', SAVE_KEY_V1 = 'wildcat-ceo-save-v1';
let state = null;
// auto = the clock is running; speed picks how long a month lasts (1: 180 s, 2: 90 s, 4: 40 s).
const CLOCK_SECONDS = { 1: 180, 2: 90, 4: 40 };
const ui = { tab: 'parcel', selected: null, auto: true, speed: 2, timer: null, clock: { left: 90 }, modal: null, design: null, designParcel: null, screen: 'title', place: 'office', drawer: false, talk: null };
const $ = (s) => document.querySelector(s);
const L = (t, k) => slog(state, t, k);

// ---------- rendering ----------
function render() {
  if (!state) return;
  $('#topbar').innerHTML = renderTopbar(state, ui);
  const tape = renderTicker(state); if (tape !== render.tape) { render.tape = tape; $('#ticker').innerHTML = tape; }
  $('#news').innerHTML = renderNews(state, ui);
  renderDrawer();
  $('#stage').dataset.screen = ui.screen;
  (SCREENS[ui.screen] || SCREENS.office).render(state, ui, ctx);
  $('#hints').innerHTML = ui.screen === 'title' ? '' : renderGuide(state, ui, HINTS[ui.screen] || '');
  if (state.pending.length && !ui.modal && !isDialogueOpen() && !isAbsent(state)) openEvent();
  if (state.company.bankrupt && ui.modal !== 'gameover') { closeDialogue(); openModal('gameover'); }
}
function renderDrawer() {
  const open = ui.screen === 'map' || !!ui.drawer;
  const d = $('#drawer');
  d.classList.toggle('open', open);
  if (open) { $('#tabs').innerHTML = renderTabs(state, ui); $('#panel').innerHTML = renderPanel(state, ui); }
  $('#drawer-handle').hidden = open || ui.screen === 'title';
}
function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.className = ''; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}
// The month-end memo: a wider toast with a heading, in HTML built by guide.js from state only.
function toastHtml(html, cls = '', ms = 8000) {
  const t = $('#toast'); t.innerHTML = html; t.className = cls; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}
function openEvent() {
  const ev = state.pending[0];
  const tree = eventTree(state, ev);
  if (!tree || !openDialogue(tree, ctx)) openModal('event'); // fallback: the old form
}
function openTalk(id, extra = {}) {
  if (!id) return;
  const tree = talkTree(state, ctx, id, extra);
  if (!tree) { toast('Nobody answers.'); return; }
  ui.talk = { id, npc: extra.npc || null };
  if (!openDialogue(tree, ctx)) { ui.talk = null; toast('Nobody answers.'); }
}

// ---------- modals ----------
function openModal(kind, data) {
  ui.modal = kind;
  const el = $('#modal');
  let html = '';
  switch (kind) {
    case 'event': html = M.renderEvent(state); break;
    case 'gameover': html = M.renderGameOver(state); break;
    case 'newgame': html = M.renderNewGame(!!localStorage.getItem(SAVE_KEY)); break;
    case 'designer': html = M.renderDesigner(state, data, ui.design); break;
    case 'lease': html = M.renderLease(state, data); break;
    case 'auction': html = M.renderAuction(state, data); break;
    case 'surface': html = M.renderSurface(state, data); break;
    case 'hedge': html = M.renderHedge(state); break;
    case 'lobby': html = M.renderLobby(state); break;
    case 'well': html = M.renderWellDetail(state, data); break;
    case 'buy': html = M.renderBuyAcreage(state, data, acreageAsk(state, data)); break;
    case 'sign': html = M.renderSign(state); break;
  }
  if (!html) { ui.modal = null; return; }
  el.innerHTML = html; el.hidden = false;
  if (kind === 'designer') updateEstimate();
  wireSliders();
}
function closeModal() { ui.modal = null; $('#modal').hidden = true; $('#modal').innerHTML = ''; }

function wireSliders() {
  const pairs = [['#l-bonus', '#l-bonus-v', (v) => '$' + v], ['#l-roy', '#l-roy-v', (v) => pct(+v, 1)], ['#s-dmg', '#s-dmg-v', (v) => money(+v)], ['#lb-amt', '#lb-amt-v', (v) => money(+v)], ['#h-vol', '#h-vol-v', (v) => (+v).toLocaleString()], ['#h-mo', '#h-mo-v', (v) => v]];
  for (const [inp, out, f] of pairs) { const i = $(inp); if (i) i.addEventListener('input', () => { $(out).textContent = f(i.value); if (inp === '#h-mo') { const q = hedgeQuote(state, +i.value); $('#h-price').textContent = q === null ? 'n/a' : '$' + q.toFixed(2); } }); }
  const a = $('#a-bid'); if (a) a.addEventListener('input', () => ($('#a-bid-v').textContent = `$${a.value} (${money(a.value * a.dataset.acres)} total)`));
  const b = $('#b-bid'); if (b) b.addEventListener('input', () => ($('#b-bid-v').textContent = `$${b.value} (${money(b.value * b.dataset.acres)} total)`));
}
function selectedStaff(id) {
  const v = +($('#' + id)?.value ?? -1);
  return v > 0 ? state.staff.find((s) => s.id === v) : null;
}
function updateEstimate() {
  const p = state.parcels[ui.designParcel];
  const form = $('#designer'); if (!form || !p) return;
  const d = M.readDesign(form, ui.design);
  if (d.target !== ui.design.target) { ui.design = d; openModal('designer', p); return; }
  ui.design = d;
  $('#estimate').innerHTML = M.renderEstimate(state, p, d, selectedStaff('d-driller'), selectedStaff('d-completions'));
}

// ---------- game flow ----------
function next() {
  if (!state || isDialogueOpen() || ui.modal) return;
  if (state.pending.length || state.company.bankrupt) { render(); return; }
  const before = snapshotForMemo(state);
  advanceMonth(state);
  ui.clock.left = CLOCK_SECONDS[ui.speed] || 90;
  render();
  const memo = monthSummary(state, before);
  if (memo) toastHtml(memo, 'memo', 9000);
}
function snapshotForMemo(s) {
  return { cash: s.company.cash, personalCash: s.founding?.personalCash ?? 0, monthsLeft: s.founding?.monthsLeft ?? 0, staff: s.staff.length, producing: s.wells.filter((w) => w.status === 'producing').length, oil: s.market.oil, gone: Object.values(s.founding?.founders || {}).filter((r) => r.status === 'gone').length };
}
// The clock: one tick a second. It only counts while the player is free to act (no dialogue, no modal,
// nothing pending) so a decision never times out; when it reaches zero the month advances.
function tickClock() {
  if (!state || !ui.auto || ui.screen === 'title') return;
  const held = isDialogueOpen() || ui.modal || state.pending.length || state.company.bankrupt;
  if (!held) ui.clock.left -= 1;
  const el = $('#clock'); if (el) el.textContent = held ? 'waiting on you' : clockText(ui);
  if (ui.clock.left <= 0 && !held) next();
}
function setAuto(on) {
  ui.auto = on;
  if (on) ui.clock.left = Math.min(ui.clock.left, CLOCK_SECONDS[ui.speed] || 90);
  render();
}
setInterval(tickClock, 1000);
// Navigation with the prison rule: nobody walks the town from a cell.
const LOCKED_SCREENS = new Set(['town', 'interior', 'field']);
function go(screen, opts = {}) {
  if (state && isAbsent(state) && LOCKED_SCREENS.has(screen)) { toast(`You are in the state penitentiary until ${dateStr(state.law.absentUntil)}.`, 4000); return; }
  goto(screen, opts);
}
const uiSnapshot = () => ({ tab: ui.tab, selected: ui.selected, screen: ui.screen === 'title' ? 'office' : ui.screen, place: ui.place, drawer: ui.drawer, talk: ui.talk?.id || null });
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ state, rng: getRngState(), ui: uiSnapshot() })); toast('Saved.'); }
  catch (e) { toast('Save failed: ' + e.message); }
}
function load() {
  const raw = localStorage.getItem(SAVE_KEY); if (!raw) { toast('No saved game.'); return; }
  try {
    const d = JSON.parse(raw);
    state = migrateState(d.state);
    setRngState(d.rng);
    ui.tab = d.ui?.tab || 'parcel'; ui.selected = d.ui?.selected ?? null; ui.place = d.ui?.place || 'office'; ui.drawer = !!d.ui?.drawer;
    closeModal(); closeDialogue(); ui.clock.left = CLOCK_SECONDS[ui.speed] || 90;
    let screen = SCREENS[d.ui?.screen] ? d.ui.screen : 'office';
    if (screen === 'title' || (isAbsent(state) && LOCKED_SCREENS.has(screen))) screen = 'office';
    goto(screen, screen === 'town' ? { spawn: true } : {});
    if (d.ui?.talk && !state.pending.length) openTalk(d.ui.talk);
    toast('Loaded.');
  } catch (e) { toast('Load failed: ' + e.message); console.error(e); }
}
// A v1 save (before the screens) is copied under the v2 key, opening in the office. The v1 entry is left alone.
function migrateSave() {
  try {
    if (localStorage.getItem(SAVE_KEY)) return;
    const v1 = localStorage.getItem(SAVE_KEY_V1); if (!v1) return;
    const d = JSON.parse(v1);
    d.ui = { ...(d.ui || {}), screen: 'office', place: 'office', drawer: false, talk: null };
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch (e) { console.warn('save migration skipped', e); }
}
// A fresh game starts on the depot platform with a suitcase: the founding year, on the town screen.
function startGame(name, seed, player) {
  state = newGame({ name: name || 'Dry Fork Petroleum', player: player || undefined, seed: seed ? (Number.isFinite(+seed) ? +seed : hashStr(seed)) : undefined });
  ui.clock.left = CLOCK_SECONDS[ui.speed] || 90; ui.auto = true;
  ui.selected = null; ui.tab = 'parcel'; ui.place = 'office'; ui.drawer = false; ui.talk = null;
  closeModal(); closeDialogue();
  goto('town', { spawn: 'depot' });
  openTalk('intro');
}

// ---------- context shared with actions, screens, input, dialogue ----------
const ctx = {
  get state() { return state; }, ui, $, render, toast, openModal, closeModal, next, setAuto, save, load, startGame, goto: go, back, openTalk, log: L,
  selectedStaff, updateEstimate, screens: SCREENS, actions: null,
};
ctx.actions = makeActions(ctx);
const actions = ctx.actions;

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el, state); }
});
document.addEventListener('keydown', (e) => {
  // Enter/Space on a focused SVG hotspot or actor behaves like a click.
  const el = e.target.closest?.('[data-action][tabindex]');
  if (el && (e.code === 'Enter' || e.code === 'Space') && !isDialogueOpen()) { e.preventDefault(); e.stopImmediatePropagation(); actions[el.dataset.action]?.(el, state); }
}, true);
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'speed') { ui.speed = +el.value; ui.clock.left = CLOCK_SECONDS[ui.speed] || 90; render(); }
  else if (el.dataset.action === 'policy-maint') { state.policy.maintenance = el.value; render(); }
  else if (el.dataset.action === 'policy-auto') { state.policy.autoWorkover = el.checked; }
  else if (el.dataset.action === 'insurance') actions.insurance(el, state);
  else if (el.closest('#designer')) updateEstimate();
});

initScreens(ctx);
initInput(ctx);
migrateSave();
window.wildcat = { get state() { return state; }, ui, render, actions, goto: go, openTalk, step: stepLoop, migrateState };
// Start: a fresh world behind the front page of the Clarion.
state = newGame({ name: 'Dry Fork Petroleum' });
goto('title');
openModal('newgame');
