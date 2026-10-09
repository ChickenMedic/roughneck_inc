// The people of Dry Fork: officeholders and the folks you have to talk to. Elections, dispositions,
// and approach(): persuade, bribe, blackmail, favor, donate, threaten. Every dollar is a 1952 base via inflate().
// conversation() and askCatalog() produce event-shaped dialogue nodes for the presentation layer.
import { rnd, rand, randInt, pick, chance, gauss } from './rng.js';
import { clamp, money, nextId, calMonth as calMonthOf } from './util.js';
import { LAST, PARTIES } from './data.js';
import { roleSkill } from './staff.js';
import { inflate, yearOf, calMonth } from './era.js';
import { surfaceAsk } from './land.js';
import { reportStory } from './press.js';
import { recordCrime, addHeat, closeInvestigations, addDirt } from './law.js';
import { applyParty } from './government.js';

const MALE = ['Harlan', 'Virgil', 'Clyde', 'Delbert', 'Orville', 'Lester', 'Wilbur', 'Homer', 'Floyd', 'Cecil', 'Roy', 'Buford', 'Elmer', 'Vernon', 'Doyle', 'Merle', 'Alvin', 'Lloyd', 'Otis', 'Earl', 'Judd', 'Lyle', 'Marvin', 'Ansel', 'Wade'];
const FEMALE = ['Mabel', 'Opal', 'Hazel', 'Edna', 'Pearl', 'Wilma', 'Bernice', 'Thelma', 'Loretta', 'Vera', 'Ruby', 'Ione'];
const SECRET_KINDS = ['gambling debts in Fort Worth', 'a lady friend in Tulsa', 'a road-fund shortage', 'a bottle in the desk drawer', 'a quiet land deal on the county road', 'a war record that will not bear looking at', 'a brother who runs whiskey', 'back taxes on the home place'];

// Role priors. honesty: reports you / cannot be bought. corruptibility: takes the envelope. greed: size of envelope. ambition: fear of exposure.
export const OFFICES = {
  mayor:     { title: 'Mayor of Dry Fork',                    portrait: 'mayor',    elected: true,  term: 24, corrupt: [0.5, 0.2],  honesty: [0.45, 0.2], greed: [0.5, 0.2],  ambition: [0.65, 0.2], female: 0 },
  judge:     { title: 'County Judge',                         portrait: 'mayor',    elected: true,  term: 48, corrupt: [0.5, 0.2],  honesty: [0.45, 0.2], greed: [0.55, 0.2], ambition: [0.55, 0.2], female: 0 },
  sheriff:   { title: 'Sheriff of Dry Fork County',           portrait: 'sheriff',  elected: true,  term: 48, corrupt: [0.4, 0.2],  honesty: [0.55, 0.25], greed: [0.45, 0.2], ambition: [0.5, 0.2], female: 0 },
  editor:    { title: 'Editor, The Dry Fork Clarion',         portrait: 'reporter', elected: false, term: 0,  corrupt: [0.3, 0.15], honesty: [0.7, 0.15], greed: [0.65, 0.15], ambition: [0.6, 0.2], female: 0.3 },
  banker:    { title: 'President, First State Bank',          portrait: 'banker',   elected: false, term: 0,  corrupt: [0.2, 0.1],  honesty: [0.8, 0.1],  greed: [0.6, 0.15], ambition: [0.45, 0.2], female: 0 },
  saloon:    { title: 'Proprietor, Bluebonnet Cafe',          portrait: 'waitress', elected: false, term: 0,  corrupt: [0.7, 0.15], honesty: [0.4, 0.2],  greed: [0.7, 0.15], ambition: [0.3, 0.2], female: 0.7 },
  inspector: { title: 'Field Agent, State Corporation Commission', portrait: 'clerk', elected: false, term: 0, corrupt: [0.45, 0.2], honesty: [0.5, 0.25], greed: [0.5, 0.2], ambition: [0.5, 0.2], female: 0 },
  preacher:  { title: 'Pastor, First Methodist Church',       portrait: 'oldtimer', elected: false, term: 0,  corrupt: [0.15, 0.1], honesty: [0.9, 0.08], greed: [0.3, 0.15], ambition: [0.5, 0.2], female: 0 },
};
const g01 = ([m, sd]) => clamp(gauss(m, sd), 0.05, 0.95);

function makePerson(state, office, party, opts = {}) {
  const spec = OFFICES[office];
  const female = chance(spec.female);
  const first = female ? pick(FEMALE) : pick(MALE);
  const p = {
    id: `${office}${nextId(state)}`, name: `${first} ${pick(LAST)}`, female, title: spec.title, office, party,
    disposition: clamp(Math.round(gauss(opts.disposition ?? 50, 10)), 5, 95),
    corruptibility: g01(spec.corrupt), honesty: g01(spec.honesty), greed: g01(spec.greed), ambition: g01(spec.ambition),
    secrets: [], dirtKnown: 0, favors: 0, bribedTotal: 0, bought: false, hostile: false, cowed: false,
    termEnd: spec.elected ? opts.termEnd ?? -1 : -1, since: state.month, cooldownUntil: -1, askCooldown: {}, memory: [],
  };
  const nSecrets = (chance(0.85 - 0.6 * p.honesty) ? 1 : 0) + (chance(0.25) ? 1 : 0);
  const kinds = [...SECRET_KINDS];
  for (let i = 0; i < nSecrets; i++) p.secrets.push({ kind: kinds.splice(randInt(0, kinds.length - 1), 1)[0], strength: Math.round(rand(0.3, 0.9) * 100) / 100 });
  return p;
}

// Next election month for an office (Nov of even years from 1954; mayor every 2 years, judge/sheriff every 4).
export function nextElectionMonth(state, office, after = state.month) {
  const term = OFFICES[office].term;
  const firstYear = 1954;
  for (let y = firstYear; y < 2100; y += 2) {
    if (term === 48 && (y - firstYear) % 4 !== 0) continue;
    const m = (y - 1952) * 12 + 10 - 8; // Nov of year y as a game month
    if (m > after) return m;
  }
  return 1e9;
}

export function initPeople(state) {
  state.people = {}; state.offices = {};
  const ring = state.gov.party;
  for (const office of Object.keys(OFFICES)) {
    const spec = OFFICES[office];
    const party = spec.elected ? (chance(0.8) ? ring : (ring === 'ring' ? 'reform' : 'ring')) : (chance(0.5) ? 'ring' : 'reform');
    const p = makePerson(state, office, office === 'judge' ? ring : party, { termEnd: spec.elected ? nextElectionMonth(state, office, -1) : -1 });
    state.people[p.id] = p; state.offices[office] = p.id;
  }
  state.gov.donations = { ring: 0, reform: 0 };
  return state.people;
}

export function holder(state, office) { return state.people?.[state.offices?.[office]] || null; }
export function officeOf(state, personId) { return Object.keys(state.offices).find((o) => state.offices[o] === personId) || null; }

// Resolve a reference: an office ('judge'), a person id ('judge3'), or a landowner ('parcel:12').
export function personFor(state, ref) {
  if (!ref) return null;
  if (typeof ref === 'object') return ref;
  if (state.people?.[ref]) return state.people[ref];
  if (state.offices?.[ref]) return state.people[state.offices[ref]];
  if (String(ref).startsWith('parcel:')) return landownerFor(state, state.parcels[+ref.slice(7)]);
  return null;
}
// A surface owner wearing the Person interface. Writes go back to the parcel through the `parcel` handle.
export function landownerFor(state, parcel) {
  if (!parcel) return null;
  const s = parcel.surface;
  s.people ||= { cooldownUntil: -1, favors: 0, bought: false, memory: [], secrets: [] };
  return {
    id: `parcel:${parcel.id}`, name: s.ownerPerson, title: `${s.name}`, office: 'landowner', party: null, portrait: s.type === 'rancher' ? 'rancher' : 'farmer',
    parcel, get disposition() { return s.disposition; }, set disposition(v) { s.disposition = v; },
    corruptibility: 0.35, honesty: 0.7, greed: clamp(parcel.mineral.greed - 0.4, 0.2, 0.9), ambition: 0.35,
    get hostile() { return s.hostile; }, set hostile(v) { s.hostile = v; },
    get cooldownUntil() { return s.people.cooldownUntil; }, set cooldownUntil(v) { s.people.cooldownUntil = v; },
    get favors() { return s.people.favors; }, set favors(v) { s.people.favors = v; },
    get bought() { return s.people.bought; }, set bought(v) { s.people.bought = v; },
    get memory() { return s.people.memory; }, secrets: s.people.secrets, askCooldown: {}, bribedTotal: 0,
  };
}
export function portraitFor(person) { return person.portrait || OFFICES[person.office]?.portrait || 'clerk'; }
export function partyBonus(state, person) {
  if (!person.party) return 0;
  const d = state.gov.donations || { ring: 0, reform: 0 };
  const mine = d[person.party], theirs = d[person.party === 'ring' ? 'reform' : 'ring'];
  if (!mine && !theirs) return 0;
  return mine >= theirs ? 8 : -5;
}

// --- Monthly --------------------------------------------------------------------
export function tickPeople(state, log) {
  if (!state.people) initPeople(state);
  const rep = state.company.reputation;
  for (const p of Object.values(state.people)) {
    if (!p.office) continue;
    let target = 40 + 0.3 * rep + partyBonus(state, p) + (p.bought ? 10 : 0) - (p.hostile ? 25 : 0) + (p.favors > 0 ? 3 * Math.min(p.favors, 3) : 0);
    if (p.office === 'preacher') target += (state.press?.goodwill || 0) * 0.3 - 0.3 * state.env.activism;
    if (p.office === 'editor') target -= 0.2 * (state.press?.notoriety || 0);
    p.disposition = clamp(p.disposition + (target - p.disposition) * 0.05, 0, 100);
    if (p.hostile && p.disposition > 45 && chance(0.05)) p.hostile = false;
  }
  // Elections: Nov of even years from 1954.
  if (calMonth(state) === 10 && yearOf(state) >= 1954 && yearOf(state) % 2 === 0) runElections(state, log);
  state.gov.monthsToElection = nextElectionMonth(state, 'mayor') - state.month;
}

function runElections(state, log) {
  const $ = (v) => inflate(state, v);
  const d = state.gov.donations || { ring: 0, reform: 0 };
  const swingReform = clamp((state.env.activism - 30) / 200, -0.1, 0.15);
  const results = [];
  for (const office of ['mayor', 'sheriff', 'judge']) {
    const inc = holder(state, office);
    if (!inc || inc.termEnd > state.month) continue;
    const other = inc.party === 'ring' ? 'reform' : 'ring';
    let p = 0.5 + 0.1 * clamp((d[inc.party] - d[other]) / $(4_000), -2, 2) + 0.1 * (inc.party === state.gov.party ? 1 : -1) + (inc.party === 'reform' ? swingReform : -swingReform);
    if (state.press?.owned && inc.disposition > 60) p += 0.08; // the paper is on their side
    p = clamp(p, 0.15, 0.88);
    const term = OFFICES[office].term;
    if (chance(p)) {
      inc.termEnd = state.month + term;
      results.push(`${inc.name} (${PARTIES[inc.party].name}) was returned as ${office === 'judge' ? 'county judge' : office}.`);
    } else {
      const winner = makePerson(state, office, other, { termEnd: state.month + term, disposition: 45 });
      inc.office = null; inc.termEnd = -1; inc.bought = false; inc.favors = 0;
      state.people[winner.id] = winner; state.offices[office] = winner.id;
      results.push(`${winner.name} (${PARTIES[other].name}) unseated ${inc.name} as ${office === 'judge' ? 'county judge' : office}.`);
      if (office === 'judge' && state.gov.party !== other) {
        state.gov.party = other; applyParty(state.gov, state);
        results.push(other === 'reform' ? 'The Reform Ticket now runs the courthouse: severance tax to 6 percent, two permits a year without a conversation, and the field man gets a second car.' : 'The Courthouse Ring is back in: severance tax to 4.6 percent, permits move in a month, and the field man is reassigned to weights and measures.');
      }
    }
  }
  // Forget the old people after a while so the roster does not grow forever.
  for (const [id, p] of Object.entries(state.people)) if (!p.office && state.month - (p.since || 0) > 240 && !state.dirt?.some((x) => x.personId === id)) delete state.people[id];
  state.gov.donations = { ring: 0, reform: 0 };
  if (results.length) { log(`ELECTION DAY. ${results.join(' ')}`, 'gov'); reportStory(state, 'election', { text: results[0] }); }
}

// --- Asks ----------------------------------------------------------------------------
// who: offices that can grant it. difficulty d in 0..1. grant() applies the favour and returns a line of text.
export const ASKS = {
  permit:      { label: 'A drilling permit', who: ['judge', 'mayor'], difficulty: 0.25, desc: 'Room on the county docket for one more well this year.',
    grant(state, p) { state.permits.countyBudget += 1; state.permits.bonus += 1; if (p.office === 'judge' && state.permits.freezeUntil > state.month) state.permits.freezeUntil = state.month; return `${p.name} makes a telephone call. There is, it turns out, room on the docket for one more.`; } },
  allowable:   { label: 'A higher allowable', who: ['inspector'], difficulty: 0.45, desc: 'An exemption from proration for your wells for a year.',
    grant(state, p, o) { state.permits.exemptions.push({ wellId: o.wellId ?? null, until: state.month + 12 }); return `${p.name} finds a "reservoir study" that justifies producing your wells at capacity. It is good for twelve months.`; } },
  spacing:     { label: 'A spacing exception', who: ['inspector'], difficulty: 0.3, desc: 'A Rule 37 waiver to drill a second well on a section.',
    avail: (state, o) => o.parcelId !== undefined && o.parcelId !== null,
    grant(state, p, o) { state.permits.spacingWaivers.push({ parcelId: o.parcelId, until: state.month + 36 }); return `${p.name} signs the Rule 37 exception. The neighbours can protest at the hearing; nobody will come.`; } },
  bury:        { label: 'Bury a story', who: ['editor'], difficulty: 0.5, desc: 'Keep a brewing story out of the Clarion.',
    avail: (state) => state.press.stories.some((s) => s.status === 'brewing' && s.about === 'player'),
    grant(state, p, o) { const s = (o.storyId ? state.press.stories.find((x) => x.id === o.storyId) : null) || state.press.stories.filter((x) => x.status === 'brewing' && x.about === 'player').sort((a, b) => b.heat - a.heat)[0]; if (!s) return 'There is nothing to bury.'; s.status = 'buried'; s.buriedMonth = state.month; return `${p.name} takes the story off the hook. "It was thin anyway," ${p.female ? 'she' : 'he'} says. "${s.headline}" will not run.`; } },
  plant:       { label: 'Plant a story', who: ['editor'], difficulty: 0.5, desc: 'Run a piece about a rival, or a flattering one about yourself.',
    grant(state, p, o) { return plantStoryVia(state, o); } },
  dismiss:     { label: 'Have the case dismissed', who: ['judge'], difficulty: 0.7, desc: 'The docket is the judge\'s to arrange.',
    avail: (state) => state.law.investigations.some((i) => i.status === 'charged'),
    grant(state, p) { let n = 0; for (const i of state.law.investigations) if (i.status === 'charged') { i.status = 'dismissed'; i.closed = state.month; n++; } addHeat(state, -10); return n ? `${p.name} finds a defect in the indictment. Case dismissed, with prejudice, before the district attorney has finished his coffee.` : 'There is no case on the docket.'; } },
  drop:        { label: 'Drop the investigation', who: ['sheriff', 'inspector'], difficulty: 0.6, desc: 'Close the file.',
    avail: (state, o, p) => state.law.investigations.some((i) => i.status === 'open' && i.by === (p.office === 'sheriff' ? 'sheriff' : 'state')),
    grant(state, p) { const n = closeInvestigations(state, p.office === 'sheriff' ? 'sheriff' : 'state', 'dropped'); return n ? `${p.name} closes the file. "Insufficient evidence," the note says, in fresh ink.` : 'There is no file to close.'; } },
  loan:        { label: 'A bigger line of credit', who: ['banker'], difficulty: 0.4, desc: 'Another slice of credit at the bank for two years.',
    grant(state, p) { const amt = inflate(state, 15_000); state.company.creditBoost = { amount: (state.company.creditBoost?.until > state.month ? state.company.creditBoost.amount : 0) + amt, until: state.month + 24 }; return `${p.name} extends your line by ${money(amt)} for two years. "Do not make me regret it."`; } },
  access:      { label: 'Permission to drill', who: ['landowner'], difficulty: 0.4, desc: 'A surface agreement without the haggling.',
    avail: (state, o, p) => !!p.parcel && !p.parcel.surface.agreement,
    grant(state, p, o, method) { const ask = surfaceAsk(state, p.parcel); const damages = method === 'persuade' || method === 'favor' ? Math.round(ask.damages * 0.5) : 0; state.company.cash -= damages; state.ledger.land += damages; p.parcel.surface.agreement = { damages, conditions: ask.conditions, month: state.month, forced: method === 'threaten' }; return `${p.name} signs the surface agreement${damages ? ` for ${money(damages)}` : ''}.`; } },
  townDrilling:{ label: 'Drilling inside the town limits', who: ['mayor'], difficulty: 0.6, desc: 'An ordinance allowing wells on town lots.',
    avail: (state) => !state.flags.townDrilling,
    grant(state, p) { state.flags.townDrilling = true; for (const q of state.parcels) if (q.surface.type === 'town') q.drillable = true; return `The council passes an ordinance at a meeting nobody attended. Wells may now be drilled inside the town limits.`; } },
  endorse:     { label: 'A word from the pulpit', who: ['preacher'], difficulty: 0.35, desc: 'A kind word about the company from the pulpit on Sunday.', cooldown: 12,
    grant(state, p) { state.press.goodwill = clamp(state.press.goodwill + 6, 0, 60); state.company.reputation = clamp(state.company.reputation + 3, 0, 100); reportStory(state, 'endorsement', { person: p.name }); return `${p.name} mentions the company, and its generosity, in Sunday's sermon on the parable of the talents.`; } },
  tip:         { label: 'What people are saying', who: ['saloon'], difficulty: 0.2, desc: 'Gossip: who owes what, who has been seen where.',
    grant(state, p) { return tipFrom(state, p); } },
};

export function asksFor(state, person) {
  return Object.entries(ASKS).filter(([, a]) => a.who.includes(person.office));
}
export function askCatalog(state, personRef, opts = {}) {
  const p = personFor(state, personRef); if (!p) return [];
  return asksFor(state, p).map(([key, a]) => {
    let available = true, why = '';
    if (a.avail && !a.avail(state, opts, p)) { available = false; why = 'Not right now.'; }
    if (a.cooldown && (p.askCooldown?.[key] ?? -99) > state.month) { available = false; why = `Not again so soon.`; }
    return { ask: key, label: a.label, desc: a.desc, difficulty: a.difficulty, available, why, bribe: suggestedBribe(state, p, key) };
  });
}

// --- approach() ------------------------------------------------------------------------
export const METHODS = ['persuade', 'bribe', 'blackmail', 'favor', 'donate', 'threaten'];
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export function expectedBribe(state, person, ask) { const d = ASKS[ask]?.difficulty ?? 0.4; return inflate(state, 200 + 1500 * person.greed) * (0.5 + d); }
export function suggestedBribe(state, person, ask) { return Math.round(expectedBribe(state, person, ask) * 1.3 / 10) * 10; }
function skillFor(state, person) {
  if (person.office === 'landowner') return roleSkill(state, 'landman');
  if (['editor', 'preacher', 'saloon'].includes(person.office)) return roleSkill(state, 'pr');
  return roleSkill(state, 'govaffairs');
}
export function dirtOn(state, person) { return (state.dirt || []).filter((d) => d.personId === person.id && !d.used); }
export function hasCowboy(state) { return state.staff.some((s) => s.role === 'driller' && s.traits.includes('cowboy')) || state.staff.some((s) => s.traits.includes('cowboy')); }

function remember(p, entry) { (p.memory ||= []).push(entry); while (p.memory.length > 8) p.memory.shift(); }
const pron = (p) => (p.female ? 'she' : 'he');

export function approach(state, personRef, method, opts = {}) {
  const p = personFor(state, personRef);
  if (!p) return { ok: false, outcome: 'nobody', text: 'There is nobody by that name in Dry Fork.', cost: 0 };
  if (!METHODS.includes(method)) return { ok: false, outcome: 'method', text: 'You are not sure how to go about that.', cost: 0 };
  if (state.law?.absentUntil > state.month) return { ok: false, outcome: 'absent', text: 'You are not in a position to call on anyone just now.', cost: 0 };
  if (p.cooldownUntil > state.month) return { ok: false, outcome: 'cooldown', text: `${p.name} has already given you ${pron(p) === 'she' ? 'her' : 'his'} time this month. Come back after the first.`, cost: 0 };
  const ask = opts.ask || asksFor(state, p)[0]?.[0];
  const askDef = ASKS[ask];
  if (method !== 'donate' && (!askDef || !askDef.who.includes(p.office))) return { ok: false, outcome: 'ask', text: `${p.name} cannot help you with that.`, cost: 0 };
  if (method !== 'donate' && askDef.avail && !askDef.avail(state, opts, p)) return { ok: false, outcome: 'unavailable', text: `${p.name} shrugs. "Nothing to be done about that just now."`, cost: 0 };
  if (method !== 'donate' && askDef.cooldown && (p.askCooldown?.[ask] ?? -99) > state.month) return { ok: false, outcome: 'cooldown', text: `${p.name} says once is a favour and twice is a habit.`, cost: 0 };
  const d = askDef?.difficulty ?? 0.3;
  const rep = state.company.reputation;
  const skill = skillFor(state, p);
  const log = state.log || (() => {});
  const $ = (v) => inflate(state, v);
  const spend = (amt, cat = 'other') => { state.company.cash -= amt; state.ledger[cat] += amt; };
  const canPay = (amt) => state.company.cash - amt >= -state.company.creditLimit;
  let r;
  p.cooldownUntil = state.month + 1;
  const grant = () => { const t = askDef.grant(state, p, opts, method); if (askDef.cooldown) (p.askCooldown ||= {})[ask] = state.month + askDef.cooldown; return t; };

  if (method === 'persuade') {
    const z = -0.8 + (p.disposition - 50) / 20 + (rep - 50) / 30 + 0.25 * (skill - 4) - 1.2 * d + (p.cowed ? 0.8 : 0) - (p.hostile ? 1.5 : 0);
    const pr = sigmoid(z);
    if (chance(pr)) { p.disposition = clamp(p.disposition + 3, 0, 100); r = { ok: true, outcome: 'granted', text: grant(), cost: 0, p: pr }; }
    else { p.disposition = clamp(p.disposition - 2, 0, 100); r = { ok: false, outcome: 'refused', cost: 0, p: pr, text: pick([`${p.name} hears you out, nods, and says ${pron(p)} will "study on it". That means no.`, `${p.name} says the rules are the rules, and looks at the clock.`, `"I'd like to help you," ${p.name} says, "but I have to think of how it looks."`, `${p.name} lets you talk for ten minutes and then asks after your family.`]) }; }
  } else if (method === 'bribe') {
    const amount = Math.max(0, Math.round(opts.amount ?? suggestedBribe(state, p, ask)));
    const expected = expectedBribe(state, p, ask);
    if (amount <= 0) return { ok: false, outcome: 'amount', text: 'An empty envelope is an insult.', cost: 0 };
    if (!canPay(amount)) return { ok: false, outcome: 'cash', text: 'You cannot cover that.', cost: 0 };
    const z = -0.6 + 3 * p.corruptibility - 1.8 * p.honesty + 1.2 * Math.log(amount / expected) - 0.4 * d + (p.bought ? 0.6 : 0);
    const pr = sigmoid(z);
    const crime = recordCrime(state, { kind: 'bribe', personId: p.id, person: p.name, amount, exposure: clamp(0.2 + amount / $(20_000), 0.2, 0.7), witnesses: 1 });
    if (chance(pr)) {
      spend(amount); p.bribedTotal += amount; p.bought = true; p.disposition = clamp(p.disposition + 6, 0, 100);
      if (p.office === 'landowner') { /* no ledger entry */ } else state.gov.lobbyingTotal += amount;
      r = { ok: true, outcome: 'granted', text: `${pick(['The envelope goes into the desk drawer without being counted.', 'The envelope disappears into a coat pocket.', `${p.name} does not look at the envelope, which is how you know it will be counted later.`])} ${grant()}`, cost: amount, p: pr, crimeId: crime.id };
    } else {
      const pReport = clamp(p.honesty * 0.9 - 0.25, 0, 0.8);
      p.disposition = clamp(p.disposition - 10, 0, 100);
      if (chance(pReport)) {
        crime.discovered = true; crime.reportedBy = p.id;
        addHeat(state, 15);
        p.hostile = p.honesty > 0.6;
        reportStory(state, 'bribeRefused', { person: p.name, title: p.title, amount, crimeId: crime.id });
        r = { ok: false, outcome: 'reported', cost: 0, p: pr, text: `${p.name} pushes the envelope back across the desk and picks up the telephone. ${p.office === 'sheriff' ? 'The sheriff writes down the amount himself.' : 'The sheriff will hear of it by supper, and the Clarion by Thursday.'}`, crimeId: crime.id };
      } else {
        r = { ok: false, outcome: 'refused', cost: 0, p: pr, text: pick([`${p.name} looks at the envelope for a long moment and says, "Put that away before somebody sees it."`, `"I'll pretend I didn't see that," ${p.name} says. "Once."`, `${p.name} slides the envelope back. "Not for that. Not for that little, anyway."`]) };
      }
    }
  } else if (method === 'blackmail') {
    const dirt = opts.dirtId ? (state.dirt || []).find((x) => x.id === opts.dirtId) : dirtOn(state, p).sort((a, b) => b.strength - a.strength)[0];
    if (!dirt || dirt.personId !== p.id) return { ok: false, outcome: 'nodirt', text: `You have nothing on ${p.name}. Yet.`, cost: 0 };
    const pr = clamp(0.3 + 0.6 * dirt.strength - 0.3 * p.ambition * (1 - p.corruptibility), 0.05, 0.95);
    const crime = recordCrime(state, { kind: 'blackmail', personId: p.id, person: p.name, exposure: 0.35, witnesses: 1 });
    dirt.used = true; dirt.strength = Math.round(dirt.strength * 0.5 * 100) / 100; if (dirt.strength > 0.15) dirt.used = false;
    p.disposition = clamp(p.disposition - 15, 0, 100);
    if (chance(pr)) { p.cowed = true; r = { ok: true, outcome: 'granted', text: `You mention ${dirt.kind}. ${p.name} goes white, then grey. ${grant()}`, cost: 0, p: pr, crimeId: crime.id }; }
    else {
      p.hostile = true; crime.discovered = chance(0.6); crime.reportedBy = p.id;
      if (crime.discovered) { addHeat(state, 20); reportStory(state, 'blackmail', { person: p.name, title: p.title, crimeId: crime.id }); }
      r = { ok: false, outcome: 'bluffCalled', cost: 0, p: pr, crimeId: crime.id, text: `You mention ${dirt.kind}. ${p.name} stands up. "Print it, then. And get out." ${crime.discovered ? `${pron(p) === 'she' ? 'She' : 'He'} tells the sheriff about the conversation before you reach your car.` : `${pron(p) === 'she' ? 'She' : 'He'} will not forget this.`}` };
    }
  } else if (method === 'favor') {
    const owed = p.favors || 0;
    const z = -0.5 + (p.disposition - 50) / 15 + 0.8 * Math.min(owed, 3) - 0.6 * d - (p.hostile ? 2 : 0);
    const pr = sigmoid(z);
    if (chance(pr)) { p.favors = owed - 1; r = { ok: true, outcome: 'granted', text: `${owed > 0 ? `${p.name} remembers what you did and says it is only right.` : `${p.name} agrees, and makes a point of saying you now owe ${pron(p) === 'she' ? 'her' : 'him'} one.`} ${grant()}`, cost: 0, p: pr }; }
    else r = { ok: false, outcome: 'refused', cost: 0, p: pr, text: owed > 0 ? `${p.name} says a favour is one thing and this is another.` : `${p.name} laughs. "A favour? Son, I don't know you."` };
  } else if (method === 'donate') {
    const amount = Math.max(0, Math.round(opts.amount ?? $(500)));
    if (amount <= 0) return { ok: false, outcome: 'amount', text: 'Nothing to give.', cost: 0 };
    if (!canPay(amount)) return { ok: false, outcome: 'cash', text: 'You cannot cover that.', cost: 0 };
    spend(amount);
    const connected = state.staff.some((s) => s.role === 'govaffairs' && s.traits.includes('connected'));
    const gain = Math.min(15, (amount / $(300)) * (1 + 0.08 * skill) * (connected ? 1.5 : 1) * (p.office === 'preacher' ? 1.4 : 1));
    p.disposition = clamp(p.disposition + gain, 0, 100);
    p.favors = (p.favors || 0) + (amount >= $(1_000) ? 1 : 0);
    if (p.party) { state.gov.donations ||= { ring: 0, reform: 0 }; state.gov.donations[p.party] += amount; state.gov.lobbyingTotal += amount; }
    if (p.office === 'preacher') { state.press.goodwill = clamp(state.press.goodwill + gain * 0.4, 0, 60); state.env.communitySpend += amount; }
    let text = p.office === 'preacher' ? `The building fund receives ${money(amount)}. ${p.name} says the Lord loves a cheerful giver, and so does the choir.`
      : p.party ? `${money(amount)} to the ${PARTIES[p.party].name} campaign, receipt in the name of your bookkeeper. ${p.name} is grateful.`
      : `${money(amount)} finds its way to ${p.name}, as a gift between friends. ${pron(p) === 'she' ? 'She' : 'He'} is grateful.`;
    if (amount > $(2_000) && chance(clamp(amount / $(40_000), 0.03, 0.4))) { reportStory(state, 'bigDonation', { person: p.name, amount }); text += ' The size of the cheque gets talked about.'; }
    r = { ok: true, outcome: 'granted', text, cost: amount, p: 1, gain };
  } else if (method === 'threaten') {
    if (!hasCowboy(state)) return { ok: false, outcome: 'nocowboy', text: 'You would need somebody on the payroll who looks the part.', cost: 0 };
    const pr = clamp(0.25 + 0.45 * (1 - p.ambition) - 0.3 * d - (p.office === 'sheriff' ? 0.3 : 0), 0.03, 0.85);
    const crime = recordCrime(state, { kind: 'threat', personId: p.id, person: p.name, exposure: 0.3, witnesses: 2 });
    p.hostile = true; p.disposition = clamp(p.disposition - 20, 0, 100);
    const cowboy = state.staff.find((s) => s.traits.includes('cowboy'));
    if (chance(pr)) { p.cowed = true; r = { ok: true, outcome: 'granted', text: `${cowboy.name} leans on the door frame while you explain how accidents happen. ${grant()}`, cost: 0, p: pr, crimeId: crime.id }; }
    else {
      crime.discovered = chance(0.5); crime.reportedBy = p.id;
      if (crime.discovered) { addHeat(state, 12); reportStory(state, 'threat', { person: p.name, title: p.title, crimeId: crime.id }); }
      r = { ok: false, outcome: 'refused', cost: 0, p: pr, crimeId: crime.id, text: `${p.name} is not the frightening kind. "Get that man out of my office." ${crime.discovered ? 'The sheriff hears about it within the hour.' : ''}` };
    }
  }
  remember(p, { month: state.month, method, ask, outcome: r.outcome });
  r.person = p.id; r.method = method; r.ask = ask;
  return r;
}

// Plant a story through the editor (used by the ASK and by press.plantStory).
function plantStoryVia(state, o) {
  const target = o.target || 'self';
  if (target === 'self') { reportStory(state, 'puff', { company: state.company.name }); return 'A flattering piece about the company will run on page one, above the fold, next to the church notes.'; }
  const comp = state.competitors.find((c) => c.name === target);
  if (!comp) return 'There is nobody by that name to write about.';
  const dirt = (state.dirt || []).find((d) => d.personId === `comp:${comp.name}` && !d.used);
  if (dirt) { dirt.used = true; reportStory(state, 'rivalScandal', { rival: comp.name, about: comp.name, detail: dirt.kind, heat: 60, repHit: 14 }); comp.hostility = clamp((comp.hostility || 0) + 25, 0, 100); return `The Clarion will print what you know about ${comp.name}. It is true, which helps.`; }
  const crime = recordCrime(state, { kind: 'libel', person: comp.name, exposure: 0.35, witnesses: 1, rival: comp.name });
  reportStory(state, 'smear', { rival: comp.name, about: comp.name, truth: false, heat: 40, repHit: 8, crimeId: crime.id });
  comp.hostility = clamp((comp.hostility || 0) + 25, 0, 100);
  return `The Clarion will print a story about ${comp.name} that is, strictly speaking, invented. Libel is a crime, if anyone can prove who invented it.`;
}

// Gossip from the cafe: dirt on an official, a rival's misdeed, or a geological rumour.
function tipFrom(state, p) {
  const officials = Object.values(state.people).filter((x) => x.office && x.office !== 'saloon' && x.secrets.some((s) => !(state.dirt || []).some((d) => d.personId === x.id && d.kind === s.kind)));
  const rivalDirt = (state.crimes || []).filter((c) => c.rival && !c.discovered && c.byRival);
  const r = rnd();
  if (rivalDirt.length && r < 0.35) { const c = pick(rivalDirt); c.discovered = true; addDirt(state, { personId: `comp:${c.rival}`, kind: c.kindText || c.kind, strength: 0.6, source: 'rumor' }); return `${p.name} leans in. "${c.rival}? ${c.kindText || 'They have been up to something at the courthouse.'}" You now have something on them.`; }
  if (officials.length && r < 0.8) { const x = pick(officials); const s = x.secrets.find((s) => !(state.dirt || []).some((d) => d.personId === x.id && d.kind === s.kind)); addDirt(state, { personId: x.id, kind: s.kind, strength: Math.round(s.strength * 0.7 * 100) / 100, source: 'rumor' }); x.dirtKnown = (x.dirtKnown || 0) + 1; return `${p.name} wipes the counter and mentions, to nobody in particular, ${x.name} and ${s.kind}.`; }
  const cand = state.parcels.filter((q) => q.drillable && q.survey.level < 1 && q.truth.sand.onStructure);
  if (cand.length) { const q = pick(cand); q.survey.level = 1; return `${p.name} says an old cable-tool hand swore there was a show of oil under ${q.surface.name} back before the war. Worth a look.`; }
  return `${p.name} has nothing for you but the pie.`;
}
export function buyRumor(state) {
  const p = holder(state, 'saloon'); if (!p) return { ok: false, msg: 'The cafe is closed.' };
  const cost = inflate(state, 20);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'You cannot even cover the pie.' };
  if (p.cooldownUntil > state.month) return { ok: false, msg: `${p.name} has told you everything ${pron(p)} knows this month.` };
  state.company.cash -= cost; state.ledger.other += cost; p.cooldownUntil = state.month + 1;
  const text = chance(0.7) ? tipFrom(state, p) : `${p.name} takes the money and talks about the weather.`;
  state.log?.(text, 'people');
  return { ok: true, msg: text, cost };
}

// --- Conversation nodes for the UI ----------------------------------------------------
function greeting(state, p) {
  const d = p.disposition;
  if (p.hostile) return `${p.name} does not offer you a chair. "Say what you came to say."`;
  const memo = (p.memory || []).slice(-1)[0];
  if (memo && memo.outcome === 'granted' && state.month - memo.month < 3) return `${p.name} greets you like an old friend, which, after last month, you are.`;
  if (d > 70) return `${p.name} waves you in. "Sit down. Coffee? What can I do for the oil business today?"`;
  if (d > 45) return `${p.name} looks up from the desk. "Afternoon. What's on your mind?"`;
  if (d > 25) return `${p.name} keeps writing for a moment before looking up. "Make it quick."`;
  return `${p.name} does not get up. "You've got some nerve coming in here."`;
}
function askLine(state, p, ask) {
  const a = ASKS[ask];
  const lines = {
    permit: [`"Permits," ${p.name} says. "Everybody wants permits. The commission gave us so many and the Kesslers took half of them by February."`, `"The docket's full," ${p.name} says, without looking at it.`],
    allowable: [`"The allowable is the allowable," ${p.name} says. "Unless there is a reservoir study that says otherwise. Those take doing."`],
    spacing: [`"Rule 37," ${p.name} says. "One well to the section unless there's an exception, and exceptions require a hearing, and hearings require a reason."`],
    bury: [`${p.name} lights a cigarette. "I know which story you mean. It's a good story."`],
    plant: [`${p.name} shrugs. "The paper prints what it hears. Depends what it hears."`],
    drop: [`${p.name} taps the file. "This is the county's business now. I can't just lose it."`],
    loan: [`${p.name} folds ${pron(p) === 'she' ? 'her' : 'his'} hands. "The bank examiner comes in March. Tell me why I should carry you further."`],
    access: [`${p.name} leans on the gate. "I've seen what a rig does to a pasture. Tell me why I want one."`],
    townDrilling: [`${p.name} winces. "A derrick on Main Street? The council would want to know what the town gets out of it."`],
    endorse: [`${p.name} smiles. "The Lord sees all men alike, but the congregation reads the Clarion."`],
    tip: [`${p.name} pours the coffee. "People talk in here. I don't repeat it, as a rule."`],
  };
  return pick(lines[ask] || [`${p.name} waits to hear what you want.`]) + ` (${a.desc})`;
}
export function conversation(state, personRef, ask = null, opts = {}) {
  const p = personFor(state, personRef);
  if (!p) return { title: 'Nobody', text: 'There is nobody here.', speaker: { name: '', portrait: 'clerk' }, options: [{ label: 'Leave', effect() {} }] };
  const speaker = { name: p.name, portrait: portraitFor(p), title: p.title };
  const busy = p.cooldownUntil > state.month;
  if (!ask) {
    const cat = askCatalog(state, p, opts);
    const options = cat.map((c) => ({ label: c.label, disabled: !c.available || busy, hint: c.available ? c.desc : c.why, effect() {}, next: { personId: p.id, ask: c.ask } }));
    if (p.office === 'saloon') options.unshift({ label: `Buy a slice of pie and listen (${money(inflate(state, 20))})`, cost: inflate(state, 20), disabled: busy, effect(s, params, log) { const r = buyRumor(s); log?.(r.msg, 'people'); return r; } });
    options.push({ label: 'Just passing the time of day', effect(s) { p.disposition = clamp(p.disposition + 0.5, 0, 100); }, close: true });
    return { title: p.title, text: `${greeting(state, p)}${busy ? ` You have already had ${pron(p) === 'she' ? 'her' : 'his'} ear this month.` : ''}`, speaker, options, person: p.id };
  }
  const a = ASKS[ask];
  if (!a) return conversation(state, p);
  const bribe = suggestedBribe(state, p, ask);
  const dirt = dirtOn(state, p);
  const mk = (method, label, o = {}) => ({ label, method, cost: o.amount || 0, disabled: busy || o.disabled, hint: o.hint, effect(s, params, log) { const r = approach(s, p.id, method, { ...opts, ask, ...o }); log?.(r.text, r.ok ? 'people' : 'people'); return r; }, close: true });
  const options = [
    mk('persuade', 'Make the case'),
    mk('bribe', `Leave an envelope (${money(bribe)})`, { amount: bribe }),
    mk('bribe', `Leave a fat envelope (${money(bribe * 2)})`, { amount: bribe * 2 }),
  ];
  if (p.party) options.push(mk('donate', `Contribute to the campaign (${money(inflate(state, 1_000))})`, { amount: inflate(state, 1_000), hint: 'Legal. Improves disposition; does not settle the ask.' }));
  else if (p.office === 'preacher') options.push(mk('donate', `Give to the building fund (${money(inflate(state, 500))})`, { amount: inflate(state, 500) }));
  options.push(mk('favor', p.favors > 0 ? `Call in a favour (${p.favors} owed)` : 'Ask it as a favour'));
  if (dirt.length) options.push(mk('blackmail', `Mention ${dirt[0].kind}`, { dirtId: dirt[0].id, hint: 'A crime. Works on the frightened.' }));
  if (hasCowboy(state)) options.push(mk('threaten', 'Bring the cowboy along', { hint: 'A crime. Works on the timid.' }));
  options.push({ label: 'Never mind', effect() {}, next: { personId: p.id, ask: null } });
  return { title: a.label, text: askLine(state, p, ask), speaker, options, person: p.id, ask };
}

export function peopleSummary(state) {
  return Object.keys(OFFICES).map((office) => { const p = holder(state, office); return p ? { office, id: p.id, name: p.name, title: p.title, party: p.party, disposition: Math.round(p.disposition), favors: p.favors, bought: p.bought, hostile: p.hostile, dirt: dirtOn(state, p).length, termEnd: p.termEnd, portrait: portraitFor(p) } : null; }).filter(Boolean);
}
