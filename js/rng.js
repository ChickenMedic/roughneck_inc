// Seeded RNG (mulberry32). State lives in one place so saves are reproducible.
let s = 1;
export function seedRng(seed) { s = (seed >>> 0) || 1; }
export function getRngState() { return s; }
export function setRngState(v) { s = v >>> 0; }
export function rnd() {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (a, b) => a + (b - a) * rnd();
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export const chance = (p) => rnd() < p;
export function gauss(mean = 0, sd = 1) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const lognorm = (sigma) => Math.exp(gauss(0, sigma));

// Independent generator that does not touch the global stream. Use for presentation jitter,
// geography, and anything that must not desync the simulation's RNG sequence.
export function makeRng(seed) {
  let st = (seed >>> 0) || 1;
  const rnd = () => {
    st = (st + 0x6D2B79F5) >>> 0;
    let t = st;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rand = (a, b) => a + (b - a) * rnd();
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  return { rnd, rand, randInt, pick, chance };
}
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
