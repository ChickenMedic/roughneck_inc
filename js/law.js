// Crimes, dirt, heat, investigations, indictments, sentences and the caretaker months when you are away.
import { rnd, rand, randInt, pick, chance } from './rng.js';
import { clamp, money, nextId } from './util.js';
import { inflate, yearOf } from './era.js';
import { reportStory } from './press.js';
import { pushEvent } from './events.js';
import { STATUTES } from './government.js';

export function initLaw() {
  return { heat: 0, stateHeat: 0, investigations: [], indictments: 0, convictions: 0, prisonUntil: -1, absentUntil: -1, statutes: {}, lawyer: null, detectiveUntil: -1, ruined: false, sentences: [], nextInv: 1, lastOpened: -99 };
}
export function statutesFor(state) { const out = {}; for (const [k, s] of Object.entries(STATUTES)) out[k] = yearOf(state) >= s.year; return out; }

const CRIME_TEXT = { bribe: 'bribery of a public official', blackmail: 'extortion', threat: 'intimidation', libel: 'criminal libel', coverup: 'concealing a death', hotOil: 'running hot oil', fraud: 'fraud', tamper: 'tampering with a witness', strikebreak: 'assault by hired men' };
export const crimeName = (c) => CRIME_TEXT[c.kind] || c.kind;

// Every crime you commit. exposure: how likely it is to come out per month of looking.
export function recordCrime(state, c) {
  state.crimes ||= [];
  const crime = { id: nextId(state), month: state.month, discovered: false, prosecuted: false, exposure: 0.3, witnesses: 1, ...c };
  state.crimes.push(crime);
  if (!c.byRival) addHeat(state, 5 + 10 * crime.exposure + (['blackmail', 'coverup'].includes(crime.kind) ? 10 : 0));
  return crime;
}
export function addHeat(state, n) { if (!state.law) return; state.law.heat = clamp(state.law.heat + n, 0, 100); }
export function addDirt(state, d) { state.dirt ||= []; const dirt = { id: nextId(state), month: state.month, used: false, strength: 0.5, ...d }; if (!state.dirt.some((x) => x.personId === dirt.personId && x.kind === dirt.kind)) state.dirt.push(dirt); return dirt; }
export function undiscoveredCrimes(state) { return (state.crimes || []).filter((c) => !c.discovered && !c.byRival && !c.stale); }

// Somebody found out. how: 'investigation'|'whistleblower'|'rival'|'witness'|'press'
export function discoverCrime(state, crime, how, log) {
  if (!crime || crime.discovered) return false;
  crime.discovered = true; crime.discoveredBy = how; crime.discoveredMonth = state.month;
  addHeat(state, 10 + 10 * crime.exposure);
  const kind = crime.kind === 'bribe' ? 'bribeExposed' : crime.kind === 'coverup' ? 'coverup' : crime.kind === 'libel' ? 'libelExposed' : crime.kind === 'hotOil' ? 'hotOil' : how === 'whistleblower' ? 'whistleblower' : crime.kind === 'blackmail' ? 'blackmail' : crime.kind === 'threat' ? 'threat' : 'generic';
  const s = reportStory(state, kind, { person: crime.person, rival: crime.rival, well: crime.well, amount: crime.amount, crimeId: crime.id, text: `${crimeName(crime)} charged` });
  if (log) log(`${how === 'whistleblower' ? 'A former employee' : how === 'rival' ? 'An anonymous letter' : how === 'investigation' ? 'The sheriff\'s men' : 'Somebody'} put the ${crimeName(crime)} of ${monthName(crime.month)} on the record.`, 'law');
  return s;
}
const monthName = (m) => { const y = 1952 + Math.floor((m + 8) / 12); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m + 8) % 12]} ${y}`; };

export function openInvestigation(state, by, log) {
  const L = state.law;
  const inv = { id: L.nextInv++, by, opened: state.month, progress: 0, evidence: 0, crimeIds: [], status: 'open', stalled: 0 };
  L.investigations.push(inv); L.lastOpened = state.month;
  reportStory(state, 'investigation', { by });
  if (log) log(by === 'sheriff' ? `The sheriff has opened a file on ${state.company.name}. His deputy is asking questions at the cafe.` : by === 'state' ? `Two men from the state attorney general's office have taken rooms at the hotel. They are asking about ${state.company.name}.` : `Federal agents are in the county. They have a subpoena for your bank records.`, 'law');
  return inv;
}
export function closeInvestigations(state, by, why = 'closed') {
  let n = 0;
  for (const inv of state.law.investigations) if (inv.status === 'open' && (!by || inv.by === by)) { inv.status = why; inv.closed = state.month; n++; }
  return n;
}
export function openInvestigations(state) { return (state.law?.investigations || []).filter((i) => i.status === 'open'); }

export function tickLaw(state, log) {
  const L = state.law;
  if (!L) return;
  const sheriff = state.people?.[state.offices?.sheriff];
  const honesty = sheriff ? sheriff.honesty : 0.5;
  const sheriffBought = !!(sheriff && sheriff.bought);
  const $ = (v) => inflate(state, v);
  // Heat decays; a bought sheriff loses paperwork.
  L.heat = Math.max(0, L.heat - (sheriffBought ? 3 : 2));
  // Prison / absence bookkeeping.
  if (L.absentUntil > 0 && L.absentUntil === state.month) { log(`You walk out of the state penitentiary at McAlester with a cardboard suitcase. ${state.company.name} is still in business, more or less.`, 'law'); L.absentUntil = -1; L.prisonUntil = -1; }
  // The detective.
  if (L.detectiveUntil > state.month) detectiveTick(state, log);
  // Old crimes are forgotten; recent ones leak. Somebody saw the envelope, somebody's wife talks at church.
  for (const c of state.crimes || []) if (!c.discovered && !c.stale && state.month - c.month > 120) c.stale = true;
  const undiscovered = undiscoveredCrimes(state);
  for (const c of undiscovered) if (chance(0.012 * c.exposure * (1 + (c.witnesses || 1) / 4) * (0.5 + honesty))) { discoverCrime(state, c, 'witness', log); break; }
  // Whistleblowers: unhappy staff with something to tell.
  if (undiscovered.length) for (const s of state.staff) if ((s.loyalty ?? 60) < 30 && chance(0.08)) { const c = pick(undiscovered); discoverCrime(state, c, 'whistleblower', log); log(`${s.name} talked. ${s.name} has left the company and taken a job with the state.`, 'law'); state.staff = state.staff.filter((x) => x !== s); break; }
  // Open investigations.
  const open = openInvestigations(state);
  const knownCrimes = (state.crimes || []).filter((c) => c.discovered && !c.prosecuted && !c.byRival).length;
  if (!open.some((i) => i.by === 'sheriff') && (L.heat > 50 || (L.heat > 30 && knownCrimes)) && state.month - L.lastOpened > 6) {
    const p = 0.12 * (0.5 + honesty) * (sheriffBought ? 0.3 : 1) * (1 + state.env.activism / 100) * (L.heat > 60 ? 1.5 : 1);
    if (chance(p)) openInvestigation(state, 'sheriff', log);
  }
  if (!open.some((i) => i.by === 'state') && (L.heat > 60 || (sheriffBought && L.heat > 45)) && state.month - L.lastOpened > 3 && chance(0.1)) openInvestigation(state, 'state', log);
  if (!open.some((i) => i.by === 'federal') && L.convictions >= 1 && L.heat > 70 && chance(0.04)) openInvestigation(state, 'federal', log);
  for (const inv of openInvestigations(state)) {
    const invHonesty = inv.by === 'sheriff' ? honesty : 0.85;
    const known = (state.crimes || []).filter((c) => c.discovered && !c.prosecuted && !c.byRival);
    const lawyer = L.lawyer && L.lawyer.until > state.month;
    let gain = 2 + 6 * invHonesty + 4 * Math.min(known.length, 4) - (lawyer ? 4 : 0) - (inv.by === 'sheriff' && sheriffBought ? 5 : 0);
    // Digging turns up undiscovered crimes.
    const hidden = undiscoveredCrimes(state);
    if (hidden.length) { const c = pick(hidden); if (chance(0.15 * c.exposure * (0.5 + invHonesty) * (inv.by === 'sheriff' ? 1 : 1.5))) { discoverCrime(state, c, 'investigation', log); gain += 10; } }
    if (!known.length && !hidden.length) { gain = Math.min(gain, 2); inv.stalled++; } else inv.stalled = 0;
    inv.evidence = clamp(inv.evidence + Math.max(0, gain), 0, 100); inv.progress++;
    for (const c of known) if (!inv.crimeIds.includes(c.id)) inv.crimeIds.push(c.id);
    if (inv.stalled >= 6 || (inv.progress > 18 && inv.evidence < 40)) { inv.status = 'closed'; inv.closed = state.month; log(`The ${inv.by === 'sheriff' ? 'sheriff' : 'state'} closed the file on ${state.company.name}. "Nothing to it," ${inv.by === 'sheriff' ? 'he' : 'they'} said, a little sadly.`, 'law'); continue; }
    if (inv.evidence >= 55 && known.length && !state.pending.some((e) => e.id === 'indictment')) {
      inv.status = 'charged'; inv.charged = state.month; L.indictments++;
      for (const c of known) c.prosecuted = true;
      const charge = known.length ? crimeName(known[0]) : 'conspiracy';
      reportStory(state, 'indictment', { charge });
      pushEvent(state, 'indictment', { invId: inv.id, by: inv.by, charge, evidence: Math.round(inv.evidence), crimeIds: inv.crimeIds.slice(), lawyerCost: $(2_500), bribe: $(3_000) });
      log(`The grand jury returned a true bill: ${charge}. You are to appear before the district court.`, 'law');
    }
  }
}

function detectiveTick(state, log) {
  const people = Object.values(state.people || {}).filter((p) => p.office && p.secrets.some((s) => !(state.dirt || []).some((d) => d.personId === p.id && d.kind === s.kind)));
  const rivalCrimes = (state.crimes || []).filter((c) => c.byRival && !c.discovered);
  if (rivalCrimes.length && chance(0.3)) { const c = pick(rivalCrimes); c.discovered = true; addDirt(state, { personId: `comp:${c.rival}`, kind: c.kindText || c.kind, strength: 0.7, source: 'detective' }); log(`Your detective reports: ${c.rival} ${c.kindText || 'has been up to something at the courthouse'}. He has a witness.`, 'law'); return; }
  if (people.length && chance(0.5)) { const p = pick(people); const s = p.secrets.find((s) => !(state.dirt || []).some((d) => d.personId === p.id && d.kind === s.kind)); addDirt(state, { personId: p.id, kind: s.kind, strength: s.strength, source: 'detective' }); p.dirtKnown = (p.dirtKnown || 0) + 1; log(`Your detective's report on ${p.name} (${p.title}) mentions ${s.kind}. There are photographs.`, 'law'); }
  else if (chance(0.3)) log('Your detective reports a quiet month and bills for mileage.', 'law');
}
export function detectiveCost(state) { return inflate(state, 400); }
export function hireDetective(state, months = 1) {
  const cost = detectiveCost(state) * months;
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford the man from Tulsa.' };
  state.company.cash -= cost; state.ledger.other += cost;
  state.law.detectiveUntil = Math.max(state.law.detectiveUntil, state.month) + months;
  const msg = `A private detective from Tulsa takes a room at the hotel for ${months} month${months > 1 ? 's' : ''} (${money(cost)}). He will find out what people would rather you did not know.`;
  state.log?.(msg, 'law');
  return { ok: true, msg, cost };
}
export function hireLawyer(state, months = 12) {
  const cost = inflate(state, 600) * months;
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford the retainer.' };
  state.company.cash -= cost; state.ledger.fines += cost;
  state.law.lawyer = { until: state.month + months, name: pick(['Judge Whitlock (retired)', 'Cravens & Duvall', 'T. Underhill, Attorney']) };
  return { ok: true, msg: `${state.law.lawyer.name} is on retainer for ${months} months (${money(cost)}). Investigations move slower and juries hear better arguments.`, cost };
}

// --- Sentences --------------------------------------------------------------------------
export function sentence(state, kind, log, ctx = {}) {
  const L = state.law;
  const $ = (v) => inflate(state, v);
  L.sentences.push({ month: state.month, kind });
  if (kind === 'fine') {
    const fine = $(Math.round(rand(3_000, 9_000) / 100) * 100);
    state.company.cash -= fine; state.ledger.fines += fine;
    state.permits.freezeUntil = Math.max(state.permits.freezeUntil, state.month + 6);
    L.convictions++;
    reportStory(state, 'conviction', {});
    log(`CONVICTED. The judge fines you ${money(fine)} and the commission suspends your permits for six months. The Clarion runs your photograph.`, 'law');
    state.press.notoriety = Math.min(100, state.press.notoriety + 10);
  } else if (kind === 'prison') {
    L.convictions++;
    L.prisonUntil = state.month + 24; L.absentUntil = state.month + 24;
    state.permits.freezeUntil = Math.max(state.permits.freezeUntil, state.month + 12);
    reportStory(state, 'prison', {});
    log(`CONVICTED. Two years in the state penitentiary. Your bookkeeper will keep the lights on; nobody will drill, and your staff will drift.`, 'law');
  } else if (kind === 'ruin') {
    L.convictions++; L.ruined = true; state.company.bankrupt = true;
    reportStory(state, 'conviction', {});
    log(`CONVICTED. ${ctx.why || 'The judge calls it the worst case of its kind in the history of the district.'} Ten years. The bank calls the note, the leases go on the courthouse steps, and ${state.company.name} is finished.`, 'law');
  }
  if (L.convictions >= 3 && !L.ruined) { L.ruined = true; state.company.bankrupt = true; log(`A third conviction. The commission revokes your operator's licence. ${state.company.name} is finished.`, 'law'); }
}
// Severity of the charges on an investigation: death coverups and repeat offenders go to prison or worse.
export function severityFor(state, inv) {
  const crimes = (state.crimes || []).filter((c) => inv?.crimeIds?.includes(c.id));
  if (crimes.some((c) => c.kind === 'coverup')) return 'ruin';
  if (state.law.convictions >= 2) return 'ruin';
  if (crimes.some((c) => ['blackmail', 'hotOil'].includes(c.kind)) || (inv?.evidence ?? 0) > 80 || state.law.convictions >= 1) return 'prison';
  return 'fine';
}

// Caretaker months: you are away, the office runs itself badly.
export function caretakerTick(state, log) {
  const L = state.law;
  if (!(L.absentUntil > state.month)) return false;
  if (state.staff.length && chance(0.08)) { const s = pick(state.staff); state.staff = state.staff.filter((x) => x !== s); log(`${s.name} gave notice. "Nothing personal. There's nobody here to work for."`, 'staff'); }
  // Outsiders (not the founders on the payroll) holding half the stock can vote you out while you are away.
  const founderEquity = state.staff.reduce((a, s) => a + (s.founder ? s.equity || 0 : 0), 0);
  if (state.company.equitySold - founderEquity >= 0.5 && chance(0.03)) { L.ruined = true; state.company.bankrupt = true; log(`${state.flags?.boardPressure ? 'Mr. Cravens and the other shareholders' : "The Houston syndicate's lawyer"} called a shareholders' meeting you could not attend. You have been voted out of your own company.`, 'company'); }
  return true;
}

export function lawSummary(state) {
  const L = state.law;
  return { heat: Math.round(L.heat), investigations: openInvestigations(state).map((i) => ({ by: i.by, evidence: Math.round(i.evidence), months: state.month - i.opened })), indictments: L.indictments, convictions: L.convictions, absentUntil: L.absentUntil, lawyer: L.lawyer && L.lawyer.until > state.month ? L.lawyer.name : null, detective: L.detectiveUntil > state.month, crimes: (state.crimes || []).filter((c) => !c.byRival).map((c) => ({ kind: crimeName(c), month: c.month, discovered: c.discovered, prosecuted: c.prosecuted })), dirt: (state.dirt || []).filter((d) => !d.used) };
}
