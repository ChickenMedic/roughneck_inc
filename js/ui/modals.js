// Modal dialogs: well designer, negotiations, hedging, lobbying, events, well detail, new game.
import { money, fmt, pct, dateStr, esc } from '../util.js';
import { OWNER_TYPES, ROLES, TRAITS } from '../data.js';
import { leaseAsk, surfaceAsk, isPublic } from '../land.js';
import { available, effSkill, contractorFee } from '../staff.js';
import { designOptionsFor, targetsFor } from '../tech.js';
import { inflate } from '../era.js';
import { defaultDesign, estimateWell, stagesFor, statusLabel, forecast, liftFactor, WELL_CAP } from '../wells.js';
import { hedgeQuote } from '../market.js';
import { EVENTS } from '../events.js';
import { foundingSummary, canForm, FOUNDERS } from '../founding.js';
import { FOUNDING_MIN_CAPITAL } from '../data.js';
import { lineChart, bar, stars } from './charts.js';

const box = (inner, narrow = false) => `<div class="box ${narrow ? 'narrow' : ''}">${inner}</div>`;
const staffSelect = (state, role, id, target) => {
  const list = available(state, role);
  return `<select id="${id}">${list.map((s) => `<option value="${s.id}">${esc(s.name)} — skill ${effSkill(state, s, { target })}${s.traits.length ? ' (' + s.traits.map((t) => TRAITS[t].name).join(', ') + ')' : ''}</option>`).join('')}<option value="-1">Contractor (fee ~${money(contractorFee(state))}, skill unknown 2–6)</option></select>${list.length ? '' : `<div class="note">No available ${ROLES[role].name.toLowerCase()}. Hire one under Staff, or use a contractor.</div>`}`;
};

// ---------- Well designer ----------
export function renderDesigner(state, p, design) {
  const avail = designOptionsFor(state), targets = targetsFor(state);
  const opts = (key) => avail[key].map((o) => `<option value="${o.v}" ${String(design[key]) === String(o.v) ? 'selected' : ''}>${o.label}</option>`).join('');
  const shale = design.target === 'shale';
  const cond = p.surface.agreement.conditions;
  return box(`<h2>Design a well — ${esc(p.surface.name)}</h2><p class="muted">Survey level ${p.survey.level}/4. ${p.survey.level < 2 ? 'Estimates below are very rough. Consider a seismic survey first.' : ''}</p>
  <form id="designer" class="designer">
    <div>
      <label>Target formation</label><select id="d-target">${targets.includes('shale') ? `<option value="shale" ${shale ? 'selected' : ''}>Blackfork Shale — horizontal + multistage frac</option>` : ''}<option value="sand" ${!shale ? 'selected' : ''}>Frontier Sandstone — vertical, conventional</option></select>
      ${shale ? `
      <label>Lateral length</label><select id="d-lateral">${opts('lateral')}</select>
      <label>Frac stage spacing (${stagesFor(design)} stages)</label><select id="d-spacing">${opts('spacing')}</select>
      <label>Proppant type</label><select id="d-proppant">${opts('proppant')}</select>
      <label>Proppant intensity</label><select id="d-intensity">${opts('intensity')}</select>
      <label>Frac fluid</label><select id="d-fluid">${opts('fluid')}</select>
      <label>Water source</label><select id="d-water">${avail.water.filter((o) => !(cond.noFresh && o.v === 'fresh')).map((o) => `<option value="${o.v}" ${design.water === o.v ? 'selected' : ''}>${o.label}</option>`).join('')}</select>` : `
      <label>Completion</label><select id="d-vfrac">${avail.vfrac.map((o) => `<option value="${o.v}" ${String(design.vfrac) === String(o.v) ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`}
      <label>Casing program</label><select id="d-casing">${opts('casing')}</select>
      <label>Artificial lift</label><select id="d-lift">${opts('lift')}</select>
      <h3 style="margin-top:14px">Crew</h3>
      <label>Drilling engineer</label>${staffSelect(state, 'driller', 'd-driller', design.target)}
      <label>Completions engineer</label>${staffSelect(state, 'completions', 'd-completions', design.target)}
    </div>
    <div id="estimate" class="estimate"></div>
  </form>
  <div class="foot"><button data-action="close-modal">Cancel</button><button class="primary" data-action="submit-well" data-id="${p.id}">File permit &amp; commit funds</button></div>`);
}

export function renderEstimate(state, p, design, driller, completions) {
  const e = estimateWell(state, p, design, { driller, completions });
  const lvl = p.survey.level;
  const unc = lvl >= 4 ? 'known' : lvl === 3 ? '±25%' : lvl === 2 ? '±45%' : lvl === 1 ? '±70%' : 'wild guess';
  const fc = forecast(e.perf, 60).map((v, t) => (v / 30.4) * liftFactor(design, t, v / 30.4));
  return `<h3>Estimate <span class="muted" style="text-transform:none;letter-spacing:0">(confidence: ${unc})</span></h3>
    <div class="grid2">
      <div><div class="muted">Total cost</div><div class="big">${money(e.cost.total)}</div></div>
      <div><div class="muted">Initial rate</div><div class="big">${fmt(e.ip)} <span style="font-size:12px">bbl/d</span></div></div>
      <div><div class="muted">EUR oil</div><div>${fmt(e.eurOil / 1000)}k bbl${e.eurGas > 50000 ? ` + ${fmt(e.eurGas / 1e6, 1)} bcf gas` : ''}</div></div>
      <div><div class="muted">NPV10 if successful</div><div class="${e.npv > 0 ? 'good' : 'bad'}">${money(e.npv)}</div></div>
      <div><div class="muted">Dry-hole risk</div><div class="${e.dry > 0.3 ? 'bad' : ''}">${pct(e.dry)}</div></div>
      <div><div class="muted">Risked value</div><div class="${e.ev > 0 ? 'good' : 'bad'}">${money(e.ev)}</div></div>
      <div><div class="muted">Payout</div><div>${e.payout ? e.payout + ' months' : 'never'}</div></div>
      <div><div class="muted">Timeline</div><div>${state.gov.permitMonths} mo permit + ${e.months} mo drill + 1 mo complete</div></div>
    </div>
    ${lineChart([{ name: 'Forecast bbl/d (5 yrs)', values: fc, color: '#f0a830' }], { h: 90, yFmt: (v) => v.toFixed(0) })}
    <table>${Object.entries(e.cost.breakdown).filter(([, v]) => v > 0).map(([k, v]) => `<tr><td>${k}</td><td class="num">${money(v)}</td></tr>`).join('')}</table>
    ${e.notes.map((n) => `<div class="note">⚠ ${n}</div>`).join('')}
    <p class="muted" style="font-size:12px;margin-bottom:0">At $${state.market.oil.toFixed(0)} oil, ${pct(p.mineral.lease.royalty, 1)} royalty, ${pct(state.gov.severance)} severance. Actual results depend on the real rock, your crew, and luck.</p>`;
}

export function readDesign(form, current) {
  const g = (id) => form.querySelector('#' + id)?.value;
  const target = g('d-target');
  const d = target === current.target ? { ...current } : defaultDesign(target);
  d.target = target;
  if (target === 'shale') { d.lateral = +g('d-lateral') || d.lateral; d.spacing = +g('d-spacing') || d.spacing; d.proppant = g('d-proppant') || d.proppant; d.intensity = +g('d-intensity') || d.intensity; d.fluid = g('d-fluid') || d.fluid; d.water = g('d-water') || d.water; }
  else { const v = g('d-vfrac'); if (v !== undefined) d.vfrac = v === 'true'; }
  d.casing = g('d-casing') || d.casing; d.lift = g('d-lift') || d.lift;
  return d;
}

// ---------- Lease negotiation ----------
export function renderLease(state, p) {
  const ask = leaseAsk(state, p), m = p.mineral;
  const land = available(state, 'landman');
  return box(`<h2>Lease negotiation — ${esc(m.name)}</h2>
  <p>${m.ownerType === 'heirs' ? 'Seventeen heirs, three lawyers, one fax machine.' : m.ownerType === 'company' ? 'A mineral company. They know exactly what the rock is worth, or think they do.' : `${esc(p.surface.ownerPerson)} owns both the surface and the minerals.`} They are asking roughly <b>$${ask.bonusAcre}/acre</b> (${money(ask.bonusAcre * p.acres)}) and a <b>${pct(ask.royalty, 1)}</b> royalty on a ${ask.term / 12}-year primary term.${m.failedRounds ? ` <span class="warn">You have been refused ${m.failedRounds} time${m.failedRounds > 1 ? 's' : ''}; the ask has gone up.</span>` : ''}</p>
  <div class="grid2">
    <div><label class="muted">Bonus per acre: <b id="l-bonus-v">$${ask.bonusAcre}</b></label><input type="range" id="l-bonus" min="${Math.max(1, Math.round(ask.bonusAcre * 0.3))}" max="${Math.round(ask.bonusAcre * 1.6)}" step="${ask.bonusAcre >= 20 ? 5 : 1}" value="${ask.bonusAcre}"></div>
    <div><label class="muted">Royalty: <b id="l-roy-v">${pct(ask.royalty, 1)}</b></label><input type="range" id="l-roy" min="0.125" max="0.25" step="0.005" value="${ask.royalty}"></div>
  </div>
  <p class="muted" style="font-size:12px">Bonus is paid now. Royalty is a share of gross revenue forever, so a lower royalty is worth a lot on a good well. Landman: ${land.length ? `<select id="l-landman">${land.map((s) => `<option value="${s.id}">${esc(s.name)} (skill ${effSkill(state, s)})</option>`).join('')}</select>` : '<span class="warn">none available — negotiating at skill 2</span>'}</p>
  <div class="foot"><button data-action="close-modal">Walk away</button><button class="primary" data-action="submit-lease" data-id="${p.id}">Make offer</button></div>`, true);
}

export function renderAuction(state, p) {
  const ask = leaseAsk(state, p);
  return box(`<h2>Public land auction — ${esc(p.mineral.name)}</h2>
  <p>${p.mineral.ownerType === 'state' ? 'State trust land' : 'Federal land'}: fixed ${pct(ask.royalty, 1)} royalty, 5-year term. Sealed bids close next month. Competitors typically bid 50–150% of the going rate (currently ~$${Math.round(state.land.hype)}/acre). Good government relations discourage rivals.</p>
  <label class="muted">Your bid per acre: <b id="a-bid-v">$${ask.bonusAcre}</b> (${money(ask.bonusAcre * p.acres)} total)</label><input type="range" id="a-bid" min="${Math.max(1, Math.round(ask.bonusAcre * 0.3))}" max="${Math.round(ask.bonusAcre * 2)}" step="${ask.bonusAcre >= 20 ? 5 : 1}" value="${ask.bonusAcre}" data-acres="${p.acres}">
  <div class="foot"><button data-action="close-modal">Cancel</button><button class="primary" data-action="submit-auction" data-id="${p.id}">Submit bid</button></div>`, true);
}

// ---------- Surface negotiation ----------
export function renderSurface(state, p) {
  const ask = surfaceAsk(state, p), s = p.surface;
  const land = available(state, 'landman');
  const conds = [['noFresh', 'No fresh water: fracs must use recycled produced water (costs more).'], ['harvestPause', 'No drilling July–October (harvest). Adds a month if you spud then.'], ['restorationBond', 'Restoration bond: you restore the pad when done (small ongoing cost, +environment).']].filter(([k]) => ask.conditions[k]);
  return box(`<h2>Surface use — ${esc(p.surface.name)}</h2>
  <p>${ask.mandatory ? 'Standard agency terms. Take them or leave them.' : `${esc(s.ownerPerson)} ${s.disposition < 35 ? 'meets you at the gate and does not invite you in.' : s.disposition < 60 ? 'offers coffee and a long list of concerns.' : 'seems pleased at the idea of a royalty cheque.'}`} They want <b>${money(ask.damages)}</b> in surface damages${conds.length ? ' and these conditions:' : '.'}</p>
  ${conds.length ? `<ul>${conds.map(([, t]) => `<li>${t}</li>`).join('')}</ul>` : ''}
  <label class="muted">Damages offer: <b id="s-dmg-v">${money(ask.damages)}</b></label><input type="range" id="s-dmg" min="${Math.round(ask.damages * 0.3 / 10) * 10}" max="${Math.round(ask.damages * 1.5 / 10) * 10}" step="10" value="${ask.damages}">
  ${conds.length ? `<label><input type="checkbox" id="s-cond" checked> Accept their conditions (refusing makes agreement much less likely)</label>` : '<input type="checkbox" id="s-cond" checked hidden>'}
  <p class="muted" style="font-size:12px">Landman: ${land.length ? `<select id="s-landman">${land.map((x) => `<option value="${x.id}">${esc(x.name)} (skill ${effSkill(state, x)})</option>`).join('')}</select>` : '<span class="warn">none available — negotiating at skill 2</span>'}</p>
  <div class="foot"><button data-action="close-modal">Walk away</button><button class="primary" data-action="submit-surface" data-id="${p.id}">Make offer</button></div>`, true);
}

// ---------- Buy acreage from a rival ----------
export function renderBuyAcreage(state, p, ask) {
  const m = p.mineral;
  return box(`<h2>Acreage purchase — ${esc(p.surface.name)}</h2>
  <p><b>${esc(ask.comp.name)}</b> ${m.owned ? 'owns the minerals outright' : `holds a lease that runs until ${dateStr(m.leaseUntil)}`}. ${esc(ask.comp.blurb)}</p>
  <p>Their number is about <b>$${ask.askAcre}/acre</b> (${money(ask.total)}). ${ask.comp.style === 'land' ? 'They are in the business of selling, so a fair offer usually closes.' : 'They are not really sellers; expect to pay up.'} An assignment carries an 18.75% royalty burden${m.owned ? ' and a 10-year term' : ' and the remaining term'}. Prices fall in a bust.</p>
  <label class="muted">Offer per acre: <b id="b-bid-v">$${ask.askAcre}</b> (${money(ask.total)} total)</label><input type="range" id="b-bid" min="${Math.max(1, Math.round(ask.askAcre * 0.4))}" max="${Math.round(ask.askAcre * 1.8)}" step="${ask.askAcre >= 50 ? 10 : 1}" value="${ask.askAcre}" data-acres="${p.acres}">
  <div class="foot"><button data-action="close-modal">Cancel</button><button class="primary" data-action="submit-buy" data-id="${p.id}">Make offer</button></div>`, true);
}

// ---------- Hedge / lobby ----------
export function renderHedge(state) {
  if (hedgeQuote(state, 12) === null) return box(`<h2>Forward sale of crude</h2><p>No futures market exists yet. Until the New York exchange lists a crude contract (the 1980s), the only hedge is a purchaser who pays on time.</p>
  <div class="foot"><button data-action="close-modal">Close</button></div>`, true);
  return box(`<h2>Forward sale of crude</h2><p>Lock a fixed price on a monthly volume. Each month you receive (fixed − spot) × volume, which can be negative. The bank quotes below the long-run average unless your marketing manager is good.</p>
  <div class="grid2"><div><label class="muted">Volume: <b id="h-vol-v">5,000</b> bbl/month</label><input type="range" id="h-vol" min="1000" max="60000" step="1000" value="5000"></div>
  <div><label class="muted">Term: <b id="h-mo-v">12</b> months</label><input type="range" id="h-mo" min="6" max="36" step="6" value="12"></div></div>
  <p>Quoted fixed price: <b id="h-price" class="big">$${hedgeQuote(state, 12).toFixed(2)}</b>/bbl <span class="muted">(spot $${state.market.oil.toFixed(2)})</span></p>
  <div class="foot"><button data-action="close-modal">Cancel</button><button class="primary" data-action="submit-hedge">Sign the agreement</button></div>`, true);
}
export function renderLobby(state) {
  return box(`<h2>Lobbying &amp; contributions</h2><p>Quail hunts, campaign envelopes, a full page in the Clarion. Improves relations with the ${state.gov.party === 'ring' ? 'Courthouse Ring' : 'Reform Ticket (who take the money, but less gratefully)'}. Larger sums are noticed.</p>
  <label class="muted">Amount: <b id="lb-amt-v">${money(inflate(state, 1_000))}</b></label><input type="range" id="lb-amt" min="${inflate(state, 250)}" max="${inflate(state, 10_000)}" step="${inflate(state, 250)}" value="${inflate(state, 1_000)}">
  <div class="foot"><button data-action="close-modal">Cancel</button><button class="primary" data-action="submit-lobby">Spend it</button></div>`, true);
}

// ---------- Event ----------
export function renderEvent(state) {
  const ev = state.pending[0]; if (!ev) return '';
  const def = EVENTS[ev.id];
  return box(`<div class="event"><h2>${def.title}</h2><p>${def.text(state, ev.params)}</p>${def.options.map((o, i) => `<button class="opt" data-action="event-choice" data-id="${i}">${o.label}</button>`).join('')}</div>`, true);
}

// ---------- Well detail ----------
export function renderWellDetail(state, w) {
  const p = state.parcels[w.parcelId];
  const d = w.design, lm = w.lastMonth;
  const design = w.target === 'shale' ? `Horizontal, ${fmt(d.lateral)} ft lateral, ${stagesFor(d)} stages @ ${d.spacing} ft, ${d.proppant} ${fmt(d.intensity)} lb/ft, ${d.fluid}, ${d.water} water, ${d.casing} casing, lift: ${d.lift}` : `Vertical, ${d.vfrac ? 'small frac' : 'perforated'}, ${d.casing} casing, lift: ${d.lift}`;
  const hist = w.perf ? forecast(w.perf, Math.max(24, w.prodMonths + 36)).map((v, t) => (v / 30.4) * liftFactor(d, t, v / 30.4)) : [];
  return box(`<h2>${esc(w.name)} <span class="muted" style="font-size:13px;font-weight:400">${esc(p.surface.name)}</span></h2>
  <div class="grid2"><div class="kv">
    <dt>Status</dt><dd>${statusLabel(w)}</dd>
    <dt>Design</dt><dd>${design}</dd>
    <dt>Crew</dt><dd>Drilling: ${esc(w.crew.driller.name)} (skill ${w.crew.driller.skill})<br>Completions: ${esc(w.crew.completions.name)} (skill ${w.crew.completions.skill})</dd>
    <dt>Spent</dt><dd>${money(w.cost.spent)} <span class="muted">(estimate ${money(w.cost.est)})</span></dd>
    <dt>Estimated IP</dt><dd>${fmt(w.estimate.ip)} bbl/d</dd>
    ${w.perf ? `<dt>Actual IP</dt><dd>${fmt(w.perf.qiOil)} bbl/d${w.perf.gasFree > 50 ? ` + ${fmt(w.perf.gasFree)} mcf/d` : ''}</dd>` : ''}
  </div><div class="kv">
    <dt>Cum oil</dt><dd>${fmt(w.cumOil)} bbl</dd><dt>Cum gas</dt><dd>${fmt(w.cumGas)} mcf${w.cumFlared ? ` <span class="warn">(${fmt(w.cumFlared)} flared)</span>` : ''}</dd><dt>Cum water</dt><dd>${fmt(w.cumWater)} bbl</dd>
    <dt>Revenue</dt><dd>${money(w.revenue)}</dd><dt>Operating cost</dt><dd>${money(w.opexTotal)}</dd>
    <dt>Health</dt><dd>${bar(w.health, 100, w.health < 35 ? 'red' : w.health < 55 ? 'amber' : '')} ${Math.round(w.health)}</dd>
    ${lm ? `<dt>Last month</dt><dd>${fmt(lm.oil)} bbl, ${fmt(lm.gas)} mcf, ${fmt(lm.water)} bbl water<br>gross ${money(lm.gross)} − royalty ${money(lm.royalty)} − tax ${money(lm.severance)} − opex ${money(lm.opex)} = <b class="${lm.net < 0 ? 'bad' : 'good'}">${money(lm.net)}</b></dd>` : ''}
  </div></div>
  ${hist.length ? lineChart([{ name: 'Decline curve bbl/d (now = month ' + w.prodMonths + ')', values: hist, color: '#f0a830' }], { h: 100, yFmt: (v) => v.toFixed(0) }) : ''}
  <div class="foot"><button data-action="close-modal">Close</button></div>`);
}

// ---------- New game / game over ----------
export function renderNewGame(hasSave) {
  return box(`<div class="front">
  <div class="nameplate"><div class="paper-name">The Dry Fork Clarion</div></div>
  <div class="ears"><span>Dry Fork, Okla. · Monday, September 1, 1952</span><span>Vol. XLI, No. 1</span><span>Price 5¢</span></div>
  <h1>Stranger Steps Off the 6:10 With a Suitcase and a Geology Book</h1>
  <p class="subhead">Takes a Room at the Hotel; Says He Means to Drill — Has No Company, No Rig and No Geologist, "Yet"</p>
  <div class="body">
    <p>A newcomer with a good suit, a letter of introduction nobody asked for and, by his own account, about twelve thousand dollars, stepped off the eastbound at the Rock Island depot Monday and asked the agent where the geologists drink. He was directed to the Bluebonnet.</p>
    <p>The stranger told this newspaper that there is oil under the Frontier sand and that he means to find it before Sooner State does. He has a year's money at the hotel and a name in mind for the concern. The geologists drink at the Bluebonnet, the money stays at the hotel, Mrs. Hargrove receives callers at the church, and the rigs are at the yard and the depot; the bank, as ever, wants to see a geologist and a rig before it opens an account in anything but a man's own name.</p>
    <p>Prices at Cushing stand at $2.53 the barrel and the commission allows fifty-five percent. Permits are issued at the courthouse, where the judge signs them. The Courthouse Ring has not commented; the Reform Ticket says it is watching. Persons wishing to be hired should present themselves at the Bluebonnet between six and seven.</p>
  </div>
  <div class="coupon"><div class="grid2"><div><label for="ng-player">Your name</label><input type="text" id="ng-player" value="" placeholder="the stranger off the 6:10" style="width:100%"></div><div><label for="ng-name">Name you have in mind for the concern</label><input type="text" id="ng-name" value="Dry Fork Petroleum" style="width:100%"></div></div>
  <div class="grid2" style="margin-top:6px"><div><label for="ng-seed">Edition No. (seed, optional)</label><input type="text" id="ng-seed" placeholder="leave blank for today's edition" style="width:100%"></div><div class="muted" style="font-size:10.5px;align-self:end;text-align:right;letter-spacing:0.1em">A ROUGHNECK INC. GAME</div></div>
  <div class="foot">${hasSave ? '<button data-action="load" title="Continue the saved game">Late Edition</button>' : ''}<button class="primary" data-action="start-game">Arrive in Dry Fork</button></div></div>
  </div>`, false);
}
export function renderGameOver(state) {
  const c = state.company;
  if (state.founding?.failed) return box(`<h2>Back to Tulsa</h2><p>${state.founding.personalCash <= 0 ? 'The hotel presented its bill and you could not pay it.' : 'A year in Dry Fork and no company to show for it.'} You went back to Tulsa to sell insurance. The Bluebonnet is quieter, the Jessup flatcar went out on the morning freight, and somebody else will drill the Frontier sand.</p>
  <p>Signed: ${state.founding.recruited.length ? state.founding.recruited.map((id) => FOUNDERS[id]?.name || id).join(', ') : 'nobody'}. Needed: a geologist, a rig and ${money(inflate(state, FOUNDING_MIN_CAPITAL))}.</p>
  <div class="foot"><button class="primary" data-action="new">Try another town</button></div>`, true);
  if (state.law?.ruined) return box(`<h2>Finished</h2><p>${esc(c.name)} is finished: ${state.law.convictions >= 3 ? "a third conviction, and the commission revoked your operator's licence" : 'the judge, the bank and the Clarion agreed on it for once'}. The leases went on the courthouse steps and the framed photograph of your first well went with them.</p>
  <p>You lasted ${Math.floor(state.month / 12)} years and ${state.month % 12} months, drilled ${state.wells.length} wells, produced ${fmt(state.wells.reduce((a, w) => a + w.cumOil, 0))} barrels, and made the Clarion ${state.press?.clippings?.length || 0} times.</p>
  <div class="foot"><button class="primary" data-action="new">Start again</button></div>`, true);
  return box(`<h2>Receivership</h2><p>${esc(c.name)} could not service its debt. The bank took the leases, the pumpjacks, and the framed photo of your first well.</p>
  <p>You lasted ${Math.floor(state.month / 12)} years and ${state.month % 12} months, drilled ${state.wells.length} wells, and produced ${fmt(state.wells.reduce((a, w) => a + w.cumOil, 0))} barrels.</p>
  <div class="foot"><button class="primary" data-action="new">Start again</button></div>`, true);
}

// ---------- Articles of incorporation (end of the founding year) ----------
export function renderSign(state) {
  const f = foundingSummary(state), cf = canForm(state);
  const loan = f.signed.find((x) => x.kind === 'lender');
  const contractor = f.signed.find((x) => x.kind === 'contractor');
  const rows = f.signed.map((x) => `<tr><td><b>${esc(x.name)}</b><br><span class="muted">${esc(x.title)}</span></td><td>${esc(x.terms)}</td><td class="muted" style="font-size:12px">${esc(x.quirk)}</td></tr>`).join('');
  return box(`<div class="articles"><h2>Articles of Incorporation</h2><p class="muted" style="margin-top:0">State of Oklahoma, County of Dry Fork. Filed with the county clerk, ${esc(state.people?.[state.offices?.judge]?.name || 'the judge')} presiding.</p>
  <label class="muted" for="sg-name">Name of the corporation</label><input type="text" id="sg-name" value="${esc(state.company.name)}" style="width:100%;font-size:17px">
  <h3>The undersigned partners</h3>${rows ? `<table><tr><th>Partner</th><th>Terms</th><th>Notes</th></tr>${rows}</table>` : '<p class="muted">Nobody has shaken on anything yet.</p>'}
  <div class="grid2" style="margin-top:10px"><div class="kv">
    <dt>Your own money</dt><dd>${money(f.personalCash)}</dd>
    <dt>Capital at signing</dt><dd class="${f.capital >= f.minCapital ? 'good' : 'bad'}">${money(f.capital)} <span class="muted">(bank wants ${money(f.minCapital)})</span></dd>
    <dt>Note at the bank</dt><dd>${loan ? esc(loan.terms) : 'none'}</dd>
    ${contractor ? `<dt>Rig contract</dt><dd>${esc(contractor.terms)}: first three wells at twenty percent off</dd>` : ''}
  </div><div class="kv">
    <dt>Equity promised</dt><dd class="${f.equity > 0.5 ? 'warn' : ''}">${pct(f.equity)} <span class="muted">(you keep ${pct(1 - f.equity)})</span></dd>
    <dt>Geologist</dt><dd class="${f.geologist ? 'good' : 'bad'}">${f.geologist ? '✓' : '✗ none signed'}</dd>
    <dt>Rig</dt><dd class="${f.rig ? 'good' : 'bad'}">${f.rig ? '✓' : '✗ none signed'}</dd>
    <dt>Hotel money left</dt><dd>${f.monthsLeft} month${f.monthsLeft === 1 ? '' : 's'}</dd>
  </div></div>
  ${cf.ok ? '<p>Everything the bank asked for is on the table. Sign, and the rooms over the Mercantile are yours by Thursday.</p>' : `<p class="warn">Not yet. You still need ${cf.missing.join('; ')}.</p>`}
  <div class="foot"><button data-action="close-modal">Not yet</button><button class="primary" data-action="form-company" ${cf.ok ? '' : 'disabled'}>Sign the papers</button></div></div>`);
}
