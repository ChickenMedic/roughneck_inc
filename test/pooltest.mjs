// Drill into a known field and watch shared depletion, water cut and a waterflood. Run: node test/pooltest.mjs [seed]
import { newGame, advanceMonth, log } from '../js/sim.js';
import { negotiateLease, negotiateSurface, leaseAsk, surfaceAsk, runSurvey } from '../js/land.js';
import { available } from '../js/staff.js';
import { defaultDesign, estimateWell, startWell, waterflood } from '../js/wells.js';
import { money } from '../js/util.js';
import { inflate } from '../js/era.js';

const seed = Number(process.argv[2] || 42);
const s = newGame({ seed, skipFounding: true });
const L = (t, k) => log(s, t, k);
// The biggest discovered field that still has a free private section (public land only leases at auction).
const freePrivate = (pool) => pool.parcels.map((id) => s.parcels[id]).filter((p) => p.drillable && !p.mineral.leasedBy && p.mineral.ownerType !== 'state' && p.mineral.ownerType !== 'federal').sort((a, b) => b.truth.sand.pos - a.truth.sand.pos);
const pool = s.pools.filter((p) => p.discovered).sort((a, b) => b.parcels.length - a.parcels.length).find((p) => freePrivate(p).length);
if (!pool) { console.log('no free parcel in any field'); process.exit(0); }
console.log(`Target: ${pool.name}, ${pool.parcels.length} sections, ${Math.round(pool.ooip / 1e6)} MMbbl, ${Math.round(pool.x * 100)}% depleted, drive ${pool.waterDrive ? 'water' : 'solution gas'}`);
const cands = freePrivate(pool);
s.company.cash += inflate(s, 50_000); // make sure the scripted test can afford everything
// Owners refuse now and then; take the first parcel in the field that will sign.
let p = null;
for (const c of cands) {
  for (let i = 0; i < 4 && !c.mineral.leasedBy; i++) { const a = leaseAsk(s, c); const r = negotiateLease(s, c, Math.round(a.bonusAcre * 1.2), a.royalty, available(s, 'landman')[0]); console.log('lease', c.surface.name + ':', r.msg); }
  if (c.mineral.leasedBy === 'player') { p = c; break; }
}
if (!p) { console.error('nobody in the field would lease'); process.exit(1); }
runSurvey(s, p, 2, available(s, 'geologist')[0], 0);
console.log('estimate says:', p.survey.est.sand.onStructure, 'truth:', p.truth.sand.onStructure, 'pos', p.truth.sand.pos.toFixed(2));
for (let i = 0; i < 6 && !p.surface.agreement; i++) { const a = surfaceAsk(s, p); negotiateSurface(s, p, a.damages, true, available(s, 'landman')[0]); }
const d = defaultDesign('sand', s); if (p.surface.agreement?.conditions.noFresh) d.water = 'recycled';
const est = estimateWell(s, p, d, {});
console.log('designer: cost', money(est.cost.total), 'IP', Math.round(est.ip), 'EUR', Math.round(est.eurOil), 'dry', est.dry.toFixed(2), 'payout', est.payout, 'notes:', est.notes.join(' | '));
const r = startWell(s, p, d, null, null, L);
console.log('start:', r.ok ? r.well.name : r.msg);
if (!r.ok) process.exit(1);
const row = (m) => { const w = s.wells[0]; const lm = w.lastMonth; return `m${m}: ${w.status} rate ${lm ? Math.round(lm.rate) : '-'} bbl/d, wc ${lm ? Math.round(lm.water / (lm.water + lm.oil) * 100) : '-'}%, pool ${Math.round(pool.x * 100)}% depleted, pressure ${Math.round(pool.pressure * 100)}%, cash ${money(s.company.cash)}`; };
for (let m = 1; m <= 96; m++) {
  advanceMonth(s); while (s.pending.length) s.pending.shift();
  if (m % 12 === 0) console.log(row(m));
  if (m === 48) { const wf = waterflood(s, pool, L); console.log('waterflood:', wf.ok ? money(wf.cost) : wf.msg); }
}
console.log(s.news.filter((n) => /DISCOVERY|Waterflood|dry hole/.test(n.text)).map((n) => n.text).join('\n'));
const bad = JSON.stringify(s, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN!' : v)).includes('NaN!');
if (bad) { console.error('NaN in state'); process.exit(1); }
console.log('pooltest OK');
