// The "what to do now" line under the stage: one sentence that tells the player the next sensible move,
// and where in town it happens. Founding year: the three things the bank wants, in order. After that:
// the same hint Dot gives in the office. Pure: reads state, returns an HTML string.
import { money, esc } from '../util.js';
import { isFounding, foundingSummary, FOUNDERS } from '../founding.js';
import { nextStepHint } from '../scenes/talk.js';
import { isAbsent } from '../sim.js';
import { dateStr } from '../util.js';

const PLACE_NAMES = { cafe: 'the Bluebonnet Cafe', store: 'the Mercantile', rigyard: 'the rig yard on Second Street', depot: 'the depot', hotel: 'the hotel', church: 'the church', bank: 'the bank', courthouse: 'the courthouse' };
function stillInTown(state, ids) {
  const r = state.founding?.founders || {};
  return ids.filter((id) => r[id] && r[id].status !== 'gone');
}
const who = (state, id) => { const d = FOUNDERS[id]; const name = d.name || (id === 'ellison' ? 'the banker' : 'the pastor'); return `${name} at ${PLACE_NAMES[d.place] || d.place}`; };

export function guideFor(state, ui) {
  if (!state) return null;
  if (isAbsent(state)) return { step: 'Doing time', text: `You are in the penitentiary until ${dateStr(state.law.absentUntil)}. Dot keeps the lights on; advance the months.` };
  if (isFounding(state)) {
    const f = foundingSummary(state);
    if (f.failed) return { step: 'The end', text: 'The year ran out. Start a new game from the top bar.' };
    if (!f.geologist) { const w = stillInTown(state, ['pruitt', 'cobb']).map((id) => who(state, id)); return { step: 'Step 1 of 4: find a geologist', text: `Nobody drills without one. ${w.length ? `Try ${w.join(' or ')}.` : 'Both geologists have left town.'} Walk in, click the person with the $ over their head, and accept their terms or counter.` }; }
    if (!f.rig) { const w = stillInTown(state, ['sandoval', 'jessup']).map((id) => who(state, id)); return { step: 'Step 2 of 4: get a rig', text: `${w.length ? `Try ${w.join(' or ')}.` : 'Every rig has left the county.'} A rig under contract is also what the banker wants to see before he lends.` }; }
    if (f.capital < f.minCapital) { const w = stillInTown(state, ['cravens', 'hargrove', 'preacher', 'ellison']).map((id) => who(state, id)); return { step: `Step 3 of 4: raise ${money(f.minCapital - f.capital)} more`, text: `You have ${money(f.capital)} of the ${money(f.minCapital)} the bank wants on deposit. Investors trade cash for a share of the company; the banker lends. ${w.length ? `See ${w.join(', ')}.` : ''}` }; }
    if (f.canForm) return { step: 'Step 4 of 4: sign the papers', text: 'Geologist, rig and capital are in hand. Press "Sign the papers" in the top bar (or the papers on your desk in the rooms) and name the company.' };
    return { step: 'Almost there', text: f.missing.join(' ') };
  }
  return { step: 'Now', text: nextStepHint(state) };
}

export function renderGuide(state, ui, keys) {
  const g = guideFor(state, ui);
  if (!g) return keys || '';
  return `<div class="now"><b>${esc(g.step)}</b> ${esc(g.text)}</div>${keys ? `<div class="keys">${keys}</div>` : ''}`;
}

// The month-end memo shown after the calendar turns: money, the field, the news of the month. HTML.
export function monthSummary(state, before) {
  if (!state || !before) return '';
  const c = state.company, f = state.founding;
  const delta = (now, then) => { const d = now - then; return d === 0 ? '' : ` <i class="${d < 0 ? 'bad' : 'good'}">(${d < 0 ? '\u2212' : '+'}${money(Math.abs(d))})</i>`; };
  const news = (state.news || []).filter((n) => n.month === state.month && n.kind !== 'press').slice(-3).map((n) => `<li>${esc(n.text)}</li>`).join('');
  let lines = '';
  if (isFounding(state) && !f.failed) {
    const gone = Object.values(f.founders || {}).filter((r) => r.status === 'gone').length - before.gone;
    lines = `<li>Your own money: <b>${money(f.personalCash)}</b>${delta(f.personalCash, before.personalCash)} after the hotel. <b>${f.monthsLeft}</b> month${f.monthsLeft === 1 ? '' : 's'} of it left.</li>`
      + (gone > 0 ? `<li class="bad">${gone === 1 ? 'A founder has' : `${gone} founders have`} left town.</li>` : '');
  } else {
    const producing = state.wells.filter((w) => w.status === 'producing').length, p = state.month_prod || {};
    lines = `<li>Cash <b>${money(c.cash)}</b>${delta(c.cash, before.cash)}${c.cash < 0 ? ` against a ${money(c.creditLimit)} line` : ''}.</li>`
      + `<li>${producing ? `${producing} well${producing === 1 ? '' : 's'} pumping, ${Math.round(p.oil || 0).toLocaleString()} bbl sold at $${state.market.oil.toFixed(2)}` : 'No wells producing'}${(p.net || 0) ? `, net ${money(p.net)}` : ''}.</li>`
      + (state.pending.length ? `<li class="bad">Somebody is waiting to see you.</li>` : '');
  }
  return `<div class="memo-head">${esc(dateStr(state.month))} <span>Dot's memo</span></div><ul>${lines}${news}</ul>`;
}
