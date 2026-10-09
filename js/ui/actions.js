// The actions table: every data-action in the page maps to a function (el, state). This is the only
// place the simulation is mutated from the UI. makeActions(ctx) binds the table to the bootstrap's
// context (render, modals, toasts, screens, dialogue).
import { money, dateStr } from '../util.js';
import { ROLES, GRID_W } from '../data.js';
import { surveysFor } from '../geology.js';
import { targetsFor } from '../tech.js';
import { inflate } from '../era.js';
import { negotiateLease, negotiateSurface, nominateAuction, forceAccess, runSurvey } from '../land.js';
import { hire, fire, available, makeContractor } from '../staff.js';
import { defaultDesign, startWell, doWorkover, preventiveService, plugWell, waterflood } from '../wells.js';
import { acreageAsk, offerAcreage } from '../competitors.js';
import { buyMidstream, addHedge } from '../market.js';
import { lobby } from '../government.js';
import { doCommunity } from '../environment.js';
import { resolveEvent } from '../events.js';
import { buyAds, buyPaper, decideStory } from '../press.js';
import { hireDetective, hireLawyer } from '../law.js';
import { fundSafety, giveRaise } from '../labor.js';
import { setInsurance } from '../disasters.js';
import { tipSheriffOn } from '../competitors.js';
import { formCompany, isFounding, canForm } from '../founding.js';
import { isAbsent } from '../sim.js';
import * as M from './modals.js';
import { choose, closeDialogue, skipReveal, openDialogue } from './dialogue.js';
import { ROOMS } from '../scenes/rooms.js';
import { SPEAKERS } from '../scenes/talk.js';
import { interact as townInteract } from '../scenes/town.js';

// While you are in the penitentiary only these still work; during the founding year these are refused.
const ABSENT_OK = new Set(['next', 'save', 'load', 'auto', 'new', 'start-game', 'tab', 'drawer', 'goto', 'hotspot', 'close-modal', 'dlg-choice', 'dlg-close', 'dlg-skip', 'select-parcel', 'well-detail', 'field-nav', 'talk']);
const FOUNDING_BLOCKED = new Set(['survey', 'lease', 'auction', 'surface', 'submit-lease', 'submit-auction', 'submit-surface', 'force', 'design', 'submit-well', 'hire', 'fire', 'workover', 'service', 'plug', 'midstream', 'buy', 'submit-buy', 'waterflood', 'hedge', 'submit-hedge', 'lobby', 'submit-lobby', 'community', 'buy-ads', 'buy-paper', 'decide-story', 'hire-detective', 'hire-lawyer', 'insurance', 'safety', 'raise', 'tip-sheriff']);

export function makeActions(ctx) {
  const { $, toast, openModal, closeModal, render, log: L } = ctx;
  const id = (el) => +el.dataset.id;
  const actions = {
    next() { ctx.next(); },
    save() { ctx.save(); },
    load() { ctx.load(); },
    auto() { ctx.setAuto(!ctx.ui.auto); },
    new() { openModal('newgame'); },
    'start-game'() { ctx.startGame($('#ng-name').value.trim(), $('#ng-seed').value.trim(), $('#ng-player')?.value.trim()); },
    tab(el) { ctx.ui.tab = el.dataset.id; if (ctx.ui.screen !== 'map') ctx.ui.drawer = true; render(); },
    drawer() { ctx.ui.drawer = !ctx.ui.drawer; render(); },
    goto(el) { const o = {}; if (el.dataset.place) o.place = el.dataset.place; if (el.dataset.from) o.from = el.dataset.from; ctx.goto(el.dataset.screen, o); },
    interact() { townInteract(ctx); },
    hotspot(el, state) {
      const room = ctx.ui.screen === 'office' ? (isFounding(state) ? ROOMS.storefront : ROOMS.office) : ROOMS[ctx.ui.place];
      const h = room?.hotspots?.find((x) => x.id === el.dataset.id);
      if (!h) return;
      if (h.tab) { ctx.ui.tab = h.tab; ctx.ui.drawer = true; render(); }
      else if (h.goto) { const [screen, opts] = Array.isArray(h.goto) ? h.goto : [h.goto, {}]; ctx.goto(screen, opts); }
      else if (h.open) { const [kind, data] = Array.isArray(h.open) ? h.open : [h.open]; openModal(kind, typeof data === 'function' ? data(state) : data); }
      else if (h.talk) ctx.openTalk(h.talk);
      else if (h.action) actions[h.action]?.(el, state);
    },
    talk(el) { ctx.openTalk(el.dataset.id, { npc: el.dataset.name }); },
    'dlg-choice'(el) { choose(id(el)); },
    'dlg-close'() { closeDialogue(); render(); },
    'dlg-skip'() { skipReveal(); },
    'field-nav'(el, state) {
      const p = state.parcels[ctx.ui.selected ?? -1]; if (!p) return;
      const nx = Math.max(0, Math.min(GRID_W - 1, p.x + (+el.dataset.dir || 0)));
      ctx.ui.selected = p.y * GRID_W + nx; render();
    },
    'select-parcel'(el) { ctx.ui.selected = id(el); ctx.ui.tab = 'parcel'; if (ctx.ui.screen !== 'map' && ctx.ui.screen !== 'field') ctx.goto('map'); else render(); },
    'close-modal'() { closeModal(); render(); },
    'event-choice'(el, state) { resolveEvent(state, id(el), L); ctx.ui.modal = null; $('#modal').hidden = true; render(); },
    survey(el, state) {
      const p = state.parcels[id(el)], lvl = +el.dataset.level, sv = surveysFor(state).find((s) => s.level === lvl);
      if (!sv) return toast('That kind of survey does not exist yet.');
      const sel = $('#svy-geo');
      const gid = sel ? +sel.value : (available(state, 'geologist')[0]?.id ?? -1);
      let geo = gid > 0 ? state.staff.find((s) => s.id === gid) : null;
      const cost = sv.cost + (gid > 0 ? 0 : inflate(state, 200));
      if (state.company.cash - cost < -state.company.creditLimit) return toast('Cannot afford that survey.');
      if (!geo && gid <= 0) geo = makeContractor(state, 'geologist');
      state.company.cash -= cost; state.ledger.other += cost;
      runSurvey(state, p, lvl, geo, cost);
      if (geo && !geo.contractor && sv.months) { geo.busyUntil = state.month + sv.months; geo.task = `Survey ${p.surface.name}`; }
      L(`${sv.name} completed on ${p.surface.name} by ${geo.name}.`, 'land');
      toast(`${sv.name} on ${p.surface.name}: ${money(cost)}.`);
      render();
    },
    lease(el, state) { openModal('lease', state.parcels[id(el)]); },
    auction(el, state) { openModal('auction', state.parcels[id(el)]); },
    surface(el, state) { openModal('surface', state.parcels[id(el)]); },
    'submit-lease'(el, state) {
      const p = state.parcels[id(el)];
      const r = negotiateLease(state, p, +$('#l-bonus').value, +$('#l-roy').value, ctx.selectedStaff('l-landman'));
      L(r.msg, 'land'); toast(r.msg, 5000);
      if (r.ok || (!p.mineral.leasedBy && p.mineral.holdoutUntil > state.month)) closeModal(); else openModal('lease', p);
      render();
    },
    'submit-auction'(el, state) { const p = state.parcels[id(el)]; const r = nominateAuction(state, p, +$('#a-bid').value); toast(r.msg, 4000); if (r.ok) L(r.msg, 'land'); closeModal(); render(); },
    'submit-surface'(el, state) {
      const p = state.parcels[id(el)];
      const r = negotiateSurface(state, p, +$('#s-dmg').value, $('#s-cond')?.checked ?? true, ctx.selectedStaff('s-landman'));
      L(r.msg, 'land'); toast(r.msg, 5000);
      if (r.ok) closeModal(); else openModal('surface', p);
      render();
    },
    force(el, state) { const p = state.parcels[id(el)]; if (!confirm(`Take ${p.surface.name} to court for access? It means lawyers' fees, ruins the relationship, and the whole county will hear about it.`)) return; const r = forceAccess(state, p); L(r.msg, 'land'); toast(r.msg, 6000); render(); },
    design(el, state) {
      const p = state.parcels[id(el)];
      ctx.ui.designParcel = p.id;
      const shaleLooksBetter = p.survey.est && !(p.survey.est.shale.quality < 0.35 && p.survey.est.sand.thickness > 0);
      ctx.ui.design = defaultDesign(targetsFor(state).includes('shale') && shaleLooksBetter ? 'shale' : 'sand', state);
      if (p.surface.agreement?.conditions?.noFresh) ctx.ui.design.water = 'recycled';
      openModal('designer', p);
    },
    'submit-well'(el, state) {
      const p = state.parcels[id(el)];
      const d = M.readDesign($('#designer'), ctx.ui.design);
      const r = startWell(state, p, d, ctx.selectedStaff('d-driller'), ctx.selectedStaff('d-completions'), L);
      if (r.ok) { toast(`Permit filed for ${r.well.name}.`, 4500); closeModal(); render(); return; }
      if (r.needs === 'permit' || r.needs === 'spacing') {
        // The refusal is a conversation with Dot that can walk you straight to the courthouse.
        closeModal();
        const judge = r.needs === 'permit';
        const who = judge ? 'judge' : 'inspector';
        const seeThem = () => { ctx.goto('interior', { place: 'courthouse' }); ctx.openTalk(who, { ask: judge ? 'permit' : 'spacing' }); };
        openDialogue({ speaker: SPEAKERS.dot(), start: { text: `${r.msg} ${judge ? 'The judge signs the permits; he is at the courthouse.' : "The commission's field man signs the spacing exceptions; he keeps a desk at the courthouse."}`, options: [
          { label: judge ? 'See the judge.' : 'See the field man.', run: seeThem },
          { label: 'Later.' },
        ] } }, ctx);
        render();
        return;
      }
      toast(r.needs === 'freeze' ? `${r.msg} Nothing to do but wait it out.` : r.needs === 'strike' ? `${r.msg} Settle with the crews first (Staff).` : r.needs === 'restricted' ? r.msg : r.msg, 6000);
      render();
    },
    hire(el, state) { const c = state.candidates.find((x) => x.id === id(el)); if (!c) return; const r = hire(state, c); if (!r.ok) return toast(r.msg); L(`Hired ${c.name} as ${ROLES[c.role].name} (skill ${c.skill}).`, 'staff'); render(); },
    fire(el, state) { const s = state.staff.find((x) => x.id === id(el)); if (!s) return; if (!confirm(`Fire ${s.name}? Severance is ${money(s.salary * 2)}.`)) return; const r = fire(state, s.id); if (!r.ok) return toast(r.msg); L(`${s.name} was let go with ${money(r.severance)} severance.`, 'staff'); render(); },
    'well-detail'(el, state) { const w = state.wells.find((x) => x.id === id(el)); if (w) openModal('well', w); },
    workover(el, state) { const r = doWorkover(state, state.wells.find((w) => w.id === id(el)), L); if (!r.ok) toast(r.msg); render(); },
    service(el, state) { const r = preventiveService(state, state.wells.find((w) => w.id === id(el)), L); if (!r.ok) toast(r.msg); render(); },
    plug(el, state) { const w = state.wells.find((x) => x.id === id(el)); if (!confirm(`Plug and abandon ${w.name}? This is permanent.`)) return; plugWell(state, w, L); render(); },
    midstream(el, state) { const r = buyMidstream(state, el.dataset.id); if (!r.ok) return toast(r.msg); L(`Built: ${el.dataset.id === 'oilPipeline' ? 'crude pipeline connection' : el.dataset.id === 'gasGathering' ? 'gas gathering system' : 'saltwater disposal well'}.`, 'market'); render(); },
    buy(el, state) { const p = state.parcels[id(el)]; const ask = acreageAsk(state, p); if (!ask?.forSale) return toast(ask?.reason || 'Not for sale.'); openModal('buy', p); },
    'submit-buy'(el, state) { const p = state.parcels[id(el)]; const r = offerAcreage(state, p, +$('#b-bid').value, L); toast(r.msg, 5000); if (r.ok) closeModal(); else L(r.msg, 'land'); render(); },
    waterflood(el, state) { const pool = state.pools.find((x) => x.id === id(el)); const r = waterflood(state, pool, L); if (!r.ok) toast(r.msg, 4000); render(); },
    hedge() { openModal('hedge'); },
    'submit-hedge'(el, state) { const vol = +$('#h-vol').value, mo = +$('#h-mo').value; const price = addHedge(state, vol, mo); if (price === null) return toast('No futures market yet.'); L(`Forward sale executed: ${vol.toLocaleString()} bbl/month at $${price.toFixed(2)} for ${mo} months.`, 'market'); closeModal(); render(); },
    lobby() { openModal('lobby'); },
    'submit-lobby'(el, state) { const r = lobby(state, +$('#lb-amt').value, L); toast(r.msg, 4000); closeModal(); render(); },
    community(el, state) { const r = doCommunity(state, el.dataset.id, L); if (!r.ok) toast(r.msg); render(); },
    // The Clarion.
    'buy-ads'(el, state) { const r = buyAds(state, +el.dataset.amount); toast(r.msg, 6000); render(); },
    'buy-paper'(el, state) { if (!confirm(`Buy The Dry Fork Clarion, its press, its Linotype and its mortgage? From then on you decide what runs.`)) return; const r = buyPaper(state); toast(r.msg, 7000); render(); },
    'decide-story'(el, state) { const r = decideStory(state, +el.dataset.id, el.dataset.decision); toast(r.msg, 6000); render(); },
    // The law.
    'hire-detective'(el, state) { const r = hireDetective(state, +el.dataset.months || 1); toast(r.msg, 6000); render(); },
    'hire-lawyer'(el, state) { const r = hireLawyer(state, +el.dataset.months || 12); toast(r.msg, 6000); render(); },
    'tip-sheriff'(el, state) { const r = tipSheriffOn(state, el.dataset.id, L); toast(r.msg, 6000); render(); },
    // Crews and the Hartford.
    safety(el, state) { const r = fundSafety(state, L); if (!r.ok) toast(r.msg); else toast('Hard hats all round. Morale up, accidents down for a year.'); render(); },
    raise(el, state) { giveRaise(state, +el.dataset.frac || 0.05, L); toast('Wages up across the payroll. It sticks.'); render(); },
    insurance(el, state) { setInsurance(state, el.checked, L); render(); },
    // The founding year.
    sign() { openModal('sign'); },
    'form-company'(el, state) {
      const name = ($('#sg-name')?.value || '').trim();
      const r = formCompany(state, { name });
      if (!r.ok) return toast(r.msg, 6000);
      closeModal();
      L(`${r.name} incorporated with ${money(r.cash)} in the bank.`, 'company');
      toast(`${r.name} is incorporated. ${money(r.cash)} in the bank${r.loan ? `, ${money(r.loan.monthly)} a month to First State` : ''}.`, 7000);
      ctx.goto('office');
      ctx.openTalk('firstday');
    },
  };
  // Guards: a prisoner cannot act and a man without a company cannot spend its money.
  for (const k of Object.keys(actions)) {
    const fn = actions[k];
    actions[k] = (el, state) => {
      if (state) {
        if (isAbsent(state) && !ABSENT_OK.has(k)) return toast(`You are in the state penitentiary until ${dateStr(state.law.absentUntil)}. Dot is keeping the lights on.`, 5000);
        if (isFounding(state) && FOUNDING_BLOCKED.has(k)) return toast('There is no company yet. Recruit a geologist, a rig and the money, then sign the papers.', 5000);
      }
      return fn(el, state);
    };
  }
  return actions;
}
