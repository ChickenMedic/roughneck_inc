// The founding phase: you arrive in Dry Fork with a suitcase and a little money, and spend up to a year
// recruiting a geologist, a rig and some capital around town before there is a company at all.
// Founder definitions are static (like EVENTS); per-game status lives in state.founding.founders[id] so
// saves stay plain JSON. founderTalk() returns event-shaped dialogue nodes for the presentation layer.
import { rnd, rand, randInt, pick, chance, gauss } from './rng.js';
import { clamp, money, nextId, dateStr } from './util.js';
import { FOUNDING_CASH, FOUNDING_LIVING, FOUNDING_MONTHS, FOUNDING_MIN_CAPITAL, START_CREDIT, ROLES } from './data.js';
import { inflate, interestRate } from './era.js';
import { runSurvey } from './land.js';
import { refreshCandidates, startingLoyalty } from './staff.js';
import { holder } from './people.js';
import { reportStory } from './press.js';

export const FOUNDER_PLACES = ['cafe', 'courthouse', 'bank', 'rigyard', 'church', 'hotel', 'depot', 'store'];

// wants: the standard terms (1952 dollars). kind: staff (joins the payroll), contractor (a rig on contract),
// investor (cash for equity), lender (a note). counter: which term the counter-offer bends, by 70%.
// difficulty: how hard the counter is (persuade logit). leaves: months after arrival before they leave town (null = stays).
export const FOUNDERS = {
  pruitt: {
    id: 'pruitt', name: 'Doc Harlan Pruitt', title: 'Geologist, lately of Tulsa', place: 'cafe', portrait: 'geologist', kind: 'staff', role: 'geologist',
    skill: 8, traits: ['veteran', 'drinker'], years: 27, leaves: 6, difficulty: 0.35, disposition: 55,
    wants: { equity: 0.10, retainer: 250, barTab: 30 }, counter: 'equity',
    blurb: 'Mapped half the Seminole district for Sooner State before the bottle and a disagreement over a dry hole. He knows where the old closures are and drinks his lunch at the Bluebonnet.',
    quirk: 'Brings a map. On signing he marks three sections of a field nobody has drilled yet.',
    greeting: (s) => `Pruitt looks up from a coffee that is not entirely coffee. "You're the one asking about geologists. Sit. I've got a map in the truck that Sooner State would pay to see burned."`,
  },
  cobb: {
    id: 'cobb', name: 'Mabel Cobb', title: 'Geologist, keeps the books at the Mercantile', place: 'store', portrait: 'lady', kind: 'staff', role: 'geologist', female: true,
    skill: 4, traits: ['loyal', 'frugal'], years: 6, leaves: null, difficulty: 0.15, disposition: 60,
    wants: { equity: 0.03, retainer: 160 }, counter: 'equity',
    blurb: 'A geology degree from the state college and no oil company that would hire a woman to use it. She keeps the ledgers at the Mercantile and reads well logs at night.',
    quirk: 'Cheap, loyal, and not going anywhere.',
    greeting: (s) => `Miss Cobb closes the ledger. "I know what you're going to ask, because nobody else in this town knows what a structure map is. Three percent and a wage I can live on, and I'll stay when the others leave."`,
  },
  sandoval: {
    id: 'sandoval', name: 'Bull Sandoval', title: 'Driller, owns a cable-tool rig', place: 'rigyard', portrait: 'roughneck', kind: 'staff', role: 'driller',
    skill: 6, traits: ['cowboy'], years: 22, leaves: 8, difficulty: 0.4, disposition: 50,
    wants: { equity: 0.15, retainer: 220 }, alt: { cash: 6_000, retainer: 300 }, counter: 'equity',
    blurb: 'Drilled with a spudder from Burkburnett to Seminole. His rig is rusted, slow, and paid for. It will not go much below four thousand feet, and it has caught fire twice.',
    quirk: 'Your own rig: wells cost 30 percent less and take a month longer, blowouts are a third more likely, and it will not reach past 4,000 feet. Applies to your first two shallow wells.',
    greeting: (s) => `Sandoval is under the bull wheel with a grease gun. "Fifteen percent and I bring the rig. Or six thousand cash and it's yours and I work for wages. Either way it'll drill. Slow."`,
  },
  jessup: {
    id: 'jessup', name: 'Jessup Bros. Rotary', title: 'Drilling contractors', place: 'depot', portrait: 'roughneck', kind: 'contractor',
    leaves: 10, difficulty: 0.3, disposition: 50,
    wants: { cash: 4_000 }, counter: 'cash',
    blurb: 'Two brothers, one rotary rig on a flatcar at the depot, and a yard in Seminole. They drill for anybody with a prepayment.',
    quirk: 'A rig contract: prepay and your first three wells drill at 20 percent off.',
    greeting: (s) => `The older Jessup spits. "Four thousand down and we'll stay in the county. First three holes at a discount. Or we go where somebody's paying."`,
  },
  whitlock: {
    id: 'whitlock', name: 'Vernon Whitlock, Esq.', title: 'Attorney and landman', place: 'courthouse', portrait: 'landman', kind: 'staff', role: 'landman',
    skill: 6, traits: ['connected'], years: 18, leaves: 9, difficulty: 0.3, disposition: 55,
    wants: { equity: 0.05, retainer: 200 }, counter: 'equity',
    blurb: 'Has an office over the drugstore and a friend in every county office. Buys leases for whoever is paying and has a way with the judge.',
    quirk: 'Well-connected at the courthouse. There is talk of card games in Fort Worth.',
    secret: 'gambling debts in Fort Worth',
    greeting: (s) => `Whitlock is in the clerk's office reading the deed records upside down. "A new outfit needs somebody who knows which heirs to call. Five percent and a retainer, and I'll have the judge's ear before the ink dries."`,
  },
  cravens: {
    id: 'cravens', name: 'T. Cravens', title: 'Investor, of Dallas', place: 'hotel', portrait: 'banker', kind: 'investor',
    leaves: 5, difficulty: 0.55, disposition: 45,
    wants: { cash: 60_000, equity: 0.45 }, counter: 'equity',
    requires: (s) => (hasGeologist(s) ? null : 'Cravens does not put money behind a man who has not hired a geologist.'),
    blurb: 'Dallas money. Made it in cotton, lost some of it in the Permian, and wants it back with interest. Stays at the hotel and reads the Wall Street Journal in the lobby so people will see him.',
    quirk: 'Board pressure: he will want dividends or a rig running, and he telephones.',
    greeting: (s) => `Cravens does not get up. "Sixty thousand for forty-five percent. I don't drill and I don't wait. Bring me a geologist's name and we'll talk about the paper."`,
  },
  hargrove: {
    id: 'hargrove', name: 'Widow Hargrove', title: 'Owns the church section', place: 'church', portrait: 'widow', kind: 'investor', female: true,
    leaves: null, difficulty: 0.45, disposition: 50,
    wants: { cash: 25_000, equity: 0.25 }, counter: 'equity',
    requires: (s) => (hasGeologist(s) ? null : 'She will not invest until you have somebody who can read the rocks.'),
    blurb: 'Her late husband sold the town its first tractor. She holds the minerals under the church section and most of the pew rent, and she wants a say.',
    quirk: 'No drilling on the church section, ever, under any name.',
    greeting: (s) => `Mrs. Hargrove receives you in the church parlour. "Twenty-five thousand for a quarter of the company, and you will never put a derrick on the church section. Mr. Hargrove is buried there."`,
  },
  ellison: {
    id: 'ellison', name: null, title: 'President, First State Bank', place: 'bank', portrait: 'banker', kind: 'lender', person: 'banker',
    leaves: null, difficulty: 0.5, disposition: null,
    wants: { loan: 30_000, rateAdd: 0.01, term: 60 }, counter: 'rate',
    requires: (s) => (!hasGeologist(s) ? 'The bank does not lend to a man without a geologist.' : !(hasRig(s) || hasInvestor(s)) ? 'The bank wants a rig under contract or a co-signer with money before it lends.' : null),
    blurb: 'Lends against cattle, cotton and, lately, oil. Wants to see a geologist on the payroll and either a rig under contract or somebody with money co-signing.',
    quirk: 'A five-year note, paid monthly whether or not the wells pay.',
    greeting: (s) => { const p = holder(s, 'banker'); return `${p ? p.name : 'The banker'} folds his hands. "Thirty thousand on a five-year note at a point over prime. I'll want to see a geologist and either a rig or a co-signer. The examiner reads these files."`; },
  },
  preacher: {
    id: 'preacher', name: null, title: 'Pastor, First Methodist Church', place: 'church', portrait: 'oldtimer', kind: 'investor', person: 'preacher',
    leaves: null, difficulty: 0.25, disposition: null,
    wants: { cash: 8_000, equity: 0.10 }, counter: 'equity',
    blurb: 'The building fund has eight thousand dollars in it and the roof is fine. He has prayed on it.',
    quirk: 'A favour owed to the church. He will remember.',
    greeting: (s) => { const p = holder(s, 'preacher'); return `${p ? p.name : 'The pastor'} shows you the building fund ledger. "Eight thousand, for a tenth of the company. The Lord favours the bold, and the choir needs robes. You would owe the church a kindness."`; },
  },
};
export const FOUNDER_IDS = Object.keys(FOUNDERS);

// --- Helpers -------------------------------------------------------------------------------------------
export const isFounding = (state) => !!(state.founding && state.founding.phase !== 'done');
const F = (state) => state.founding;
const rt = (state, id) => state.founding?.founders?.[id];
const signedIds = (state) => (state.founding ? state.founding.recruited.filter((id) => rt(state, id)?.status === 'signed') : []);
export const isSigned = (state, id) => rt(state, id)?.status === 'signed';
export const hasGeologist = (state) => signedIds(state).some((id) => FOUNDERS[id].role === 'geologist');
export const hasRig = (state) => isSigned(state, 'sandoval') || isSigned(state, 'jessup');
export const hasInvestor = (state) => signedIds(state).some((id) => FOUNDERS[id].kind === 'investor');
export function founderName(state, id) { const d = FOUNDERS[id]; if (d.person) { const p = holder(state, d.person); return p ? p.name : d.title; } return d.name; }
export function founderSpeaker(state, id) { const d = FOUNDERS[id]; return { name: founderName(state, id), portrait: d.portrait, title: d.title }; }

// Terms as the founder currently offers them (1952 bases inflated). alt = Sandoval's cash option.
export function founderTerms(state, id, variant = 'standard') {
  const d = FOUNDERS[id];
  const base = variant === 'alt' ? d.alt : { ...d.wants };
  if (!base) return null;
  const t = { ...base };
  if (variant === 'counter') {
    if (d.counter === 'equity') t.equity = Math.round(t.equity * 0.7 * 1000) / 1000;
    if (d.counter === 'cash') t.cash = Math.round(t.cash * 0.7);
    if (d.counter === 'rate') t.rateAdd = Math.round(t.rateAdd * 0.7 * 1000) / 1000 - 0.003;
  }
  if (t.cash !== undefined) t.cash = inflate(state, t.cash);
  if (t.loan !== undefined) { t.loan = inflate(state, t.loan); t.rate = Math.round((interestRate(state) + t.rateAdd) * 1000) / 1000; }
  if (t.retainer !== undefined) t.retainer = inflate(state, t.retainer + (t.barTab || 0));
  return t;
}
export function termsLabel(state, id, t) {
  const d = FOUNDERS[id];
  const parts = [];
  if (d.kind === 'staff') { if (t.equity) parts.push(`${Math.round(t.equity * 100)}% of the company`); if (t.cash) parts.push(`${money(t.cash)} for the rig`); parts.push(`${money(t.retainer)} a month`); if (t.barTab) parts.push('a bar tab'); }
  if (d.kind === 'contractor') parts.push(`${money(t.cash)} prepaid`);
  if (d.kind === 'investor') parts.push(`${money(t.cash)} for ${Math.round(t.equity * 100)}%`);
  if (d.kind === 'lender') parts.push(`${money(t.loan)} at ${(t.rate * 100).toFixed(1)}% over ${t.term / 12} years`);
  return parts.join(', ');
}
// The same terms spelled out from the player's side, for the Accept and Counter buttons: who pays what, who gets what.
const pronoun = (d) => (d.female ? 'She' : d.id === 'jessup' ? 'They' : 'He');
export function dealLabel(state, id, t) {
  const d = FOUNDERS[id], eq = (v) => `${Math.round(v * 100)}%`, who = pronoun(d);
  if (d.kind === 'investor') return `${who} puts in ${money(t.cash)}; you give up ${eq(t.equity)} of the company`;
  if (d.kind === 'lender') return `A ${money(t.loan)} loan at ${(t.rate * 100).toFixed(1)}% over ${t.term / 12} years`;
  if (d.kind === 'contractor') return `You prepay ${money(t.cash)} for the rig contract`;
  const parts = [];
  if (t.equity) parts.push(`${eq(t.equity)} of the company`);
  if (t.cash) parts.push(`${money(t.cash)} cash for the rig`);
  parts.push(`${money(t.retainer)} a month${t.barTab ? ' and a bar tab' : ''}`);
  return `${who} joins for ${parts.join(', ')}`;
}
// What changes in the counter-offer, relative to the ask ("same money, 7% instead of 10%").
export function counterLabel(state, id, std, ctr) {
  const d = FOUNDERS[id], eq = (v) => `${Math.round(v * 100)}%`;
  if (d.counter === 'equity') return `Same ${d.kind === 'investor' ? money(std.cash) : 'wages'}, but only ${eq(ctr.equity)} of the company instead of ${eq(std.equity)}`;
  if (d.counter === 'cash') return `${money(ctr.cash)} prepaid instead of ${money(std.cash)}`;
  if (d.counter === 'rate') return `Same ${money(std.loan)} loan at ${(ctr.rate * 100).toFixed(1)}% instead of ${(std.rate * 100).toFixed(1)}%`;
  return termsLabel(state, id, ctr);
}
// What the signed roster adds up to.
export function equityCommitted(state) { return signedIds(state).reduce((a, id) => a + (rt(state, id).terms.equity || 0), 0); }
export function capitalAt(state) {
  const f = F(state); if (!f) return 0;
  let cap = f.personalCash;
  for (const id of signedIds(state)) { const t = rt(state, id).terms, d = FOUNDERS[id]; if (d.kind === 'investor') cap += t.cash; if (d.kind === 'lender') cap += t.loan; if (d.kind === 'contractor' || (d.kind === 'staff' && t.cash)) cap -= t.cash; }
  return cap;
}

// --- Setup ----------------------------------------------------------------------------------------------
export function initFounding(state, opts = {}) {
  const f = {
    phase: 'recruit', startMonth: state.month, personalCash: opts.personalCash ?? inflate(state, FOUNDING_CASH), livingCost: opts.livingCost ?? inflate(state, FOUNDING_LIVING),
    monthsLeft: opts.monthsLeft ?? FOUNDING_MONTHS, recruited: [], founders: {}, formedMonth: -1, failed: false, churchParcel: null, pruittParcels: [],
  };
  for (const id of FOUNDER_IDS) {
    const d = FOUNDERS[id];
    const p = d.person ? holder(state, d.person) : null;
    f.founders[id] = {
      id, status: 'available', terms: null, variant: null, met: false, countered: false, cooldownUntil: -1,
      disposition: p ? Math.round(p.disposition) : clamp(Math.round(gauss(d.disposition, 8)), 10, 90),
      leaveMonth: d.leaves === null ? null : state.month + Math.max(2, d.leaves + randInt(-1, 1)),
    };
  }
  // The church section: a split-estate parcel already in the widow's or the church's name, else a farm next to town.
  let church = state.parcels.find((p) => ['Widow Hargrove', 'Church of the Open Prairie'].includes(p.mineral.name) && p.drillable);
  if (!church) {
    const town = state.parcels.find((p) => p.surface.type === 'town');
    const near = state.parcels.filter((p) => p.drillable && ['farmer', 'rancher'].includes(p.surface.type) && !p.mineral.leasedBy && town && Math.abs(p.x - town.x) <= 2 && Math.abs(p.y - town.y) <= 2);
    church = near.length ? pick(near) : pick(state.parcels.filter((p) => p.drillable));
    if (church) { church.mineral.name = 'Widow Hargrove'; church.mineral.ownerType = 'heirs'; church.mineral.split = true; }
  }
  f.churchParcel = church ? church.id : null;
  state.founding = f;
  state.company.cash = 0; state.company.creditLimit = 0;
  state.news.push({ month: state.month, text: `${dateStr(state.month)}. You step off the train at Dry Fork with ${money(f.personalCash)}, a good suit and a letter of introduction nobody asked for. There is no company yet. You need a geologist, a rig and about ${money(inflate(state, FOUNDING_MIN_CAPITAL))} before the bank will open an account in anything but your own name, and the money in your pocket goes ${money(f.livingCost)} a month at the hotel. The geologists drink at the Bluebonnet, the money stays at the hotel, and the rigs are at the yard and the depot.`, kind: 'company' });
  return f;
}

// Founders present at a place (not gone), with enough for the UI to draw them and a checklist.
export function foundersAt(state, place) {
  if (!state.founding) return [];
  return FOUNDER_IDS.filter((id) => FOUNDERS[id].place === place && rt(state, id).status !== 'gone').map((id) => founderSummary(state, id));
}
export function founderSummary(state, id) {
  const d = FOUNDERS[id], r = rt(state, id);
  const t = r?.terms || founderTerms(state, id);
  return { id, name: founderName(state, id), title: d.title, place: d.place, portrait: d.portrait, kind: d.kind, role: d.role || null, status: r?.status || 'available', met: !!r?.met, terms: termsLabel(state, id, t), leavesIn: r?.leaveMonth === null || r?.leaveMonth === undefined ? null : Math.max(0, r.leaveMonth - state.month), blurb: d.blurb, quirk: d.quirk };
}
export function foundingSummary(state) {
  const f = F(state); if (!f) return null;
  const c = canForm(state);
  return { phase: f.phase, personalCash: f.personalCash, livingCost: f.livingCost, monthsLeft: f.monthsLeft, capital: capitalAt(state), minCapital: inflate(state, FOUNDING_MIN_CAPITAL), equity: equityCommitted(state), geologist: hasGeologist(state), rig: hasRig(state), canForm: c.ok, missing: c.missing, signed: signedIds(state).map((id) => founderSummary(state, id)), failed: f.failed };
}

// --- Talking to a founder ---------------------------------------------------------------------------------
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
function availability(state, id, variant) {
  const d = FOUNDERS[id], r = rt(state, id);
  if (!r || r.status === 'gone') return 'They have left town.';
  if (r.status === 'signed') return 'Already signed.';
  if (d.requires) { const why = d.requires(state); if (why) return why; }
  const t = founderTerms(state, id, variant);
  if (t && t.equity && equityCommitted(state) + t.equity > 0.75) return 'That would leave you with less than a quarter of your own company.';
  return null;
}
function sign(state, id, variant, log) {
  const why = availability(state, id, variant);
  if (why) return { ok: false, msg: why };
  const f = F(state), r = rt(state, id);
  r.status = 'signed'; r.variant = variant; r.terms = founderTerms(state, id, variant); r.met = true;
  if (!f.recruited.includes(id)) f.recruited.push(id);
  const msg = `${founderName(state, id)} shakes on it: ${termsLabel(state, id, r.terms)}.`;
  log?.(msg, 'company');
  return { ok: true, msg };
}
function release(state, id, log) {
  const f = F(state), r = rt(state, id);
  if (r.status !== 'signed') return { ok: false, msg: 'There is nothing to call off.' };
  r.status = 'available'; r.terms = null; r.variant = null; r.disposition = clamp(r.disposition - 15, 0, 100);
  f.recruited = f.recruited.filter((x) => x !== id);
  if (r.leaveMonth !== null) r.leaveMonth = Math.min(r.leaveMonth, state.month + 2);
  const msg = `${founderName(state, id)} takes the news badly. The handshake is withdrawn.`;
  log?.(msg, 'company');
  return { ok: true, msg };
}
// A counter-offer at 70 percent of their ask, resolved with the persuade logit from people.js.
function counter(state, id, log) {
  const d = FOUNDERS[id], r = rt(state, id);
  const why = availability(state, id, 'counter');
  if (why) return { ok: false, msg: why };
  if (r.cooldownUntil > state.month) return { ok: false, msg: `${founderName(state, id)} has heard your number once this month.` };
  r.cooldownUntil = state.month + 1; r.met = true;
  const rep = state.company.reputation;
  const z = -0.8 + (r.disposition - 50) / 20 + (rep - 50) / 30 + 0.25 * (4 - 4) - 1.2 * d.difficulty;
  const p = sigmoid(z);
  if (chance(p)) { r.disposition = clamp(r.disposition + 3, 0, 100); const s = sign(state, id, 'counter', log); return { ...s, countered: true, p }; }
  r.disposition = clamp(r.disposition - 6, 0, 100); r.countered = true;
  const msg = pick([`${founderName(state, id)} laughs, once. "The number is the number."`, `${founderName(state, id)} looks at the ceiling. "You must think I'm new in town."`, `"That's not an offer," ${founderName(state, id)} says. "That's an insult with a handshake on it."`]);
  log?.(msg, 'company');
  return { ok: false, msg, p };
}

export function founderTalk(state, id, topic = null) {
  const d = FOUNDERS[id], r = rt(state, id);
  const speaker = founderSpeaker(state, id);
  const name = founderName(state, id);
  if (r && r.status === 'gone') return { title: d.title, text: `${name} has left town. ${d.kind === 'contractor' ? 'The flatcar went out on the morning freight.' : 'Nobody expects them back.'}`, speaker, founder: id, options: [{ label: 'Leave', effect() {}, close: true }] };
  if (!r || !isFounding(state)) return { title: d.title, text: `${name} has nothing to discuss with you just now.`, speaker, founder: id, options: [{ label: 'Leave', effect() {}, close: true }] };
  const back = { label: 'Back to business', effect() {}, next: (s) => founderTalk(s, id) };
  if (topic === 'about') return { title: name, text: `${d.blurb} ${d.quirk}`, speaker, founder: id, options: [back] };
  if (r.status === 'signed') {
    return { title: d.title, text: `${name} nods. "We shook on ${termsLabel(state, id, r.terms)}. Get the rest of it together and I'm ready to sign the papers."`, speaker, founder: id,
      options: [{ label: 'Ask about them', effect() {}, next: (s) => founderTalk(s, id, 'about') }, { label: 'Tell them the deal is off', effect(s, p, log) { return release(s, id, log); }, close: true, hint: 'They will not take it well.' }, { label: 'See you at the signing', effect() {}, close: true }] };
  }
  r.met = true;
  const std = founderTerms(state, id), ctr = founderTerms(state, id, 'counter');
  const whyStd = availability(state, id, 'standard');
  const options = [{ label: 'Ask about them', effect() {}, next: (s) => founderTalk(s, id, 'about') }];
  options.push({ label: `Accept: ${dealLabel(state, id, std)}`, disabled: !!whyStd, hint: whyStd || d.quirk, effect(s, p, log) { return sign(s, id, 'standard', log); }, close: true });
  if (d.alt) { const alt = founderTerms(state, id, 'alt'); const whyAlt = availability(state, id, 'alt'); options.push({ label: `Accept instead: ${dealLabel(state, id, alt)}`, disabled: !!whyAlt, hint: whyAlt || 'Buy the rig outright; he works for wages.', effect(s, p, log) { return sign(s, id, 'alt', log); }, close: true }); }
  if (!r.countered) options.push({ label: `Counter: ${counterLabel(state, id, std, ctr)}`, disabled: !!whyStd || r.cooldownUntil > state.month, hint: whyStd || (r.cooldownUntil > state.month ? 'Not again this month.' : 'A better deal for you, at seventy percent of their ask. They may take it, or walk.'), effect(s, p, log) { return counter(s, id, log); }, close: true });
  options.push({ label: 'Walk away', effect() {}, close: true });
  const leaving = r.leaveMonth !== null && r.leaveMonth - state.month <= 2 ? ` ${d.kind === 'contractor' ? 'The rig' : name.split(' ')[0]} will not be in town much longer.` : '';
  return { title: d.title, text: `${d.greeting(state)}${r.countered ? ` (${name} has already turned down one of your numbers.)` : ''}${leaving}`, speaker, founder: id, options };
}

// --- Monthly ----------------------------------------------------------------------------------------------
export function founderTick(state, log) {
  const f = F(state); if (!f || f.phase === 'done') return;
  f.personalCash -= f.livingCost; f.monthsLeft--;
  for (const id of FOUNDER_IDS) {
    const r = f.founders[id], d = FOUNDERS[id];
    if (r.status !== 'available' || r.leaveMonth === null || state.month < r.leaveMonth) continue;
    r.status = 'gone';
    const line = {
      pruitt: 'Doc Pruitt took a job with Sooner State Oil and left on the noon train with his map. The Bluebonnet is quieter.',
      sandoval: 'Bull Sandoval loaded his rig on a truck and went to drill for the Kesslers. The yard is empty.',
      jessup: 'The Jessup Bros. flatcar went out on the morning freight. Somebody in the next county was paying.',
      whitlock: 'Vernon Whitlock has taken a retainer from Prairie Royalty & Land. He still tips his hat.',
      cravens: 'T. Cravens checked out of the hotel and went back to Dallas. The lobby Wall Street Journal is unread.',
    }[id] || `${founderName(state, id)} has left town.`;
    log(line, 'founderLeaves');
  }
  if (f.personalCash <= 0 || f.monthsLeft <= 0) {
    f.failed = true; f.phase = 'done'; state.company.bankrupt = true;
    log(`${f.personalCash <= 0 ? 'The hotel presented its bill and you could not pay it.' : 'A year in Dry Fork and no company to show for it.'} You went back to Tulsa to sell insurance.`, 'company');
  }
}

// --- Forming the company ------------------------------------------------------------------------------------
export function canForm(state) {
  const f = F(state);
  const missing = [];
  if (!f || f.phase === 'done') return { ok: false, missing: ['The company already exists.'] };
  if (!hasGeologist(state)) missing.push('a geologist (Doc Pruitt at the cafe, or Miss Cobb at the store)');
  if (!hasRig(state)) missing.push('a rig (Sandoval at the yard, or the Jessup brothers at the depot)');
  const min = inflate(state, FOUNDING_MIN_CAPITAL);
  if (capitalAt(state) < min) missing.push(`${money(min - capitalAt(state))} more capital (investors at the hotel and the church, the bank)`);
  return { ok: missing.length === 0, missing };
}

function founderStaff(state, id, terms) {
  const d = FOUNDERS[id];
  const s = { id: nextId(state), name: founderName(state, id), role: d.role, skill: d.skill, traits: [...d.traits], salary: terms.retainer, busyUntil: -1, task: null, hiredMonth: state.month, awayUntil: -1, years: d.years, founder: true, equity: terms.equity || 0, founderId: id };
  if (d.female) s.female = true;
  if (d.secret) s.secret = d.secret;
  s.loyalty = clamp(startingLoyalty(s) + (s.equity ? 10 : 0), 20, 95);
  return s;
}

export function formCompany(state, opts = {}) {
  const f = F(state);
  if (!f || f.phase === 'done') return { ok: false, msg: 'The company already exists.' };
  const c = canForm(state);
  if (!c.ok) return { ok: false, msg: `Not yet. You still need ${c.missing.join('; ')}.`, missing: c.missing };
  const name = (opts.name || '').trim() || state.company.name || 'Dry Fork Petroleum';
  state.company.name = name;
  const split = opts.split || {};
  let cash = f.personalCash, equitySold = 0;
  const lines = [];
  for (const id of signedIds(state)) {
    const d = FOUNDERS[id], r = f.founders[id];
    const terms = { ...r.terms };
    if (split[id] !== undefined && terms.equity !== undefined) terms.equity = clamp(+split[id] || 0, 0, 0.6);
    r.terms = terms;
    if (d.kind === 'staff') {
      const s = founderStaff(state, id, terms);
      state.staff.push(s);
      equitySold += s.equity;
      if (terms.cash) { cash -= terms.cash; state.ledger.capex += terms.cash; }
      lines.push(`${s.name} (${ROLES[d.role].name}${s.equity ? `, ${Math.round(s.equity * 100)}%` : ''})`);
    } else if (d.kind === 'investor') {
      cash += terms.cash; equitySold += terms.equity;
      lines.push(`${founderName(state, id)} (${Math.round(terms.equity * 100)}% for ${money(terms.cash)})`);
    } else if (d.kind === 'lender') {
      const r12 = terms.rate / 12, n = terms.term;
      const monthly = Math.round(terms.loan * r12 / (1 - Math.pow(1 + r12, -n)));
      state.company.loan = { principal: terms.loan, balance: terms.loan, rate: terms.rate, monthly, term: n, startMonth: state.month, lender: founderName(state, id) };
      cash += terms.loan;
      lines.push(`a ${money(terms.loan)} note at First State Bank (${money(monthly)} a month)`);
    } else if (d.kind === 'contractor') {
      cash -= terms.cash; state.ledger.capex += terms.cash; state.flags.rigCredits = 3;
      lines.push(`Jessup Bros. Rotary under contract`);
    }
    // Quirks.
    if (id === 'sandoval') state.flags.ownRig = { wellsLeft: 2, depthLimit: 4000, name: "Sandoval's spudder" };
    if (id === 'whitlock') for (const o of ['judge', 'mayor']) { const p = holder(state, o); if (p) p.disposition = clamp(p.disposition + 6, 0, 100); }
    if (id === 'cravens') state.flags.boardPressure = { equity: terms.equity, since: state.month, last: state.month, patience: 60, promise: -1 };
    if (id === 'hargrove' && f.churchParcel !== null) { const p = state.parcels[f.churchParcel]; if (p) p.restricted = 'church'; }
    if (id === 'preacher') { const p = holder(state, 'preacher'); if (p) { p.favors = (p.favors || 0) - 1; p.disposition = clamp(p.disposition + 10, 0, 100); } }
    if (id === 'ellison') { const p = holder(state, 'banker'); if (p) p.disposition = clamp(p.disposition + 5, 0, 100); }
  }
  state.company.cash = Math.round(cash);
  state.company.equitySold = Math.round(equitySold * 1000) / 1000;
  // Credit is what the banker thinks of you: a line from half to one and a quarter of the base, better with a note on the books.
  const banker = holder(state, 'banker');
  const scale = clamp(0.5 + ((banker ? banker.disposition : 50) - 30) / 80 + (state.company.loan ? 0.2 : 0), 0.5, 1.25);
  state.company.creditScale = Math.round(scale * 100) / 100;
  state.company.creditLimit = Math.round(inflate(state, START_CREDIT) * state.company.creditScale);
  f.phase = 'done'; f.formedMonth = state.month;
  // Pruitt's map: three sections of one undiscovered field, shot at level 2 with his skill.
  if (isSigned(state, 'pruitt')) {
    const pruitt = state.staff.find((s) => s.founderId === 'pruitt');
    const pools = state.pools.filter((p) => !p.discovered && p.parcels.length >= 3).sort((a, b) => b.ooip - a.ooip);
    const pool = pools.length ? pools[Math.min(pools.length - 1, 1)] : null;
    if (pool) {
      const ps = pool.parcels.map((i) => state.parcels[i]).filter((p) => p.drillable).sort((a, b) => b.truth.sand.pos - a.truth.sand.pos).slice(0, 3);
      for (const p of ps) runSurvey(state, p, 2, pruitt, 0);
      f.pruittParcels = ps.map((p) => p.id);
      state.log?.(`Doc Pruitt unrolls his map on the desk: a closure under ${ps.map((p) => p.surface.name).join(', ')} that Sooner State never drilled. "Don't tell anybody where you got it."`, 'wells');
    }
  }
  refreshCandidates(state);
  state.news.push({ month: state.month, text: `${dateStr(state.month)}. ${name} is incorporated at the courthouse with ${money(state.company.cash)} in the bank and a ${money(state.company.creditLimit)} line at First State Bank. Partners: ${lines.join('; ')}. You keep ${Math.round((1 - state.company.equitySold) * 100)} percent. Crude is posted at $${state.market.oil.toFixed(2)} a barrel${state.permits ? ` and the commission allows ${Math.round(state.permits.allowable * 100)} percent` : ''}. Lease it, drill it, and try to stay out of the Clarion.`, kind: 'company' });
  reportStory(state, 'puff', { company: name, headline: `NEW OUTFIT SETS UP SHOP IN DRY FORK; ${name.toUpperCase()} TO DRILL THIS YEAR`, repHit: -3 });
  return { ok: true, name, cash: state.company.cash, equitySold: state.company.equitySold, loan: state.company.loan };
}

// Tests and "skip the founding" games: the standard roster, signed at their asking terms.
export function autoFound(state, opts = {}) {
  if (!state.founding) initFounding(state, opts);
  const log = state.log || (() => {});
  for (const id of ['pruitt', 'jessup', 'whitlock', 'cravens', 'ellison']) { const r = sign(state, id, 'standard', log); if (!r.ok) return { ok: false, msg: `autoFound: ${id}: ${r.msg}` }; }
  return formCompany(state, { name: opts.name });
}
