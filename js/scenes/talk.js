// Who says what. TALK[id](state, ctx, extra) builds a dialogue tree (see ui/dialogue.js for the node
// shape) from the current state, so every conversation reads the world as it is. The officials (mayor,
// judge, sheriff, editor, banker, cafe owner, inspector, preacher) use the sim's conversation() from
// people.js as their tree, adapted by adaptNode(): the root lists the asks, an ask lists the methods, and
// running a method shows the outcome as the next node. Founders use founderTalk() the same way.
// eventTree() wraps a pending decision event so it appears as a person talking instead of a form.
import { money, pct, dateStr, fmt } from '../util.js';
import { ROLES, PARTIES, OWNER_TYPES } from '../data.js';
import { hire } from '../staff.js';
import { EVENTS, resolveEvent, speakerFor } from '../events.js';
import { leaseAsk, surfaceAsk, isPublic } from '../land.js';
import { acreageAsk, tipSheriffOn, rivalSummary } from '../competitors.js';
import { surveysFor, neighbours } from '../geology.js';
import { statusLabel, poolFor } from '../wells.js';
import { interestRate, yearOf, inflate } from '../era.js';
import { hedgeQuote } from '../market.js';
import { getRngState, setRngState } from '../rng.js';
import { conversation, holder, portraitFor } from '../people.js';
import { lawSummary, hireDetective, detectiveCost, hireLawyer } from '../law.js';
import { pressSummary } from '../press.js';
import { permitSummary } from '../government.js';
import { founderTalk, isFounding, canForm, FOUNDERS } from '../founding.js';
import { isAbsent } from '../sim.js';

const N = (text, options = [], extra = {}) => ({ text, options, ...extra });
const O = (label, rest = {}) => ({ label, ...rest });
const LEAVE = (label = 'Good day.') => O(label);
export const ROLE_SPRITE = { geologist: 'geologist', landman: 'landman', driller: 'roughneck', completions: 'roughneck', production: 'roughneck', marketing: 'ceo', govaffairs: 'ceo', pr: 'clerk' };
const ownerSprite = (p) => ({ farmer: 'farmer', rancher: 'rancher', homes: 'ceo', state: 'clerk', federal: 'clerk' }[p.surface.type] || 'farmer');

// The officeholder's speaker line; falls back to the Phase 2 names if the roster is missing.
function personSpeaker(state, office, name, title, sprite) {
  const p = holder(state, office);
  return p ? { name: p.name, title: p.title, sprite: portraitFor(p) } : { name, title, sprite };
}
export const SPEAKERS = {
  dot: () => ({ name: 'Dot', title: 'your secretary', sprite: 'clerk' }),
  banker: (s) => personSpeaker(s, 'banker', 'H. Fenwick', 'First State Bank of Dry Fork', 'banker'),
  teller: () => ({ name: 'Miss Okafor', title: 'teller', sprite: 'clerk' }),
  mayor: (s) => personSpeaker(s, 'mayor', 'Mayor Cyrus Bellweather', 'Mayor of Dry Fork', 'mayor'),
  judge: (s) => personSpeaker(s, 'judge', 'Judge Amos Thibodeaux', 'county judge', 'mayor'),
  clerk: () => ({ name: 'Ida Quintero', title: 'county clerk', sprite: 'clerk' }),
  sheriff: (s) => personSpeaker(s, 'sheriff', 'Sheriff Hollis Trask', 'Dry Fork County', 'sheriff'),
  editor: (s) => personSpeaker(s, 'editor', 'Beatrix Duvall', 'editor and publisher, The Clarion', 'reporter'),
  reporter: () => ({ name: 'Wes Iverson', title: 'reporter, The Clarion', sprite: 'reporter' }),
  waitress: (s) => personSpeaker(s, 'saloon', 'Pearl Mabry', 'proprietor, Bluebonnet Cafe', 'waitress'),
  inspector: (s) => personSpeaker(s, 'inspector', 'The field man', 'State Corporation Commission', 'clerk'),
  preacher: (s) => personSpeaker(s, 'preacher', 'Rev. Stroud', 'First Methodist Church', 'oldtimer'),
  oldtimer: () => ({ name: 'Old Ezra', title: "drilled the Hollister in '26", sprite: 'oldtimer' }),
  agent: () => ({ name: 'Amos Petrov', title: 'station agent, Rock Island', sprite: 'clerk' }),
  landoffice: () => ({ name: 'Vernon Whitlock', title: 'abstracts and leases drawn', sprite: 'landman' }),
  surveyor: () => ({ name: 'Gus Lindqvist', title: 'Prairie Seismograph Service', sprite: 'geologist' }),
  storekeeper: () => ({ name: 'Mrs. Hargrove', title: 'Hargrove Mercantile', sprite: 'clerk' }),
  picketer: () => ({ name: 'A picketer', title: 'Citizens Against the Flares', sprite: 'picketer' }),
  toolpusher: () => ({ name: 'Bull Sandoval', title: 'toolpusher', sprite: 'roughneck' }),
  hotelclerk: () => ({ name: 'Nell', title: 'desk clerk, Dry Fork Hotel', sprite: 'waitress' }),
  yardhand: () => ({ name: 'Chuy', title: 'yard hand', sprite: 'roughneck' }),
  detective: () => ({ name: 'Tulsa Confidential Agency', title: 'long distance', sprite: 'landman' }),
  lawyer: () => ({ name: 'T. Underhill', title: 'attorney at law', sprite: 'banker' }),
  statemen: () => ({ name: 'Two men in grey suits', title: "state attorney general's office", sprite: 'landman' }),
};

// ---------------- adapting sim conversation nodes ----------------
// Sim nodes: {title, text, speaker:{name,portrait,title}, options:[{label, effect(state,params,log)->result,
// disabled?, hint?, cost?, next?: {personId, ask} | (state)=>node, close?}]}. Building a node must not
// touch the sim RNG (askLine picks a line), so the RNG is restored around it; effects run for real.
function pure(fn) { const r = getRngState(); try { return fn(); } finally { setRngState(r); } }
const simSpeaker = (sp) => (sp ? { name: sp.name || '', title: sp.title || '', sprite: sp.portrait || sp.sprite || 'clerk' } : undefined);

function adaptNode(state, ctx, node, opts = {}) {
  if (!node) return null;
  const speaker = simSpeaker(node.speaker);
  const o = { ...opts, speaker };
  const title = node.title && node.title !== speaker?.title && node.title !== speaker?.name ? node.title : undefined;
  return { speaker, title, text: node.text, options: (node.options || []).map((x) => adaptOption(state, ctx, x, o)) };
}
function adaptOption(state, ctx, o, opts) {
  let result = null;
  const out = { label: o.label, hint: o.hint, disabled: !!o.disabled };
  if (o.effect) out.effect = (s, p, log) => { result = o.effect(s, p, log) || null; return null; };
  const ref = o.next;
  out.next = (s, c) => {
    const text = result && (result.text || result.msg);
    if (text && (o.close || !ref)) return resultNode(s, c, text, result, opts);
    if (typeof ref === 'function') return adaptNode(s, c, pure(() => ref(s)), opts);
    if (ref && typeof ref === 'object') return adaptNode(s, c, pure(() => conversation(s, ref.personId, ref.ask, opts.askOpts)), opts);
    return null; // closes the box
  };
  return out;
}
// What happened, in the speaker's voice, with a way back to the start of the conversation.
function resultNode(state, ctx, text, r, opts) {
  const mood = !r ? '' : r.ok ? 'pleased' : ['reported', 'bluffCalled'].includes(r.outcome) ? 'furious' : r.outcome === 'refused' ? 'unmoved' : '';
  const options = [];
  if (opts.root) options.push(O('Anything else?', { next: (s) => opts.root(s) }));
  if (isFounding(state) && canForm(state).ok) options.push(O('Sign the papers.', { open: 'sign' }));
  options.push(LEAVE(r && r.ok ? 'Much obliged.' : 'Good day.'));
  return { speaker: opts.speaker ? { ...opts.speaker, mood } : undefined, text, options };
}
// An officeholder: the sim's ask/method tree plus any flavour options and nodes the room wants.
function officialTree(state, ctx, office, extra = {}) {
  const askOpts = extra.askOpts || {};
  const root = (s) => {
    const n = adaptNode(s, ctx, pure(() => conversation(s, office, null, askOpts)), { root, askOpts });
    if (!n) return null;
    const flav = (typeof extra.options === 'function' ? extra.options(s) : extra.options) || [];
    n.options.splice(Math.max(0, n.options.length - 1), 0, ...flav);
    return n;
  };
  const start = extra.ask ? (s) => adaptNode(s, ctx, pure(() => conversation(s, office, extra.ask, askOpts)), { root, askOpts }) || root(s) : root;
  return { speaker: SPEAKERS[extra.speakerKey || office]?.(state), start, nodes: { main: root, ...(extra.nodes || {}) } };
}
// A founder during the founding year: founderTalk() adapted, with extra options spliced in before "Walk away".
function founderTree(state, ctx, id, extraOptions = [], nodes = {}) {
  if (!FOUNDERS[id]) return null;
  const root = (s) => { const n = adaptNode(s, ctx, pure(() => founderTalk(s, id)), { root }); if (n && extraOptions.length) n.options.splice(Math.max(0, n.options.length - 1), 0, ...extraOptions); return n; };
  const sp = pure(() => founderTalk(state, id)).speaker;
  return { speaker: simSpeaker(sp), start: root, nodes: { main: root, ...nodes } };
}

export function nextStepHint(state) {
  const mine = state.parcels.filter((p) => p.mineral.leasedBy === 'player');
  const drilling = state.wells.filter((w) => ['permit', 'drill', 'complete'].includes(w.status));
  const producing = state.wells.filter((w) => w.status === 'producing');
  const shut = state.wells.filter((w) => w.status === 'shutin');
  const L = lawSummary(state);
  if (L.investigations.length) return `The ${L.investigations[0].by === 'sheriff' ? 'sheriff' : 'state'} has a file open on us. A lawyer on retainer slows them down; the sheriff's office is across the square.`;
  if (shut.length) return `${shut[0].name} is down and needs a workover. The well files are in the cabinet.`;
  if (!mine.length) return 'You hold no leases. Pick a section on the land map, then see the Land Office in the Mercantile, or call the owner from the parcel file.';
  const noSurface = mine.find((p) => !p.surface.agreement);
  if (noSurface && !drilling.length && !producing.length) return `You have the minerals under ${noSurface.surface.name} but no surface agreement. ${noSurface.surface.ownerPerson} takes coffee at the Bluebonnet.`;
  const ready = mine.find((p) => p.surface.agreement && !p.wells.length);
  if (ready && !drilling.length) return `${ready.surface.name} is leased and signed. Design a well from the parcel file, or shoot a seismic line first if you like sleeping at night.`;
  if (drilling.length) return `${drilling[0].name} is ${statusLabel(drilling[0]).toLowerCase()}. ${drilling[0].phaseEnd - state.month} month${drilling[0].phaseEnd - state.month === 1 ? '' : 's'} to go. Advance the month when you are ready.`;
  if (producing.length) return `${producing.length} well${producing.length > 1 ? 's' : ''} pumping. Keep them healthy, keep the bank happy, and keep out of the Clarion.`;
  return 'Nothing pressing. The calendar is on the wall when you want to move the month along.';
}

export const TALK = {
  // The walkthrough on the depot platform when a new game starts.
  intro(state) {
    const f = state.founding;
    return { speaker: SPEAKERS.agent(), start: 'main', nodes: {
      main: N(`${dateStr(state.month)}. Dry Fork, end of the line. ${state.player?.name && state.player.name !== 'The newcomer' ? `${state.player.name}, is it? ` : ''}You step off the westbound with a suitcase and ${money(f?.personalCash || 0)} of your own money, and no company. Yet. I'm Petrov, I run the depot. New in the oil business?`, [
        O('What do I do first?', { next: 'first' }),
        O('How do I get around?', { next: 'keys' }),
        O("I'll manage."),
      ]),
      first: N(`Three things before First State Bank will open an account in a company's name. A geologist: Doc Pruitt drinks his lunch at the Bluebonnet Cafe, and Miss Cobb at the Mercantile has the degree if not the reputation. A rig: Bull Sandoval's at the yard on Second Street, or the Jessup brothers' rotary on that flatcar behind you. And money: Cravens at the hotel, the widow and the pastor at the church, or Ellison at the bank once you've got the other two. Then you sign the papers. You've got about a year of hotel money to do it in.`, [
        O('How do I talk to them?', { next: 'talk' }),
        O('How do I get around?', { next: 'keys' }),
        O('Got it.'),
      ]),
      talk: N(`Walk up to a building and press Space, or click it. Inside, anybody with a dollar sign over their head has a deal to offer. Take their terms, or counter: a counter is a better deal for you, and some of them will take it, and some will laugh. The line at the bottom of the screen tells you what's still missing; so does the checklist up top.`, [
        O('How do I get around?', { next: 'keys' }),
        O('Got it.'),
      ]),
      keys: N(`Arrow keys or WASD to walk, or click where you want to go. Space enters a building or talks to whoever's nearest. Esc steps back out. T brings you to town from anywhere, O to your rooms, M to the land map. N moves the calendar along a month, when you're ready for that. Your papers are in the FILES folder on the right edge of the screen.`, [
        O('What do I do first?', { next: 'first' }),
        O('Thanks.'),
      ]),
    } };
  },
  dot(state) {
    const c = state.company;
    if (isAbsent(state)) {
      return { speaker: SPEAKERS.dot(), start: N(`I am keeping the lights on until ${dateStr(state.law.absentUntil)}. The bookkeeper signs what has to be signed, nobody drills, and I tell the men you send your regards. ${state.staff.length ? `${state.staff.length} on the payroll, for now.` : 'The office is empty.'} Cash stands at ${money(c.cash)}.`, [O('Bring me the books.', { tab: 'company' }), O('Move the calendar along.', { action: 'next' }), LEAVE('Thank you, Dot.')]) };
    }
    return { speaker: SPEAKERS.dot(), start: 'main', nodes: {
      main: N(`Morning. It is ${dateStr(state.month)}. Cash stands at ${money(c.cash)}${c.cash < 0 ? ', which is to say we are into the bank' : ''}. ${nextStepHint(state)}`, [
        O('What should I do next?', { next: 'hint' }),
        O('Bring me the books.', { tab: 'company' }),
        O('Any messages?', { next: 'messages' }),
        O('Move the calendar along.', { action: 'next' }),
        LEAVE('Thanks, Dot.'),
      ]),
      hint: N((s) => nextStepHint(s), [O('Right.', { next: 'main' })]),
      messages: N((s) => { const n = s.news.slice(-3).reverse(); return n.length ? n.map((x) => `${dateStr(x.month)}: ${x.text}`).join('  ') : 'Nothing but the Clarion.'; }, [O('Noted.', { next: 'main' })]),
    } };
  },
  // The first morning after incorporation.
  firstday(state) {
    const c = state.company;
    return { speaker: SPEAKERS.dot(), start: N(`Dot. I came with the rooms. The sign painter wants ${money(inflate(state, 12))} and says he can have "${c.name}" on the glass by Thursday. ${money(c.cash)} in the account${c.loan ? `, ${money(c.loan.monthly)} a month to the bank` : ''}, ${state.staff.length} on the payroll, and a ${money(c.creditLimit)} line if it comes to that. ${nextStepHint(state)}`, [O('Bring me the books.', { tab: 'company' }), O('Show me the land map.', { goto: 'map' }), LEAVE("Let's get to work.")]) };
  },
  staff(state, ctx, { arg }) {
    const s = state.staff.find((x) => x.id === +arg);
    if (!s) return null;
    const role = ROLES[s.role];
    const busy = s.busyUntil > state.month, away = s.awayUntil > state.month;
    const status = away ? 'They have not been seen this month.' : busy ? `Busy: ${s.task || 'on a job'}, ${s.busyUntil - state.month} month${s.busyUntil - state.month === 1 ? '' : 's'} to go.` : 'Available for whatever comes next.';
    const loyalty = s.loyalty === undefined ? '' : s.loyalty < 30 ? ' If you want my honest opinion, you would not like it.' : s.loyalty > 75 ? ' Whatever you need.' : '';
    return { speaker: { name: s.name, title: `${role.name}, skill ${s.skill}/10${s.founder ? ', partner' : ''}`, sprite: ROLE_SPRITE[s.role] || 'clerk' }, start: N(`${role.desc} ${status} ${s.years} years in the business; ${money(s.salary)} a month${s.equity ? ` and ${Math.round(s.equity * 100)} percent of the company` : ''}.${loyalty}`, [
      O('See the staff ledger.', { tab: 'staff' }),
      LEAVE('Carry on.'),
    ]) };
  },
  founder(state, ctx, { arg }) { return founderTree(state, ctx, arg); },
  banker(state, ctx) {
    const chat = N((s) => { const rival = s.competitors.filter((x) => !x.dormant).sort((a, b) => b.held.length - a.held.length)[0]; return `${rival ? `${rival.name} holds ${rival.held.length} sections and banks elsewhere, which tells you something.` : ''} Leases are going for about $${Math.round(s.land.hype)} an acre. ${s.env.activism > 30 ? 'And there is grumbling about the oil business at the Grange, which I would take seriously.' : 'The county is glad of the business, for now.'}`; }, [O('Good to know.', { next: 'main' })]);
    if (isFounding(state)) return founderTree(state, ctx, 'ellison', [O('What do you hear around town?', { next: 'chat' })], { chat });
    const c = state.company, rate = interestRate(state);
    const over = c.cash < -c.creditLimit;
    const tone = over ? `You are past your line and I have said so in writing. ${3 - (c.underwater || 0)} month${3 - (c.underwater || 0) === 1 ? '' : 's'} before the note is called.` : c.cash < 0 ? `You are drawn ${money(-c.cash)} against a ${money(c.creditLimit)} line at ${pct(rate, 1)}.` : `The line stands at ${money(c.creditLimit)} and you are not using it, which I approve of.`;
    return officialTree(state, ctx, 'banker', {
      options: [O('Show me where I stand.', { tab: 'company' }), O('Could the line be larger?', { next: 'line' }), O("I'd like to lock in a price for my oil.", { next: 'hedge' }), O('What do you hear around town?', { next: 'chat' })],
      nodes: {
        line: N((s) => `${tone} The line is half its base plus about two dollars for every dollar of lease cash flow you showed the last twelve months${s.company.loan ? `, and the note stands at ${money(s.company.loan.balance)}` : ''}. ${s.history.slice(-12).reduce((a, h) => a + h.net, 0) > 0 ? 'Your wells are paying; keep it up and the number grows on its own.' : 'Bring me a producing well and we will talk about a larger number.'} We do not lend against optimism. Not officially.`, [O('Understood.', { next: 'main' })]),
        hedge: N((s) => (hedgeQuote(s, 12) === null ? `There is no such thing, not in ${yearOf(s)}. Until some exchange in New York lists a crude contract, the only hedge is a purchaser who pays on time. Sell to the pipeline and pray.` : 'The bank can write a fixed-price agreement against a monthly volume. Let me get the form.'), [
          O('Show me the form.', { when: (s) => hedgeQuote(s, 12) !== null, open: 'hedge' }),
          O('Then I will pray.', { next: 'main' }),
        ]),
        chat,
      },
    });
  },
  teller(state) {
    return { speaker: SPEAKERS.teller(), start: N(`Deposits and withdrawals at this window. ${SPEAKERS.banker(state).name} handles the loans; he is at the desk pretending to read the Tulsa paper.`, [O('The ledger, please.', { tab: 'company' }), LEAVE('Thank you.')]) };
  },
  mayor(state, ctx) {
    return officialTree(state, ctx, 'mayor', {
      options: [O('Talk about permits and taxes.', { tab: 'gov' }), O('How are things at the courthouse?', { next: 'chat' })],
      nodes: {
        chat: N((s) => { const g = s.gov, party = PARTIES[g.party]; return `The ${party.name} runs the county, the election is ${g.monthsToElection} months off, and the severance tax is ${pct(g.severance, 1)}. ${s.gov.scandals ? `The Clarion has had its fun with the courthouse ${s.gov.scandals} time${s.gov.scandals > 1 ? 's' : ''} already; I would rather it did not have more.` : 'Quiet. I like quiet.'} ${s.env.activism > 45 ? 'There are people with signs on my square, which I do not like.' : ''} ${s.gov.freezeUntil > s.month ? 'And the permit freeze is out of my hands; talk to the judge.' : ''}`; }, [O('I see.', { next: 'main' })]),
      },
    });
  },
  judge(state, ctx, { ask }) {
    return officialTree(state, ctx, 'judge', {
      ask: ask || null,
      options: [O('About the permits.', { next: 'permits' }), O('A donation to the re-election fund.', { open: 'lobby' })],
      nodes: {
        permits: N((s) => { const P = permitSummary(s); return `${s.gov.freezeUntil > s.month ? `Your permits are frozen for ${s.gov.freezeUntil - s.month} more months on account of the lawsuit, and I am the one who froze them. ` : ''}The county has used ${P.used} of its ${P.budget} permits for ${P.year}${P.bonus ? `, ${P.bonus} of them found on the docket by special arrangement` : ''}. The commission's allowable is ${Math.round(P.allowable * 100)} percent. Permits take ${s.gov.permitMonths} month${s.gov.permitMonths > 1 ? 's' : ''} and cost ${money(s.gov.permitFee)}${s.gov.party === 'ring' ? ', and the Ring keeps me on the bench' : ', and the Reform Ticket expects me to read them first'}.`; }, [O('Then I have an ask.', { next: 'main' }), O('Your honour.')]),
      },
    });
  },
  inspector(state, ctx, { ask }) {
    const sel = state.parcels[ctx.ui.selected ?? -1];
    return officialTree(state, ctx, 'inspector', {
      ask: ask || null, askOpts: { parcelId: sel && sel.drillable ? sel.id : null },
      options: [O("The commission's rules.", { next: 'rules' }), O('The permit and tax notices.', { tab: 'gov' })],
      nodes: {
        rules: N((s) => { const P = permitSummary(s); return `Market-demand proration: every well in the state produces ${Math.round(P.allowable * 100)} percent of its yardstick until the purchasers want more, strippers excepted. Rule 37: one well to the section unless I sign an exception${P.waivers ? `, and you hold ${P.waivers}` : ''}. ${P.exemptions ? `You have ${P.exemptions} reservoir study on file that says otherwise.` : 'A "reservoir study" can say otherwise, if somebody writes one.'} I inspect what I can reach and fine what I find; the ${PARTIES[s.gov.party].name} sets the schedule.${sel ? ` If it is ${sel.surface.name} you mean, say so.` : ' Pick a section on the land map if you want a spacing exception on it.'}`; }, [O('Then I have an ask.', { next: 'main' }), LEAVE()]),
      },
    });
  },
  sheriff(state, ctx, { ask }) {
    const rivals = () => rivalSummary(state).filter((r) => !r.dormant);
    return officialTree(state, ctx, 'sheriff', {
      ask: ask || null,
      options: [O('Anything I should know?', { next: 'chat' }), O('About one of the other outfits...', { when: () => rivals().length > 0, next: 'tip' }), O('How does the county see us?', { tab: 'community' })],
      nodes: {
        chat: N((s) => { const L = lawSummary(s); const forced = s.parcels.find((p) => p.surface.agreement?.forced); return `${forced ? `I served your court order on ${forced.surface.ownerPerson}. Legal. I did not enjoy it. ` : ''}${L.investigations.length ? `There is a file open on your outfit, ${L.investigations.map((i) => `${i.by === 'sheriff' ? 'mine' : i.by === 'state' ? "the state's" : 'the federal men\'s'} (${i.months} months, evidence ${i.evidence})`).join(' and ')}. I would get a lawyer. ` : ''}${L.heat > 50 ? 'Your name comes up more than I like. ' : L.heat > 20 ? 'Your name comes up now and then. ' : 'Nothing on my desk with your name on it. '}${s.env.spills ? `${s.env.spills} spill${s.env.spills > 1 ? 's' : ''} on the record. ` : ''}${s.env.blowouts ? `${s.env.blowouts} blowout${s.env.blowouts > 1 ? 's' : ''}, which I remember. ` : ''}${s.competitors.some((c) => !c.dormant) ? 'The Kessler brothers drink at the Bluebonnet and drive home after. I mention it for no reason.' : ''}`; }, [O('Noted.', { next: 'main' })]),
        tip: N('Which one, and what do you know? If it is only that they beat you to a lease, save us both the time.', rivals().map((r) => O(`${r.name}${r.dirt ? ` (you have something on them)` : ''}`, { effect: (s, p, log) => tipSheriffOn(s, r.name, log), next: 'main' })).concat([O('Never mind.', { next: 'main' })])),
      },
    });
  },
  editor(state, ctx, { ask }) {
    return officialTree(state, ctx, 'editor', {
      ask: ask || null,
      options: [O("What's the news?", { next: 'news' }), O('The clippings file.', { tab: 'press' }), O('I want to buy some advertising.', { next: 'ads' })],
      nodes: {
        news: N((s) => { const P = pressSummary(s); const brewing = P.brewing.length ? `There is something in the works about your outfit: "${P.brewing[0].headline}". ` : ''; return `${brewing}${s.news.slice(-3).reverse().map((n) => n.text).join('  ') || 'Slow week.'}`; }, [O('Hm.', { next: 'main' })]),
        ads: N('Advertising is sold by the column inch and it buys column inches, not opinions. Though I will say bad news prints smaller next to a full page. The rate card is in the clippings file, with the paper itself, if you were thinking of buying that too.', [O('Show me.', { tab: 'press' }), O('Never mind.', { next: 'main' })]),
      },
    });
  },
  reporter(state) {
    const pending = state.pending?.find((e) => e.id === 'journalist' || e.id === 'photosOfThePit');
    return { speaker: SPEAKERS.reporter(), start: N(pending ? 'I have the photographs. I am waiting on your comment.' : `Wes Iverson, Clarion. ${state.wells.length ? `I hear ${state.wells[state.wells.length - 1].name} is ${statusLabel(state.wells[state.wells.length - 1]).toLowerCase()}. Care to comment?` : 'You have not drilled anything yet, so there is nothing to write. Yet.'} I also cover the school board and the weather.`, [
      O('No comment.'), O('Print whatever you like.', { effect: (s) => { s.company.reputation = Math.max(0, s.company.reputation - 0.5); return null; } }),
    ]) };
  },
  waitress(state, ctx) {
    const rumours = [];
    const rival = state.competitors.filter((c) => !c.dormant).sort((a, b) => b.held.length - a.held.length)[0];
    if (rival) rumours.push(`The ${rival.name} landman paid for everybody's pie last night. He had a map with ${rival.held.length} sections coloured in.`);
    const pool = state.pools.find((p) => p.discovered);
    if (pool) rumours.push(`Old Ezra says the ${pool.name} field is ${Math.round(pool.x * 100)}% pumped out. Ezra also says it rained oil in '26.`);
    if (state.candidates.length) rumours.push(`${state.candidates[0].name} at the corner table is looking for work. ${ROLES[state.candidates[0].role].name}, or so the hat says.`);
    rumours.push(`Leases are going for about $${Math.round(state.land.hype)} an acre and every farmer in here knows it.`);
    return officialTree(state, ctx, 'saloon', {
      speakerKey: 'waitress',
      options: [O("What's the talk?", { next: 'rumour' }), O("Who's looking for work?", { tab: 'staff' })],
      nodes: { rumour: N(rumours.slice(0, 2).join('  '), [O('Interesting.', { next: 'main' })]) },
    });
  },
  preacher(state, ctx) {
    const chat = N((s) => `${s.press.goodwill > 20 ? 'The congregation speaks well of your company, which is rarer than you would think.' : s.press.notoriety > 20 ? 'The congregation reads the Clarion, and the Clarion has not been kind.' : 'The congregation has no opinion of your company yet. That is a kind of blessing.'} ${s.env.activism > 45 ? 'Some of the younger people carry signs on the square. I do not stop them.' : ''} Pew rent is what it is; the roof is what it is.`, [O('Amen.', { next: 'main' })]);
    if (isFounding(state)) return founderTree(state, ctx, 'preacher', [O('How is the congregation?', { next: 'chat' })], { chat });
    return officialTree(state, ctx, 'preacher', { options: [O('How is the congregation?', { next: 'chat' })], nodes: { chat } });
  },
  clerk(state) {
    const open = state.parcels.filter((p) => isPublic(p) && !p.mineral.leasedBy && !p.mineral.auction && p.drillable);
    return { speaker: SPEAKERS.clerk(), start: 'main', nodes: {
      main: N(`Records, permits and the public land sales. ${open.length ? `${open.length} state and federal sections are open to sealed bids this month.` : 'Nothing public is up for bid just now.'} Bids close at the end of the month; the losers usually blame me.`, [
        O('Which sections are up for bid?', { when: () => open.length > 0, next: 'bids' }),
        O('Permit records.', { tab: 'gov' }),
        LEAVE("That's all, thank you."),
      ]),
      bids: N('Take your pick. Each is 320 acres at the fixed royalty.', open.slice(0, 6).map((p) => O(`Sec. ${p.id}: ${p.mineral.name} (${p.mineral.ownerType}) — about $${leaseAsk(state, p).bonusAcre}/acre`, { run: (s, ctx) => { ctx.ui.selected = p.id; ctx.ui.tab = 'parcel'; }, goto: ['map', { selected: p.id }], open: ['auction', p] })).concat([O('None of them.', { next: 'main' })])),
    } };
  },
  agent(state) {
    const m = state.market;
    return { speaker: SPEAKERS.agent(), start: 'main', nodes: {
      main: N(`Eastbound at 6:10, westbound at 4:40, freight when it comes. Crude is posted at $${m.oil.toFixed(2)} at Cushing; the truckers and the tank cars take their cut before you see it. ${m.oilPipeline ? 'Your pipeline connection has cut the drayage, which the Red Ball boys resent.' : 'A pipeline connection would cut the differential in half.'}`, [
        O('Freight rates and the posted price.', { tab: 'market' }),
        O('About a pipeline connection.', { tab: 'market' }),
        LEAVE('Obliged.'),
      ]),
    } };
  },
  oldtimer(state) {
    const fields = state.pools.filter((p) => p.discovered);
    return { speaker: SPEAKERS.oldtimer(), start: 'main', nodes: {
      main: N(`You the new outfit? I brought in the Hollister in twenty-six with a cable tool rig and a mule. ${fields.length ? `${fields.map((f) => f.name).join(' and ')}, all tired now. ` : ''}Ask me anything. I will tell you something, at any rate.`, [
        O('Tell me about the fields.', { next: 'fields' }),
        O('Any advice?', { next: 'advice' }),
        LEAVE('Take care, Ezra.'),
      ]),
      fields: N((s) => (fields.length ? fields.map((f) => `${f.name}: ${f.parcels.length} sections, ${f.waterDrive ? 'water drive, holds its pressure' : 'solution gas, falls off fast'}, about ${Math.round(f.x * 100)}% of what it will give is gone.`).join('  ') : 'Nobody has found a field around here yet that they will admit to. The Sooner State boys know more than they say.'), [O('Go on.', { next: 'advice' }), O('Thanks.', { next: 'main' })]),
      advice: N('Oil sits up on the high ground underground, in closures, and the sand is wet off the flanks. Shoot a line before you drill. Buy the farmer a truck before you need his gate. And never let a driller pay for his own whiskey.', [O('Noted.', { next: 'main' })]),
    } };
  },
  picketer() {
    return { speaker: SPEAKERS.picketer(), start: N('The flares light up my bedroom at night and my cows will not drink from the creek. We will be here every day until somebody at the courthouse listens.', [O('I hear you.'), O('Move along.', { effect: (s) => { s.env.activism = Math.min(100, s.env.activism + 1); return { msg: 'They did not move along.' }; } })]) };
  },
  landoffice(state, ctx) {
    const p = state.parcels[ctx.ui.selected ?? -1];
    const sp = state.staff.some((s) => s.founderId === 'whitlock') ? { name: 'Ed Baca', title: 'abstracts and leases drawn', sprite: 'landman' } : SPEAKERS.landoffice();
    if (!p) return { speaker: sp, start: N('Abstracts, title searches, leases drawn while you wait. Pick a section on the land map and I will pull the file.', [O('Show me the land map.', { goto: 'map' }), LEAVE()]) };
    const m = p.mineral;
    const status = m.leasedBy === 'player' ? 'You hold that lease.' : m.leasedBy ? `${m.leasedBy} holds it.` : m.auction ? 'Your bid is in; results next month.' : isPublic(p) ? 'Public land: sealed bids through the county clerk.' : `${m.name} owns the minerals${m.split ? ', not the surface' : ''}. They will want about $${leaseAsk(state, p).bonusAcre} an acre.`;
    return { speaker: sp, start: N(`Section ${p.id}, ${p.surface.name}, ${p.acres} acres. ${status} ${p.surface.agreement ? 'Surface is signed.' : `${p.surface.ownerPerson} has not signed a surface agreement.`}${p.restricted === 'church' ? ' And it is the church section: nobody drills it, by the terms of the widow\'s money.' : ''}`, [
      O('Draw up a lease offer.', { when: () => !m.leasedBy && !m.auction && !isPublic(p) && m.holdoutUntil <= state.month, open: ['lease', p] }),
      O('Prepare a sealed bid.', { when: () => !m.leasedBy && !m.auction && isPublic(p), open: ['auction', p] }),
      O('A surface damage agreement.', { when: () => !p.surface.agreement && p.drillable, open: ['surface', p] }),
      O('Ask the holder to sell.', { when: () => !!(m.leasedBy && m.leasedBy !== 'player' && acreageAsk(state, p)?.forSale), open: ['buy', p] }),
      O('Pull the whole file.', { tab: 'parcel' }),
      O('Another section.', { goto: 'map' }),
      LEAVE(),
    ]) };
  },
  survey(state, ctx) {
    const p = state.parcels[ctx.ui.selected ?? -1];
    const levels = p ? surveysFor(state).filter((sv) => sv.level > p.survey.level) : [];
    return { speaker: SPEAKERS.surveyor(), start: N(p ? `${p.surface.name}, survey level ${p.survey.level}. ${levels.length ? 'The crew can shoot it whenever you say.' : 'Nothing more I can do there short of drilling.'}` : 'Reflection shooting by the mile, records in a week. Pick a section on the land map and I will quote it.', [
      ...levels.map((sv) => O(`${sv.name} — ${money(sv.cost)}${sv.months ? `, ${sv.months} mo` : ''}`, { run: (s, c) => c.actions.survey({ dataset: { id: String(p.id), level: String(sv.level) } }, s) })),
      O('Show me the land map.', { goto: 'map' }),
      LEAVE(),
    ]) };
  },
  storekeeper(state) {
    return { speaker: SPEAKERS.storekeeper(), start: N('Work boots, khakis, hard hats, dynamite by permit, and the land office is in the back if it is land you want. Pumping units and sucker rods come from Plains Pipe; I can order.', [O('Oilfield supply.', { tab: 'wells' }), LEAVE('Just looking.')]) };
  },
  owner(state, ctx, { arg }) {
    const p = state.parcels[+arg]; if (!p) return null;
    const s = p.surface, m = p.mineral, d = s.disposition;
    const sp = { name: s.ownerPerson, title: `${s.name}, ${OWNER_TYPES[s.type]?.name || s.type}`, sprite: ownerSprite(p), mood: s.hostile ? 'hostile' : d < 35 ? 'cold' : d < 60 ? 'wary' : d < 75 ? 'civil' : 'friendly' };
    if (s.hostile) return { speaker: sp, start: N('You got your court order. You got your deputy. Get off my porch.', [O('Leave.')]) };
    if (isPublic(p)) return { speaker: { name: p.surface.type === 'state' ? 'The land agent' : 'The BLM ranger', title: p.surface.name, sprite: 'clerk' }, start: N(`${p.surface.name}. ${m.leasedBy === 'player' ? 'Your lease is on file. Standard agency surface terms apply, take them or leave them.' : m.leasedBy ? `${m.leasedBy} holds the lease.` : m.auction ? 'Your sealed bid is in. Results are posted at the courthouse next month.' : 'Minerals go by sealed bid through the county clerk. No handshakes, no pie.'}`, [
      O('Prepare a sealed bid.', { when: () => !m.leasedBy && !m.auction, open: ['auction', p] }),
      O('The surface terms.', { when: () => !s.agreement, open: ['surface', p] }),
      LEAVE(),
    ]) };
    const greet = d < 35 ? 'Say what you came to say. I have work.' : d < 60 ? 'Coffee is on. I have heard about oil men; convince me you are the other kind.' : d < 75 ? 'Come on in. The neighbours say you pay on time.' : 'Well, if it is not the oil man. Sit down; the wife made a pie.';
    const about = m.leasedBy === 'player' ? `You have my minerals under lease${s.agreement ? ' and my signature on the surface papers' : ', but I have not signed a surface agreement, and you are not putting a rig on my wheat without one'}.` : m.split ? `The minerals here belong to ${m.name}, not me. I only own the dirt, which is what you would be tearing up.` : m.leasedBy ? `${m.leasedBy} has my minerals already.` : `Nobody has leased my minerals. I hear the going rate is $${Math.round(state.land.hype)} an acre; I hear a lot of things.`;
    const nb = neighbours(state.parcels, p).filter((q) => ['farmer', 'rancher', 'homes'].includes(q.surface.type));
    const root = (st) => TALK.owner(st, ctx, { arg }).nodes.main;
    return { speaker: sp, start: 'main', nodes: {
      main: N(`${greet} ${about}`, [
        O('Talk about leasing your minerals.', { when: () => !m.leasedBy && !m.split && !isPublic(p) && m.holdoutUntil <= state.month, open: ['lease', p] }),
        O('Ask about the sealed-bid sale.', { when: () => isPublic(p) && !m.leasedBy && !m.auction, open: ['auction', p] }),
        O('Talk about surface damages.', { when: () => !s.agreement && p.drillable, open: ['surface', p] }),
        O('Ask for access, plainly.', { when: () => !s.agreement && p.drillable && !isFounding(state), hint: 'A surface agreement without the haggling: persuasion, an envelope, a favour.', next: (st) => adaptNode(st, ctx, pure(() => conversation(st, `parcel:${p.id}`, 'access')), { root }) }),
        O('Ask about the neighbours.', { when: () => nb.length > 0, next: 'neighbours' }),
        O("How's the well site?", { when: () => p.wells.length > 0, next: 'site' }),
        LEAVE(d < 35 ? 'Leave.' : 'Thank you for your time.'),
      ]),
      neighbours: N(nb.map((q) => `${q.surface.ownerPerson} at ${q.surface.name} ${q.surface.hostile ? 'would shoot at your truck' : q.surface.disposition < 40 ? 'does not care for oil men' : q.surface.disposition < 65 ? 'will listen' : 'would sign tomorrow'}.`).join(' '), [O('Good to know.', { next: 'main' })]),
      site: N((st) => { const ws = p.wells.map((id) => st.wells.find((w) => w.id === id)).filter(Boolean); return ws.map((w) => `${w.name} is ${statusLabel(w).toLowerCase()}${w.lastMonth ? `, ${fmt(w.lastMonth.rate)} barrels a day` : ''}.`).join(' ') + (s.agreement?.conditions?.harvestPause ? ' Mind the harvest months.' : ''); }, [O('Right.', { next: 'main' })]),
    } };
  },
  candidate(state, ctx, { arg }) {
    const c = state.candidates.find((x) => x.id === +arg);
    if (!c) return { speaker: SPEAKERS.waitress(state), start: N('Gone. Somebody else hired them, or they gave up and went home.', [O('Pity.')]) };
    const role = ROLES[c.role];
    return { speaker: { name: c.name, title: `${role.name}, ${c.years} years`, sprite: ROLE_SPRITE[c.role] || 'clerk' }, start: 'main', nodes: {
      main: N(`${role.desc} I would say I am about a ${c.skill} out of 10 and I would be lying one way or the other. ${c.traits.length ? `People say I am ${c.traits.join(' and ')}. ` : ''}I want ${money(c.salary)} a month and the same again to sign.`, [
        O(`Hire ${c.name.split(' ')[0]} (${money(c.salary)} signing bonus)`, { disabled: isFounding(state), hint: isFounding(state) ? 'There is no company to hire into yet.' : '', effect: (s, p, log) => { const r = hire(s, c); if (r.ok) log(`Hired ${c.name} as ${role.name} (skill ${c.skill}) over pie at the Bluebonnet.`, 'staff'); return r; }, next: (s) => (s.staff.some((x) => x.id === c.id) ? N('Welcome aboard. When do I start? Now, apparently.', [O('Get to the office.', { goto: 'office' }), O('Finish your pie first.')]) : N('If you cannot cover the bonus I will keep eating pie.', [O('Later, then.')])) }),
        O('See who else is looking.', { tab: 'staff' }),
        O('Not today.'),
      ]),
    } };
  },
  rival(state, ctx, { arg }) {
    const comp = state.competitors.find((c) => c.name === arg);
    if (!comp) return null;
    const forSale = comp.held.map((id) => state.parcels[id]).filter((p) => p && p.mineral.leasedBy === comp.name && acreageAsk(state, p)?.forSale);
    return { speaker: { name: `${comp.name}'s landman`, title: comp.tag, sprite: 'landman' }, start: 'main', nodes: {
      main: N(`${comp.blurb} ${forSale.length ? `We might part with ${forSale.length} section${forSale.length > 1 ? 's' : ''} at the right number.` : 'Nothing of ours is for sale. We like our position.'}${(comp.hostility || 0) > 40 ? ' And we know what you have been saying about us.' : ''}`, [
        O('What would you sell?', { when: () => forSale.length > 0, next: 'sell' }),
        O('See their holdings.', { tab: 'rivals' }),
        LEAVE(),
      ]),
      sell: N('Pick one.', forSale.slice(0, 6).map((p) => O(`${p.surface.name} (Sec. ${p.id}) — about ${money(acreageAsk(state, p).total)}`, { run: (s, c) => { c.ui.selected = p.id; }, open: ['buy', p] })).concat([O('None of them.', { next: 'main' })])),
    } };
  },
  roughneck(state) {
    const rig = state.wells.find((w) => w.status === 'drill');
    return { speaker: { name: 'A roughneck', title: 'waiting on the westbound', sprite: 'roughneck' }, start: N(rig ? `You the outfit drilling ${rig.name}? I worked derricks for Bar-K till the Kessler boy dropped a tong on my foot. Pay is pay.` : 'Rig crews go where the rigs go. There is not much drilling in this county, which is why I am at the depot.', [O('Good luck.')]) };
  },
  toolpusher(state, ctx, { arg }) {
    const w = state.wells.find((x) => x.id === +arg); if (!w) return null;
    return { speaker: SPEAKERS.toolpusher(), start: N(`${w.name}: ${statusLabel(w).toLowerCase()}, ${Math.max(0, w.phaseEnd - state.month)} month${w.phaseEnd - state.month === 1 ? '' : 's'} to go. Spent ${money(w.cost.spent)} against ${money(w.cost.est)} estimated. ${w.crew?.driller?.name || 'The driller'} runs the tower; I run the driller.`, [
      O('The well file.', { open: ['well', w] }),
      LEAVE('Keep at it.'),
    ]) };
  },
  // The sheriff's office telephone: a private detective from Tulsa, by the month.
  detective(state) {
    const cost = detectiveCost(state), L = lawSummary(state);
    const dirt = L.dirt.length;
    return { speaker: SPEAKERS.detective(), start: N(`Tulsa Confidential. ${L.detective ? `Our man is in your county now, until ${dateStr(state.law.detectiveUntil)}, and bills for mileage. ` : ''}Divorce work, mostly, but a county courthouse is a county courthouse. ${money(cost)} a month, findings in writing, photographs extra. ${dirt ? `You already hold ${dirt} item${dirt > 1 ? 's' : ''} somebody would rather you did not.` : 'He will find out what people would rather you did not know.'}`, [
      ...[1, 3, 6].map((m) => O(`Retain him for ${m} month${m > 1 ? 's' : ''} (${money(cost * m)})`, { effect: (s) => hireDetective(s, m) })),
      LEAVE('Not today.'),
    ]) };
  },
  lawyer(state) {
    const L = lawSummary(state), c6 = inflate(state, 600) * 6, c12 = inflate(state, 600) * 12;
    return { speaker: SPEAKERS.lawyer(), start: N(`${L.lawyer ? `${L.lawyer} is on your retainer already. ` : ''}Criminal defence, commission hearings, and a word with the district attorney when a word will do. ${L.investigations.length ? `You have ${L.investigations.length} investigation${L.investigations.length > 1 ? 's' : ''} open; a retainer slows the evidence and makes a jury listen.` : 'Nothing open against you at present, which is the time to retain counsel, not after.'} ${money(inflate(state, 600))} a month.`, [
      O(`Six months' retainer (${money(c6)})`, { effect: (s) => hireLawyer(s, 6) }),
      O(`A year's retainer (${money(c12)})`, { effect: (s) => hireLawyer(s, 12) }),
      LEAVE('I will think on it.'),
    ]) };
  },
  hotelclerk(state) {
    const f = state.founding;
    const det = state.law?.detectiveUntil > state.month, stateInv = lawSummary(state).investigations.some((i) => i.by === 'state');
    return { speaker: SPEAKERS.hotelclerk(), start: N(`${isFounding(state) ? `Room 4, ${money(f.livingCost)} a month, and the bill is on the first. ${f.monthsLeft} month${f.monthsLeft === 1 ? '' : 's'} paid ahead, by my book.` : 'Steam heat, travelling men welcome, Sunday dinner a dollar and a quarter.'} ${det ? 'The gentleman from Tulsa in Room 6 asks a lot of questions and tips well. ' : ''}${stateInv ? 'Two men from the capital took Rooms 2 and 3 and want their receipts itemised. ' : ''}${isFounding(state) && f.founders?.cravens?.status === 'available' ? 'Mr. Cravens is in the lobby with his newspaper, as usual.' : ''}`, [LEAVE('Thank you.')]) };
  },
  statemen(state) {
    const inv = lawSummary(state).investigations.find((i) => i.by === 'state');
    return { speaker: SPEAKERS.statemen(), start: N(inv ? `They fold their newspapers at the same moment. "We are not at liberty to discuss the matter." One of them writes down that you asked. Evidence gathered so far, by the look of the file: ${inv.evidence} of a hundred.` : 'They have checked out.', [LEAVE('Good day, gentlemen.')]) };
  },
  yardhand(state) {
    const rig = state.flags?.ownRig;
    return { speaker: SPEAKERS.yardhand(), start: N(rig ? `${rig.name}: ${rig.wellsLeft > 0 ? `good for ${rig.wellsLeft} more hole${rig.wellsLeft > 1 ? 's' : ''} before she needs new cable and a new everything else` : 'she has drilled what she is going to drill. We keep her for parts.'}. Four thousand feet is her limit and she kicks.` : 'Sandoval took the spudder to the Kessler lease. Pipe, bits and a truck with no brakes is what is left. Jessup Bros. keep a rotary on the flatcar at the depot if you have money.', [LEAVE('Carry on.')]) };
  },
};

// id forms: 'banker', 'owner:12', 'staff:34', 'candidate:56', 'rival:Sooner State Oil', 'toolpusher:3', 'founder:pruitt'.
export function talkTree(state, ctx, id, extra = {}) {
  const i = id.indexOf(':');
  const base = i < 0 ? id : id.slice(0, i), arg = i < 0 ? null : id.slice(i + 1);
  const fn = TALK[base];
  if (!fn) return null;
  return fn(state, ctx, { ...extra, arg });
}

// ---------------- events as conversations ----------------
const roleKeyByName = (name) => Object.keys(ROLES).find((k) => ROLES[k].name === name);
export const EVENT_SPEAKERS = {
  investor: () => ({ name: 'A lawyer from Houston', title: 'for the syndicate', sprite: 'banker' }),
  journalist: () => SPEAKERS.reporter(),
  cattle: (s, p) => ({ name: p.owner || 'A rancher', title: p.farm || '', sprite: 'rancher', mood: 'angry' }),
  poach: (s, p) => ({ name: p.name || 'One of your people', title: p.role || '', sprite: ROLE_SPRITE[roleKeyByName(p.role)] || 'clerk' }),
  steelShortage: () => ({ name: 'Plains Pipe & Supply', title: 'the supply house', sprite: 'clerk' }),
  dinner: () => ({ name: "Congressman Vance's man", title: 'Friends of Oil', sprite: 'mayor' }),
  rigDeal: () => ({ name: 'Cal Jessup', title: 'Jessup Bros. Rotary', sprite: 'roughneck' }),
  school: () => ({ name: 'Ida Quintero', title: 'school board president (and county clerk)', sprite: 'clerk' }),
  leaseBuyer: () => ({ name: 'Prairie Royalty & Land', title: 'their landman', sprite: 'landman' }),
  whistleblower: () => ({ name: 'A lawyer', title: 'for your former pumper', sprite: 'banker' }),
  documentary: () => ({ name: 'A magazine photographer', title: 'on assignment', sprite: 'reporter' }),
  storm: () => SPEAKERS.dot(),
  dowser: () => ({ name: 'A man with a peach branch', title: 'water witch, oil witch', sprite: 'oldtimer' }),
  unionDrive: () => ({ name: 'Your foreman', title: 'speaking for the crews', sprite: 'roughneck' }),
  pipelineCompany: () => ({ name: 'Panhandle & Plains Pipe Line', title: 'their gas buyer', sprite: 'landman' }),
};
export function eventTree(state, ev) {
  const def = EVENTS[ev.id];
  if (!def) return null;
  const params = ev.params || {};
  let speaker = null;
  try { speaker = simSpeaker(speakerFor(def, state, params)) || EVENT_SPEAKERS[ev.id]?.(state, params); } catch (e) { speaker = null; }
  if (!speaker) speaker = { ...SPEAKERS.dot(), title: 'brings a message' };
  const text = typeof def.text === 'function' ? def.text(state, params) : String(def.text || '');
  return {
    speaker,
    start: { title: def.title, text, closable: false, options: def.options.map((o, i) => ({ label: o.labelFn ? o.labelFn(state, params) : o.label, effect: (s, p, log) => { resolveEvent(s, i, log); return null; } })) },
  };
}
