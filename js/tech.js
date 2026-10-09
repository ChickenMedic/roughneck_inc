// Technology unlocks over the decades. Each seed jitters the years a little; unlock months live in state.tech.
import { randInt } from './rng.js';
import { DESIGN_OPTIONS } from './data.js';
import { monthOf } from './util.js';
import { yearOf } from './era.js';

export const TECH = {
  waterflood:     { year: 1952, name: 'Waterflooding', news: 'The state commission approves secondary-recovery units. Operators may now inject water to repressure tired fields.' },
  frac:           { year: 1953, name: 'Hydraulic fracturing', news: 'A Halliburton crew is in the county offering "Hydrafrac" treatments: gelled oil and sand pumped down the hole to crack tight sand. The old-timers are skeptical; the results are not.' },
  esp:            { year: 1958, name: 'Electric submersible pumps', news: 'Reda salesmen are calling on operators with electric submersible pumps that lift more fluid than any rod pump, at a price.' },
  seismicDigital: { year: 1965, name: 'Digital seismic', news: 'Seismic crews now record on magnetic tape and process on computers in Tulsa. Reflection surveys are twice as sharp as the old paper records.' },
  ceramic:        { year: 1978, name: 'Ceramic proppant', news: 'Sintered bauxite proppant reaches the market. It costs a fortune and does not crush at depth.' },
  seismic3d:      { year: 1983, name: '3D seismic', news: 'Three-dimensional seismic surveys are now available to independents. They cost a fortune and see everything.' },
  futures:        { year: 1983, name: 'Crude futures', news: 'The New York Mercantile Exchange lists a crude oil futures contract. Producers can lock in a price for the first time.' },
  horizontal:     { year: 1989, name: 'Horizontal drilling', news: 'Steerable motors and measurement-while-drilling make horizontal wells routine. The Austin Chalk operators are drilling sideways for a mile.' },
  massiveFrac:    { year: 1992, name: 'Massive hydraulic fracturing', news: 'Service companies now pump million-pound frac jobs. Tight rock that never paid is starting to.' },
  slickwater:     { year: 1998, name: 'Slickwater fracturing', news: 'Mitchell Energy is fracturing the Barnett Shale with plain water and friction reducer instead of gel, at a fraction of the cost.' },
  shale:          { year: 2004, name: 'Shale development', news: 'Horizontal wells with multistage slickwater fracs are unlocking shale across the country. The Blackfork Shale under this county is on every landman\'s map.' },
};

export function initTech() {
  const unlocks = {};
  for (const [key, t] of Object.entries(TECH)) unlocks[key] = t.year <= 1952 ? 0 : monthOf(t.year + randInt(-2, 2), randInt(0, 11));
  return { unlocks, announced: [] };
}
export function techAvailable(state, key) {
  const u = state.tech?.unlocks?.[key];
  if (u === undefined) return yearOf(state) >= TECH[key].year;
  return state.month >= u;
}
export function techYear(state, key) { const u = state.tech?.unlocks?.[key]; return u === undefined ? TECH[key].year : yearOf(Math.max(0, u)); }
export function unlockedTech(state) { return Object.keys(TECH).filter((k) => techAvailable(state, k)); }

export function tickTech(state, log) {
  if (!state.tech) state.tech = initTech();
  for (const key of Object.keys(TECH)) {
    if (state.tech.announced.includes(key) || !techAvailable(state, key)) continue;
    state.tech.announced.push(key);
    if (state.month > 0) log(`NEW TECHNOLOGY: ${TECH[key].name}. ${TECH[key].news}`, 'market');
  }
}

// Which formations can be drilled, and which designer options exist yet.
export function targetsFor(state) { return techAvailable(state, 'shale') ? ['sand', 'shale'] : ['sand']; }
export function designOptionsFor(state) {
  const has = (k) => techAvailable(state, k);
  const out = {};
  out.lateral = has('horizontal') ? DESIGN_OPTIONS.lateral : [];
  out.spacing = has('horizontal') ? DESIGN_OPTIONS.spacing : [];
  out.proppant = DESIGN_OPTIONS.proppant.filter((o) => o.v === 'sand' || has('ceramic'));
  out.intensity = DESIGN_OPTIONS.intensity.filter((o) => o.v < 3000 || has('massiveFrac'));
  out.fluid = DESIGN_OPTIONS.fluid.filter((o) => o.v === 'gel' || has('slickwater'));
  out.casing = DESIGN_OPTIONS.casing;
  out.water = DESIGN_OPTIONS.water;
  out.lift = DESIGN_OPTIONS.lift.filter((o) => o.v !== 'esp' || has('esp'));
  out.vfrac = DESIGN_OPTIONS.vfrac.filter((o) => o.v === false || has('frac'));
  return out;
}
export function validateDesign(state, d) {
  if (!targetsFor(state).includes(d.target)) return { ok: false, msg: `Nobody knows how to produce the ${d.target === 'shale' ? 'Blackfork Shale' : 'Frontier Sandstone'} yet.` };
  const opts = designOptionsFor(state);
  const keys = d.target === 'shale' ? ['lateral', 'spacing', 'proppant', 'intensity', 'fluid', 'water', 'casing', 'lift'] : ['vfrac', 'casing', 'water', 'lift'];
  for (const k of keys) {
    if (d[k] === undefined) continue;
    if (!opts[k].some((o) => String(o.v) === String(d[k]))) {
      const label = DESIGN_OPTIONS[k].find((o) => String(o.v) === String(d[k]))?.label || String(d[k]);
      return { ok: false, msg: `${label} does not exist yet in ${yearOf(state)}.` };
    }
  }
  return { ok: true };
}
