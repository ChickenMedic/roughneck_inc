// Hiring, skills, traits, and who actually does the work.
import { rnd, rand, randInt, pick, chance, gauss } from './rng.js';
import { clamp, nextId } from './util.js';
import { ROLES, ROLE_KEYS, TRAITS, FIRST, LAST } from './data.js';
import { inflate, costIndexAt, yearFrac, calMonth } from './era.js';

// Monthly salary in 1952 dollars; inflated to the current year when a candidate is generated.
export function baseSalary(skill) { return 180 + skill * skill * 14; }
export function salaryFor(skill, traits, state = null) {
  let s = baseSalary(skill);
  if (traits.includes('pricey')) s *= 1.3;
  if (traits.includes('frugal')) s *= 0.75;
  if (state) s = inflate(state, s);
  return Math.round(s / 5) * 5;
}

// Loyalty starts from temperament, not the dice, so the candidate stream is unchanged from earlier versions.
export function startingLoyalty(c) { return clamp(45 + 2 * (c.skill || 4) + (c.traits.includes('loyal') ? 20 : 0) - (c.traits.includes('restless') ? 15 : 0) + ((c.years || 10) % 7) * 2, 20, 90); }
export function makeCandidate(state, role, bias = 0) {
  const skill = clamp(Math.round(gauss(4.5 + bias, 2)), 1, 10);
  const traits = [];
  const pool = Object.keys(TRAITS);
  const n = chance(0.15) ? 2 : chance(0.75) ? 1 : 0;
  while (traits.length < n) {
    const t = pick(pool);
    if (traits.includes(t)) continue;
    if ((t === 'pricey' && traits.includes('frugal')) || (t === 'frugal' && traits.includes('pricey'))) continue;
    if ((t === 'loyal' && traits.includes('restless')) || (t === 'restless' && traits.includes('loyal'))) continue;
    if ((t === 'cowboy' && traits.includes('bythebook')) || (t === 'bythebook' && traits.includes('cowboy'))) continue;
    if ((t === 'veteran' && traits.includes('shale')) || (t === 'shale' && traits.includes('veteran'))) continue;
    traits.push(t);
  }
  const c = {
    id: nextId(state), name: `${pick(FIRST)} ${pick(LAST)}`, role, skill, traits,
    salary: salaryFor(skill, traits, state), busyUntil: -1, task: null, hiredMonth: -1, awayUntil: -1,
    years: randInt(2, 30),
  };
  c.loyalty = startingLoyalty(c);
  return c;
}

export function refreshCandidates(state) {
  const rep = state.company.reputation;
  const bias = (rep - 50) / 40; // good reputation attracts talent
  const list = [];
  for (const role of ROLE_KEYS) {
    const n = chance(0.6) ? 1 : chance(0.5) ? 2 : 0;
    for (let i = 0; i < n; i++) list.push(makeCandidate(state, role, bias));
  }
  while (list.length < 6) list.push(makeCandidate(state, pick(ROLE_KEYS), bias));
  state.candidates = list;
  state.candidatesRefreshed = state.month;
}

export function hire(state, cand) {
  const bonus = cand.salary; // signing bonus = one month
  if (state.company.cash - bonus < -state.company.creditLimit) return { ok: false, msg: 'Not enough cash or credit for the signing bonus.' };
  state.company.cash -= bonus;
  state.ledger.salaries += bonus;
  cand.hiredMonth = state.month;
  state.staff.push(cand);
  state.candidates = state.candidates.filter((c) => c.id !== cand.id);
  return { ok: true };
}

// A founder holds equity; letting one go means buying it back at the company's current value.
export function founderBuyout(state, s) { return s && s.founder && s.equity ? Math.round(s.equity * Math.max(state.company.value || 0, 0)) : 0; }
export function fire(state, id) {
  const s = state.staff.find((x) => x.id === id);
  if (!s) return { ok: false };
  if (s.busyUntil > state.month) return { ok: false, msg: `${s.name} is in the middle of a job. Wait until it finishes.` };
  const sev = s.salary * 2;
  const buyout = founderBuyout(state, s);
  if (buyout && state.company.cash - sev - buyout < -state.company.creditLimit) return { ok: false, msg: `${s.name} is a partner. Buying out ${Math.round(s.equity * 100)}% of the company costs ${buyout.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} and you cannot cover it.` };
  state.company.cash -= sev + buyout;
  state.ledger.salaries += sev;
  if (buyout) { state.ledger.other += buyout; }
  if (s.founder && s.equity) state.company.equitySold = Math.max(0, Math.round((state.company.equitySold - s.equity) * 1000) / 1000);
  state.staff = state.staff.filter((x) => x.id !== id);
  return { ok: true, severance: sev, buyout };
}

// Effective skill of one person for a given context. ctx: { target: 'sand'|'shale' }
export function effSkill(state, s, ctx = {}) {
  let k = s.skill;
  if (ctx.target === 'sand') { if (s.traits.includes('veteran')) k += 1; if (s.traits.includes('shale')) k -= 1; }
  if (ctx.target === 'shale') { if (s.traits.includes('shale')) k += 1; if (s.traits.includes('veteran')) k -= 1; }
  if (state.staff.some((o) => o !== s && o.role === s.role && o.traits.includes('mentor') && o.awayUntil <= state.month)) k += 1;
  return clamp(k, 1, 11);
}

// Everyone in a role who is present and not locked into a task.
export function available(state, role) {
  return state.staff.filter((s) => s.role === role && s.busyUntil <= state.month && s.awayUntil <= state.month);
}

// Best present skill for continuous roles (production, marketing, gov, pr). Baseline 2 if no one.
export function roleSkill(state, role, ctx = {}) {
  const present = state.staff.filter((s) => s.role === role && s.awayUntil <= state.month);
  if (!present.length) return 2;
  return Math.max(...present.map((s) => effSkill(state, s, ctx)));
}
export function hasRole(state, role) { return state.staff.some((s) => s.role === role); }

// A contractor for one job: unknown quality, expensive fee.
export function contractorFee(state) { return inflate(state, Math.round(baseSalary(6) * 1.6)); }
export function makeContractor(state, role) {
  const skill = randInt(2, 6);
  return { id: -1, name: `Contract ${ROLES[role].name.toLowerCase()} (${pick(['Jessup Bros. Rotary', 'Basin Field Service', 'Tri-County Engineering Co.', 'Kessler & Sons'])})`, role, skill, traits: [], salary: 0, contractor: true, fee: contractorFee(state) };
}

export function speedMult(s) { let m = 1; if (s.traits.includes('cowboy')) m *= 0.75; if (s.traits.includes('bythebook')) m *= 1.2; return m; }
export function riskMult(s) { let m = 1; if (s.traits.includes('cowboy')) m *= 1.5; if (s.traits.includes('bythebook')) m *= 0.6; return m; }

export function assignTask(state, s, task, months) {
  if (!s || s.contractor) return;
  s.busyUntil = state.month + Math.max(1, Math.round(months * speedMult(s)));
  s.task = task;
}

export function monthlyStaff(state, log) {
  // Cost-of-living adjustment every January so a 1952 salary does not stay at $500 in 1980.
  if (calMonth(state) === 0 && state.month > 0) {
    const f = costIndexAt(yearFrac(state)) / costIndexAt(yearFrac(state) - 1);
    for (const s of state.staff) s.salary = Math.round(s.salary * f / 5) * 5;
  }
  let total = 0;
  const wageMult = state.labor?.wageMult || 1;
  for (const s of state.staff) {
    total += Math.round(s.salary * wageMult);
    if (s.loyalty === undefined) s.loyalty = 60;
    if (s.busyUntil <= state.month) s.task = null;
    if (s.traits.includes('unreliable') && s.awayUntil <= state.month && chance(0.06)) {
      s.awayUntil = state.month + 1;
      log(`${s.name} (${ROLES[s.role].name}) has not shown up this month. Nobody knows where they are.`, 'staff');
    }
  }
  state.company.cash -= total;
  state.ledger.salaries += total;
  if (state.month - (state.candidatesRefreshed ?? -99) >= 3) refreshCandidates(state);
}

export function roleName(role) { return ROLES[role].name; }
export function traitNames(s) { return s.traits.map((t) => TRAITS[t].name).join(', '); }
