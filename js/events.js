// Decision events. Definitions are static; pending events are stored as {id, params, month, system} so saves stay plain JSON.
// Every dollar amount is a 1952 base run through inflate(). `weight(s)` (optional) biases the monthly pick.
// `speaker` is {name, portrait} or a function (state, params) => {name, portrait}; `text` is a function (state, params).
// `caretaker` is the option index the bookkeeper picks while you are away (default: the last one).
import { rnd, rand, randInt, chance, pick } from './rng.js';
import { clamp, money } from './util.js';
import { activeWells, producingWells } from './wells.js';
import { ROLES } from './data.js';
import { salaryFor, makeCandidate } from './staff.js';
import { inflate, yearOf, calMonth } from './era.js';
import { techAvailable } from './tech.js';
import { createGasMarket, gasAnchor, oilAnchor } from './market.js';
import { statute } from './government.js';
import { reportStory } from './press.js';
import { recordCrime, discoverCrime, addHeat, addDirt, sentence, severityFor, hireLawyer, undiscoveredCrimes } from './law.js';
import { giveRaise } from './labor.js';
import { damage } from './disasters.js';
import { holder, approach, portraitFor } from './people.js';

const rep = (s, d) => (s.company.reputation = clamp(s.company.reputation + d, 0, 100));
const act = (s, d) => (s.env.activism = clamp(s.env.activism + d, 0, 100));
const goodwill = (s, d) => { if (s.press) s.press.goodwill = clamp(s.press.goodwill + d, 0, 60); };
const cash = (s, d, cat = 'other') => { s.company.cash += d; s.ledger[cat] -= d; };
const $ = (s, v) => inflate(s, v);
const activeRivals = (s) => s.competitors.filter((c) => !c.dormant).map((c) => c.name);
const disp = (p, d) => (p.surface.disposition = clamp(p.surface.disposition + d, 0, 100));
const person = (s, office) => holder(s, office);
const who = (s, office, fallback, portrait) => { const p = person(s, office); return p ? { name: p.name, portrait: portraitFor(p), title: p.title } : { name: fallback, portrait }; };
const wellById = (s, id) => s.wells.find((w) => w.id === id);
const electionYear = (s) => yearOf(s) >= 1954 && yearOf(s) % 2 === 0;
// Equity held by people who are not founders on the payroll (the Houston syndicate, Cravens, the widow, the church).
const outsideEquity = (s) => Math.max(0, (s.company.equitySold || 0) - s.staff.reduce((a, st) => a + (st.founder ? st.equity || 0 : 0), 0));
// Cravens out of patience: a mismanagement suit in Dallas, settled for a sum, and a story in the Clarion.
function escalate(s, b, log) {
  const fine = $(s, 5_000);
  cash(s, -fine, 'fines'); b.patience = 40; b.last = s.month;
  reportStory(s, 'generic', { text: `DALLAS SHAREHOLDER SUES ${s.company.name.toUpperCase()} FOR MISMANAGEMENT`, repHit: 5 });
  log(`Cravens filed a mismanagement suit in Dallas district court and settled it for ${money(fine)} the week before trial. The Clarion printed the petition.`, 'company');
}

export const EVENTS = {
  // ---------------------------------------------------------------- the originals, in period
  investor: {
    when: (s) => s.month > 6 && s.company.cash < $(s, 20_000) && outsideEquity(s) < 0.5,
    title: 'Money from Houston', speaker: { name: 'A lawyer from Houston', portrait: 'banker' },
    text: (s, p) => `A syndicate of Houston doctors and one lawyer offers ${money(p.amount)} for a 30% interest in the company. The lawyer will want a seat at the table. Every share you sell reduces your final score.`,
    params: (s) => ({ amount: Math.round(Math.max($(s, 60_000), 0.3 * Math.max(0, s.company.value) * rand(0.6, 0.9)) / 100) * 100 }),
    options: [
      { label: 'Take the money', effect(s, p, log) { cash(s, p.amount); s.company.equitySold += 0.3; log(`Sold 30% of the company to the Houston syndicate for ${money(p.amount)}. Their lawyer now attends your meetings and orders the steak.`, 'company'); } },
      { label: 'Decline politely', effect(s, p, log) { log('You declined the syndicate. The lawyer says the offer stands "for a while".', 'company'); } },
    ],
  },
  journalist: {
    when: (s) => s.month_prod.flared > 5_000 && (yearOf(s) >= 1965 || s.env.activism > 30),
    title: 'A reporter asks about the flares', speaker: (s) => who(s, 'editor', 'A reporter from the Clarion', 'reporter'),
    text: (s) => `A reporter from the Clarion drove out at night with a Speed Graphic and photographed your flares lighting up the sky over Coyote Creek. ${yearOf(s) < 1975 ? 'He wants a comment before it runs Thursday.' : 'She wants a comment before it runs Thursday.'}`,
    options: [
      { label: '"No comment."', effect(s, p, log) { reportStory(s, 'generic', { text: `${s.company.name} FLARES LIGHT THE SKY; "NO COMMENT"`, repHit: 4 }); log('The story runs with the photograph and the words "declined to comment".', 'env'); } },
      { label: 'Explain that flaring is normal and safe', effect(s, p, log) { if (chance(0.4)) { log('The reporter quoted you accurately. Nobody read past the photograph.', 'env'); } else { reportStory(s, 'generic', { text: 'OIL MAN CALLS FLARE "A BIG CANDLE"', repHit: 7 }); act(s, 5); log('Your remark that a flare is "basically a big candle" was repeated in every cafe in the county.', 'env'); } } },
      { label: 'Pledge to hook the gas to a pipeline within a year', effect(s, p, log) { goodwill(s, 3); act(s, -4); s.env.pledges.push({ type: 'gathering', due: s.month + 12 }); log('You pledged to end routine flaring within 12 months. The reporter wrote the date in his notebook.', 'env'); } },
    ],
  },
  cattle: {
    when: (s) => activeWells(s).some((w) => ['farmer', 'rancher'].includes(s.parcels[w.parcelId].surface.type)),
    title: 'Sick cattle', speaker: (s, p) => ({ name: p.owner, portrait: 'rancher' }),
    text: (s, p) => `${p.owner} says six cows died after drinking from a stock tank downhill of your pit at ${p.farm}. He wants ${money(p.claim)} and an apology. Fighting it in district court costs about ${money(p.court)} in lawyers; an honest investigation by the state college lab is ${money(p.lab)}.`,
    params: (s) => { const w = pick(activeWells(s).filter((w) => ['farmer', 'rancher'].includes(s.parcels[w.parcelId].surface.type))); const pc = s.parcels[w.parcelId]; return { pid: pc.id, owner: pc.surface.ownerPerson, farm: pc.surface.name, claim: $(s, 1_500), court: $(s, 2_000), damages: $(s, 4_500), lab: $(s, 600), fix: $(s, 2_500) }; },
    options: [
      { label: 'Pay quietly', effect(s, p, log) { cash(s, -p.claim, 'fines'); disp(s.parcels[p.pid], 5); if (chance(0.25)) { reportStory(s, 'generic', { text: 'HUSH MONEY FOR DEAD COWS, CAFE CROWD SAYS', repHit: 6 }); log('The quiet settlement got around. "Hush money for dead cows" is what they call it at the cafe.', 'env'); } else log('Settled. The rancher took the cheque and shook your hand, once.', 'land'); } },
      { label: 'Fight it in district court', effect(s, p, log) { cash(s, -p.court, 'fines'); disp(s.parcels[p.pid], -25); if (chance(0.5)) { log('The judge found no link between your pit and the tank. The rancher glares at your trucks every morning.', 'land'); } else { cash(s, -p.damages, 'fines'); reportStory(s, 'generic', { text: 'OIL COMPANY FIGHTS GRIEVING RANCHER, LOSES', repHit: 7 }); act(s, 5); log(`You lost. Damages of ${money(p.damages)} plus the Clarion headline "Oil Company Fights Grieving Rancher".`, 'env'); } } },
      { label: 'Commission an honest investigation', effect(s, p, log) { cash(s, -p.lab, 'other'); if (chance(0.5)) { cash(s, -p.fix, 'fines'); goodwill(s, 2); s.env.score = clamp(s.env.score - 3, 0, 100); log(`It was your salt water. You paid ${money(p.fix)}, fixed the berm, and the rancher, grudgingly, respects that.`, 'env'); } else { goodwill(s, 3); log('The state college lab found blue-green algae. Not you. You paid for the report and the vet bill anyway.', 'land'); } } },
    ],
  },
  poach: {
    when: (s) => s.company.cash > $(s, 15_000) && s.staff.some((st) => !st.founder && !st.traits.includes('loyal') && st.skill >= 6 && st.salary < 1.8 * salaryFor(st.skill, st.traits, s)),
    title: 'A rival wants your people', speaker: (s, p) => ({ name: p.name, portrait: p.portrait || 'roughneck' }),
    text: (s, p) => `${p.rival} has offered ${p.name} (${p.role}, skill ${p.skill}) a 30% raise. ${p.name} asks if you'd match it.`,
    params: (s, o = {}) => { const c = s.staff.filter((st) => !st.founder && !st.traits.includes('loyal') && (o.sid ? st.id === o.sid : st.skill >= 6 && st.salary < 1.8 * salaryFor(st.skill, st.traits, s))); const pool = c.length ? c : s.staff.filter((st) => !st.founder).length ? s.staff.filter((st) => !st.founder) : s.staff; const st = pick(pool.filter((x) => x.traits.includes('restless')).length && chance(0.7) ? pool.filter((x) => x.traits.includes('restless')) : pool); return { sid: st.id, name: st.name, role: ROLES[st.role].name, skill: st.skill, rival: o.rival || pick(activeRivals(s)), portrait: { geologist: 'geologist', landman: 'landman', driller: 'roughneck', completions: 'roughneck', production: 'roughneck', marketing: 'clerk', govaffairs: 'clerk', pr: 'clerk' }[st.role] }; },
    options: [
      { label: 'Match the raise', effect(s, p, log) { const st = s.staff.find((x) => x.id === p.sid); if (st) { st.salary = Math.round(st.salary * 1.3 / 5) * 5; st.loyalty = clamp((st.loyalty ?? 60) + 10, 0, 100); log(`${p.name} stays, at $${st.salary.toLocaleString()}/month.`, 'staff'); } } },
      { label: 'Wish them well', effect(s, p, log) { s.staff = s.staff.filter((x) => x.id !== p.sid); log(`${p.name} left for ${p.rival}. They took the good coffee cup.`, 'staff'); } },
    ],
  },
  steelShortage: {
    when: (s) => !s.flags.steelShortage && (yearOf(s) <= 1953 || (yearOf(s) >= 2005 && techAvailable(s, 'shale')) || (s.market.regime === 'shock' && s.market.oil > 1.25 * oilAnchor(s.month))),
    title: 'Materials on allocation', speaker: { name: 'The supply house', portrait: 'clerk' },
    text: (s) => (yearOf(s) <= 1953 ? 'The Korean War steel controls put oil-country tubular goods on allocation. Casing is scarce and the supply house wants a premium. Drilling costs +25% for six months.' : 'Every operator in the basin is drilling at once. Casing, crews and sand are booked solid. Drilling and pumping costs +25-30% for six months.'),
    options: [{ label: 'Noted', effect(s, p, log) { s.flags.steelShortage = s.month + 6; } }],
  },
  dinner: {
    when: (s) => s.month > 3,
    title: 'The Congressman\'s barbecue', speaker: { name: 'Congressman Colby Vance', portrait: 'mayor' },
    text: (s, p) => `An invitation arrives for Congressman Colby Vance's "Friends of Oil" barbecue at the fairgrounds. A table for eight is ${money(p.cost)}. The brisket is included.`,
    params: (s) => ({ cost: $(s, 600) }),
    options: [
      { label: 'Buy a table', effect(s, p, log) { cash(s, -p.cost); for (const o of ['judge', 'mayor', 'sheriff']) { const q = person(s, o); if (q) q.disposition = clamp(q.disposition + 6, 0, 100); } if (chance(0.06)) { reportStory(s, 'generic', { text: 'OIL MAN LAUGHS WITH CONGRESSMAN BESIDE FARMER WITH JAR OF BAD WATER', repHit: 8 }); log('The Clarion ran a photograph of you laughing with the Congressman beside a farmer holding a jar of bad water.', 'gov'); } else log('You sat beside the Congressman. He remembered your name by the pie. The courthouse crowd noticed.', 'gov'); } },
      { label: 'Skip it', effect(s, p, log) { log('You skipped the barbecue. A rival sat at your table.', 'gov'); } },
    ],
  },
  rigDeal: {
    when: (s) => !s.flags.rigCredits && s.company.cash > $(s, 30_000),
    title: 'A drilling contractor offers a package', speaker: { name: 'Jessup Bros. Rotary', portrait: 'roughneck' },
    text: (s, p) => `Jessup Bros. Rotary has a rig sitting idle in the yard. Prepay ${money(p.cost)} now and your next three wells drill at 20% off.`,
    params: (s) => ({ cost: $(s, 12_000) }),
    options: [
      { label: 'Prepay the contractor', effect(s, p, log) { cash(s, -p.cost, 'capex'); s.flags.rigCredits = 3; log('Rig contract signed. Your next three wells drill 20% cheaper.', 'wells'); } },
      { label: 'Pass', effect() {} },
    ],
  },
  school: {
    when: (s) => s.month > 2,
    title: 'The school board calls', speaker: { name: 'The school board president', portrait: 'clerk' },
    text: (s, p) => `Dry Fork School needs ${money(p.cost)} for a new roof. The board president is also the county clerk who files your permits.`,
    params: (s) => ({ cost: $(s, 250) }),
    options: [
      { label: 'Donate', effect(s, p, log) { cash(s, -p.cost); goodwill(s, 3); const j = person(s, 'judge'); if (j) j.disposition = clamp(j.disposition + 3, 0, 100); for (const pc of s.parcels) disp(pc, 3); s.env.communitySpend += p.cost; reportStory(s, 'community', { what: 'SCHOOL ROOF' }); log('The new roof has a brass plate with your name on it.', 'env'); } },
      { label: 'Decline', effect(s, p, log) { rep(s, -1); } },
    ],
  },
  leaseBuyer: {
    when: (s) => s.parcels.some((p) => p.mineral.leasedBy === 'player' && !p.wells.length),
    title: 'Offer for your acreage', speaker: { name: 'A landman for Prairie Royalty & Land', portrait: 'landman' },
    text: (s, p) => `Prairie Royalty & Land offers ${money(p.offer)} for your undrilled lease on ${p.farm}. You paid ${money(p.paid)}.`,
    params: (s) => { const pc = pick(s.parcels.filter((p) => p.mineral.leasedBy === 'player' && !p.wells.length)); const hot = techAvailable(s, 'shale') ? pc.truth.shale.quality : (pc.truth.sand.onStructure ? 0.7 : 0.15); return { pid: pc.id, farm: pc.surface.name, paid: pc.mineral.lease.bonus, offer: Math.round(pc.mineral.lease.bonus * (0.9 + 2.5 * hot) * rand(0.8, 1.2)) }; },
    options: [
      { label: 'Sell', effect(s, p, log) { const pc = s.parcels[p.pid]; cash(s, p.offer, 'land'); pc.mineral.lease = null; pc.mineral.leasedBy = 'Prairie Royalty & Land'; pc.mineral.leaseUntil = s.month + 36; s.competitors.find((c) => c.name === 'Prairie Royalty & Land')?.held.push(pc.id); log(`Sold the ${p.farm} lease for ${money(p.offer)}.`, 'land'); } },
      { label: 'Keep it', effect() {} },
    ],
  },
  whistleblower: {
    when: (s) => s.env.score < 45 && activeWells(s).length > 2,
    title: 'A pumper talks', speaker: { name: 'A lawyer for a former pumper', portrait: 'clerk' },
    text: (s, p) => `A pumper you let go tells the state commission your run tickets and pit reports were "creative". His lawyer suggests ${money(p.settle)} would be cheaper than a hearing. Lose the hearing and the penalties could run to ${money(p.penalty)}.`,
    params: (s) => ({ settle: $(s, 4_000), penalty: $(s, 13_000) }),
    options: [
      { label: 'Settle', effect(s, p, log) { cash(s, -p.settle, 'fines'); log('Settled with the pumper. The commission received "corrected" reports.', 'gov'); } },
      { label: 'Fight it', effect(s, p, log) { if (chance(0.45)) log('The hearing collapsed when the pumper failed to appear. Your lawyer sends a large bill and a small bottle of bourbon.', 'gov'); else { cash(s, -p.penalty, 'fines'); reportStory(s, 'whistleblower', {}); addHeat(s, 10); const i = person(s, 'inspector'); if (i) i.disposition = clamp(i.disposition - 15, 0, 100); log(`The ledgers came out at the hearing. ${money(p.penalty)} in penalties and a very bad week.`, 'gov'); } } },
    ],
  },
  magazinePhotographer: {
    when: (s) => yearOf(s) >= 1970 && s.env.activism > 45,
    title: 'A magazine photographer in town', speaker: { name: 'A photographer from back East', portrait: 'reporter' },
    text: (s, p) => `A photographer on assignment for a national magazine is shooting a story on "the price of oil country". Your gate is in the contact sheets. Advertisements in the same issue would run about ${money(p.cost)}.`,
    params: (s) => ({ cost: $(s, 2_000) }),
    options: [
      { label: 'Invite him on a lease tour', effect(s, p, log) { const sk = Math.max(...s.staff.filter((x) => x.role === 'pr').map((x) => x.skill), 2); if (chance(0.3 + sk * 0.06)) { goodwill(s, 5); act(s, -6); log('Your community man gave a candid tour. The spread shows your reseeded pads. Almost fair.', 'env'); } else { reportStory(s, 'magazine', {}); act(s, 6); log('The tour went badly. The spread shows your flare behind a crying child.', 'env'); } } },
      { label: 'Buy advertisements in the same issue', effect(s, p, log) { cash(s, -p.cost); if (chance(0.7)) { goodwill(s, 4); act(s, -3); } else { reportStory(s, 'magazine', { repHit: 5 }); log('Your advertisement ran opposite the photograph of the flare. Readers noticed.', 'env'); } } },
      { label: 'Ignore it', effect(s, p, log) { reportStory(s, 'magazine', {}); act(s, 4); } },
    ],
  },
  dowser: {
    when: (s) => s.month < 30,
    title: 'A visitor with a forked stick', speaker: { name: 'An old wildcatter', portrait: 'oldtimer' },
    text: (s, p) => `An old wildcatter offers to "witch" your acreage with a peach branch for ${money(p.cost)}. He says he found the Hollister field in '26.`,
    params: (s) => ({ cost: $(s, 50) }),
    options: [
      { label: 'Pay the man', effect(s, p, log) { cash(s, -p.cost); if (chance(0.15)) { const pc = pick(s.parcels.filter((x) => x.drillable)); pc.survey.level = Math.max(pc.survey.level, 1); log(`The wildcatter walked ${pc.surface.name} and said "there's oil under that fence line". He was, statistically, right about something.`, 'land'); } else log('He walked in circles for an hour and left. Your geologist did not make eye contact.', 'land'); } },
      { label: 'No thanks', effect() {} },
    ],
  },
  unionDrive: {
    when: (s) => s.staff.length >= 5 && !s.labor.union && s.labor.morale < 55,
    title: 'Your crews want a union', speaker: { name: 'An organiser from the Oil Workers International', portrait: 'picketer' },
    text: (s, p) => `The roughnecks and pumpers are talking to the Oil Workers International. They want a safety committee and a 10% raise. Your foreman says morale is "tense". A firm of "labor consultants" from Tulsa will handle it for ${money(p.cost)}.`,
    params: (s) => ({ cost: $(s, 1_500) }),
    options: [
      { label: 'Recognise the union', effect(s, p, log) { s.labor.union = 'recognised'; s.flags.union = true; giveRaise(s, 0.1, null); s.env.score = clamp(s.env.score + 3, 0, 100); reportStory(s, 'unionWon', { repHit: -2 }); log('Union recognised. Wages +10%, but the safety committee actually reads the checklists.', 'staff'); } },
      { label: 'Bring in the "labor consultants"', effect(s, p, log) { cash(s, -p.cost); if (chance(0.6)) { s.labor.union = 'busted'; s.flags.union = 'busted'; s.labor.morale = clamp(s.labor.morale - 8, 0, 100); log('The union drive fizzled. The consultants sent a thank-you card.', 'staff'); } else { s.labor.union = 'recognised'; s.flags.union = true; giveRaise(s, 0.12, null); reportStory(s, 'unionWon', { repHit: 6 }); log('The consultants made it worse. The union won 80-20 and the story made the wire services.', 'staff'); } } },
    ],
  },
  pipelineCompany: {
    when: (s) => yearOf(s) >= 1954 && !s.market.gasMarket && s.wells.length > 0,
    weight: (s) => 1 + 0.5 * (yearOf(s) - 1954),
    title: 'The pipeline company calls', speaker: { name: 'A man from Panhandle & Plains Pipe Line', portrait: 'clerk' },
    text: (s, p) => `A man from Panhandle & Plains Pipe Line is buying casinghead gas in the county. He offers a twenty-year contract at ${p.price.toFixed(3)} dollars per thousand cubic feet, escalating one percent a year. You would still need to build gathering to his line.`,
    params: (s) => ({ price: Math.round(gasAnchor(s.month) * 0.6 * 1000) / 1000 }),
    options: [
      { label: 'Sign the twenty-year contract', effect(s, p, log) { const g = createGasMarket(s); log(`Signed with Panhandle & Plains: $${g.price.toFixed(3)}/mcf for twenty years. There is now somebody to sell gas to, once you build a gathering system.`, 'market'); } },
      { label: 'Hold out for better terms', effect(s, p, log) { log('You told the pipeline man to come back with a better number. He will, eventually.', 'market'); } },
    ],
  },

  // ---------------------------------------------------------------- people and the courthouse
  favorCalled: {
    when: (s) => Object.values(s.people || {}).some((p) => p.office && p.favors < 0),
    title: 'A favour is called in', speaker: (s, p) => { const q = s.people[p.pid]; return q ? { name: q.name, portrait: portraitFor(q) } : { name: 'A friend', portrait: 'mayor' }; },
    text: (s, p) => `${p.name} stops by. "You'll remember I did you a good turn." ${p.what}`,
    params: (s) => { const q = pick(Object.values(s.people).filter((p) => p.office && p.favors < 0)); const kind = pick(['nephew', 'raffle', 'lease']); const what = kind === 'nephew' ? `His nephew needs a job. Not much of a hand, but he needs a job. ${money($(s, 220))} a month ought to do.` : kind === 'raffle' ? `The Lions Club raffle needs a big buyer: ${money($(s, 400))} in tickets, and your name read out at the fair.` : `A cousin has a dry section on the county road. A lease at ${money($(s, 1_200))} would be a kindness.`; return { pid: q.id, name: q.name, kind, what, cost: $(s, kind === 'nephew' ? 220 : kind === 'raffle' ? 400 : 1_200) }; },
    options: [
      { label: 'Of course', effect(s, p, log) { const q = s.people[p.pid]; if (p.kind === 'nephew') { const c = makeCandidate(s, 'production', -2); c.skill = Math.min(c.skill, 3); c.name = `${pick(['Junior', 'Buddy', 'Sonny', 'Dwayne'])} ${q ? q.name.split(' ')[1] : 'Pruitt'}`; c.salary = p.cost; c.hiredMonth = s.month; c.nephewOf = p.pid; s.staff.push(c); log(`${c.name} is now on the payroll as a pumper. He is at the cafe most afternoons.`, 'staff'); } else { cash(s, -p.cost); log(p.kind === 'raffle' ? 'Your name is read out at the fair, twice.' : 'You now hold a lease on four hundred acres of dry rock, and a friend at the courthouse.', 'gov'); } if (q) { q.favors += 1; q.disposition = clamp(q.disposition + 6, 0, 100); } } },
      { label: '"I don\'t recall it that way."', effect(s, p, log) { const q = s.people[p.pid]; if (q) { q.favors = 0; q.disposition = clamp(q.disposition - 15, 0, 100); if (chance(0.4)) q.hostile = true; } log(`${p.name} leaves without shaking hands. That will cost you later.`, 'gov'); } },
    ],
  },
  // Cravens, from Dallas, by telephone. He holds a big piece of the company and wants it to do something.
  boardPressure: {
    when: (s) => !!s.flags.boardPressure && s.month - (s.flags.boardPressure.last ?? 0) >= 9 && (producingWells(s).length < 2 || s.history.slice(-12).reduce((a, h) => a + h.net, 0) < $(s, 3_000) || s.flags.boardPressure.promise > 0 && s.flags.boardPressure.promise <= s.month),
    weight: (s) => 2.5,
    title: 'Dallas on the line', speaker: { name: 'T. Cravens', portrait: 'banker', title: 'Shareholder, of Dallas' },
    text: (s, p) => `The long-distance operator puts through T. Cravens. "${p.broken ? 'You promised me a well by now and I do not see one.' : p.wells < 2 ? 'I hold ' + Math.round(p.equity * 100) + ' percent of a company with ' + (p.wells === 1 ? 'one well' : 'no wells') + '.' : 'The wells pay and I see none of it.'} I want either a dividend of ${money(p.dividend)} or a rig turning to the right by spring. Which is it?"`,
    params: (s) => { const b = s.flags.boardPressure; return { equity: b.equity, wells: producingWells(s).length, dividend: Math.round($(s, 4_000) * (0.5 + b.equity)), broken: b.promise > 0 && b.promise <= s.month && !s.wells.some((w) => w.startedMonth > b.promise - 6) }; },
    options: [
      { label: 'Pay the dividend', effect(s, p, log) { const b = s.flags.boardPressure; cash(s, -p.dividend); b.last = s.month; b.promise = -1; b.patience = clamp((b.patience ?? 60) + 15, 0, 100); log(`A ${money(p.dividend)} dividend goes to Dallas. Cravens says "obliged" and hangs up.`, 'company'); } },
      { label: 'Promise a well by spring', effect(s, p, log) { const b = s.flags.boardPressure; b.last = s.month; b.promise = s.month + 6; b.patience = clamp((b.patience ?? 60) - (p.broken ? 20 : 5), 0, 100); log(`You promised Cravens a well within six months. He wrote the date down; you heard the pencil.`, 'company'); if (b.patience <= 0) escalate(s, b, log); } },
      { label: 'Tell him to mind his own business', effect(s, p, log) { const b = s.flags.boardPressure; b.last = s.month; b.promise = -1; b.patience = clamp((b.patience ?? 60) - 30, 0, 100); log(`You told a man holding ${Math.round(p.equity * 100)} percent of your company to mind his own business. The line went quiet, then dead.`, 'company'); if (b.patience <= 0) escalate(s, b, log); } },
    ],
  },
  electionDonation: {
    when: (s) => electionYear(s) && [8, 9].includes(calMonth(s)),
    title: 'The campaign comes calling', speaker: (s, p) => who(s, 'judge', 'A candidate for county judge', 'mayor'),
    text: (s, p) => `It is an election year. ${p.inc} (${p.incParty}) asks for ${money(p.amount)} toward the campaign for county judge; the challenger, ${p.chal} (${p.chalParty}), has sent a letter asking for the same. A donation tips the odds in November.`,
    params: (s) => { const j = person(s, 'judge'); const chal = `${pick(['Newt', 'Ansel', 'Lyle', 'Woody', 'Truman'])} ${pick(['Stroud', 'Trask', 'Yoder', 'Mabry', 'Fenwick'])}`; const other = j?.party === 'ring' ? 'reform' : 'ring'; return { amount: $(s, 1_500), inc: j?.name || 'the judge', incParty: j?.party === 'ring' ? 'Courthouse Ring' : 'Reform Ticket', chal, chalParty: other === 'ring' ? 'Courthouse Ring' : 'Reform Ticket', other }; },
    options: [
      { label: 'Back the incumbent', effect(s, p, log) { const r = approach(s, 'judge', 'donate', { amount: p.amount }); log(r.text, 'gov'); } },
      { label: 'Back the challenger', effect(s, p, log) { if (s.company.cash - p.amount < -s.company.creditLimit) { log('You cannot cover it.', 'gov'); return; } cash(s, -p.amount); s.gov.donations[p.other] += p.amount; const j = person(s, 'judge'); if (j) j.disposition = clamp(j.disposition - 12, 0, 100); log(`${money(p.amount)} to ${p.chal}. The judge will hear of it, and remember, if he wins.`, 'gov'); } },
      { label: 'Stay out of politics', effect(s, p, log) { log('You kept your chequebook closed. Both candidates noticed.', 'gov'); } },
    ],
  },
  spacingHearing: {
    when: (s) => yearOf(s) < 1972 && producingWells(s).length > 0 && activeRivals(s).length > 0,
    title: 'A Rule 37 hearing', speaker: (s) => who(s, 'inspector', 'The commission field agent', 'clerk'),
    text: (s, p) => `${p.rival} has applied for a Rule 37 spacing exception to drill an offset well against your ${p.well}. If it is granted they will drain your side of the line. Protesting the hearing means a lawyer in Oklahoma City for a day (${money(p.cost)}).`,
    params: (s) => { const w = pick(producingWells(s)); return { rival: pick(activeRivals(s)), well: w.name, wid: w.id, cost: $(s, 300) }; },
    options: [
      { label: 'Protest the hearing', effect(s, p, log) { cash(s, -p.cost, 'fines'); const i = person(s, 'inspector'); const win = chance(0.45 + (i ? (i.disposition - 50) / 200 : 0)); const c = s.competitors.find((c) => c.name === p.rival); if (c) c.hostility = clamp((c.hostility || 0) + 10, 0, 100); if (win) log(`The commission denied ${p.rival}'s exception. Your lawyer bills for the day and the mileage.`, 'gov'); else { const w = wellById(s, p.wid); if (w?.perf) w.perf.qiOil *= 0.9; log(`The commission granted the exception. ${p.rival}'s offset well will pull some of your oil across the line.`, 'gov'); } } },
      { label: 'Let it go', effect(s, p, log) { const w = wellById(s, p.wid); if (w?.perf) w.perf.qiOil *= 0.92; log(`${p.rival} got their exception without a fight. Their offset well drains your ${p.well} a little.`, 'gov'); } },
    ],
  },
  photosOfThePit: {
    when: (s) => producingWells(s).length > 0 && (yearOf(s) >= 1960 || s.env.activism > 15),
    title: 'Photographs of the pit', speaker: (s) => who(s, 'editor', 'The editor of the Clarion', 'reporter'),
    text: (s, p) => `The Clarion's editor has photographs of the salt-water pit at ${p.well}, unlined and running over into ${p.farm}'s pasture. The editor mentions, in passing, that plates cost money.`,
    params: (s) => { const w = pick(producingWells(s)); return { well: w.name, wid: w.id, farm: s.parcels[w.parcelId].surface.name, plates: $(s, 200), line: $(s, 1_500) }; },
    options: [
      { label: `Buy the plates`, effect(s, p, log) { if (s.company.cash - p.plates < -s.company.creditLimit) return; cash(s, -p.plates); const e = person(s, 'editor'); if (e) e.disposition = clamp(e.disposition + 3, 0, 100); if (chance(0.7)) log('You bought the plates. The story died on the hook.', 'press'); else { reportStory(s, 'spill', { well: p.well, farm: p.farm, repHit: 7 }); log('You bought the plates. The editor had made prints.', 'press'); } } },
      { label: 'Line the pit', effect(s, p, log) { cash(s, -p.line, 'opex'); s.env.score = clamp(s.env.score + 3, 0, 100); reportStory(s, 'spill', { well: p.well, farm: p.farm, repHit: 2, headline: `${s.company.name.toUpperCase()} LINES PIT AFTER COMPLAINT` }); log('The pit is lined and bermed. The story ran small, on page four.', 'env'); } },
      { label: '"Print what you like."', effect(s, p, log) { reportStory(s, 'spill', { well: p.well, farm: p.farm }); log('The photographs ran on page one.', 'press'); } },
    ],
  },
  sheriffCoffee: {
    when: (s) => s.law.heat > 20,
    title: 'The sheriff drops by for coffee', speaker: (s) => who(s, 'sheriff', 'The sheriff', 'sheriff'),
    text: (s, p) => `${p.name} takes off his hat and sits without being asked. "People talk," he says. "Some of what they say is about you." He drinks his coffee slowly.`,
    params: (s) => { const sh = person(s, 'sheriff'); return { name: sh?.name || 'The sheriff', amount: $(s, 500), gift: $(s, 300) }; },
    options: [
      { label: 'Talk about the weather', effect(s, p, log) { addHeat(s, -2); log('You talked about the weather. He left a nickel for the coffee.', 'law'); } },
      { label: 'Mention his re-election fund', effect(s, p, log) { const r = approach(s, 'sheriff', 'donate', { amount: p.amount }); log(r.text, 'law'); if (r.ok) addHeat(s, -5); }, labelFn: (s, p) => `Mention his re-election fund (${money(p.amount)})` },
      { label: 'Slide an envelope across the table', effect(s, p, log) { const sh = person(s, 'sheriff'); if (!sh) return; const crime = recordCrime(s, { kind: 'bribe', personId: sh.id, person: sh.name, amount: p.gift, exposure: 0.3 }); if (chance(clamp(sh.corruptibility - 0.4 * sh.honesty + 0.2, 0.05, 0.9))) { cash(s, -p.gift); sh.bought = true; sh.bribedTotal += p.gift; addHeat(s, -15); log('The envelope went into his hat. "I didn\'t hear anything," he said, and meant it.', 'law'); } else { crime.discovered = true; addHeat(s, 15); sh.hostile = sh.honesty > 0.6; sh.disposition = clamp(sh.disposition - 15, 0, 100); reportStory(s, 'bribeRefused', { person: sh.name, title: sh.title, amount: p.gift, crimeId: crime.id }); log('He looked at the envelope and put his hat on. "That was a mistake, son."', 'law'); } } },
    ],
    caretaker: 0,
  },
  grandJurySubpoena: {
    when: (s) => s.law.investigations.some((i) => i.status === 'open' && i.by !== 'sheriff'),
    title: 'A subpoena for the books', speaker: { name: 'A deputy with a paper', portrait: 'sheriff' },
    text: (s, p) => `The grand jury wants your ledgers, run tickets and cancelled cheques back to the beginning. A lawyer on retainer would cost ${money(p.lawyer)} for the year.`,
    params: (s) => ({ lawyer: $(s, 600) * 12 }),
    options: [
      { label: 'Hand them over', effect(s, p, log) { for (const i of s.law.investigations) if (i.status === 'open') i.evidence = clamp(i.evidence + 10, 0, 100); log('Your bookkeeper carried the ledgers to the courthouse in two boxes. The grand jury has plenty to read.', 'law'); } },
      { label: '"There was a fire in the storeroom."', effect(s, p, log) { const c = recordCrime(s, { kind: 'tamper', exposure: 0.4, witnesses: 2 }); for (const i of s.law.investigations) if (i.status === 'open') i.evidence = clamp(i.evidence - 15, 0, 100); if (chance(0.35)) { discoverCrime(s, c, 'investigation', log); log('The bookkeeper told the grand jury there was no fire.', 'law'); } else log('The ledgers are ash. The grand jury is annoyed but has less to read.', 'law'); } },
      { label: 'Put a lawyer on retainer', effect(s, p, log) { const r = hireLawyer(s, 12); log(r.msg, 'law'); } },
    ],
    caretaker: 0,
  },
  indictment: {
    when: () => false, system: true,
    title: 'Indicted', speaker: (s) => who(s, 'judge', 'The district judge', 'mayor'),
    text: (s, p) => `The grand jury has returned a true bill: ${p.charge}. The evidence is ${p.evidence > 80 ? 'overwhelming' : p.evidence > 65 ? 'strong' : 'thin but sufficient'}. The best lawyer in Oklahoma City wants ${money(p.lawyerCost * 2)}; the county judge, who sets the docket, is said to be a reasonable man.`,
    options: [
      { label: 'Hire the best lawyer in Oklahoma City', effect(s, p, log) { cash(s, -p.lawyerCost * 2, 'fines'); trial(s, p, 0.45, log); } },
      { label: 'Plead guilty', effect(s, p, log) { sentence(s, 'fine', log); } },
      { label: 'Take it to trial', effect(s, p, log) { trial(s, p, s.law.lawyer && s.law.lawyer.until > s.month ? 0.7 : 1.0, log); } },
      { label: 'See the judge', effect(s, p, log) { const r = approach(s, 'judge', 'bribe', { ask: 'dismiss', amount: p.bribe, invId: p.invId }); log(r.text, 'law'); if (!r.ok) { if (r.outcome === 'reported') for (const i of s.law.investigations) if (i.id === p.invId) i.evidence = clamp(i.evidence + 15, 0, 100); trial(s, { ...p, evidence: Math.min(100, p.evidence + (r.outcome === 'reported' ? 15 : 0)) }, 1.0, log); } } },
    ],
    caretaker: 1,
  },
  anonymousLetter: {
    when: (s) => s.month > 12 && Object.values(s.people || {}).some((p) => p.office && p.secrets.length),
    title: 'An anonymous letter', speaker: { name: 'An unsigned letter', portrait: 'clerk' },
    text: (s, p) => `A typed letter, no signature: the writer knows something about ${p.name}, ${p.title}, and will tell it for ${money(p.cost)} left in a coffee can behind the depot.`,
    params: (s) => { const q = pick(Object.values(s.people).filter((p) => p.office && p.secrets.length)); return { pid: q.id, name: q.name, title: q.title, cost: $(s, 300) }; },
    options: [
      { label: 'Leave the money', effect(s, p, log) { if (s.company.cash - p.cost < -s.company.creditLimit) return; cash(s, -p.cost); const q = s.people[p.pid]; if (q && chance(0.75)) { const sec = pick(q.secrets); addDirt(s, { personId: q.id, kind: sec.kind, strength: sec.strength, source: 'letter' }); log(`A second letter arrives about ${q.name}: ${sec.kind}. There is a photograph.`, 'law'); } else log('The coffee can was empty the next morning, and no letter came.', 'law'); } },
      { label: 'Burn it', effect() {} },
      { label: 'Take it to the sheriff', effect(s, p, log) { const sh = person(s, 'sheriff'); if (sh) sh.disposition = clamp(sh.disposition + 5, 0, 100); addHeat(s, -4); log('The sheriff read the letter twice and put it in a drawer. He seemed to appreciate the gesture.', 'law'); } },
    ],
  },

  // ---------------------------------------------------------------- labor
  workerDeath: {
    when: () => false, system: true,
    title: 'A man is dead', speaker: (s, p) => ({ name: 'Your toolpusher', portrait: 'roughneck' }),
    text: (s, p) => `${p.worker}, a derrick man on ${p.well} at ${p.farm}, fell from the monkey board on the morning tour. He has a wife and three children in town. The crew saw it. The commission has a form for this, if anyone fills it in.`,
    options: [
      { label: `Do right by the widow`, effect(s, p, log) { cash(s, -(p.widow + p.funeral), 'fines'); s.labor.morale = clamp(s.labor.morale + 4, 0, 100); goodwill(s, 3); reportStory(s, 'workerDeath', { well: p.well, farm: p.farm, worker: p.worker, repHit: 3 }); log(`You paid for the funeral and ${money(p.widow)} to the widow. The crew stood in the rain with their hats off.`, 'staff'); } },
      { label: 'Report it and let the commission look', effect(s, p, log) { cash(s, -p.funeral, 'fines'); reportStory(s, 'workerDeath', { well: p.well, farm: p.farm, worker: p.worker }); s.labor.morale = clamp(s.labor.morale - 5, 0, 100); if (chance(0.5)) { const fine = $(s, 1_000) * s.gov.fineMult; cash(s, -fine, 'fines'); log(`The commission's field man found the safety belt was frayed. Fine ${money(fine)}.`, 'gov'); } else log('The commission called it an accident. The crew calls it something else.', 'staff'); } },
      { label: 'Bury it quietly', effect(s, p, log) { cash(s, -p.funeral, 'fines'); recordCrime(s, { kind: 'coverup', exposure: 0.5, witnesses: 4, well: p.well }); s.labor.morale = clamp(s.labor.morale - 15, 0, 100); for (const st of s.staff) st.loyalty = clamp((st.loyalty ?? 60) - 10, 0, 100); log(`${p.worker} "left for the Permian". The widow received an envelope. Four men on the crew know better.`, 'staff'); } },
    ],
    caretaker: 0,
  },
  drunkOnTour: {
    when: () => false, system: true,
    title: 'Drunk on tour', speaker: (s, p) => ({ name: 'Your toolpusher', portrait: 'roughneck' }),
    text: (s, p) => `${p.name} showed up for the morning tour at ${p.well} with a pint in his coat and another inside him. The crew is scared to work under him. A month at the sanitarium in Sulphur costs ${money(p.cure)}.`,
    options: [
      { label: 'Fire him on the spot', effect(s, p, log) { s.staff = s.staff.filter((x) => x.id !== p.sid); s.labor.morale = clamp(s.labor.morale - 3, 0, 100); log(`${p.name} is off the payroll. He is at the cafe, telling his side.`, 'staff'); } },
      { label: 'Send him to dry out', effect(s, p, log) { cash(s, -p.cure, 'salaries'); const st = s.staff.find((x) => x.id === p.sid); if (st) { st.awayUntil = s.month + 2; st.loyalty = clamp((st.loyalty ?? 60) + 20, 0, 100); if (chance(0.5)) st.traits = st.traits.filter((t) => t !== 'drinker'); } s.labor.morale = clamp(s.labor.morale + 3, 0, 100); log(`${p.name} is in Sulphur for the cure. The crew thinks well of you for it.`, 'staff'); } },
      { label: 'Look the other way', effect(s, p, log) { s.labor.drunkUntil = s.month + 6; s.labor.drunkStaffId = p.sid; s.labor.morale = clamp(s.labor.morale - 4, 0, 100); log(`${p.name} stays on the brake. The crew works with one eye on him.`, 'staff'); } },
    ],
    caretaker: 1,
  },
  hotOil: {
    when: () => false, system: true,
    title: 'A truck at night', speaker: { name: 'A man from a Cushing refinery', portrait: 'clerk' },
    text: (s, p) => `A purchaser from a small refinery at Cushing will take ${p.bbl.toLocaleString()} barrels over your allowable, trucked at night, no run tickets, for ${money(p.offer)} cash. Everyone does it, he says. The commission calls it "hot oil" and seizes trucks.`,
    options: [
      { label: 'Fill his trucks', effect(s, p, log) { cash(s, p.offer, 'revenue'); recordCrime(s, { kind: 'hotOil', exposure: 0.35, witnesses: 3, amount: p.offer }); s.labor.hotOilUntil = s.month + 12; log(`${money(p.offer)} in a paper sack. The trucks ran three nights without lights.`, 'wells'); } },
      { label: 'Send him away', effect(s, p, log) { log('You sent the Cushing man away. He will find somebody else; everyone does it.', 'wells'); } },
    ],
  },
  wildcatStrike: {
    when: () => false, system: true,
    title: 'The men walk out', speaker: { name: 'A picket captain', portrait: 'picketer' },
    text: (s, p) => `The crews walked off at seven this morning. They want ${Math.round(p.raise * 100)} percent and an end to twelve-hour tours. The pumps are stopped, the rig is cold. Some "Tulsa men" will cross the line for ${money(p.scabs)}.`,
    options: [
      { label: 'Give them the raise', effect(s, p, log) { giveRaise(s, p.raise, log); s.labor.strikeUntil = -1; log('The men are back at work by noon, and cheerful about it.', 'staff'); } },
      { label: 'Wait them out', effect(s, p, log) { s.labor.strikeUntil = s.month + randInt(2, 4); log(`The leases sit idle. You are betting the men run out of money before you do.`, 'staff'); } },
      { label: 'Bring in the Tulsa men', effect(s, p, log) { cash(s, -p.scabs, 'salaries'); if (chance(0.6)) { s.labor.strikeUntil = -1; s.labor.morale = clamp(s.labor.morale - 10, 0, 100); if (s.labor.union === 'recognised') s.labor.union = 'busted'; reportStory(s, 'strikebreak', { repHit: 6 }); log('The Tulsa men broke the line in a morning. The pumps are running and nobody is speaking to anybody.', 'staff'); } else { s.labor.strikeUntil = s.month + 2; recordCrime(s, { kind: 'strikebreak', exposure: 0.3, witnesses: 6 }); reportStory(s, 'strikebreak', {}); act(s, 8); s.labor.morale = clamp(s.labor.morale - 15, 0, 100); log('There was a fight at the gate. Two men in the hospital, a sheriff\'s report, and the strike goes on.', 'staff'); } } },
    ],
    caretaker: 1,
  },

  // ---------------------------------------------------------------- disasters
  wellFire: {
    when: () => false, system: true,
    title: 'The well is on fire', speaker: { name: 'Your drilling superintendent', portrait: 'roughneck' },
    text: (s, p) => `${p.well} is burning with a roar you can hear in town. The famous well-fire man from Houston will come for ${money(p.famous)} and have it out in a week. A local crew will try for ${money(p.local)} and take a month or three. Or you can let it burn itself out.`,
    options: [
      { label: 'Wire Houston', effect(s, p, log) { cash(s, -p.famous, 'fines'); const w = wellById(s, p.wellId); if (w) w.phaseEnd = s.month + 1; goodwill(s, 3); reportStory(s, 'wellFireOut', { well: p.well, who: 'HOUSTON MAN' }); log('The Houston man arrived with a truck of dynamite and a red helmet. The fire was out before the Clarion could get a photograph of it burning.', 'wells'); } },
      { label: 'Send the local crew', effect(s, p, log) { cash(s, -p.local, 'fines'); const w = wellById(s, p.wellId); if (w) w.phaseEnd = s.month + 3; if (chance(0.4)) { const extra = damage(s, $(s, 3_000), 'fire spread', log); const pc = s.parcels[w?.parcelId ?? 0]; for (const q of s.parcels.filter((q) => Math.abs(q.x - pc.x) <= 1 && Math.abs(q.y - pc.y) <= 1)) disp(q, -10); log(`The fire spread to the pasture before the crew got a hold of it. Another ${money(extra)}, and the neighbours are burned too.`, 'wells'); } else log('The local crew smothered it with mud and prayer. Three weeks.', 'wells'); } },
      { label: 'Let it burn', effect(s, p, log) { const w = wellById(s, p.wellId); if (w) w.phaseEnd = s.month + 6; reportStory(s, 'letItBurn', { well: p.well, farm: p.farm }); s.env.score = clamp(s.env.score - 10, 0, 100); act(s, 10); const pc = s.parcels[w?.parcelId ?? 0]; for (const q of s.parcels.filter((q) => Math.abs(q.x - pc.x) <= 1 && Math.abs(q.y - pc.y) <= 1)) disp(q, -20); log(`${p.well} will burn until the sand gives out. The glow is visible from the courthouse steps.`, 'wells'); } },
    ],
    caretaker: 1,
  },
  tornadoResponse: {
    when: () => false, system: true,
    title: 'After the twister', speaker: { name: 'Your production foreman', portrait: 'roughneck' },
    text: (s, p) => `${p.wells ? `${p.wells} of your wells are wrecked; putting them back costs about ${money(p.cost)}.` : 'Your leases were spared.'} ${p.town ? 'The town is a mess: the school roof is gone and the Methodists are sheltering families.' : `${p.farm} lost a barn and most of a herd.`} Your trucks and crews could help for about ${money(p.help)} in wages and fuel.`,
    options: [
      { label: 'Rebuild the leases now', effect(s, p, log) { damage(s, p.cost, 'tornado', log); for (const w of s.wells) if (w.status === 'shutin' && w.health < 61) { w.status = 'workover'; w.phaseEnd = s.month + 1; } log('Crews are out setting new tanks and straightening pumpjacks.', 'wells'); } },
      { label: 'Wait for the adjuster', effect(s, p, log) { if (s.policy?.insured) { const refund = Math.round(p.cost * 0.7); cash(s, refund, 'fines'); s.disasters.claimsPaid += refund; log(`The Hartford's man came out in a new car and paid ${money(refund)}. The wells sit shut in until you fix them.`, 'company'); } else log('There is no adjuster; you have no policy. The wells sit shut in until you fix them.', 'company'); } },
      { label: 'Send the crews to help the town first', effect(s, p, log) { damage(s, p.cost, 'tornado', log); cash(s, -p.help); for (const w of s.wells) if (w.status === 'shutin' && w.health < 61) { w.status = 'workover'; w.phaseEnd = s.month + 2; } goodwill(s, 8); for (const pc of s.parcels) disp(pc, 5); reportStory(s, 'disasterHelp', {}); log('Your trucks hauled lumber, your crews cleared the school lot, and the cafe fed everyone on your ticket. The county will remember it.', 'env'); } },
    ],
    caretaker: 1,
  },
  floodResponse: {
    when: () => false, system: true,
    title: 'High water', speaker: { name: 'Your production foreman', portrait: 'roughneck' },
    text: (s, p) => `${p.wells ? `${p.wells} wells are under water; pumping them out and drying the motors is ${money(p.cost)}.` : 'Your leases are dry.'}${p.spill ? ' A tank battery went over and there is oil on the creek.' : ''} The bottoms farms are cut off; your trucks could run supplies for ${money(p.help)}.`,
    options: [
      { label: 'Sandbag and pump', effect(s, p, log) { damage(s, p.cost, 'flood', log); s.disasters.floodUntil = s.month + 1; log('Crews worked in hip boots for a week. The wells are back sooner than the creek.', 'wells'); } },
      { label: 'Help the neighbours first', effect(s, p, log) { damage(s, p.cost, 'flood', log); cash(s, -p.help); goodwill(s, 6); for (const id of s.disasters.floodParcels) disp(s.parcels[id], 10); reportStory(s, 'disasterHelp', {}); log('Your trucks ran groceries and feed to the bottoms until the bridge was clear. The farmers there will not forget it.', 'env'); } },
      { label: 'Wait for the water to go down', effect(s, p, log) { s.disasters.floodUntil = s.month + 3; log('You let the creek take its time. Three months of half production along the bottoms.', 'wells'); } },
    ],
    caretaker: 0,
  },
  iceStorm: {
    when: () => false, system: true,
    title: 'Ice storm', speaker: { name: 'Your production foreman', portrait: 'roughneck' },
    text: (s, p) => `An ice storm took down the power lines and closed the roads. The pumps are stopped; production this month is down 30 percent and the drilling crew went home. Sending crews out on the ice to keep the wells pumping would cost about ${money(p.crews)} in overtime and truck chains.`,
    options: [
      { label: 'Wait for the thaw', effect(s, p, log) { cash(s, -p.cost, 'opex'); } },
      { label: 'Send the crews out on the ice', effect(s, p, log) { cash(s, -(p.cost + p.crews), 'opex'); s.flags.stormMonth = -1; s.labor.morale = clamp(s.labor.morale - 3, 0, 100); log('The pumpers went out in chains and came back frostbitten. The wells never stopped.', 'wells'); } },
    ],
    caretaker: 0,
  },
  farmerWater: {
    when: (s) => activeWells(s).some((w) => s.parcels[w.parcelId].surface.type === 'farmer') && (s.disasters?.droughtUntil > s.month || chance(0.5)),
    title: 'The farmer\'s water', speaker: (s, p) => ({ name: p.owner, portrait: 'farmer' }),
    text: (s, p) => `${p.owner} of ${p.farm} says his windmill water has turned salty since your ${p.well} came in. ${s.disasters?.droughtUntil > s.month ? 'In a drought year that is a matter of life and death for his stock.' : 'He wants to know what you mean to do about it.'} Hauling water for him is ${money(p.haul)}; the state college will test the well for ${money(p.test)}.`,
    params: (s) => { const w = pick(activeWells(s).filter((w) => s.parcels[w.parcelId].surface.type === 'farmer')); const pc = s.parcels[w.parcelId]; return { pid: pc.id, owner: pc.surface.ownerPerson, farm: pc.surface.name, well: w.name, haul: $(s, 400), test: $(s, 300), fix: $(s, 1_500) }; },
    options: [
      { label: 'Haul water for him', effect(s, p, log) { cash(s, -p.haul, 'opex'); disp(s.parcels[p.pid], 12); goodwill(s, 2); log(`A water truck stops at ${p.farm} every other day. ${p.owner} waves at it now.`, 'land'); } },
      { label: 'Have the well tested', effect(s, p, log) { cash(s, -p.test); if (chance(0.5)) { cash(s, -p.fix, 'fines'); s.env.score = clamp(s.env.score - 2, 0, 100); disp(s.parcels[p.pid], 6); log(`It was your brine. You squeezed the casing and paid for a new water well. ${p.owner} respects the honesty and not much else.`, 'env'); } else { goodwill(s, 2); disp(s.parcels[p.pid], 3); log('The state college found gypsum, not brine. The well was always going to go salty. You paid for the test anyway.', 'land'); } } },
      { label: 'Tell him to see a lawyer', effect(s, p, log) { disp(s.parcels[p.pid], -20); if (chance(0.4)) s.parcels[p.pid].surface.hostile = true; reportStory(s, 'farmerWater', { farm: p.farm }); log(`${p.owner} saw a lawyer, and the editor of the Clarion, in that order.`, 'land'); } },
    ],
  },
  poolingOffer: {
    when: (s) => producingWells(s).some((w) => w.poolId !== null && w.poolId !== undefined && s.parcels.some((q) => q.mineral.leasedBy && q.mineral.leasedBy !== 'player' && q.truth.sand.pool === w.poolId && Math.abs(q.x - s.parcels[w.parcelId].x) <= 1 && Math.abs(q.y - s.parcels[w.parcelId].y) <= 1)),
    title: 'A pooling proposal', speaker: (s, p) => ({ name: `A landman for ${p.rival}`, portrait: 'landman' }),
    text: (s, p) => `${p.rival} holds the section next to your ${p.well} in the same field. Rather than drill an offset and drain each other, they propose to pool the two tracts: you take ${money(p.pay)} now and a share of their well. Refuse and they drill against you.`,
    params: (s) => { const w = pick(producingWells(s).filter((w) => w.poolId !== null && w.poolId !== undefined)); const pc = s.parcels[w.parcelId]; const q = s.parcels.find((q) => q.mineral.leasedBy && q.mineral.leasedBy !== 'player' && q.truth.sand.pool === w.poolId && Math.abs(q.x - pc.x) <= 1 && Math.abs(q.y - pc.y) <= 1); return { rival: q?.mineral.leasedBy || pick(activeRivals(s)), well: w.name, wid: w.id, pay: $(s, 2_000) }; },
    options: [
      { label: 'Pool the tracts', effect(s, p, log) { cash(s, p.pay, 'land'); const c = s.competitors.find((c) => c.name === p.rival); if (c) c.hostility = clamp((c.hostility || 0) - 10, 0, 100); log(`Pooled with ${p.rival}. ${money(p.pay)} in hand and one less offset well in the field.`, 'land'); } },
      { label: 'Let them drill', effect(s, p, log) { const w = wellById(s, p.wid); if (w?.perf) w.perf.qiOil *= 0.9; const c = s.competitors.find((c) => c.name === p.rival); if (c) c.hostility = clamp((c.hostility || 0) + 10, 0, 100); log(`${p.rival} spudded an offset well within the month. Your ${p.well} feels it.`, 'land'); } },
    ],
  },
  hydrafracSalesman: {
    when: (s) => techAvailable(s, 'frac') && s.month - (s.tech.unlocks.frac || 0) < 36 && producingWells(s).some((w) => w.target === 'sand' && !w.design.vfrac),
    title: 'The Halliburton man', speaker: { name: 'A Halliburton salesman', portrait: 'clerk' },
    text: (s, p) => `A salesman from Halliburton wants to "Hydrafrac" your ${p.well}: gelled crude and river sand pumped down the hole at pressure to crack the sand. ${money(p.cost)} for the job, and he says it doubles tight wells. Your old-timers say it will ruin the hole.`,
    params: (s) => { const w = pick(producingWells(s).filter((w) => w.target === 'sand' && !w.design.vfrac)); return { well: w.name, wid: w.id, cost: $(s, 3_000), perm: s.parcels[w.parcelId].truth.sand.perm }; },
    options: [
      { label: 'Try it', effect(s, p, log) { cash(s, -p.cost, 'capex'); const w = wellById(s, p.wid); if (!w?.perf) return; const f = p.perm < 20 ? rand(1.3, 1.8) : rand(0.95, 1.15); w.perf.qiOil *= f; w.design.vfrac = true; log(f > 1.2 ? `The frac worked: ${p.well} came back at ${Math.round(f * 100 - 100)} percent more oil. The old-timers are quiet.` : `The frac did little for ${p.well}. The sand was already open; the salesman has left town.`, 'wells'); } },
      { label: 'Pass', effect() {} },
    ],
  },
  embargoAllocation: {
    when: (s) => yearOf(s) >= 1974 && yearOf(s) <= 1976 && producingWells(s).length > 0,
    title: 'Old oil, new oil', speaker: { name: 'A Washington lawyer', portrait: 'banker' },
    text: (s, p) => `Under the price controls your "old" oil sells at the 1972 price and "new" oil sells free, at twice that. A lawyer explains that with the right paperwork at the commission, old wells become new wells. It would be worth about ${money(p.gain)} over the year. It is also fraud.`,
    params: (s) => ({ gain: Math.round(s.month_prod.oil * s.market.oil * 6) }),
    options: [
      { label: 'Reclassify the wells', effect(s, p, log) { cash(s, p.gain, 'revenue'); recordCrime(s, { kind: 'fraud', exposure: 0.3, witnesses: 2, amount: p.gain }); log(`The paperwork went through. ${money(p.gain)} extra this year, and a file in Washington with your name on it.`, 'market'); } },
      { label: 'Sell old oil at the old price', effect(s, p, log) { log('You sold your oil at the controlled price and slept well, poorer.', 'market'); } },
    ],
  },
  windfallTax: {
    when: (s) => yearOf(s) >= 1980 && yearOf(s) <= 1987 && s.history.slice(-12).reduce((a, h) => a + h.net, 0) > $(s, 50_000),
    title: 'The Windfall Profit Tax', speaker: { name: 'Your accountant', portrait: 'clerk' },
    text: (s, p) => `The Crude Oil Windfall Profit Tax bill is ${money(p.bill)} this year. Houston accountants will contest the "base price" for ${money(p.fee)} and might halve it. Or the run tickets could be, as your bookkeeper says, "conservative".`,
    params: (s) => { const net = s.history.slice(-12).reduce((a, h) => a + h.net, 0); return { bill: Math.round(net * 0.08), fee: $(s, 3_000) }; },
    options: [
      { label: 'Pay it', effect(s, p, log) { cash(s, -p.bill, 'taxes'); } },
      { label: 'Hire the Houston accountants', effect(s, p, log) { cash(s, -p.fee); cash(s, -(chance(0.6) ? Math.round(p.bill / 2) : p.bill), 'taxes'); log('The accountants argued base prices for a month. The bill came down, or did not.', 'company'); } },
      { label: 'Understate the runs', effect(s, p, log) { cash(s, -Math.round(p.bill * 0.25), 'taxes'); recordCrime(s, { kind: 'fraud', exposure: 0.25, witnesses: 2, amount: p.bill }); log('The run tickets were conservative. The tax bill was a quarter of what it should have been.', 'company'); } },
    ],
    caretaker: 0,
  },
  bankExaminer: {
    when: (s) => yearOf(s) >= 1982 && yearOf(s) <= 1986 && s.company.cash < 0,
    title: 'The bank examiner', speaker: (s) => who(s, 'banker', 'Mr. Ellison at the bank', 'banker'),
    text: (s, p) => `Since Penn Square went under, the examiners are going through every energy loan in the state. Your banker says yours is "classified". He needs the line paid down by ${money(p.paydown)} or he needs a reason.`,
    params: (s) => ({ paydown: Math.round(Math.min(-s.company.cash, $(s, 20_000)) / 100) * 100 }),
    options: [
      { label: 'Pay it down', effect(s, p, log) { cash(s, -p.paydown, 'interest'); log(`You paid down ${money(p.paydown)}. The examiner moved on to somebody worse.`, 'company'); } },
      { label: 'Talk to the banker', effect(s, p, log) { const r = approach(s, 'banker', 'persuade', { ask: 'loan' }); log(r.text, 'company'); if (!r.ok) { s.company.creditPenaltyUntil = s.month + 12; log('The bank cut your line by a fifth for the year.', 'company'); } } },
      { label: 'Find another bank', effect(s, p, log) { s.company.creditPenaltyUntil = s.month + 12; log('There is no other bank. Your line is cut by a fifth for the year.', 'company'); } },
    ],
    caretaker: 0,
  },
};

function trial(s, p, mult, log) {
  const j = holder(s, 'judge');
  const pConvict = clamp((p.evidence / 100) * mult * (j && j.bought ? 0.5 : 1) * (j && j.cowed ? 0.6 : 1), 0.05, 0.95);
  const inv = s.law.investigations.find((i) => i.id === p.invId);
  if (chance(pConvict)) { sentence(s, severityFor(s, inv), log); }
  else { reportStory(s, 'acquittal', {}); addHeat(s, -20); if (inv) inv.status = 'acquitted'; log(`NOT GUILTY. The jury was out two hours. You shook every hand in the courtroom, including the sheriff's.`, 'law'); }
}

export function speakerFor(def, state, params) {
  const sp = def?.speaker;
  if (!sp) return null;
  return typeof sp === 'function' ? sp(state, params) : sp;
}
export function eventText(def, state, params) { return typeof def.text === 'function' ? def.text(state, params) : def.text; }
export function optionLabel(def, i, state, params) { const o = def.options[i]; return o.labelFn ? o.labelFn(state, params) : o.label; }

// System-pushed events skip the monthly roll and the twelve-month repeat rule.
export function pushEvent(state, id, params = {}) {
  const e = EVENTS[id]; if (!e) return null;
  state.eventHistory[id] = state.month;
  const ev = { id, params: e.params && !Object.keys(params).length ? e.params(state) : params, month: state.month, system: true };
  state.pending.push(ev);
  return ev;
}

export function tickEvents(state, log) {
  if (state.pending.length) return;
  if (state.law?.absentUntil > state.month) return;
  if (!chance(0.16)) return;
  const eligible = Object.entries(EVENTS).filter(([id, e]) => !e.system && e.when(state) && (state.eventHistory[id] ?? -99) + 12 <= state.month);
  if (!eligible.length) return;
  const weights = eligible.map(([, e]) => (e.weight ? e.weight(state) : 1));
  let r = rnd() * weights.reduce((a, w) => a + w, 0), idx = 0;
  while (idx < weights.length - 1 && (r -= weights[idx]) > 0) idx++;
  const [id, e] = eligible[idx];
  state.eventHistory[id] = state.month;
  state.pending.push({ id, params: e.params ? e.params(state) : {}, month: state.month });
}

export function resolveEvent(state, idx, log) {
  const ev = state.pending[0];
  if (!ev) return;
  const def = EVENTS[ev.id];
  if (!def) { state.pending.shift(); return; }
  const i = clamp(idx | 0, 0, def.options.length - 1);
  def.options[i].effect(state, ev.params, log || state.log || (() => {}));
  state.pending.shift();
}
export function caretakerChoice(def) { return def.caretaker ?? def.options.length - 1; }
