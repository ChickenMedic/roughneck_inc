// The Dry Fork Clarion. Stories brew, get printed, get buried, and resurface. reportStory() is the single hook
// every other system calls; what gets printed (not what you did) drives reputation through goodwill and notoriety.
import { rnd, rand, randInt, pick, chance } from './rng.js';
import { clamp, money } from './util.js';
import { inflate, yearOf } from './era.js';

export function initPress() { return { stories: [], clippings: [], adSpend: 0, adUntil: -1, owned: false, ownedSince: -1, rivalPaper: false, kills: 0, goodwill: 4, notoriety: 0, nextId: 1, printed: 0 }; }

// Defaults per kind. heat: how hard the story pushes to print and how loudly. repHit: notoriety added (negative = goodwill).
// lawHeat: heat added to the law system when printed. delay: months before it can run.
export const STORY_KINDS = {
  blowout:       { heat: 70, repHit: 12, lawHeat: 4, delay: 0 },
  spill:         { heat: 35, repHit: 5, lawHeat: 2, delay: 1 },
  citation:      { heat: 25, repHit: 3, lawHeat: 2, delay: 1 },
  bribeRefused:  { heat: 65, repHit: 12, lawHeat: 12, delay: 1 },
  bribeExposed:  { heat: 75, repHit: 15, lawHeat: 15, delay: 0 },
  blackmail:     { heat: 70, repHit: 14, lawHeat: 14, delay: 1 },
  threat:        { heat: 55, repHit: 10, lawHeat: 10, delay: 1 },
  bigDonation:   { heat: 30, repHit: 4, lawHeat: 1, delay: 1 },
  discovery:     { heat: 60, repHit: -6, lawHeat: 0, delay: 0 },
  puff:          { heat: 30, repHit: -5, lawHeat: 0, delay: 1 },
  endorsement:   { heat: 25, repHit: -4, lawHeat: 0, delay: 0 },
  community:     { heat: 25, repHit: -4, lawHeat: 0, delay: 0 },
  strike:        { heat: 50, repHit: 6, lawHeat: 0, delay: 0 },
  strikebreak:   { heat: 60, repHit: 10, lawHeat: 3, delay: 0 },
  unionWon:      { heat: 40, repHit: 2, lawHeat: 0, delay: 0 },
  workerDeath:   { heat: 65, repHit: 8, lawHeat: 6, delay: 0 },
  coverup:       { heat: 85, repHit: 20, lawHeat: 25, delay: 0 },
  drunkDriller:  { heat: 45, repHit: 7, lawHeat: 3, delay: 1 },
  hotOil:        { heat: 60, repHit: 10, lawHeat: 15, delay: 0 },
  tornado:       { heat: 60, repHit: 0, lawHeat: 0, delay: 0 },
  flood:         { heat: 55, repHit: 0, lawHeat: 0, delay: 0 },
  iceStorm:      { heat: 45, repHit: 0, lawHeat: 0, delay: 0 },
  drought:       { heat: 40, repHit: 0, lawHeat: 0, delay: 0 },
  tankFire:      { heat: 45, repHit: 3, lawHeat: 1, delay: 0 },
  prairieFire:   { heat: 60, repHit: 8, lawHeat: 3, delay: 0 },
  wellFire:      { heat: 80, repHit: 6, lawHeat: 2, delay: 0 },
  wellFireOut:   { heat: 55, repHit: -6, lawHeat: 0, delay: 0 },
  letItBurn:     { heat: 75, repHit: 14, lawHeat: 6, delay: 0 },
  disasterHelp:  { heat: 40, repHit: -8, lawHeat: 0, delay: 0 },
  lawsuit:       { heat: 45, repHit: 6, lawHeat: 3, delay: 0 },
  investigation: { heat: 55, repHit: 6, lawHeat: 0, delay: 1 },
  indictment:    { heat: 90, repHit: 18, lawHeat: 0, delay: 0 },
  conviction:    { heat: 95, repHit: 22, lawHeat: 0, delay: 0 },
  acquittal:     { heat: 60, repHit: -6, lawHeat: 0, delay: 0 },
  prison:        { heat: 95, repHit: 25, lawHeat: 0, delay: 0 },
  forcedAccess:  { heat: 50, repHit: 8, lawHeat: 0, delay: 0 },
  rivalScandal:  { heat: 60, repHit: 14, lawHeat: 0, delay: 1 },
  smear:         { heat: 40, repHit: 8, lawHeat: 0, delay: 1 },
  libelExposed:  { heat: 65, repHit: 14, lawHeat: 10, delay: 0 },
  rivalTrick:    { heat: 50, repHit: 12, lawHeat: 0, delay: 1 },
  rivalIndicted: { heat: 75, repHit: 20, lawHeat: 0, delay: 0 },
  sabotage:      { heat: 45, repHit: 0, lawHeat: 0, delay: 0 },
  whistleblower: { heat: 70, repHit: 12, lawHeat: 12, delay: 0 },
  resurfaced:    { heat: 70, repHit: 14, lawHeat: 12, delay: 0 },
  boughtPaper:   { heat: 40, repHit: 4, lawHeat: 0, delay: 0 },
  election:      { heat: 50, repHit: 0, lawHeat: 0, delay: 0 },
  tremor:        { heat: 50, repHit: 6, lawHeat: 2, delay: 0 },
  magazine:      { heat: 60, repHit: 8, lawHeat: 0, delay: 0 },
  waterComplaint:{ heat: 40, repHit: 5, lawHeat: 2, delay: 1 },
  farmerWater:   { heat: 40, repHit: 5, lawHeat: 2, delay: 1 },
  pledgeBroken:  { heat: 40, repHit: 6, lawHeat: 0, delay: 0 },
  astroturf:     { heat: 50, repHit: 10, lawHeat: 2, delay: 0 },
  insurance:     { heat: 30, repHit: 0, lawHeat: 0, delay: 0 },
  generic:       { heat: 30, repHit: 3, lawHeat: 0, delay: 1 },
};

const up = (s) => String(s || '').toUpperCase();
const short = (name) => String(name || 'THE COMPANY').replace(/ (Petroleum|Oil|Oil & Gas|Drilling|Company|Co\.|Corp\.|Inc\.|Exploration)$/i, '').toUpperCase();
// Headlines in the small-town weekly style of 1952: capitals, a comma splice, a "SAYS" or two.
export function headlineFor(kind, ctx = {}) {
  const co = short(ctx.company), well = up(ctx.well), farm = up(ctx.farm), who = up(ctx.person), rival = short(ctx.rival), amt = ctx.amount ? money(ctx.amount) : '';
  const H = {
    blowout: [`FIRE AT ${well} SEEN FROM TOWN; CREW ESCAPES`, `GUSHER RUNS WILD ON ${farm}, DERRICK LOST`, `${co} WELL BLOWS OUT; HOUSTON MEN CALLED`],
    spill: [`SALT WATER KILLS COTTONWOODS ON ${farm}`, `${farm} OWNER SAYS PIT RAN OVER; ${co} "LOOKING INTO IT"`, `BRINE IN THE CREEK BELOW ${well}, RANCHER SAYS`],
    citation: [`STATE FIELD MAN CITES ${co} AT ${well}`, `COMMISSION FINES ${co}; "ROUTINE," SAYS OPERATOR`, `${well} DRAWS CITATION FOR ${up(ctx.what || 'VIOLATIONS')}`],
    bribeRefused: [`${who} SAYS OIL MAN OFFERED "ENVELOPE"`, `OFFER OF ${amt || 'CASH'} REFUSED, ${who} TELLS SHERIFF`, `${co} MAN TRIED TO BUY ${up(ctx.title || 'OFFICIAL')}, IT IS CHARGED`],
    bribeExposed: [`CANCELLED CHEQUE LINKS ${co} TO ${who}`, `"CONSULTING FEE" TO ${who} DRAWS QUESTIONS`, `GRAND JURY ASKS ABOUT ${co} MONEY AT COURTHOUSE`],
    blackmail: [`${who} SAYS OIL MAN THREATENED TO "TELL ALL"`, `EXTORTION CHARGED IN ${co} PERMIT MATTER`, `${who}: "I WILL NOT BE BULLIED BY THE OIL CROWD"`],
    threat: [`${who} REPORTS THREAT BY ${co} EMPLOYEE`, `SHERIFF LOOKS INTO "ROUGH TALK" AT ${up(ctx.title || 'OFFICE')}`, `OIL COMPANY MAN "LEANED ON" ${who}, COMPLAINT SAYS`],
    bigDonation: [`${co} GIVES ${amt} TO ${who} CAMPAIGN`, `LARGEST CONTRIBUTION IN COUNTY HISTORY, CLERK SAYS`, `OIL MONEY FLOWS TO ${who}; OPPONENT CRIES FOUL`],
    discovery: [`OIL! ${co} STRIKES PAY ON ${farm}`, `NEW FIELD OPENED BY ${co}; LANDMEN SWARM COURTHOUSE`, `${well} FLOWS ${ctx.ip ? Math.round(ctx.ip) + ' BARRELS' : 'OIL'}; TOWN CELEBRATES`],
    puff: [`${co} "HERE TO STAY," PRESIDENT SAYS`, `LOCAL OIL FIRM PLANS EXPANSION, MORE JOBS`, `${co} PAYROLL NOW LARGEST IN COUNTY`],
    endorsement: [`${who} PRAISES OIL FIRM'S GENEROSITY`, `"A BLESSING TO THIS TOWN," PASTOR SAYS OF ${co}`, `CHURCH ROOF FUND THANKS ${co}`],
    community: [`${co} GIVES TO ${up(ctx.what || 'SCHOOL')}`, `OIL FIRM SPONSORS ${up(ctx.what || 'HOMECOMING')}`, `${co} REMEMBERS THE TOWN, BOARD SAYS`],
    strike: [`ROUGHNECKS WALK OUT AT ${co}`, `PICKETS AT ${co} LEASES; SHERIFF KEEPS PEACE`, `STRIKE HALTS ${co} DRILLING; TALKS STALLED`],
    strikebreak: [`TULSA MEN BREAK ${co} PICKET LINE`, `SCABS AT ${co} LEASES; TWO HURT`, `"STRIKEBREAKERS," CRY ${co} MEN AS TRUCKS ROLL`],
    unionWon: [`OIL WORKERS UNION WINS AT ${co}`, `${co} MEN VOTE UNION; COMPANY "WILL COMPLY"`],
    workerDeath: [`ROUGHNECK KILLED ON ${co} RIG AT ${farm}`, `${up(ctx.worker || 'DERRICK MAN')} DIES IN FALL AT ${well}`, `FUNERAL SATURDAY FOR ${co} DRILLING HAND`],
    coverup: [`${co} HID RIG DEATH, WITNESS SAYS`, `"THEY BURIED HIM AND THE REPORT," CREWMAN CHARGES`, `SHERIFF REOPENS ${well} DEATH AFTER LETTER`],
    drunkDriller: [`DRUNK ON THE BRAKE: ${co} DRILLER FACES CHARGE`, `${co} RIG HAND HAD BOTTLE ON TOUR, CREW SAYS`],
    hotOil: [`"HOT OIL" RUN FROM ${co} LEASES, COMMISSION CHARGES`, `TRUCKS AT NIGHT: ${co} ACCUSED OF OVERPRODUCING`, `STATE SEIZES TANK TRUCK OF ${co} CRUDE`],
    tornado: [`TWISTER RIPS COUNTY; DERRICKS DOWN AT ${farm}`, `TORNADO LEVELS ${up(ctx.what || 'TANK BATTERY')}, SPARES TOWN`, `CYCLONE STRIKES SOUTH OF DRY FORK`],
    flood: [`COYOTE CREEK OUT OF ITS BANKS; LEASES UNDER WATER`, `FLOOD CUTS ROADS, STOPS PUMPS ALONG CREEK`, `HIGH WATER AT ${farm}; OIL SLICK SEEN DOWNSTREAM`],
    iceStorm: [`ICE STORM DOWNS LINES; PUMPS STILL ACROSS COUNTY`, `WORST ICE IN MEMORY CLOSES ROADS, LEASES`],
    drought: [`DRIEST SUMMER SINCE '36; STOCK TANKS EMPTY`, `DROUGHT DEEPENS; FARMERS EYE OIL COMPANY WATER`],
    tankFire: [`LIGHTNING FIRES ${co} TANKS AT ${farm}`, `TANK BATTERY BURNS ALL NIGHT ON ${farm}`],
    prairieFire: [`PRAIRIE FIRE SWEEPS FROM ${co} LEASE; PASTURE LOST`, `FLARE BLAMED FOR GRASS FIRE ON ${farm}`],
    wellFire: [`${well} STILL BURNING; SMOKE SEEN FOR 40 MILES`, `WILD WELL AT ${farm} DEFIES CREWS`],
    wellFireOut: [`${well} FIRE OUT; ${up(ctx.who || 'CREW')} SNUFFS BLAZE`, `TEXAS FIRE FIGHTER KILLS ${well} IN ONE DAY`],
    letItBurn: [`${co} LETS ${well} BURN; NEIGHBOURS FURIOUS`, `"THEY JUST WATCH IT," RANCHER SAYS OF ${well} FIRE`],
    disasterHelp: [`${co} CREWS HELP CLEAR TOWN AFTER STORM`, `OIL FIRM LENDS TRUCKS, MEN TO RELIEF`, `${co} FEEDS STORM VICTIMS AT THE CAFE`],
    lawsuit: [`LANDOWNERS SUE ${co} OVER PERMITS`, `COYOTE CREEK COMMITTEE FILES AGAINST ${co}`],
    investigation: [`SHERIFF LOOKS INTO ${co} COURTHOUSE DEALINGS`, `STATE MEN IN TOWN ASKING ABOUT ${co}`, `GRAND JURY MAY HEAR ${co} MATTER, SOURCES SAY`],
    indictment: [`${co} PRESIDENT INDICTED`, `GRAND JURY RETURNS TRUE BILL AGAINST OIL MAN`, `${up(ctx.charge || 'BRIBERY')} CHARGED; ${co} HEAD TO ANSWER`],
    conviction: [`${co} PRESIDENT GUILTY`, `JURY OUT TWO HOURS; OIL MAN CONVICTED`],
    acquittal: [`${co} PRESIDENT ACQUITTED; "VINDICATED," HE SAYS`, `JURY FREES OIL MAN; SHERIFF "DISAPPOINTED"`],
    prison: [`${co} HEAD SENTENCED TO STATE PENITENTIARY`, `OIL MAN GETS TWO YEARS; COMPANY TO CARRY ON`],
    forcedAccess: [`DEPUTY, BULLDOZER AT ${farm} GATE`, `${who} LOSES FIGHT TO KEEP ${co} OFF LAND`],
    rivalScandal: [`${rival} ${up(ctx.detail || 'IN COURTHOUSE SCANDAL')}`, `${rival} MEN "BOUGHT PERMITS," RECORDS SUGGEST`, `${rival} DENIES ${up(ctx.detail || 'IMPROPRIETY')}`],
    smear: [`${rival} "CUTTING CORNERS," SOURCES SAY`, `QUESTIONS RAISED ABOUT ${rival} WELLS`, `${rival} PAYS ROYALTIES LATE, OWNERS COMPLAIN`],
    libelExposed: [`${co} PLANTED ${rival} STORY, EDITOR ADMITS`, `CLARION RETRACTS; BLAMES ${co} FOR "FALSE ITEM"`],
    rivalTrick: [`${rival} ${up(ctx.detail || 'ACCUSED OF SHARP PRACTICE')}`, `${rival} LANDMAN CAUGHT ${up(ctx.detail || 'AT COURTHOUSE')}`],
    rivalIndicted: [`${rival} OFFICERS INDICTED`, `GRAND JURY NAMES ${rival} IN COURTHOUSE PROBE`],
    sabotage: [`VALVES OPENED AT ${well}; SHERIFF SUSPECTS MISCHIEF`, `${co} WELL DAMAGED IN NIGHT; "NO ACCIDENT," FOREMAN SAYS`],
    whistleblower: [`FORMER ${co} MAN TELLS ALL TO COMMISSION`, `"THE BOOKS WERE CREATIVE," EX-PUMPER SAYS OF ${co}`],
    resurfaced: [`${up(ctx.original || 'OLD STORY')} - WHY DID IT NOT RUN?`, `CLARION KILLED ${co} STORY LAST YEAR; HERE IT IS`, `THE STORY ${co} DID NOT WANT YOU TO READ`],
    boughtPaper: [`${co} BUYS THE CLARION; EDITOR TO STAY "FOR NOW"`, `NEW OWNER FOR COUNTY'S PAPER`],
    election: [`ELECTION RETURNS: ${up(ctx.text || 'COUNTY VOTES')}`],
    tremor: [`EARTH SHAKES IN DRY FORK; STATE MAN BLAMES ${co} WELL`, `TREMOR CRACKS CHIMNEYS; DISPOSAL WELL SUSPECTED`],
    magazine: [`EASTERN MAGAZINE CALLS ${co} "POISONER OF THE PRAIRIE"`, `NATIONAL PHOTOGRAPHER SHOOTS ${co} FLARES`],
    waterComplaint: [`${farm} WATER WELL TURNED SALTY, OWNER SAYS`, `FARMERS BLAME ${co} FOR BAD WATER`],
    farmerWater: [`${farm} WATER WELL TURNED SALTY, OWNER SAYS`, `FARMERS BLAME ${co} FOR BAD WATER`],
    pledgeBroken: [`${co} PROMISED TO STOP FLARING; FLARES STILL BURN`],
    astroturf: [`"CITIZENS FOR PROSPERITY" SHARES BOX WITH ${co} BOOKKEEPER`],
    insurance: [`${co} INSURED; ${up(ctx.what || 'CLAIM PAID')}`],
    generic: [`${up(ctx.text || co + ' IN THE NEWS')}`],
  };
  return pick(H[kind] || H.generic);
}

// The hook. opts: {about:'player'|<rival name>, heat, repHit, lawHeat, truth, crimeId, headline, ...ctx}
export function reportStory(state, kind, opts = {}) {
  const P = state.press; if (!P) return null;
  const def = STORY_KINDS[kind] || STORY_KINDS.generic;
  const ctx = { company: state.company.name, ...opts };
  const s = {
    id: P.nextId++, month: state.month, kind, subject: opts.subject || opts.well || opts.person || opts.rival || null, about: opts.about || 'player',
    heat: clamp(Math.round(opts.heat ?? def.heat), 5, 100), truth: opts.truth ?? true, repHit: opts.repHit ?? def.repHit, lawHeat: opts.lawHeat ?? def.lawHeat,
    status: P.owned && (opts.repHit ?? def.repHit) > 0 && (opts.about || 'player') === 'player' ? 'held' : 'brewing', printMonth: state.month + (opts.delay ?? def.delay),
    headline: opts.headline || headlineFor(kind, ctx), crimeId: opts.crimeId ?? null, coverup: false,
  };
  P.stories.push(s);
  if (P.stories.length > 120) P.stories = P.stories.filter((x) => x.status === 'brewing' || x.status === 'buried' || x.status === 'held' || state.month - x.month < 60).slice(-120);
  return s;
}

export function adDiscount(state) { return state.press.adUntil > state.month ? 0.3 : 0; }
function editorHostile(state) { const e = state.people?.[state.offices?.editor]; return !!(e && e.hostile); }

export function tickPress(state, log) {
  const P = state.press;
  const openInvestigation = (state.law?.investigations || []).some((i) => i.status === 'open');
  // 1. Buried stories resurface.
  for (const s of P.stories) {
    if (s.status !== 'buried' && !(s.status === 'killed' && P.rivalPaper)) continue;
    const p = s.status === 'killed' ? 0.06 : 0.01 + 0.03 * s.heat / 100 + (openInvestigation ? 0.05 : 0) + (editorHostile(state) ? 0.05 : 0);
    if (!chance(p)) continue;
    const original = s.headline;
    s.status = 'brewing'; s.printMonth = state.month; s.heat = Math.min(100, Math.round(s.heat * 1.4)); s.coverup = true; s.lawHeat += 5; s.repHit = Math.round(s.repHit * 1.3);
    s.headline = headlineFor('resurfaced', { company: state.company.name, original });
    if (s.crimeId) { const c = (state.crimes || []).find((x) => x.id === s.crimeId); if (c) c.discovered = true; }
  }
  // 2. Publish the top three brewing stories.
  const ready = P.stories.filter((s) => s.status === 'brewing' && s.printMonth <= state.month).sort((a, b) => b.heat - a.heat);
  const printed = ready.slice(0, 3);
  for (const s of printed) publish(state, s, log);
  for (const s of ready.slice(3)) { s.printMonth = state.month + 1; if (state.month - s.month > 6) s.status = 'stale'; }
  // Held stories (you own the paper) auto-print after three months if nobody decides; the printers need copy.
  for (const s of P.stories) if (s.status === 'held' && state.month - s.month >= 3) { s.status = 'brewing'; s.printMonth = state.month; }
  // 3. Decay.
  P.notoriety = Math.max(0, P.notoriety * 0.97 - 0.2);
  P.goodwill = Math.max(0, P.goodwill * 0.96);
  // 4. Ads expire quietly.
  if (P.adUntil <= state.month) P.adUntil = -1;
}

function publish(state, s, log) {
  const P = state.press;
  s.status = 'published'; s.printedMonth = state.month; P.printed++;
  if (s.about === 'player') {
    if (s.repHit > 0) P.notoriety = Math.min(100, P.notoriety + s.repHit * (1 - adDiscount(state)));
    else P.goodwill = Math.min(60, P.goodwill - s.repHit);
    if (s.lawHeat && state.law) state.law.heat = clamp(state.law.heat + s.lawHeat, 0, 100);
    if (s.repHit >= 10) state.env.activism = clamp(state.env.activism + s.repHit * 0.4, 0, 100);
  } else {
    const comp = state.competitors.find((c) => c.name === s.about);
    if (comp) { comp.standing = clamp((comp.standing ?? 55) - s.repHit, 0, 100); if (s.kind === 'rivalScandal' || s.kind === 'rivalTrick') comp.heat = clamp((comp.heat || 0) + 15, 0, 100); }
  }
  P.clippings.push({ id: s.id, month: state.month, kind: s.kind, headline: s.headline, about: s.about, coverup: s.coverup, repHit: s.repHit });
  while (P.clippings.length > 60) P.clippings.shift();
  log(`THE CLARION: ${s.headline}${s.coverup ? ' (the paper notes the story was held last year)' : ''}`, 'press');
}

// --- Player actions -----------------------------------------------------------------------
export function buyAds(state, amount) {
  const P = state.press;
  amount = Math.round(amount);
  if (amount <= 0) return { ok: false, msg: 'Nothing to buy.' };
  if (state.company.cash - amount < -state.company.creditLimit) return { ok: false, msg: 'Cannot afford it.' };
  state.company.cash -= amount; state.ledger.other += amount; P.adSpend += amount;
  const months = clamp(Math.round(amount / inflate(state, 300)), 1, 6);
  P.adUntil = Math.max(P.adUntil, state.month) + months;
  const gw = Math.min(6, amount / inflate(state, 200));
  P.goodwill = Math.min(60, P.goodwill + gw);
  P.notoriety = Math.max(0, P.notoriety - Math.min(4, amount / inflate(state, 400)));
  const e = state.people?.[state.offices?.editor]; if (e) e.disposition = clamp(e.disposition + 4, 0, 100);
  const msg = `${money(amount)} in display advertising: "${pick(['THE COMPANY THAT PAYS ITS ROYALTIES ON TIME', 'PROGRESS COMES TO DRY FORK', 'YOUR NEIGHBOURS IN THE OIL BUSINESS', 'JOBS. TAXES. A FUTURE.'])}" runs for ${months} week${months > 1 ? 's' : ''}. Bad news is printed smaller while it does.`;
  state.log?.(msg, 'press');
  return { ok: true, msg, cost: amount, months };
}
export function paperPrice(state) { return inflate(state, 40_000); }
export function buyPaper(state) {
  const P = state.press;
  if (P.owned) return { ok: false, msg: 'You already own the Clarion.' };
  const cost = paperPrice(state);
  if (state.company.cash - cost < -state.company.creditLimit) return { ok: false, msg: `The Clarion, its press and its debts are ${money(cost)}. You cannot cover it.` };
  state.company.cash -= cost; state.ledger.other += cost;
  P.owned = true; P.ownedSince = state.month;
  const e = state.people?.[state.offices?.editor]; if (e) { e.disposition = 80; e.hostile = false; e.bought = true; }
  reportStory(state, 'boughtPaper', {});
  for (const s of P.stories) if (s.status === 'brewing' && s.about === 'player' && s.repHit > 0) s.status = 'held';
  const msg = `You own The Dry Fork Clarion: one flatbed press, a Linotype, a mortgage and four hundred subscribers. From now on you decide what runs.`;
  state.log?.(msg, 'press');
  return { ok: true, msg, cost };
}
export function decideStory(state, storyId, decision) {
  const P = state.press;
  const s = P.stories.find((x) => x.id === storyId);
  if (!s || s.status !== 'held') return { ok: false, msg: 'That story is not on your desk.' };
  if (decision === 'print') { s.status = 'brewing'; s.printMonth = state.month; return { ok: true, msg: `"${s.headline}" will run.` }; }
  s.status = 'killed'; s.killedMonth = state.month; P.kills++;
  let msg = `"${s.headline}" goes in the stove.`;
  if (P.kills >= 3 && !P.rivalPaper && chance(0.4)) { P.rivalPaper = true; msg += ' Two of your reporters quit and start a mimeographed weekly called the Free Press. It prints what you would not.'; state.log?.('A rival paper, the Dry Fork Free Press, begins printing out of the back of the feed store.', 'press'); }
  return { ok: true, msg };
}
// Plant a story about a rival or yourself. Goes through the editor's disposition when you do not own the paper.
export function plantStory(state, opts = {}) {
  const P = state.press;
  const target = opts.target || 'self';
  if (!P.owned) {
    const e = state.people?.[state.offices?.editor];
    if (!e || e.disposition < 55) return { ok: false, msg: 'The editor is not in the mood to print what you hand in. Talk to them first.' };
  }
  if (target === 'self') { reportStory(state, 'puff', {}); return { ok: true, msg: 'A flattering piece about the company will run above the fold.' }; }
  const comp = state.competitors.find((c) => c.name === target);
  if (!comp) return { ok: false, msg: 'Nobody by that name.' };
  const dirt = (state.dirt || []).find((d) => d.personId === `comp:${comp.name}` && !d.used);
  if (dirt) { dirt.used = true; reportStory(state, 'rivalScandal', { rival: comp.name, about: comp.name, detail: dirt.kind, heat: 60, repHit: 14 }); comp.hostility = clamp((comp.hostility || 0) + 25, 0, 100); return { ok: true, msg: `The Clarion will print what you know about ${comp.name}.` }; }
  return { ok: false, msg: 'You have nothing true to print about them. Ask the editor to plant it, if you have the stomach for libel.', needs: 'dirt' };
}
export function pressSummary(state) {
  const P = state.press;
  return { goodwill: Math.round(P.goodwill), notoriety: Math.round(P.notoriety), owned: P.owned, rivalPaper: P.rivalPaper, adUntil: P.adUntil,
    brewing: P.stories.filter((s) => s.status === 'brewing' && s.about === 'player'), held: P.stories.filter((s) => s.status === 'held'), buried: P.stories.filter((s) => s.status === 'buried'), clippings: P.clippings.slice().reverse() };
}
