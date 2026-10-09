// Watch a sand well's health and failures month by month. Run: node test/healthtest.mjs [seed]
import { newGame, advanceMonth, log } from '../js/sim.js';
import { negotiateLease, negotiateSurface, leaseAsk, surfaceAsk, runSurvey } from '../js/land.js';
import { available } from '../js/staff.js';
import { defaultDesign, startWell } from '../js/wells.js';
import { inflate } from '../js/era.js';
const s = newGame({ seed: Number(process.argv[2] || 5), skipFounding: true });
const L = (t, k) => log(s, t, k);
const p = s.parcels.filter((p) => p.truth.sand.onStructure && p.drillable && !p.mineral.leasedBy && !['state', 'federal'].includes(p.mineral.ownerType)).sort((a, b) => b.truth.sand.pos - a.truth.sand.pos)[0];
s.company.cash += inflate(s, 50_000);
runSurvey(s, p, 2, available(s, 'geologist')[0], 0);
for (let i = 0; i < 8 && !p.mineral.leasedBy; i++) { const a = leaseAsk(s, p); negotiateLease(s, p, Math.round(a.bonusAcre * 1.3), a.royalty, available(s, 'landman')[0]); }
for (let i = 0; i < 8 && !p.surface.agreement; i++) { const a = surfaceAsk(s, p); negotiateSurface(s, p, a.damages * 1.2, true, available(s, 'landman')[0]); }
const r = startWell(s, p, defaultDesign('sand', s), null, null, L);
console.log('start', r.ok ? r.well.name : r.msg, 'prod skill', s.staff.filter((x) => x.role === 'production').length);
if (!r.ok) process.exit(1);
for (let m = 1; m <= 30; m++) { advanceMonth(s); while (s.pending.length) s.pending.shift(); const w = s.wells[0]; console.log(`m${m} ${w.status} health ${w.health.toFixed(0)} rate ${Math.round(w.lastMonth?.rate || 0)} net $${Math.round(w.lastMonth?.net || 0)}`); }
console.log(s.news.filter((n) => /down:|shut in|workover/i.test(n.text)).map((n) => n.text).join('\n'));
const bad = JSON.stringify(s, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN!' : v)).includes('NaN!');
if (bad) { console.error('NaN in state'); process.exit(1); }
console.log('healthtest OK');
