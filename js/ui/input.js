// One keydown/keyup pair for the whole game. `keys` is the set of codes currently held (the town loop
// reads it every frame). Dispatch order: dialogue -> modal -> the active screen's onKey -> global keys.
// Arrow keys are only swallowed by the town screen, so the panels still scroll everywhere else.
import { isDialogueOpen, dialogueKey } from './dialogue.js';

export const keys = new Set();
export const MOVE_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const has = (...codes) => codes.some((c) => keys.has(c));
export function moveAxis() {
  return { x: (has('ArrowRight', 'KeyD') ? 1 : 0) - (has('ArrowLeft', 'KeyA') ? 1 : 0), y: (has('ArrowDown', 'KeyS') ? 1 : 0) - (has('ArrowUp', 'KeyW') ? 1 : 0) };
}

const TYPING = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

export function initInput(ctx) {
  document.addEventListener('keydown', (e) => {
    if (TYPING.has(e.target.tagName) || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    keys.add(e.code);
    if (e.repeat && !MOVE_CODES.has(e.code)) { if (MOVE_CODES.has(e.code) || e.code === 'Space') e.preventDefault(); return; }
    const ui = ctx.ui;
    if (isDialogueOpen()) { if (dialogueKey(e, ctx)) e.preventDefault(); return; }
    if (ui.modal) {
      if (e.code === 'Escape' && !['event', 'gameover'].includes(ui.modal) && !(ui.modal === 'newgame' && ui.screen === 'title')) { ctx.closeModal(); ctx.render(); e.preventDefault(); }
      else if (e.code === 'Space' || MOVE_CODES.has(e.code)) { /* let the modal scroll */ }
      return;
    }
    const scr = ctx.screens[ui.screen];
    if (scr && scr.onKey && scr.onKey(e, ctx)) { e.preventDefault(); return; }
    switch (e.code) {
      case 'KeyN': ctx.next(); e.preventDefault(); break;
      case 'Space': if (ui.screen === 'office' || ui.screen === 'map') { ctx.next(); e.preventDefault(); } break;
      case 'KeyM': if (ui.screen !== 'map') ctx.goto('map'); e.preventDefault(); break;
      case 'KeyT': if (ui.screen !== 'town') ctx.goto('town', { spawn: ui.screen === 'office' ? 'office' : undefined }); e.preventDefault(); break;
      case 'KeyO': if (ui.screen !== 'office') ctx.goto('office'); e.preventDefault(); break;
      case 'Escape': if (ctx.back()) e.preventDefault(); break;
    }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  // Touch D-pad: buttons carry data-key codes; holding one is the same as holding the key.
  const pad = document.getElementById('dpad');
  if (pad) {
    const down = (e) => { const b = e.target.closest('[data-key]'); if (!b) return; e.preventDefault(); b.setPointerCapture?.(e.pointerId); keys.add(b.dataset.key); };
    const up = (e) => { const b = e.target.closest('[data-key]'); if (!b) return; keys.delete(b.dataset.key); };
    pad.addEventListener('pointerdown', down); pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('pointerleave', up);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
