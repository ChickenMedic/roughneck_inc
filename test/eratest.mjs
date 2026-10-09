// The era tables: prices, cost index, interest and technology from 1952 to 2020. Run: node test/eratest.mjs [seed]
import { newGame } from '../js/sim.js';
import { costIndexAt, interestRate, oilAnchorYear, gasAnchorYear, oilAnchor, eraLabel } from '../js/era.js';
import { unlockedTech, techYear, TECH } from '../js/tech.js';
import { monthOf } from '../js/util.js';

const seed = Number(process.argv[2] || 42);
const s = newGame({ seed, skipFounding: true });
let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } };
const pad = (v, n) => String(v).padStart(n);

console.log(pad('Year', 5), pad('Oil', 7), pad('Gas', 6), pad('Cost', 6), pad('Int', 6), pad('Allow', 6), ' Era / tech unlocked (this seed)');
let prev = 0;
for (let y = 1952; y <= 2020; y += 4) {
  const m = monthOf(y, 8);
  const st = { month: m, market: s.market };
  const ci = costIndexAt(y + 0.67);
  assert(ci >= prev, `cost index not monotone at ${y}`); prev = ci;
  console.log(pad(y, 5), pad(oilAnchorYear(y).toFixed(2), 7), pad(gasAnchorYear(y).toFixed(2), 6), pad(ci.toFixed(2), 6), pad((interestRate(st) * 100).toFixed(1) + '%', 6), pad('n/a', 6), ' ' + eraLabel(st) + ': ' + unlockedTech(st).join(', '));
}
// Steps: the embargo and the 1986 crash must be visible in the monthly anchor.
const beforeEmbargo = oilAnchor(monthOf(1973, 8)), afterEmbargo = oilAnchor(monthOf(1973, 10));
const beforeCrash = oilAnchor(monthOf(1985, 11)), afterCrash = oilAnchor(monthOf(1986, 1));
console.log(`anchor Sep 1973 $${beforeEmbargo.toFixed(2)} -> Nov 1973 $${afterEmbargo.toFixed(2)}; Dec 1985 $${beforeCrash.toFixed(2)} -> Feb 1986 $${afterCrash.toFixed(2)}`);
assert(afterEmbargo > 1.5 * beforeEmbargo, '1973 embargo step missing');
assert(afterCrash < 0.6 * beforeCrash, '1986 crash step missing');
assert(costIndexAt(1952) === 1 && Math.abs(costIndexAt(1980) - 3.11) < 1e-9, 'cost index anchors');
console.log('tech years this seed:', Object.keys(TECH).map((k) => `${k} ${techYear(s, k)}`).join(', '));
assert(techYear(s, 'shale') >= 2002 && techYear(s, 'shale') <= 2006, 'shale unlock jitter within ±2 years');
assert(unlockedTech({ month: 0, market: s.market }).join() === 'waterflood', 'only waterflood exists in Sep 1952');
console.log(failures ? `${failures} FAILURE(S)` : 'eratest OK');
process.exit(failures ? 1 : 0);
