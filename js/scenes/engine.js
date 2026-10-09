// Presentation loop for the town overworld: requestAnimationFrame with a clamped dt, DPR-aware canvas
// sizing, and a camera that eases toward its target and snaps to whole pixels so sprites stay crisp.
// Nothing here touches simulation state.
let raf = 0, last = 0, running = false, cbs = null, hiddenPause = false;

function frame(t) {
  if (!running || !cbs) return;
  let dt = (t - last) / 1000; last = t;
  if (dt > 0.05) dt = 0.05; // clamp: tab switches and long frames never teleport anybody
  try { cbs.update(dt); cbs.draw(dt); } catch (e) { console.error('scene loop', e); stopLoop(); return; }
  raf = requestAnimationFrame(frame);
}
export function startLoop(update, draw) {
  cbs = { update, draw };
  if (running) return;
  running = true; hiddenPause = false; last = performance.now();
  raf = requestAnimationFrame(frame);
}
export function stopLoop() { running = false; hiddenPause = false; cbs = null; if (raf) cancelAnimationFrame(raf); raf = 0; }
export const isRunning = () => running;
// Advance the scene by hand (tests, or a tab that never gets animation frames). dt in seconds.
export function stepLoop(dt = 1 / 60) { if (!cbs) return false; cbs.update(dt); cbs.draw(dt); return true; }

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (running) { hiddenPause = true; running = false; cancelAnimationFrame(raf); raf = 0; } }
    else if (hiddenPause && cbs) { hiddenPause = false; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  });
}

// Size a canvas to css pixels w x h at the device pixel ratio (capped at 2). Returns the dpr used.
export function sizeCanvas(canvas, w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.round(w * dpr)), ch = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  canvas.style.width = `${Math.round(w)}px`; canvas.style.height = `${Math.round(h)}px`;
  return dpr;
}

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.tx = 0; this.ty = 0; this.snapNext = true; }
  // Aim at (cx, cy) world coordinates, keeping a viewport of vw x vh inside a world of ww x wh.
  aim(cx, cy, vw, vh, ww, wh) {
    let tx = cx - vw / 2, ty = cy - vh / 2;
    tx = ww <= vw ? (ww - vw) / 2 : Math.max(0, Math.min(ww - vw, tx));
    ty = wh <= vh ? (wh - vh) / 2 : Math.max(0, Math.min(wh - vh, ty));
    this.tx = tx; this.ty = ty;
    if (this.snapNext) { this.x = tx; this.y = ty; this.snapNext = false; }
  }
  step(dt) {
    const k = 1 - Math.exp(-dt * 9);
    this.x += (this.tx - this.x) * k; this.y += (this.ty - this.y) * k;
    if (Math.abs(this.tx - this.x) < 0.3) this.x = this.tx;
    if (Math.abs(this.ty - this.y) < 0.3) this.y = this.ty;
  }
  get ix() { return Math.round(this.x); }
  get iy() { return Math.round(this.y); }
}
