// Top bar, tabs, side panels, news feed. All return HTML strings.
import { money, fmt, pct, dateStr, esc, sum } from '../util.js';
import { OWNER_TYPES, ROLES, ROLE_KEYS, TRAITS, PARTIES } from '../data.js';
import { surveysFor, describeQuality, describeBrittle, describePressure, describePerm, describeOilFrac, surveySigma, describeStructure } from '../geology.js';
import { leaseAsk, surfaceAsk, isPublic } from '../land.js';
import { available, roleSkill, traitNames } from '../staff.js';
import { statusLabel, producingWells, activeWells, WELL_CAP, poolFor, waterfloodCost, serviceCost } from '../wells.js';
import { acreageAsk, compProduction, compByName } from '../competitors.js';
import { oilDifferential, realizedOil, realizedGas, MIDSTREAM, midstreamCost, hedgedVolume } from '../market.js';
import { communityActionsFor } from '../environment.js';
import { companyStats, isAbsent } from '../sim.js';
import { targetsFor } from '../tech.js';
import { interestRate, inflate } from '../era.js';
import { peopleSummary, OFFICES } from '../people.js';
import { pressSummary, paperPrice } from '../press.js';
import { lawSummary, detectiveCost } from '../law.js';
import { laborSummary, safetyProgramCost } from '../labor.js';
import { disasterSummary } from '../disasters.js';
import { permitSummary } from '../government.js';
import { rivalSummary } from '../competitors.js';
import { isFounding, foundingSummary, canForm } from '../founding.js';
import { sparkline, lineChart, bar, stars } from './charts.js';
import { adFor } from './ticker.js';

const SCREEN_NAV = [['office', 'Office'], ['map', 'Land'], ['town', 'Town']];

// Three manila folders, each holding a few sheets. ui.tab names the sheet; the folder is derived from it.
export const FOLDERS = [
  { id: 'company', name: 'Company', tabs: [['company', 'Company'], ['staff', 'Staff'], ['wells', 'Wells'], ['market', 'Market']] },
  { id: 'personal', name: 'Personal', tabs: [['parcel', 'Parcel'], ['reports', 'Reports'], ['people', 'People'], ['help', 'How to play']] },
  { id: 'county', name: 'Dry Fork', tabs: [['rivals', 'Rivals'], ['gov', 'Government'], ['press', 'Clarion'], ['community', 'Community']] },
];
export const TABS = FOLDERS.flatMap((f) => f.tabs);
export const folderOf = (tab) => FOLDERS.find((f) => f.tabs.some(([id]) => id === tab)) || FOLDERS[0];

// The stat plates during the founding year: personal money, the clock, and the checklist.
function foundingStats(state) {
  const f = foundingSummary(state);
  const tick = (ok) => `<i class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</i>`;
  return `<div class="stat"><b class="${f.personalCash < f.livingCost * 2 ? 'bad' : ''}">${money(f.personalCash)}</b><span>Your own money</span></div>
    <div class="stat"><b class="${f.monthsLeft <= 3 ? 'bad' : ''}">${f.monthsLeft}</b><span>Months of hotel</span></div>
    <div class="stat checklist"><b>${tick(f.geologist)} geologist ${tick(f.rig)} rig ${tick(f.capital >= f.minCapital)} ${money(f.capital)} of ${money(f.minCapital)}</b><span>Before the bank opens an account${f.equity ? ` · ${pct(f.equity)} promised away` : ''}</span></div>`;
}
export const clockText = (ui) => { const s = Math.max(0, Math.round(ui.clock?.left ?? 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export function renderTopbar(state, ui) {
  const c = state.company, m = state.market;
  const cashCls = c.cash < 0 ? (c.cash < -c.creditLimit ? 'bad' : 'warn') : 'good';
  const [calM, calY] = dateStr(state.month).split(' ');
  const founding = isFounding(state), absent = isAbsent(state);
  const stats = founding ? foundingStats(state) : `<div class="stat"><b class="${cashCls}">${money(c.cash)}</b><span>Cash</span></div>
    <div class="stat"><b>${money(c.creditLimit)}</b><span>Credit line</span></div>
    <div class="stat"><b>${money(c.value)}</b><span>Company value</span></div>`;
  const heat = state.law ? lawSummary(state).heat : 0;
  return `<div class="brand">WILDCAT CEO<small>${esc(state.player?.name || '')}${state.player?.name ? ' · ' : ''}${founding ? `${esc(c.name)} (not yet incorporated)` : esc(c.name)}</small></div>
    <div class="date"><span class="cal-m">${calM}</span><span class="cal-y">${calY || ''}</span></div>
    ${absent ? `<div class="stat absent"><b>In the state penitentiary until ${dateStr(state.law.absentUntil)}</b><span>Dot keeps the lights on</span></div>` : ''}
    ${stats}
    <div class="stat"><b>$${m.oil.toFixed(2)} ${sparkline(m.oilHistory.slice(-24), { w: 50, h: 18 })}</b><span>Oil /bbl</span></div>
    ${founding ? '' : `<div class="stat"><b>$${m.gas.toFixed(2)} ${sparkline(m.gasHistory.slice(-24), { w: 50, h: 18, color: '#b07fe0' })}</b><span>Gas /mcf</span></div>
    <div class="stat"><b class="${c.reputation < 35 ? 'bad' : c.reputation > 65 ? 'good' : ''}">${Math.round(c.reputation)}</b><span>Reputation</span></div>
    <div class="stat"><b class="${state.env.score < 35 ? 'bad' : state.env.score > 65 ? 'good' : ''}">${Math.round(state.env.score)}</b><span>Environment</span></div>
    <div class="stat"><b class="${state.env.activism > 60 ? 'bad' : ''}">${Math.round(state.env.activism)}</b><span>Activism</span></div>
    <div class="stat"><b class="${heat > 60 ? 'bad' : heat > 30 ? 'warn' : ''}">${heat}</b><span>Heat</span></div>`}
    <div class="spacer"></div>
    <div class="nav">${SCREEN_NAV.map(([k, n]) => `<button class="${ui.screen === k ? 'active' : ''}" data-action="goto" data-screen="${k}" title="${n} (${k[0].toUpperCase()})" ${absent && k === 'town' ? 'disabled' : ''}>${k === 'office' && founding ? 'Rooms' : n}</button>`).join('')}</div>
    <div class="controls">
      ${founding && canForm(state).ok ? '<button class="primary" data-action="sign">Sign the papers</button>' : ''}
      <button class="primary" data-action="next" ${state.pending.length || c.bankrupt ? 'disabled' : ''} title="Advance the calendar now (N)">Next month ▸ <span id="clock" class="clock">${ui.auto ? clockText(ui) : 'held'}</span></button>
      <button data-action="auto" title="${ui.auto ? 'Stop the clock: the month only advances when you say' : 'Run the clock: the month advances on its own'}">${ui.auto ? '⏸ Hold' : '▶ Clock'}</button>
      <select data-action="speed" title="How long a month lasts when the clock runs"><option value="1" ${ui.speed == 1 ? 'selected' : ''}>3 min / month</option><option value="2" ${ui.speed == 2 ? 'selected' : ''}>90 s / month</option><option value="4" ${ui.speed == 4 ? 'selected' : ''}>40 s / month</option></select>
      <button data-action="save" title="Save to this browser">Save</button>
      <button data-action="load" title="Load from this browser">Load</button>
      <button data-action="new">New game</button>
    </div>`;
}

export function renderTabs(state, ui) {
  const cur = folderOf(ui.tab);
  const flag = (id) => (id === 'wells' && state.wells.some((w) => w.status === 'shutin') ? '<span class="n">!</span>' : '');
  const folders = FOLDERS.map((f) => `<button class="folder ${f === cur ? 'active' : ''}" data-action="tab" data-id="${f === cur ? ui.tab : f.tabs[0][0]}">${f.name}${f.tabs.some(([id]) => flag(id)) && f !== cur ? '<span class="n">!</span>' : ''}</button>`).join('');
  const sheets = cur.tabs.map(([id, name]) => `<button class="sheet ${ui.tab === id ? 'active' : ''}" data-action="tab" data-id="${id}">${name}${flag(id)}</button>`).join('');
  return `<div class="folders">${folders}</div><div class="sheets">${sheets}</div>`;
}

export function renderNews(state, ui) {
  const items = state.news.slice(-60).reverse();
  const clip = state.press?.clippings?.length ? state.press.clippings[state.press.clippings.length - 1] : null;
  const clipItem = clip ? items.find((n) => n.kind === 'press' && n.month === clip.month && n.text.includes(clip.headline)) : null;
  const lead = clip ? { month: clip.month, kind: 'press', text: clipItem ? clipItem.text.replace(/^THE CLARION: /, '') : clip.headline, headline: clip.headline } : (items.find((n) => ['company', 'env', 'gov'].includes(n.kind)) || items[0]);
  const rest = items.filter((n) => n !== lead && n !== clipItem);
  const ad = adFor(state, 3);
  const dash = ad.indexOf(' — ');
  const adName = dash > 0 ? ad.slice(0, dash) : ad, adBody = dash > 0 ? ad.slice(dash + 3) : '';
  const col = rest.map((n) => `<div class="item ${n.kind} ${n.month === state.month && state.month > 0 ? 'new' : ''}"><span class="d">${dateStr(n.month)}</span><span>${esc(n.text)}</span></div>`).join('');
  return `<div class="clarion">
    <div class="mh"><span class="mh-name">The Dry Fork Clarion</span><span class="mh-date">${dateStr(state.month)} · Vol. XLI · Price 5¢ · All the news that fits</span></div>
    <div class="cols">
      <div class="headline">${lead ? `<div class="dateline">${dateStr(lead.month)} · ${esc(lead.kind)}</div><h4>${esc(lead.headline || headlineOf(lead.text))}</h4><p>${esc(lead.text)}</p>` : '<p class="muted">Nothing to report. The presses are idle.</p>'}</div>
      <div class="column">${col || '<div class="item muted">Advance a month and something will happen.</div>'}</div>
      <div class="ad"><b>${esc(adName)}</b>${esc(adBody)}<i>ADVERTISEMENT</i></div>
    </div></div>`;
}
function headlineOf(text) {
  const first = String(text).split(/[.!?]\s/)[0].replace(/[.!?]+$/, '');
  const words = first.split(' ').slice(0, 9).join(' ');
  return words.length > 60 ? words.slice(0, 58) + '…' : words;
}

export function renderPanel(state, ui) {
  switch (ui.tab) {
    case 'parcel': return renderParcel(state, ui);
    case 'company': return renderCompany(state, ui);
    case 'staff': return renderStaff(state, ui);
    case 'wells': return renderWells(state, ui);
    case 'market': return renderMarket(state, ui);
    case 'rivals': return renderRivals(state, ui);
    case 'gov': return renderGov(state, ui);
    case 'community': return renderCommunity(state, ui);
    case 'reports': return renderReports(state, ui);
    case 'press': return renderPress(state, ui);
    case 'people': return renderPeople(state, ui);
    case 'help': return renderHelp(state, ui);
  }
  return '';
}

// ---------------- Parcel -----------------
function range(v, sigma, d = 0, unit = '') {
  if (sigma === 0) return `${fmt(v, d)}${unit}`;
  const lo = v * Math.exp(-sigma), hi = v * Math.exp(sigma);
  return `${fmt(lo, d)}–${fmt(hi, d)}${unit}`;
}

// Geologist's sketch: an ink cross-section on the parcel sheet. The shale is only drawn once anybody
// knows how to produce it (targetsFor); in 1952 the deep rock is just a dashed guess at the bottom.
function crossSection(p, state) {
  const est = p.survey.est; if (!est) return '';
  const shale = targetsFor(state).includes('shale');
  const W = 600, H = 130, maxD = shale ? 11500 : Math.max(6000, est.sand.depth * 1.6);
  const y = (d) => 14 + (d / maxD) * (H - 24);
  const sTop = y(est.sand.depth), sBot = y(est.sand.depth + Math.max(est.sand.thickness, 0) * 6 + 20);
  const hTop = y(est.shale.depth), hBot = y(est.shale.depth + est.shale.thickness * 4 + 20);
  const wells = p.wells.length;
  const wet = est.sand.onStructure === false;
  const INK = 'var(--ink)', BLUE = 'var(--blue)', RED = 'var(--red)';
  let g = `<svg class="xsec" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet"><defs>
    <pattern id="xs-sand" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="1.5" cy="1.5" r="0.9" fill="${INK}"/><circle cx="4.5" cy="4.5" r="0.9" fill="${INK}"/></pattern>
    <pattern id="xs-wet" patternUnits="userSpaceOnUse" width="8" height="4"><path d="M0 2H8" stroke="${BLUE}" stroke-width="0.8"/></pattern>
    <pattern id="xs-shale" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><path d="M0 0V7" stroke="${INK}" stroke-width="0.9"/></pattern>
    <pattern id="xs-rock" patternUnits="userSpaceOnUse" width="14" height="10"><path d="M0 5H14M7 0V5M0 10H14" stroke="${INK}" stroke-width="0.5" opacity="0.35" fill="none"/></pattern></defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="var(--paper3)"/>
    <rect x="0" y="14" width="${W}" height="${H - 14}" fill="url(#xs-rock)"/>
    <path d="M0 14Q40 10 80 13T160 14T240 12T320 14T400 13T480 14T560 12T600 14" fill="none" stroke="${INK}" stroke-width="1.4"/>
    <g stroke="${INK}" stroke-width="0.8" opacity="0.8">${[...Array(24)].map((_, i) => `<path d="M${8 + i * 25} 13v-4M${11 + i * 25} 13v-3M${14 + i * 25} 13v-5" fill="none"/>`).join('')}</g>`;
  if (est.sand.thickness > 0) g += `<rect x="0" y="${sTop}" width="${W}" height="${Math.max(3, sBot - sTop)}" fill="url(#${wet ? 'xs-wet' : 'xs-sand'})" stroke="${INK}" stroke-width="1"/><text class="type" x="6" y="${sTop - 3}" font-size="8" fill="${INK}" letter-spacing="1">FRONTIER SS ${fmt(est.sand.depth)} FT${wet ? ' (WET)' : ''}</text>`;
  else g += `<path d="M0 ${sTop}H${W}" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3"/><text class="type" x="6" y="${sTop - 3}" font-size="8" fill="${INK}" letter-spacing="1">FRONTIER SS ABSENT?</text>`;
  if (shale) g += `<rect x="0" y="${hTop}" width="${W}" height="${Math.max(4, hBot - hTop)}" fill="url(#xs-shale)" stroke="${INK}" stroke-width="1"/><text class="type" x="6" y="${hTop - 3}" font-size="8" fill="${INK}" letter-spacing="1">BLACKFORK SH ${fmt(est.shale.depth)} FT</text>`;
  else g += `<path d="M0 ${H - 8}H${W}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 4" opacity="0.6"/><text class="type" x="6" y="${H - 11}" font-size="7" fill="${INK}" opacity="0.7" letter-spacing="1">DEEPER ROCK: NOT PROSPECTIVE</text>`;
  if (wells) g += `<line x1="${W - 30}" y1="8" x2="${W - 30}" y2="${sBot + 4}" stroke="${RED}" stroke-width="1.8"/><path d="M${W - 36} 8h12l-4 -6h-4z" fill="${RED}"/>`;
  g += `<g class="type" font-size="7" fill="${INK}" opacity="0.7"><text x="${W - 4}" y="${y(0) + 8}" text-anchor="end">0</text><text x="${W - 4}" y="${y(maxD / 2)}" text-anchor="end">${fmt(maxD / 2)}'</text><text x="${W - 4}" y="${H - 3}" text-anchor="end">${fmt(maxD)}'</text></g></svg>`;
  g += `<div class="muted xsec-key">Cross-section:<i class="${wet ? 'wet' : 'sand'}"></i>Frontier Sandstone ~${fmt(est.sand.depth)} ft${est.sand.thickness <= 0 ? ' (absent?)' : wet ? ' (wet)' : ''}${shale ? `<i class="shale"></i>Blackfork Shale ~${fmt(est.shale.depth)} ft` : ''}${wells ? '<i class="bore"></i>wellbore' : ''}</div>`;
  return g;
}

export function renderParcel(state, ui) {
  const p = state.parcels[ui.selected ?? -1];
  if (!p) return `<div class="card"><h2>Select a section</h2><p class="muted">Click a section on the land map. Green hatching is your acreage, coloured hatching the neighbours'. Seismic lines and "REC" stamps show what you know about the rock underneath.</p><div class="row"><button data-action="goto" data-screen="map">Open the land map</button></div></div>`;
  const s = p.surface, m = p.mineral, ot = OWNER_TYPES[s.type];
  const wells = p.wells.map((id) => state.wells.find((w) => w.id === id)).filter(Boolean);
  let html = `<h2>${esc(s.name)} <span class="muted" style="font-weight:400;font-size:13px">${ot.name}, ${p.acres} acres, row ${p.y + 1} col ${p.x + 1}</span></h2>
  <div class="row" style="margin:-4px 0 8px"><button class="small" data-action="goto" data-screen="field" title="Drive out and look at it">Drive out to the section</button></div>`;
  if (!p.drillable) return html + `<div class="card"><p>No drilling here. ${s.type === 'town' ? 'The town council would like to remind you they have a noise ordinance.' : 'Protected habitat. The Coyote Creek Preserve has lawyers.'}</p></div>`;

  // Surface
  const geoSk = available(state, 'geologist');
  if (isPublic(p)) {
    const agency = s.type === 'state' ? 'the State Land Office' : 'the Bureau of Land Management';
    html += `<div class="card"><h3>Surface</h3><p>Public land: ${agency} holds both the surface and the minerals, so there is no farmer to deal with. ${s.agreement ? `Your lease carries the right to use the surface on the agency's standard terms${s.agreement.conditions.noFresh ? ' (no fresh water)' : ''}, with a restoration bond.` : 'Win the lease at auction and surface access comes with it on standard terms: restoration bond, and no fresh water once the statute says so.'}</p></div>`;
  } else {
  html += `<div class="card"><h3>Surface owner</h3>
    <div class="kv"><dt>Owner</dt><dd>${esc(s.ownerPerson)}${s.hostile ? ' <span class="pill red">hostile</span>' : ''}</dd>
    <dt>Disposition</dt><dd>${bar(s.disposition, 100, s.disposition < 35 ? 'red' : s.disposition < 60 ? 'amber' : '')} <span class="muted">${Math.round(s.disposition)}/100 ${s.disposition < 30 ? '(wants you gone)' : s.disposition < 55 ? '(wary)' : s.disposition < 75 ? '(open to talk)' : '(friendly)'}</span></dd>`;
  if (s.agreement) {
    const c = s.agreement.conditions;
    html += `<dt>Agreement</dt><dd>${s.agreement.forced ? '<span class="pill red">court-ordered access</span>' : `Signed ${dateStr(s.agreement.month)}, damages ${money(s.agreement.damages)}`}<br><span class="muted">${[c.noFresh && 'no fresh water', c.harvestPause && 'no drilling during harvest (Jul–Oct)', c.restorationBond && 'restoration bond'].filter(Boolean).join(' · ') || 'no conditions'}</span></dd>`;
  } else {
    const ask = surfaceAsk(state, p);
    html += `<dt>Wants</dt><dd>${money(ask.damages)} in damages${ask.mandatory ? ' (standard terms)' : ''}<br><span class="muted">${[ask.conditions.noFresh && 'no fresh water', ask.conditions.harvestPause && 'harvest pause', ask.conditions.restorationBond && 'restoration bond'].filter(Boolean).join(' · ') || 'no conditions'}</span></dd>`;
  }
  html += `</div><div class="row" style="margin-top:8px">`;
  if (!s.agreement) html += `<button data-action="surface" data-id="${p.id}">Negotiate surface use</button>`;
  if (!s.agreement && m.split && m.leasedBy === 'player') html += `<button class="danger" data-action="force" data-id="${p.id}" title="The mineral estate is dominant. Get a court order.">Force access (split estate)</button>`;
  html += `</div></div>`;
  }

  // Minerals
  html += `<div class="card"><h3>Mineral rights</h3><div class="kv">
    <dt>Owner</dt><dd>${esc(m.name)}${m.split ? ' <span class="pill amber" title="Surface and minerals owned by different people">split estate: the minerals belong to someone other than the farmer</span>' : ''}${isPublic(p) ? ' <span class="pill blue">public land: sealed-bid auction, surface included</span>' : ''}</dd>`;
  if (m.leasedBy === 'player') {
    const l = m.lease;
    html += `<dt>Your lease</dt><dd>${money(l.bonus)} bonus ($${l.bonusAcre}/acre), ${pct(l.royalty, 1)} royalty<br><span class="muted">${l.hbp ? 'Held by production' : `Expires ${dateStr(l.termEnd)} unless drilled (${l.termEnd - state.month} months)`}</span></dd>`;
  } else if (m.leasedBy) {
    const comp = compByName(state, m.leasedBy);
    html += `<dt>Held by</dt><dd class="bad">${esc(m.leasedBy)} <span class="muted">${m.owned ? '— owns the minerals outright' : m.hbp ? '— held by production, indefinitely' : `— lease runs until ${dateStr(m.leaseUntil)}`}</span>${comp ? `<br><span class="muted" style="font-size:12px">${esc(comp.blurb)}</span>` : ''}</dd>`;
  } else if (m.auction) {
    html += `<dt>Auction</dt><dd>Your bid: $${m.auction.bidAcre}/acre. Results next month.</dd>`;
  } else {
    const ask = leaseAsk(state, p);
    html += `<dt>Asking</dt><dd>~$${ask.bonusAcre}/acre (${money(ask.bonusAcre * p.acres)}), ${pct(ask.royalty, 1)} royalty, ${ask.term / 12}-year term${m.holdoutUntil > state.month ? `<br><span class="bad">Not speaking to you for ${m.holdoutUntil - state.month} more months.</span>` : ''}</dd>`;
  }
  html += `</div><div class="row" style="margin-top:8px">`;
  if (!m.leasedBy && !m.auction) html += isPublic(p) ? `<button data-action="auction" data-id="${p.id}">Bid at auction</button>` : `<button data-action="lease" data-id="${p.id}" ${m.holdoutUntil > state.month ? 'disabled' : ''}>Negotiate lease</button>`;
  if (m.leasedBy && m.leasedBy !== 'player') { const ask = acreageAsk(state, p); html += ask?.forSale ? `<button data-action="buy" data-id="${p.id}">Offer to buy acreage <span class="muted">~${money(ask.total)}</span></button>` : `<span class="muted">${ask?.reason || ''}</span>`; }
  html += `</div></div>`;

  // Conventional field (only if you know it exists)
  const pool = poolFor(state, p);
  const est0 = p.survey.est;
  const structKnown = est0 && est0.sand.onStructure !== null;
  if (pool && (!structKnown || est0.sand.onStructure)) {
    const mine = state.wells.filter((w) => w.poolId === pool.id && ['producing', 'shutin', 'workover'].includes(w.status)).length;
    const theirs = state.competitors.reduce((a, c) => a + c.wells.filter((w) => w.poolId === pool.id).length, 0);
    html += `<div class="card"><h3>${esc(pool.name)} <span class="muted" style="text-transform:none;letter-spacing:0">— discovered ${pool.discoveredMonth <= 0 ? 'years ago' : dateStr(pool.discoveredMonth)} by ${pool.discoveredBy === 'player' ? 'you' : esc(pool.discoveredBy || 'unknown')}</span></h3>
      <div class="kv"><dt>Extent</dt><dd>${pool.parcels.length} sections${structKnown ? '' : ' <span class="muted">(seismic will confirm whether this parcel is inside the closure)</span>'}</dd>
      <dt>Oil in place</dt><dd>~${fmt(pool.ooip / 1e6, 1)} million bbl, ${pool.waterDrive ? 'water drive' : 'solution-gas drive'}${pool.waterflood ? ', <span class="good">under waterflood</span>' : ''}</dd>
      <dt>Produced</dt><dd>${fmt(pool.cum / 1e6, 2)} million bbl (${pct(Math.min(1, pool.x))} of recoverable)</dd>
      <dt>Reservoir pressure</dt><dd>${bar(pool.pressure * 100, 100, pool.pressure < 0.4 ? 'red' : pool.pressure < 0.7 ? 'amber' : '')} <span class="muted">${pct(pool.pressure)} of original. Every well in the field shares it.</span></dd>
      <dt>Wells</dt><dd>${mine} yours, ${theirs} competitors'</dd></div>
      <div class="row" style="margin-top:8px"><button data-action="waterflood" data-id="${pool.id}" ${pool.waterflood || !mine ? 'disabled' : ''}>Start a waterflood <span class="muted">${money(waterfloodCost(pool))}</span></button><span class="muted" style="font-size:12px">${pool.waterflood ? 'Injection is restoring pressure and sweeping more oil.' : 'Inject produced water to hold pressure and recover ~15% more of the oil in place. Worth it once the field is depleted.'}</span></div></div>`;
  }

  // Geology
  const e = p.survey.est, sg = e ? e.sigma : null;
  const shaleKnown = targetsFor(state).includes('shale');
  html += `<div class="card"><h3>Geology <span class="muted" style="text-transform:none;letter-spacing:0">— survey level ${p.survey.level}/4${p.survey.by ? `, by ${esc(p.survey.by)}` : ''}</span></h3>`;
  if (!e) html += `<p class="muted">Nothing but the regional map. ${shaleKnown ? 'Two targets are expected: the shallow <b>Frontier Sandstone</b> (vertical wells, cheap, trap risk) and the deep <b>Blackfork Shale</b> (horizontal wells, expensive, needs fracturing).' : 'The target is the <b>Frontier Sandstone</b>: shallow, cheap to reach with a vertical hole, and dry unless the parcel sits inside a closure. Seismic tells you which.'}</p>`;
  else {
    html += crossSection(p, state);
    html += `<div class="${shaleKnown ? 'grid2' : ''}" style="margin-top:8px"><div><b>Frontier Sandstone</b> (conventional)<div class="kv">
      <dt>Depth</dt><dd>${range(e.sand.depth, sg * 0.2)} ft</dd>
      <dt>Net pay</dt><dd>${e.sand.thickness > 0 ? range(e.sand.thickness, sg) + ' ft' : '<span class="bad">probably absent</span>'}</dd>
      <dt>Porosity</dt><dd>${pct(e.sand.porosity)}</dd>
      <dt>Permeability</dt><dd>${describePerm(e.sand.perm)} (~${e.sand.perm < 10 ? e.sand.perm.toFixed(1) : fmt(e.sand.perm)} mD)</dd>
      <dt>Oil saturation</dt><dd>${pct(e.sand.oilSat)}</dd>
      <dt>Structure</dt><dd class="${e.sand.onStructure === true ? 'good' : e.sand.onStructure === false ? 'bad' : 'muted'}">${describeStructure(e.sand)}</dd>
      <dt>Trap risk</dt><dd class="${e.sand.trapRisk > 0.5 ? 'bad' : e.sand.trapRisk < 0.25 ? 'good' : ''}">${pct(e.sand.trapRisk)} dry-hole risk${e.sand.onStructure === null ? ' <span class="muted">(regional guess)</span>' : ''}</dd>
      <dt>Drive</dt><dd>${e.sand.waterDrive ? 'water drive (steady pressure, rising water cut)' : 'solution gas'}</dd></div></div>
      ${shaleKnown ? `<div><b>Blackfork Shale</b> (unconventional)<div class="kv">
      <dt>Depth</dt><dd>${range(e.shale.depth, sg * 0.15)} ft</dd>
      <dt>Thickness</dt><dd>${range(e.shale.thickness, sg * 0.8)} ft</dd>
      <dt>Rock quality</dt><dd class="${e.shale.quality > 0.65 ? 'good' : e.shale.quality < 0.35 ? 'bad' : ''}">${describeQuality(e.shale.quality)} (${(e.shale.quality * 100).toFixed(0)}/100)</dd>
      <dt>Brittleness</dt><dd>${describeBrittle(e.shale.brittleness)}</dd>
      <dt>Fluid window</dt><dd>${describeOilFrac(e.shale.oilFrac)} (${pct(e.shale.oilFrac)} oil)</dd>
      <dt>Pressure</dt><dd>${describePressure(e.shale.pressureGrad)} (${e.shale.pressureGrad.toFixed(2)} psi/ft)</dd>
      <dt>H2S</dt><dd class="${e.shale.sour ? 'bad' : ''}">${e.shale.sour ? 'sour gas likely' : 'sweet'}</dd></div></div>` : ''}</div>
      <p class="muted" style="font-size:12px">Ranges show the uncertainty at this survey level (±${Math.round(sg * 100)}%). Better geologists produce tighter, more honest ranges.</p>`;
  }
  if (p.survey.level < 3) {
    html += `<div class="row" style="margin-top:6px">Geologist: <select id="svy-geo">${geoSk.map((g) => `<option value="${g.id}">${esc(g.name)} (skill ${g.skill})</option>`).join('')}<option value="-1">Contract geologist (fee extra, unknown skill)</option></select></div><div class="row" style="margin-top:6px">`;
    for (const sv of surveysFor(state)) if (sv.level > p.survey.level) html += `<button data-action="survey" data-id="${p.id}" data-level="${sv.level}" title="${esc(sv.desc)}">${sv.name} <span class="muted">${money(sv.cost)}${sv.months ? `, ${sv.months} mo` : ''}</span></button>`;
    html += `</div>`;
  }
  html += `</div>`;

  // Wells
  html += `<div class="card"><h3>Wells on this parcel</h3>`;
  if (!wells.length) html += `<p class="muted">None yet.</p>`;
  else html += `<table><tr><th>Well</th><th>Target</th><th>Status</th><th class="num">Rate bbl/d</th><th class="num">Cum bbl</th><th></th></tr>${wells.map((w) => `<tr><td>${esc(w.name)}</td><td>${w.target === 'shale' ? 'Shale (H)' : 'Sand (V)'}</td><td>${statusLabel(w)}</td><td class="num">${w.lastMonth ? fmt(w.lastMonth.rate) : '-'}</td><td class="num">${fmt(w.cumOil)}</td><td><button class="small" data-action="well-detail" data-id="${w.id}">Details</button></td></tr>`).join('')}</table>`;
  const can = m.leasedBy === 'player' && s.agreement;
  const busy = state.gov.freezeUntil > state.month;
  html += `<div class="row" style="margin-top:8px"><button class="primary" data-action="design" data-id="${p.id}" ${can && !busy ? '' : 'disabled'}>Design a well</button>
    <span class="muted">${busy ? `Permits frozen by lawsuit for ${state.gov.freezeUntil - state.month} months.` : can ? `Up to ${WELL_CAP.sand} vertical wells per parcel${targetsFor(state).includes("shale") ? ` and ${WELL_CAP.shale} horizontal` : ""}.` : isPublic(p) ? 'Needs the lease: win the auction first.' : 'Needs a mineral lease and a surface agreement.'}</span></div></div>`;
  return html;
}

// ---------------- Company -----------------
function ledgerTable(l) {
  const rows = [['Oil & gas revenue', l.revenue], ['Royalties paid', -l.royalties], ['Severance tax & permit fees', -l.taxes], ['Lease operating costs', -l.opex], ['Salaries & contractors', -l.salaries], ['G&A overhead', -l.ga], ['Land & leases', -l.land], ['Drilling & facilities capex', -l.capex], ['Hedge settlements', l.hedging], ['Fines, cleanup, legal', -l.fines], ['Interest', -l.interest], ['Other (lobbying, community, credits, equity)', -l.other]];
  return `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="num ${v < 0 ? 'bad' : v > 0 ? 'good' : ''}">${money(v)}</td></tr>`).join('')}<tr><th>Net</th><th class="num">${money(sum(rows, (r) => r[1]))}</th></tr></table>`;
}
export function renderCompany(state, ui) {
  const c = state.company, st = companyStats(state);
  const ml = state.monthlyLedger;
  return `<h2>${esc(c.name)}</h2>
  <div class="grid2">
  <div class="card"><h3>Position</h3><div class="kv">
    <dt>Cash</dt><dd class="${c.cash < 0 ? 'bad' : ''}">${money(c.cash)} ${c.cash < 0 ? `<span class="muted">(drawn on ${money(c.creditLimit)} credit line at ${pct(interestRate(state), 1)})</span>` : ''}</dd>
    <dt>Credit line</dt><dd>${money(c.creditLimit)} <span class="muted">grows with cash flow</span></dd>
    <dt>Company value</dt><dd>${money(c.value)} <span class="muted">cash + PV10 of reserves + leases</span></dd>
    <dt>PV10 reserves</dt><dd>${money(c.pv10 || 0)}</dd>
    <dt>Equity sold</dt><dd>${pct(c.equitySold)}</dd>
    <dt>Production</dt><dd>${fmt(st.oilRate)} bbl/d oil, ${fmt(st.gasRate)} mcf/d gas from ${st.wells} wells</dd>
    <dt>Field cash flow</dt><dd class="${st.monthlyNet < 0 ? 'bad' : 'good'}">${money(st.monthlyNet)}/month</dd>
    <dt>Payroll</dt><dd>${money(st.payroll)}/month for ${state.staff.length} staff</dd>
  </div></div>
  <div class="card"><h3>Standing</h3><div class="kv">
    <dt>Reputation</dt><dd>${bar(c.reputation)} <span class="muted">${Math.round(c.reputation)}: affects leases, hiring, elections</span></dd>
    <dt>Environment</dt><dd>${bar(state.env.score, 100, state.env.score < 40 ? 'red' : '')} <span class="muted">${Math.round(state.env.score)}: flaring, water, spills</span></dd>
    <dt>Activism</dt><dd>${bar(state.env.activism, 100, 'red')} <span class="muted">${Math.round(state.env.activism)}: protests at 45, lawsuits at 60, campaigns at 80</span></dd>
    <dt>Gov. relations</dt><dd>${bar(state.gov.relations, 100, 'blue')} <span class="muted">${Math.round(state.gov.relations)} with the ${PARTIES[state.gov.party].name}</span></dd>
    <dt>Lease market</dt><dd>~$${Math.round(state.land.hype)}/acre <span class="muted">regional bonus level (rises with oil price and good wells)</span></dd>
  </div></div></div>
  ${lawCard(state)}
  <div class="card"><h3>Operating policy</h3>
    <div class="row">Maintenance: <select data-action="policy-maint"><option value="reactive" ${state.policy.maintenance === 'reactive' ? 'selected' : ''}>Reactive (fix it when it breaks)</option><option value="preventive" ${state.policy.maintenance === 'preventive' ? 'selected' : ''}>Preventive (a small monthly cost per well, half the wear)</option></select>
    <label><input type="checkbox" data-action="policy-auto" ${state.policy.autoWorkover ? 'checked' : ''}> Automatically pay for workovers when wells fail</label></div>
    ${insuranceRow(state)}
    <p class="muted" style="font-size:12px">Your Production Engineer's skill also slows equipment wear and lowers operating costs. Without one, the field runs at skill 2.</p></div>
  ${c.loan ? `<div class="card"><h3>The founders' note</h3><div class="kv"><dt>Lender</dt><dd>${esc(c.loan.lender || 'First State Bank')}</dd><dt>Balance</dt><dd>${money(c.loan.balance)} of ${money(c.loan.principal)} at ${pct(c.loan.rate, 1)}</dd><dt>Payment</dt><dd>${money(c.loan.monthly)} a month, whether or not the wells pay</dd></div></div>` : ''}
  <div class="card"><h3>Last month's ledger</h3>${ml ? ledgerTable(ml) : '<p class="muted">Advance a month to see cash flows.</p>'}</div>
  <div class="card"><h3>Cumulative ledger</h3>${ledgerTable(state.ledger)}</div>`;
}

// ---------------- Staff -----------------
function staffRow(state, s, hired) {
  const busy = s.busyUntil > state.month, away = s.awayUntil > state.month;
  return `<tr><td><b>${esc(s.name)}</b>${s.founder ? ` <span class="pill amber" title="A founding partner${s.equity ? `, ${Math.round(s.equity * 100)}% of the company` : ''}">partner</span>` : ''}<br><span class="muted">${s.years} yrs experience${hired && s.loyalty !== undefined ? ` · loyalty ${Math.round(s.loyalty)}` : ''}</span></td><td>${ROLES[s.role].name}</td><td>${stars(s.skill)}</td>
    <td>${s.traits.map((t) => `<span class="pill" title="${esc(TRAITS[t].desc)}">${TRAITS[t].name}</span>`).join('') || '<span class="muted">—</span>'}</td>
    <td class="num">${money(s.salary)}/mo</td>
    <td>${hired ? (away ? '<span class="bad">absent</span>' : busy ? `<span class="warn">${esc(s.task || 'busy')} (${s.busyUntil - state.month} mo)</span>` : '<span class="good">available</span>') : ''}</td>
    <td>${hired ? `<button class="small danger" data-action="fire" data-id="${s.id}" ${busy ? 'disabled' : ''} title="Severance: 2 months salary">Fire</button>` : `<button class="small primary" data-action="hire" data-id="${s.id}" title="Signing bonus: 1 month salary">Hire</button>`}</td></tr>`;
}
export function renderStaff(state, ui) {
  const missing = ROLE_KEYS.filter((r) => !state.staff.some((s) => s.role === r));
  return `<h2>Staff</h2>
  <div class="card"><h3>Your team (${state.staff.length})</h3>
  ${state.staff.length ? `<table><tr><th>Name</th><th>Role</th><th>Skill</th><th>Traits</th><th class="num">Salary</th><th>Status</th><th></th></tr>${state.staff.map((s) => staffRow(state, s, true)).join('')}</table>` : '<p class="muted">Nobody. You are the CEO of a spreadsheet.</p>'}
  ${missing.length ? `<p class="muted" style="font-size:12px">Unfilled: ${missing.map((r) => ROLES[r].name).join(', ')}. Unfilled roles run at skill 2; drilling and completions can use one-off contractors of unknown quality.</p>` : ''}</div>
  ${laborCard(state)}
  <div class="card"><h3>Candidates <span class="muted" style="text-transform:none;letter-spacing:0">— pool refreshes every 3 months; a better reputation attracts better people</span></h3>
  <table><tr><th>Name</th><th>Role</th><th>Skill</th><th>Traits</th><th class="num">Salary</th><th></th><th></th></tr>${state.candidates.map((s) => staffRow(state, s, false)).join('')}</table></div>
  <div class="card"><h3>What each role does</h3><div class="kv">${ROLE_KEYS.map((r) => `<dt>${ROLES[r].name}</dt><dd class="muted">${ROLES[r].desc}</dd>`).join('')}</div></div>`;
}

// ---------------- Wells -----------------
export function renderWells(state, ui) {
  if (!state.wells.length) return `<h2>Wells</h2><p class="muted">No wells yet. Lease a parcel, sign a surface agreement, and design one.</p>`;
  const rows = state.wells.slice().reverse().map((w) => {
    const p = state.parcels[w.parcelId];
    const lm = w.lastMonth;
    const hCls = w.health < 35 ? 'red' : w.health < 55 ? 'amber' : '';
    return `<tr><td><b>${esc(w.name)}</b><br><span class="muted">${esc(p.surface.name)}</span></td><td>${w.target === 'shale' ? `H ${w.design.lateral / 1000}k ft` : 'V'}</td>
      <td>${statusLabel(w)}${['permit', 'drill', 'complete', 'workover', 'blowout'].includes(w.status) ? `<br><span class="muted">${w.phaseEnd - state.month} mo</span>` : ''}</td>
      <td class="num">${w.perf ? fmt(w.perf.qiOil) : fmt(w.estimate.ip) + '*'}</td>
      <td class="num">${lm ? fmt(lm.rate) : '-'}</td>
      <td class="num">${fmt(w.cumOil)}</td>
      <td class="num ${lm && lm.net < 0 ? 'bad' : ''}">${lm ? money(lm.net) : '-'}</td>
      <td class="num">${money(w.revenue - w.cost.spent - w.opexTotal)}</td>
      <td>${['producing', 'shutin', 'workover'].includes(w.status) ? `${bar(w.health, 100, hCls)}<span class="muted">${Math.round(w.health)}</span>` : ''}</td>
      <td><div class="row"><button class="small" data-action="well-detail" data-id="${w.id}">Details</button>
        ${w.status === 'shutin' ? `<button class="small primary" data-action="workover" data-id="${w.id}">Workover ${money(w.workoverCost)}</button>` : ''}
        ${w.status === 'producing' && w.health < 70 ? `<button class="small" data-action="service" data-id="${w.id}" title="+30 health">Service ${money(serviceCost(state))}</button>` : ''}
        ${['producing', 'shutin'].includes(w.status) ? `<button class="small danger" data-action="plug" data-id="${w.id}" title="Plug and abandon">P&A</button>` : ''}</div></td></tr>`;
  }).join('');
  return `<h2>Wells</h2><div class="card"><table><tr><th>Well</th><th>Type</th><th>Status</th><th class="num">IP bbl/d</th><th class="num">Now bbl/d</th><th class="num">Cum bbl</th><th class="num">Net last mo</th><th class="num">Lifetime P/L</th><th>Health</th><th></th></tr>${rows}</table>
  <p class="muted" style="font-size:12px">* estimated. Health drops with age; below 55 the failure risk climbs. Failed wells need a workover. Lifetime P/L is gross revenue minus capex and operating cost (before royalty and tax).</p></div>`;
}

// ---------------- Market -----------------
export function renderMarket(state, ui) {
  const m = state.market;
  const prod = producingWells(state);
  const oilVol = sum(prod, (w) => w.lastMonth?.oil || 0);
  const flared = sum(prod, (w) => w.lastMonth?.flared || 0);
  return `<h2>Market</h2>
  <div class="card">${lineChart([{ name: 'Oil $/bbl', values: m.oilHistory.slice(-60), color: '#5aa7e0' }, { name: 'Gas $/mcf ×10', values: m.gasHistory.slice(-60).map((v) => v * 10), color: '#b07fe0' }], { yFmt: (v) => '$' + v.toFixed(0) })}
  <div class="kv" style="margin-top:8px"><dt>Regime</dt><dd>${m.regime === 'shock' ? '<span class="bad">shock</span>' : m.regime === 'proration' ? 'proration' : 'normal'} <span class="muted">(prices follow the historical track; the commission sets allowables until 1972)</span></dd>
    <dt>Realized oil</dt><dd>$${realizedOil(state).toFixed(2)}/bbl <span class="muted">= $${m.oil.toFixed(2)} benchmark − $${oilDifferential(state).toFixed(2)} ${m.oilPipeline ? 'pipeline' : 'trucking'} differential (marketing skill ${roleSkill(state, 'marketing')})</span></dd>
    <dt>Realized gas</dt><dd>${m.gasGathering ? `$${realizedGas(state).toFixed(2)}/mcf` : '<span class="bad">$0 — no gathering system, gas is flared</span>'}</dd>
    <dt>Last month</dt><dd>${fmt(oilVol)} bbl sold${flared ? `, <span class="warn">${fmt(flared)} mcf flared</span>` : ''}</dd></div></div>
  <div class="card"><h3>Midstream</h3>${Object.entries(MIDSTREAM).map(([k, it]) => `<div class="row" style="margin-bottom:6px"><button data-action="midstream" data-id="${k}" ${m[k] ? 'disabled' : ''}>${m[k] ? '✓ ' : ''}${it.name} <span class="muted">${money(midstreamCost(state, k))}</span></button><span class="muted" style="font-size:12px">${it.desc}</span></div>`).join('')}</div>
  <div class="card"><h3>Hedging</h3>
  ${m.hedges.length ? `<table><tr><th class="num">bbl/month</th><th class="num">Fixed price</th><th>Until</th><th class="num">Mark vs spot</th></tr>${m.hedges.map((h) => `<tr><td class="num">${fmt(h.vol)}</td><td class="num">$${h.price.toFixed(2)}</td><td>${dateStr(h.endMonth)}</td><td class="num ${h.price > m.oil ? 'good' : 'bad'}">${money(h.vol * (h.price - m.oil))}/mo</td></tr>`).join('')}</table>` : '<p class="muted">No hedges. You are fully exposed to the price of oil, like a real wildcatter.</p>'}
  <div class="row" style="margin-top:8px"><button data-action="hedge">Forward sale at the bank</button><span class="muted" style="font-size:12px">Lock a fixed price on a monthly volume. You pay the difference if prices rise, receive it if they fall. Nothing of the kind exists before a futures market does. Currently fixed: ${fmt(hedgedVolume(state))} bbl/month vs ${fmt(oilVol)} produced.</span></div></div>`;
}

// ---------------- Government -----------------
export function renderGov(state, ui) {
  const g = state.gov, party = PARTIES[g.party];
  return `<h2>Government</h2>
  <div class="grid2"><div class="card"><h3>Current regime</h3><div class="kv">
    <dt>In power</dt><dd><b style="color:${party.color}">${party.name}</b></dd>
    <dt>Next election</dt><dd>${g.monthsToElection} months <span class="muted">(activism and oil prices sway voters)</span></dd>
    <dt>Severance tax</dt><dd>${pct(g.severance)} of gross revenue</dd>
    <dt>Drilling permit</dt><dd>${g.permitMonths} month${g.permitMonths > 1 ? 's' : ''}, ${money(g.permitFee)} <span class="muted">(gov. affairs skill ≥7 and relations >75 each save a month)</span></dd>
    <dt>Flaring</dt><dd>${g.flaring === 'allowed' ? 'allowed' : '<span class="warn">limited — fines above 3,000 mcf/well/month</span>'}</dd>
    <dt>Inspections</dt><dd>${pct(g.inspection)} per well per month, fines ×${g.fineMult}</dd>
    <dt>Setbacks</dt><dd>${g.setbacks ? 'one well max near subdivisions' : 'none'}</dd>
    <dt>Water rules</dt><dd>${g.waterRules ? 'fresh water for fracking discouraged; farmers will insist on recycled' : 'none'}</dd>
    ${g.freezeUntil > state.month ? `<dt>Permit freeze</dt><dd class="bad">${g.freezeUntil - state.month} months (lawsuit)</dd>` : ''}
  </div></div>
  <div class="card"><h3>Relations</h3>${bar(g.relations, 100, 'blue')}<p class="muted">${Math.round(g.relations)}/100. Above 70: fewer inspections, faster permits, occasional "resilience credits". Decays toward 50; your Government Affairs hire (skill ${roleSkill(state, 'govaffairs')}) slows that.</p>
    <div class="kv"><dt>Spent on lobbying</dt><dd>${money(g.lobbyingTotal)}</dd><dt>Scandals</dt><dd>${g.scandals}</dd><dt>Credits received</dt><dd>${money(g.taxCredits)}</dd></div>
    <div class="row" style="margin-top:8px"><button data-action="lobby">Lobby / donate</button><span class="muted" style="font-size:12px">Money buys relations. Large sums and a bad reputation raise the chance of a scandal.</span></div></div></div>
  <div class="card"><h3>How the two parties differ</h3><table><tr><th></th><th>Courthouse Ring</th><th>Reform Ticket</th></tr>
  <tr><td>Severance tax</td><td>4.6%</td><td>6%</td></tr><tr><td>Permits</td><td>1 month, $25 (1952)</td><td>2 months, $75 (1952)</td></tr><tr><td>Inspection rate</td><td>1.5%/well/month</td><td>5%/well/month</td></tr><tr><td>Fines</td><td>×0.6</td><td>×1.5</td></tr></table>
  <p class="muted" style="font-size:12px">Flaring limits (1972), setbacks (1985) and water rules (2010) arrive by statute whoever holds the courthouse.</p></div>`;
}

// ---------------- Community -----------------
export function renderCommunity(state, ui) {
  const e = state.env;
  const hostile = state.parcels.filter((p) => p.surface.hostile).length;
  return `<h2>Community & Environment</h2>
  <div class="grid2"><div class="card"><h3>Scorecard</h3><div class="kv">
    <dt>Environmental score</dt><dd>${bar(e.score, 100, e.score < 40 ? 'red' : '')} <span class="muted">${Math.round(e.score)}</span></dd>
    <dt>Activism</dt><dd>${bar(e.activism, 100, 'red')} <span class="muted">${Math.round(e.activism)}</span></dd>
    <dt>Reputation</dt><dd>${bar(state.company.reputation)} <span class="muted">${Math.round(state.company.reputation)}</span></dd>
    <dt>Spills</dt><dd>${e.spills}</dd><dt>Blowouts</dt><dd>${e.blowouts}</dd><dt>Lawsuits</dt><dd>${e.lawsuits}</dd><dt>Hostile landowners</dt><dd>${hostile}</dd>
    <dt>Community spend</dt><dd>${money(e.communitySpend)}</dd><dt>PR skill</dt><dd>${roleSkill(state, 'pr')} <span class="muted">(Community & PR Director)</span></dd></div>
    <p class="muted" style="font-size:12px">What hurts: each producing well, flaring, fresh water for fracs, spills, forced access. What helps: gas gathering, recycled water, premium casing, restoration, honest monitoring, plugging old wells.</p></div>
  <div class="card"><h3>Programs</h3>${communityActionsFor(state).map(([k, a]) => `<div style="margin-bottom:8px"><button data-action="community" data-id="${k}">${a.name} <span class="muted">${money(a.cost)}</span></button><div class="muted" style="font-size:12px">${a.desc}</div></div>`).join('')}</div></div>`;
}

// ---------------- Reports -----------------
export function renderReports(state, ui) {
  const h = state.history;
  if (h.length < 2) return `<h2>Reports</h2><p class="muted">Play a couple of months first.</p>`;
  const years = [];
  for (let y = 0; y * 12 < h.length; y++) { const sl = h.slice(y * 12, y * 12 + 12); years.push({ y: y + 1, oil: sum(sl, (x) => x.oil), gas: sum(sl, (x) => x.gas), net: sum(sl, (x) => x.net), value: sl.at(-1).value, cash: sl.at(-1).cash, price: sum(sl, (x) => x.price) / sl.length }); }
  return `<h2>Reports</h2>
  <div class="card"><h3>Cash and company value</h3>${lineChart([{ name: 'Cash', values: h.map((x) => x.cash / 1e6), color: '#5fbf74' }, { name: 'Company value', values: h.map((x) => x.value / 1e6), color: '#f0a830' }], { yFmt: (v) => '$' + v.toFixed(0) + 'M' })}</div>
  <div class="card"><h3>Monthly oil production (bbl)</h3>${lineChart([{ name: 'Oil bbl/month', values: h.map((x) => x.oil), color: '#5aa7e0' }], { yFmt: (v) => fmt(v / 1000) + 'k' })}</div>
  <div class="card"><h3>Standing</h3>${lineChart([{ name: 'Reputation', values: h.map((x) => x.rep), color: '#5fbf74' }, { name: 'Environment', values: h.map((x) => x.env), color: '#5aa7e0' }, { name: 'Activism', values: h.map((x) => x.act), color: '#e0574f' }], { yFmt: (v) => v.toFixed(0) })}</div>
  <div class="card"><h3>By year</h3><table><tr><th>Year</th><th class="num">Oil bbl</th><th class="num">Gas mcf</th><th class="num">Avg oil price</th><th class="num">Field cash flow</th><th class="num">Cash</th><th class="num">Value</th></tr>${years.map((y) => `<tr><td>${y.y}</td><td class="num">${fmt(y.oil)}</td><td class="num">${fmt(y.gas)}</td><td class="num">$${y.price.toFixed(0)}</td><td class="num">${money(y.net)}</td><td class="num">${money(y.cash)}</td><td class="num">${money(y.value)}</td></tr>`).join('')}</table></div>`;
}

// ---------- Rivals ----------
export function renderRivals(state, ui) {
  const fields = state.pools.filter((p) => p.discovered);
  return `<h2>Rivals</h2>
  ${state.competitors.map((c) => {
    const held = c.held.map((id) => state.parcels[id]).filter((p) => p.mineral.leasedBy === c.name);
    const prod = compProduction(state, c);
    return `<div class="card"><h3 style="color:${c.color}">${c.tag} · ${esc(c.name)}</h3><p class="muted" style="margin-top:0">${esc(c.blurb)}</p>
      <div class="kv"><dt>Acreage</dt><dd>${held.length} sections (${fmt(held.length * 320)} acres), ${held.filter((p) => p.mineral.owned).length} owned outright, ${held.filter((p) => p.mineral.hbp).length} held by production</dd>
      <dt>Wells</dt><dd>${c.wells.length} producing about ${fmt(prod)} bbl/d</dd>
      <dt>Deals</dt><dd>${c.sold} parcels sold</dd></div>
      ${held.length ? `<table style="margin-top:6px"><tr><th>Parcel</th><th>Status</th><th>Wells</th><th></th></tr>${held.map((p) => { const ask = acreageAsk(state, p); return `<tr><td>${esc(p.surface.name)}</td><td>${p.mineral.owned ? 'owned' : p.mineral.hbp ? 'HBP' : 'leased to ' + dateStr(p.mineral.leaseUntil)}</td><td>${p.competitorWells || 0}</td><td>${ask?.forSale ? `<button class="small" data-action="buy" data-id="${p.id}">Offer ~${money(ask.total)}</button>` : '<span class="muted">not for sale</span>'} <button class="small" data-action="select-parcel" data-id="${p.id}">Map</button></td></tr>`; }).join('')}</table>` : ''}</div>`;
  }).join('')}
  <div class="card"><h3>Known oil fields</h3>${fields.length ? `<table><tr><th>Field</th><th class="num">Sections</th><th class="num">Oil in place</th><th class="num">Produced</th><th class="num">Pressure</th><th>Drive</th><th>Found by</th></tr>${fields.map((f) => `<tr><td>${esc(f.name)}</td><td class="num">${f.parcels.length}</td><td class="num">${fmt(f.ooip / 1e6, 1)} MMbbl</td><td class="num">${pct(Math.min(1, f.x))}</td><td class="num">${pct(f.pressure)}</td><td>${f.waterDrive ? 'water' : 'solution gas'}${f.waterflood ? ' + flood' : ''}</td><td>${f.discoveredBy === 'player' ? 'you' : esc(f.discoveredBy || '?')}</td></tr>`).join('')}</table>` : '<p class="muted">No fields discovered yet.</p>'}
  <p class="muted" style="font-size:12px">Fields are shared reservoirs: everyone's wells drain the same pressure. Old fields the neighbours have been pumping for decades are cheap to get into but tired. Undiscovered closures show up on a seismic line as a pencilled "closure?" on the land map.</p></div>`;
}

export function renderHelp() {
  return `<h2>How to play</h2>
  <div class="card"><h3>The first year</h3><p>It is September 1952 and you have just stepped off the train at Dry Fork with a suitcase and a few thousand dollars of your own. There is no company yet. You have twelve months of hotel money to put one together, and you need three things before the bank will open an account: <b>a geologist</b> (Doc Pruitt drinks his lunch at the Bluebonnet Cafe; Mabel Cobb keeps the books at the Mercantile), <b>a rig</b> (Bull Sandoval at the rig yard on Second Street, or the Jessup brothers' rotary on a flatcar at the depot) and <b>enough capital</b> (investors at the hotel and the church, a loan from the banker once you have the other two). Walk into a building, click the person with the <b>$</b> over their head, and accept their terms or counter. The checklist in the top bar shows what is still missing. When it is complete, press <b>Sign the papers</b>.</p>
  <h3>After that</h3><p>You run a small independent oil company with 140 sections of prairie around Dry Fork, some of it already leased by the neighbours. A lease runs a few dollars an acre, a 2D seismic shot about $6,000, and a 4,000-foot well into the sand $40–65,000. The goal is to build a valuable company over the decades without going bankrupt, getting sued into the ground, or becoming the villain of the Clarion. Your company value is cash plus the discounted value of your producing wells. Every share you sell to investors reduces your score.</p>
  <h3>The loop</h3><ol style="line-height:1.6">
  <li><b>Know the rock.</b> Click a parcel, run a survey. Cheap surveys give wide ranges; a seismic line costs more and tells the truth (later decades bring sharper seismic still). A skilled geologist tightens every range and lowers dry-hole risk. Conventional oil sits in <b>closed structures</b> (fields) that span several sections; only seismic shows whether a parcel is inside one. Off-structure, the sand is wet and the well is dry.</li>
  <li><b>Watch the neighbours.</b> Four rival companies already hold acreage and produce from old fields. Their wells drain the same reservoirs yours will. You can offer to buy their undrilled acreage; land-flippers sell readily, producers don't. Their public well records tell you where the oil is.</li>
  <li><b>Lease the minerals.</b> Negotiate a bonus per acre and a royalty. Lowball offers get refused, and owners remember. Public land is auctioned against competitors. In a <b>split estate</b> the minerals belong to someone else, and you can force access past the farmer, legally, if you don't mind being hated.</li>
  <li><b>Sign the surface.</b> Minerals and surface are two different things. A lease buys the oil underground; the farmer on top still has to let you in. Farmers want damages and conditions: recycled water only, no drilling during harvest. Their disposition depends on your reputation and what happened to their neighbours. On <b>state trust and federal sections</b> the agency owns both, so winning the auction is the whole job: surface access comes with the lease on standard terms.</li>
  <li><b>Design the well.</b> Vertical wells into the Frontier Sandstone are cheap but can be dry. Technology arrives with the years: hydraulic fracturing, submersible pumps, digital and then 3D seismic, horizontal drilling, and finally (2000s) horizontal wells into the Blackfork Shale that cost millions and need the right frac: slickwater in brittle rock, gel in ductile rock, ceramic proppant when it's deep and overpressured, premium casing when it's sour. Assign a drilling superintendent and a completion engineer; their skill sets cost, time, screenouts and how much oil actually comes out.</li>
  <li><b>Produce and maintain.</b> Wells decline (shale fast, sand slower). Wells in a field share its pressure: every barrel anyone pulls lowers rates for all and brings the water up from below. A waterflood restores pressure and recovers more of the oil in place. Health drops with age; a good production engineer, preventive maintenance and the right artificial lift keep them flowing. Build a pipeline to stop paying truckers and a gathering system to stop flaring gas.</li>
  <li><b>Sell it.</b> Prices follow the historical track: the calm of the proration years, the 1973 embargo, the 1986 crash, the shale boom. Your crude purchaser liaison narrows the differential; once a futures market exists (1983) the bank will write a forward sale at a fixed price. Gas is flared until a pipeline company offers a contract.</li>
  <li><b>Get around.</b> The office is where the files are: the desk, the phone, the cabinet and the wall map each open a folder. Walk into town (<kbd>T</kbd>) to see the banker, the courthouse, the sheriff, the Clarion, the cafe (where people looking for work eat), the Mercantile's land office and the depot. Drive out to a section from the parcel file to see it. <kbd>N</kbd> advances the month anywhere; <kbd>Esc</kbd> steps back.</li>
  <li><b>Manage the politics.</b> Permits, severance tax, inspections and flaring rules depend on who wins the election every four years. Lobbying helps until it becomes a scandal. Activists respond to your environmental score: protests, lawsuits, national campaigns.</li>
  </ol>
  <h3>Staff</h3><p>Every task is done by a person. Skill 1–10 sets how well it goes; traits change how. Busy people can't take a second job, so a second rig needs a second engineer, or a contractor of unknown quality. Better reputation attracts better candidates.</p>
  <h3>Losing</h3><p>Exceed your credit line for three months and the bank takes the keys.</p></div>`;
}

// ---------------- Law (on the company sheet) ----------------
function lawCard(state) {
  if (!state.law) return '';
  const L = lawSummary(state);
  const known = L.crimes.filter((c) => c.discovered);
  const cls = L.heat > 60 ? 'red' : L.heat > 30 ? 'amber' : '';
  return `<div class="card"><h3>The law</h3><div class="grid2"><div class="kv">
    <dt>Heat</dt><dd>${bar(L.heat, 100, cls)} <span class="muted">${L.heat}/100: above 30 the sheriff opens a file, above 60 the state does</span></dd>
    <dt>Investigations</dt><dd>${L.investigations.length ? L.investigations.map((i) => `<span class="bad">${i.by === 'sheriff' ? 'County' : i.by === 'state' ? 'State' : 'Federal'}</span>: ${i.months} months open, evidence ${i.evidence}/100 (charged at 55)`).join('<br>') : '<span class="good">none open</span>'}</dd>
    <dt>Record</dt><dd>${L.crimes.length ? `${L.crimes.length} act${L.crimes.length > 1 ? 's' : ''} the county could call a crime, ${known.length} on the record` : 'clean, as far as anybody knows'}${L.indictments ? `; ${L.indictments} indictment${L.indictments > 1 ? 's' : ''}` : ''}${L.convictions ? `, <span class="bad">${L.convictions} conviction${L.convictions > 1 ? 's' : ''}</span>` : ''}</dd>
    <dt>Dirt held</dt><dd>${L.dirt.length ? L.dirt.map((d) => `${esc(state.people?.[d.personId]?.name || d.personId.replace(/^comp:/, ''))}: ${esc(d.kind)}`).join('<br>') : '<span class="muted">nothing on anybody</span>'}</dd>
  </div><div class="kv">
    <dt>Lawyer</dt><dd>${L.lawyer ? `${esc(L.lawyer)} on retainer until ${dateStr(state.law.lawyer.until)}` : 'none'} <button class="small" data-action="hire-lawyer" data-months="12">Retain a year (${money(inflate(state, 600) * 12)})</button></dd>
    <dt>Detective</dt><dd>${L.detective ? `a man from Tulsa, until ${dateStr(state.law.detectiveUntil)}` : 'none'} <button class="small" data-action="hire-detective" data-months="3">Three months (${money(detectiveCost(state) * 3)})</button></dd>
    ${L.absentUntil > state.month ? `<dt>Absent</dt><dd class="bad">in the penitentiary until ${dateStr(L.absentUntil)}</dd>` : ''}
  </div></div></div>`;
}
function insuranceRow(state) {
  const D = disasterSummary(state);
  return `<div class="row" style="margin-top:6px"><label><input type="checkbox" data-action="insurance" ${D.insured ? 'checked' : ''}> Insure the wells with the Hartford</label><span class="muted" style="font-size:12px">${money(D.premium)}/month at today's well count (${money(inflate(state, 15))} per well); pays seventy cents on the dollar for fire, wind and water. Paid ${money(D.premiumsPaid)} in premiums, received ${money(D.claimsPaid)}.${D.drought ? ' <span class="warn">Drought: water costs triple.</span>' : ''}</span></div>`;
}

// ---------------- Labor (on the staff sheet) ----------------
function laborCard(state) {
  if (!state.labor) return '';
  const Lb = laborSummary(state);
  const cls = Lb.morale < 35 ? 'red' : Lb.morale < 50 ? 'amber' : '';
  return `<div class="card"><h3>The crews</h3><div class="grid2"><div class="kv">
    <dt>Morale</dt><dd>${bar(Lb.morale, 100, cls)} <span class="muted">${Lb.morale}: below 35 they walk out</span></dd>
    <dt>Wages</dt><dd>${Math.round((Lb.wageMult - 1) * 100)}% over scale${Lb.union ? ` · union ${Lb.union}` : ''}</dd>
    <dt>Safety</dt><dd>${Lb.safety ? '<span class="good">programme running</span>' : 'none'}${Lb.deaths ? ` · <span class="bad">${Lb.deaths} dead on the job</span>` : ''}${Lb.drunk ? ' · <span class="warn">somebody is drinking on tour</span>' : ''}</dd>
    ${Lb.striking ? `<dt>Strike</dt><dd class="bad">until ${dateStr(Lb.strikeUntil)}: oil at forty percent, rigs idle</dd>` : ''}
  </div><div class="row" style="align-items:flex-start;flex-direction:column">
    <button data-action="safety" ${Lb.safety ? 'disabled' : ''}>Fund a safety programme <span class="muted">${money(safetyProgramCost(state))}, a year</span></button>
    <button data-action="raise" data-frac="0.05">Five percent raise across the board</button>
    <span class="muted" style="font-size:12px">Raises stick to the payroll for good. Unhappy pumpers steal oil and unhappy hands talk to the sheriff.</span></div></div></div>`;
}

// ---------------- The Clarion ----------------
export function renderPress(state, ui) {
  if (!state.press) return '<h2>The Clarion</h2>';
  const P = pressSummary(state);
  const clips = P.clippings;
  const amounts = [300, 1_000, 3_000].map((v) => inflate(state, v));
  const heatCls = (h) => (h > 65 ? 'red' : h > 40 ? 'amber' : '');
  const story = (s, actions = '') => `<tr><td><b>${esc(s.headline)}</b><br><span class="muted">${esc(s.kind)}${s.truth === false ? ' · invented' : ''}${s.coverup ? ' · <span class="bad">held last year</span>' : ''} · since ${dateStr(s.month)}</span></td><td>${bar(s.heat, 100, heatCls(s.heat))}<span class="muted"> ${s.heat}</span></td><td class="num ${s.repHit > 0 ? 'bad' : 'good'}">${s.repHit > 0 ? '−' : '+'}${Math.abs(s.repHit)}</td><td>${actions}</td></tr>`;
  return `<h2>The Dry Fork Clarion</h2>
  <div class="grid2"><div class="card"><h3>Standing in print</h3><div class="kv">
    <dt>Goodwill</dt><dd>${bar(P.goodwill, 60)} <span class="muted">${P.goodwill}: what the paper has printed in your favour</span></dd>
    <dt>Notoriety</dt><dd>${bar(P.notoriety, 100, 'red')} <span class="muted">${P.notoriety}: what it has printed against you</span></dd>
    <dt>Advertising</dt><dd>${P.adUntil > state.month ? `<span class="good">running until ${dateStr(P.adUntil)}</span>: bad news prints smaller` : 'none running'} · ${money(state.press.adSpend)} spent to date</dd>
    <dt>Ownership</dt><dd>${P.owned ? `<span class="good">yours since ${dateStr(state.press.ownedSince)}</span>${P.rivalPaper ? ' · <span class="bad">the Free Press prints what you will not</span>' : ''}` : 'independent'}</dd></div></div>
  <div class="card"><h3>The rate card</h3>
    <div class="row">${amounts.map((a) => `<button data-action="buy-ads" data-amount="${a}">Ads: ${money(a)}</button>`).join('')}</div>
    <p class="muted" style="font-size:12px">Display advertising for a few weeks: goodwill up, notoriety down a little, the editor fonder of you, and anything unkind printed below the fold while it runs.</p>
    ${P.owned ? '' : `<div class="row" style="margin-top:6px"><button class="primary" data-action="buy-paper">Buy the Clarion <span class="muted">${money(paperPrice(state))}</span></button><span class="muted" style="font-size:12px">One flatbed press, a Linotype, a mortgage and four hundred subscribers. Then you decide what runs; kill too much and the reporters start their own sheet.</span></div>`}</div></div>
  ${P.held.length ? `<div class="card"><h3>On your desk <span class="muted" style="text-transform:none;letter-spacing:0">— you own the paper; print or kill (unread copy prints itself after three months)</span></h3><table><tr><th>Story</th><th>Heat</th><th class="num">Standing</th><th></th></tr>${P.held.map((s) => story(s, `<button class="small" data-action="decide-story" data-id="${s.id}" data-decision="print">Print</button> <button class="small danger" data-action="decide-story" data-id="${s.id}" data-decision="kill">Kill</button>`)).join('')}</table></div>` : ''}
  <div class="card"><h3>Brewing about you</h3>${P.brewing.length ? `<table><tr><th>Story</th><th>Heat</th><th class="num">Standing</th><th></th></tr>${P.brewing.map((s) => story(s, `<span class="muted">${s.printMonth <= state.month ? 'prints next issue' : `prints ${dateStr(s.printMonth)}`}</span>`)).join('')}</table><p class="muted" style="font-size:12px">The editor can be asked to bury a story; buried stories resurface with interest. The three hottest stories print each month.</p>` : '<p class="muted">Nothing in the works. Enjoy it.</p>'}${P.buried.length ? `<p class="muted" style="font-size:12px">Buried: ${P.buried.map((s) => `"${esc(s.headline)}"`).join(', ')}.</p>` : ''}</div>
  <div class="card clippings"><h3>Clippings <span class="muted" style="text-transform:none;letter-spacing:0">— every issue that mentioned you or the neighbours</span></h3>
    ${clips.length ? `<div class="paper"><div class="mh"><span class="mh-name">The Dry Fork Clarion</span><span class="mh-date">Clippings file · ${clips.length} item${clips.length > 1 ? 's' : ''}</span></div><div class="clipcols">${clips.map((c) => `<div class="clip ${c.about === 'player' ? (c.repHit > 0 ? 'bad' : 'good') : 'rival'}"><span class="d">${dateStr(c.month)}</span><h4>${esc(c.headline)}</h4><span class="k">${esc(c.kind)}${c.coverup ? ' · resurfaced' : ''}${c.about !== 'player' ? ` · about ${esc(c.about)}` : ''}</span></div>`).join('')}</div></div>` : '<p class="muted">The file is empty. The Clarion has not yet found you interesting.</p>'}</div>`;
}

// ---------------- People ----------------
const PARTY_PILL = (party) => (party ? `<span class="pill ${party === 'ring' ? 'red' : 'blue'}">${PARTIES[party].name.split(' ')[0]}</span>` : '<span class="muted">—</span>');
export function renderPeople(state, ui) {
  if (!state.people) return '<h2>People</h2>';
  const people = peopleSummary(state);
  const rivals = rivalSummary(state);
  const dispCls = (d) => (d < 30 ? 'red' : d < 50 ? 'amber' : '');
  return `<h2>The people of Dry Fork</h2>
  <div class="card"><h3>Who runs things</h3><table><tr><th>Name</th><th>Office</th><th>Party</th><th>Disposition</th><th class="num">Favors owed</th><th>Dirt</th><th>Term ends</th></tr>
  ${people.map((p) => `<tr><td><b>${esc(p.name)}</b>${p.bought ? ' <span class="pill amber" title="Has taken your money">bought</span>' : ''}${p.hostile ? ' <span class="pill red">hostile</span>' : ''}</td><td class="muted">${esc(p.title)}</td><td>${PARTY_PILL(p.party)}</td><td>${bar(p.disposition, 100, dispCls(p.disposition))} <span class="muted">${p.disposition}</span></td><td class="num">${p.favors > 0 ? `<span class="good">${p.favors} to you</span>` : p.favors < 0 ? `<span class="bad">${-p.favors} by you</span>` : '0'}</td><td>${p.dirt ? `<span class="warn">${p.dirt} item${p.dirt > 1 ? 's' : ''}</span>` : '<span class="muted">none</span>'}</td><td>${p.termEnd >= 0 ? dateStr(p.termEnd) : '<span class="muted">appointed</span>'}</td></tr>`).join('')}</table>
  <p class="muted" style="font-size:12px">Disposition drifts toward your reputation and your party's donations. Bought people stay bought until they lose an election. Dirt comes from the cafe and the detective and works on the frightened. Elections in November of even years: mayor every two, sheriff and judge every four.</p></div>
  <div class="card"><h3>The other outfits</h3><table><tr><th>Company</th><th>Standing</th><th>Sheriff's interest</th><th>Hostility to you</th><th>Dirt held</th><th></th></tr>
  ${rivals.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.dormant ? ' <span class="muted">(dormant)</span>' : ''}${r.frozen ? ' <span class="pill red">permits frozen</span>' : ''}</td><td>${bar(r.standing, 100)} <span class="muted">${r.standing}</span></td><td>${bar(r.heat, 100, 'red')} <span class="muted">${r.heat}</span></td><td>${bar(r.hostility, 100, 'amber')} <span class="muted">${r.hostility}</span></td><td>${r.dirt ? `<span class="warn">${r.dirt}</span>` : '<span class="muted">none</span>'}${r.tricks ? `<br><span class="muted">${r.tricks} trick${r.tricks > 1 ? 's' : ''} played on you</span>` : ''}</td><td>${r.dormant ? '' : `<button class="small" data-action="tip-sheriff" data-id="${esc(r.name)}" title="${r.dirt ? 'You have something on them; it will stick.' : 'Without dirt you are a sore loser, and the sheriff knows it.'}">Tip the sheriff</button>`}</td></tr>`).join('')}</table>
  <p class="muted" style="font-size:12px">Rivals with low ethics eat the county's permit budget, plant stories and tip the sheriff about you. Dirt on them comes from the cafe and the detective; hand it to the sheriff or to the editor.</p></div>`;
}
