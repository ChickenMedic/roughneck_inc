// The dialogue box: a portrait, a name plate, typewriter text and numbered options. A "tree" is a
// start node (or {start, nodes, speaker}); a node is {speaker?, title?, text, options, closable}.
// Options carry any of: effect(state, params, log), next (node | id | fn), open (modal kind or
// [kind, data]), tab, goto (screen or [screen, opts]), action (name in the actions table), run(state, ctx).
// This is the same shape as a decision event, so pending events render through here too (see talk.js).
import { esc } from '../util.js';
import { portraitUrl } from '../scenes/sprites.js';

let cur = null;
const $ = (s) => document.querySelector(s);
const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isDialogueOpen = () => !!cur;
export const currentNode = () => cur?.node || null;

export function openDialogue(tree, ctx, params = {}) {
  if (cur) stopTyping();
  cur = { tree, ctx, params, node: null, options: [], done: false, timer: 0 };
  const start = tree.start !== undefined ? tree.start : (tree.text !== undefined ? tree : null);
  const node = resolveNode(start);
  if (!node) { cur = null; return false; }
  showNode(node);
  return true;
}
// A ref is a node, a node id (looked up in tree.nodes) or a function (state, ctx, params) -> ref; ids may
// point at functions, so resolution loops until it lands on a plain node.
function resolveNode(ref) {
  if (!cur) return null;
  for (let i = 0; i < 6 && ref; i++) {
    if (typeof ref === 'string') { ref = cur.tree.nodes?.[ref]; continue; }
    if (typeof ref === 'function') { ref = ref(cur.ctx.state, cur.ctx, cur.params); continue; }
    return ref;
  }
  return null;
}
function stopTyping() { if (cur?.timer) { clearInterval(cur.timer); cur.timer = 0; } }

function showNode(node) {
  stopTyping();
  cur.node = node;
  const { ctx, params } = cur, state = ctx.state;
  const sp = node.speaker || cur.tree.speaker || { name: 'Dot', title: 'your secretary', sprite: 'clerk' };
  const text = typeof node.text === 'function' ? node.text(state, params, ctx) : String(node.text ?? '');
  const opts = (node.options || []).filter((o) => !o.when || o.when(state, params, ctx));
  cur.options = opts;
  const closable = node.closable !== false;
  const el = $('#dialogue');
  el.innerHTML = `<div class="dlg">
    <div class="portrait"><img src="${portraitUrl(sp.sprite || 'clerk', sp.name || '')}" alt=""></div>
    <div class="body">
      <div class="who"><b>${esc(sp.name || '')}</b>${sp.title ? `<span class="title">${esc(sp.title)}</span>` : ''}${sp.mood ? `<i class="mood">${esc(sp.mood)}</i>` : ''}</div>
      ${node.title ? `<h3>${esc(node.title)}</h3>` : ''}
      <p class="text" data-action="dlg-skip" title="Click to skip"></p>
      <div class="opts">${opts.map((o, i) => `<button class="opt${o.disabled ? ' off' : ''}" data-action="dlg-choice" data-id="${i}" ${o.disabled ? 'disabled' : ''}><span class="n">${i + 1}</span><span class="lbl">${esc(o.label)}</span>${o.hint ? `<small class="hint">${esc(o.hint)}</small>` : ''}</button>`).join('')}${!opts.length && closable ? '<button class="opt" data-action="dlg-close"><span class="n">1</span>That is all.</button>' : ''}</div>
    </div>
    ${closable ? '<button class="x" data-action="dlg-close" title="Close (Esc)">✕</button>' : ''}
  </div>`;
  el.hidden = false;
  typewrite(text);
}
function typewrite(text) {
  const p = $('#dialogue .text'), box = $('#dialogue .dlg');
  cur.full = text; cur.done = false;
  if (reduced() || text.length < 8) { p.textContent = text; finish(); return; }
  let i = 0;
  p.textContent = '';
  cur.timer = setInterval(() => {
    if (!cur) return;
    i += text.length > 400 ? 3 : 2;
    p.textContent = text.slice(0, i);
    if (i >= text.length) finish();
  }, 18);
  function finish() { stopTyping(); if (!cur) return; p.textContent = cur.full; cur.done = true; box.classList.add('ready'); }
  if (cur.done) finish();
}
export function skipReveal() { if (!cur || cur.done) return false; stopTyping(); const p = $('#dialogue .text'); if (p) p.textContent = cur.full; cur.done = true; $('#dialogue .dlg')?.classList.add('ready'); return true; }

export function closeDialogue() {
  stopTyping();
  const ctx = cur?.ctx;
  cur = null;
  const el = $('#dialogue'); if (el) { el.hidden = true; el.innerHTML = ''; }
  if (ctx) ctx.ui.talk = null;
}

export function choose(i) {
  if (!cur) return;
  const o = cur.options[i]; if (!o || o.disabled) return;
  const { ctx, params } = cur, state = ctx.state;
  let r = null;
  if (o.effect) r = o.effect(state, params, ctx.log);
  if (r && r.msg) ctx.toast(r.msg, 4500);
  if (o.next) { const n = resolveNode(o.next); if (n) { showNode(n); ctx.render(); return; } }
  closeDialogue();
  if (o.open) { const spec = typeof o.open === 'function' ? o.open(state, ctx) : o.open; const [kind, data] = Array.isArray(spec) ? spec : [spec]; if (kind) ctx.openModal(kind, data); }
  if (o.tab) { ctx.ui.tab = o.tab; ctx.ui.drawer = true; }
  if (o.run) o.run(state, ctx);
  if (o.goto) { const gt = typeof o.goto === 'function' ? o.goto(state, ctx) : o.goto; const [screen, opts] = Array.isArray(gt) ? gt : [gt, {}]; ctx.goto(screen, opts || {}); return; }
  if (o.action) { const fn = ctx.actions[o.action]; if (fn) { fn(null, state); return; } }
  ctx.render();
}

// Keyboard while a dialogue is open. Returns true when the key was consumed.
export function dialogueKey(e, ctx) {
  if (!cur) return false;
  const closable = cur.node?.closable !== false;
  if (/^(Digit|Numpad)[1-9]$/.test(e.code)) {
    const i = +e.code.slice(-1) - 1;
    if (cur.options.length) { if (i < cur.options.length) choose(i); }
    else if (i === 0 && closable) { closeDialogue(); ctx.render(); }
    return true;
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (!cur.done) skipReveal();
    else if (cur.options.length === 1 && !cur.options[0].disabled) choose(0);
    else if (!cur.options.length && closable) { closeDialogue(); ctx.render(); }
    return true;
  }
  if (e.code === 'Escape') { if (closable) { closeDialogue(); ctx.render(); } return true; }
  return true; // nothing else leaks through while somebody is talking
}
