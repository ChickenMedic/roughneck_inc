// Headless balance/regression test: a simple bot plays N years from Sep 1952. Run: node test/headless.mjs [seed] [years] [-v]
import { newGame, advanceMonth, log, isAbsent } from '../js/sim.js';
import { negotiateLease, negotiateSurface, leaseAsk, surfaceAsk, runSurvey } from '../js/land.js';
import { surveysFor } from '../js/geology.js';
import { hire, available } from '../js/staff.js';
import { defaultDesign, estimateWell, startWell, doWorkover } from '../js/wells.js';
import { resolveEvent, EVENTS } from '../js/events.js';
import { buyMidstream } from '../js/market.js';
import { money, calMonth, yearOf, dateStr } from '../js/util.js';
import { inflate } from '../js/era.js';
import { targetsFor, designOptionsFor } from '../js/tech.js';
import { rnd } from '../js/rng.js';
import { approach, holder } from '../js/people.js';
import { buyAds, decideStory } from '../js/press.js';

const seed = Number(process.argv[2] || 42);
const years = Number(process.argv[3] || 30);
const verbose = process.argv.includes('-v');
const noProration = process.argv.includes('--noproration'); // balance experiment: what the bot does without the allowable
const state = newGame({ seed, name: 'Test Petroleum', skipFounding: true });
const L = (t, k) => log(state, t, k);
const tally = { permitAsks: 0, permitOk: 0, bribes: 0, bribeOk: 0, reported: 0, spacingAsks: 0, ads: 0 };

// The courthouse loop: a refused permit means a trip to the judge (or the field agent for spacing).
function courthouse(s, r) {
  const $ = (v) => inflate(s, v);
  if (r.needs === 'permit') {
    tally.permitAsks++;
    const bribe = s.company.cash > $(5_000) && rnd() < 0.5;
    const judge = holder(s, 'judge');
    const a = bribe ? approach(s, 'judge', 'bribe', { ask: 'permit' }) : approach(s, 'judge', 'persuade', { ask: 'permit' });
    if (bribe && a.outcome !== 'cooldown') { tally.bribes++; if (a.ok) tally.bribeOk++; if (a.outcome === 'reported') tally.reported++; }
    if (a.ok) tally.permitOk++;
    if (verbose) console.log(`  judge ${judge.name}: ${bribe ? 'bribe' : 'persuade'} -> ${a.outcome} (${a.text})`);
    if (a.text && a.outcome !== 'cooldown') L(a.text, 'people');
    return a.ok;
  }
  if (r.needs === 'spacing') {
    tally.spacingAsks++;
    const a = approach(s, 'inspector', rnd() < 0.3 && s.company.cash > $(5_000) ? 'bribe' : 'persuade', { ask: 'spacing', parcelId: r.parcelId });
    if (a.text && a.outcome !== 'cooldown') L(a.text, 'people');
    return a.ok;
  }
  return false;
}

function bot() {
  const s = state;
  const $ = (v) => inflate(s, v);
  const annualNet = s.history.slice(-12).reduce((a, h) => a + h.net, 0);
  const room = () => s.company.cash + s.company.creditLimit;
  const producing = s.wells.filter((w) => w.status === 'producing');
  // Hire: a driller once there is money to drill, a production man once wells are pumping, the rest when cash flow allows.
  const wanted = [];
  if (producing.length >= 2) wanted.push('driller', 'production');
  if (annualNet > $(40_000) && producing.length >= 4) wanted.push('completions', 'marketing', 'govaffairs', 'pr');
  for (const role of wanted) {
    if (!s.staff.some((x) => x.role === role)) {
      const c = s.candidates.filter((x) => x.role === role).sort((a, b) => b.skill - a.skill)[0];
      if (c && s.company.cash > $(20_000)) hire(s, c);
    }
  }
  // Land: shoot seismic on open acreage first, lease only closures, then drill the best of them.
  const known = new Set(s.pools.filter((p) => p.discovered).flatMap((p) => p.parcels));
  const open = s.parcels.filter((p) => p.drillable && !p.mineral.leasedBy && !p.mineral.auction && !['state', 'federal'].includes(p.mineral.ownerType) && p.mineral.holdoutUntil <= s.month);
  const looksGood = (p) => {
    if (p.survey.level < 2 || p.survey.est.sand.onStructure !== true || p.survey.est.sand.thickness <= 0 || p.survey.est.sand.trapRisk >= 0.35) return false;
    const e = estimateWell(s, p, defaultDesign('sand', s), {});
    return e.dry < 0.3 && e.ev > 0.25 * e.cost.total;
  };
  const leased = s.parcels.filter((p) => p.mineral.leasedBy === 'player');
  const undrilled = leased.filter((p) => !p.wells.length).length;
  const maxLeases = 3 + Math.floor(producing.length / 2);
  const surveys = surveysFor(s);
  const sv2 = surveys.find((x) => x.level === 2), best = surveys[surveys.length - 1];
  const prospects = open.filter(looksGood);
  // Shoot one line a quarter (or monthly once there is production). With no production and the money running low,
  // only shoot next to somebody's well or inside a known field.
  const lowCash = !producing.length && s.company.cash <= $(45_000);
  const canShoot = (s.month - (s.flags.botLastShot ?? -99)) >= 3 && s.company.cash > (producing.length ? $(15_000) : $(20_000));
  if (undrilled < maxLeases && !prospects.length && canShoot && room() > $(25_000)) {
    const unshot = open.filter((p) => p.survey.level < 2);
    const inField = unshot.filter((p) => known.has(p.id));
    const offset = unshot.filter((p) => p.survey.level >= 1 && p.survey.est?.sand.thickness > 0);
    const pool = inField.length && rnd() < 0.9 ? inField : offset.length && rnd() < 0.7 ? offset : lowCash ? [] : unshot;
    if (pool.length) {
      const p = pool[Math.floor(rnd() * pool.length)];
      const g = available(s, 'geologist')[0]; s.company.cash -= sv2.cost; s.ledger.other += sv2.cost; runSurvey(s, p, 2, g, sv2.cost); s.flags.botLastShot = s.month;
      if (verbose) { const e = estimateWell(s, p, defaultDesign('sand', s), {}); console.log('  seismic', p.surface.name, p.survey.est.sand.onStructure ? 'closure' : 'wet', 'trap', p.survey.est.sand.trapRisk.toFixed(2), 'IP', e.ip.toFixed(0), 'EV', money(e.ev), 'dry', e.dry.toFixed(2)); }
    }
  }
  if (undrilled < maxLeases && prospects.length && room() > $(20_000)) {
    const p = prospects.sort((a, b) => a.survey.est.sand.trapRisk - b.survey.est.sand.trapRisk)[0];
    const ask = leaseAsk(s, p);
    const r = negotiateLease(s, p, Math.round(ask.bonusAcre * 1.05), ask.royalty, available(s, 'landman')[0]);
    if (verbose) console.log('  lease', p.surface.name, r.msg);
  }
  let drilledThisMonth = false;
  for (const p of leased) {
    if (p.survey.level < 2 && room() > $(12_000)) { const g = available(s, 'geologist')[0]; s.company.cash -= sv2.cost; s.ledger.other += sv2.cost; runSurvey(s, p, 2, g, sv2.cost); }
    if (p.survey.level === 2 && best.level === 3 && s.company.cash > 3 * best.cost) { const g = available(s, 'geologist')[0]; s.company.cash -= best.cost; s.ledger.other += best.cost; runSurvey(s, p, 3, g, best.cost); }
    if (!p.surface.agreement && p.survey.level >= 2) { const ask = surfaceAsk(s, p); negotiateSurface(s, p, ask.damages, true, available(s, 'landman')[0]); }
    const liveWells = p.wells.filter((id) => { const w = s.wells.find((w) => w.id === id); return w && !['dry', 'plugged'].includes(w.status); }).length;
    const dryHere = p.wells.some((id) => s.wells.find((w) => w.id === id)?.status === 'dry');
    if (!drilledThisMonth && p.surface.agreement && p.survey.level >= 2 && liveWells < 2 && !dryHere && !s.wells.some((w) => ['permit', 'drill', 'complete'].includes(w.status))) {
      const opts = designOptionsFor(s);
      const designs = targetsFor(s).map((t) => defaultDesign(t, s));
      for (const d of designs) {
        if (d.target === 'sand') d.vfrac = p.survey.est.sand.perm < 20 && opts.vfrac.some((o) => o.v === true);
        if (p.surface.agreement.conditions.noFresh) d.water = 'recycled';
        if (d.target === 'shale') {
          if (p.survey.est.shale.brittleness < 0.5) d.fluid = 'gel';
          if (p.survey.est.shale.depth > 9500 && opts.proppant.some((o) => o.v === 'ceramic')) d.proppant = 'ceramic';
          if (p.survey.est.shale.sour) d.casing = 'premium';
        }
      }
      const est = designs.map((d) => ({ d, e: estimateWell(s, p, d, { driller: available(s, 'driller')[0], completions: available(s, 'completions')[0] }) }));
      est.sort((a, b) => b.e.ev - a.e.ev);
      const pick = est.find((x) => x.e.valid && x.e.ev > 0.25 * x.e.cost.total && x.e.dry < 0.3 && s.company.cash - x.e.cost.total > -0.9 * s.company.creditLimit && (s.company.cash > $(10_000) || annualNet > $(15_000) || x.e.ev > x.e.cost.total));
      if (pick) {
        let r = startWell(s, p, pick.d, available(s, 'driller')[0], available(s, 'completions')[0], L);
        if (!r.ok && (r.needs === 'permit' || r.needs === 'spacing')) { if (courthouse(s, { ...r, parcelId: p.id })) r = startWell(s, p, pick.d, available(s, 'driller')[0], available(s, 'completions')[0], L); }
        if (r.ok) drilledThisMonth = true;
        if (verbose) console.log('  drill', p.surface.name, pick.d.target, 'cost', money(pick.e.cost.total), 'EV', money(pick.e.ev), 'IP', Math.round(pick.e.ip), r.ok ? 'ok' : r.msg);
      } else if (verbose) console.log('  skip', p.surface.name, est.map((x) => `${x.d.target} EV ${money(x.e.ev)} dry ${x.e.dry.toFixed(2)} ${x.e.notes[0] || ''}`).join(' | '));
    }
  }
  for (const w of s.wells) if (w.status === 'shutin') doWorkover(s, w, L);
  if (!s.market.oilPipeline && producing.length >= 2 && room() > $(80_000)) buyMidstream(s, 'oilPipeline');
  if (!s.market.gasGathering && s.market.gasMarket && producing.length >= 2 && room() > $(60_000)) buyMidstream(s, 'gasGathering');
  // The press: buy ads when the Clarion has been unkind; decide held stories if you own the paper.
  if (s.press.notoriety > 20 && s.company.cash > $(5_000) && s.press.adUntil <= s.month) { const r = buyAds(s, $(600)); if (r.ok) tally.ads++; }
  for (const st of s.press.stories.filter((x) => x.status === 'held')) decideStory(s, st.id, st.repHit > 5 ? 'kill' : 'print');
  // Events: a seeded random option.
  while (s.pending.length) {
    const ev = s.pending[0]; const def = EVENTS[ev.id];
    const choice = Math.floor(rnd() * def.options.length);
    if (verbose) console.log(`  event ${ev.id}: "${def.options[choice].label}"`);
    resolveEvent(s, choice, L);
  }
}

let lastNews = 0;
const rows = [];
const row = () => rows.push([yearOf(state.month), state.market.oil.toFixed(2), state.wells.filter((w) => w.status === 'producing').length, state.wells.length, money(state.company.cash), money(state.company.value), Math.round(state.company.reputation), state.staff.length, Math.round(state.law.heat), state.press.printed,state.law.investigations.length, state.law.convictions, state.permits.allowable.toFixed(2), (() => { const h = state.permits.history[state.permits.history.length - 1]; return h && calMonth(state.month) === 0 ? `${h.used}/${h.budget}` : `${state.permits.countyUsed}/${state.permits.countyBudget}`; })()]);
let absentMonths = 0;
for (let m = 0; m < years * 12; m++) {
  if (isAbsent(state)) absentMonths++; else bot();
  advanceMonth(state);
  if (noProration) state.permits.allowable = 1;
  if (verbose) { for (const n of state.news.slice(lastNews)) console.log(`[${dateStr(n.month)}] ${n.text}`); lastNews = state.news.length; }
  const bad = JSON.stringify(state, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN!' : v)).includes('NaN!');
  if (bad) { console.error('NaN detected at month', state.month); process.exit(1); }
  if (calMonth(state.month) === 0) row();
  if (state.company.bankrupt) { console.log(`${state.law.ruined ? 'RUINED' : 'BANKRUPT'} at month ${state.month} (${dateStr(state.month)})`); break; }
}
if (calMonth(state.month) !== 0) row();
const pad = (v, n) => String(v).padStart(n);
const H = [['Year', 5], ['Oil $', 7], ['Prod', 5], ['Wells', 5], ['Cash', 9], ['Value', 9], ['Rep', 4], ['Staff', 5], ['Heat', 5], ['Stories', 7], ['Inv', 4], ['Conv', 4], ['Allow', 6], ['Permits', 8]];
console.log(H.map(([h, n]) => pad(h, n)).join(' '));
for (const r of rows) console.log(r.map((v, i) => pad(v, H[i][1])).join(' '));
const c = state.company;
const prod = state.wells.filter((w) => w.status === 'producing');
console.log(`Seed ${seed}: month ${state.month} (${yearOf(state.month)}). Cash ${money(c.cash)}, value ${money(c.value)}, credit ${money(c.creditLimit)}, rep ${c.reputation.toFixed(0)}, env ${state.env.score.toFixed(0)}, activism ${state.env.activism.toFixed(0)}, notoriety ${state.press.notoriety.toFixed(0)}, goodwill ${state.press.goodwill.toFixed(0)}, morale ${state.labor.morale.toFixed(0)}`);
console.log(`Wells: ${state.wells.length} total, ${prod.length} producing, ${state.wells.filter((w) => w.status === 'dry').length} dry, ${state.wells.filter((w) => w.status === 'plugged').length} plugged. Staff ${state.staff.length}. Oil $${state.market.oil.toFixed(2)}. Gas market ${state.market.gasMarket ? 'yes' : 'no'}.`);
console.log(`Courthouse: ${tally.permitAsks} permit asks (${tally.permitOk} granted), ${tally.bribes} bribes (${tally.bribeOk} taken, ${tally.reported} reported), ${tally.spacingAsks} spacing asks, ${tally.ads} ad buys. Crimes ${state.crimes.filter((x) => !x.byRival).length} (${state.crimes.filter((x) => !x.byRival && x.discovered).length} discovered), rival tricks ${state.crimes.filter((x) => x.byRival).length}. Investigations ${state.law.investigations.map((i) => `${i.by}:${i.status}`).join(', ') || 'none'}. Indictments ${state.law.indictments}, convictions ${state.law.convictions}, months away ${absentMonths}.`);
console.log(`Disasters ${state.disasters.count} (${Object.entries(state.disasters.byKind).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}); strikes ${state.labor.strikes}, deaths ${state.labor.deaths}, union ${state.labor.union || 'no'}. Clippings ${state.press.clippings.length}; last: ${state.press.clippings.slice(-3).map((x) => `"${x.headline}"`).join(' / ')}`);
console.log('Ledger:', Object.fromEntries(Object.entries(state.ledger).map(([k, v]) => [k, money(v)])));
if (verbose) for (const w of state.wells) console.log(`  ${w.name} ${w.target} ${w.status} est IP ${Math.round(w.estimate.ip)} act ${w.perf ? Math.round(w.perf.qiOil) : '-'} cum ${Math.round(w.cumOil)} spent ${money(w.cost.spent)} rev ${money(w.revenue)} health ${w.health.toFixed(0)}`);
JSON.parse(JSON.stringify({ ...state, log: undefined })); // serializable
