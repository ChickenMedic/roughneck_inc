// Ticker tape under the masthead: prices, lease hype, the last headlines, one period ad.
// Returns the same string until month or news count changes so the CSS scroll animation is not restarted.
import { esc } from '../util.js';

export const ADS = [
  'HOLLISTER TOOL CO. — Rotary Bits, Casing, Cementing. "We Set It Right."',
  'DRY FORK MOTOR COURT — Air Cooled Rooms $4. Radio in Every Unit.',
  'BLUEBONNET CAFE — Chicken Fried Steak 65¢. Open Til Midnight for Rig Crews.',
  'FIRST STATE BANK OF DRY FORK — Production Loans, Sound Counsel Since 1911.',
  'PRAIRIE SEISMOGRAPH SERVICE — Reflection Shooting by the Mile. Tulsa Office.',
  'JESSUP BROS. ROTARY — Two Rigs Available. Footage or Day Rate.',
  'STUDEBAKER OF DRY FORK — The 1953 Commander. Drive One Today.',
  'PHILCO TELEVISION — 21-inch Console $289.95. Easy Terms at Cobb Furniture.',
  'WHITLOCK ABSTRACT & TITLE — Mineral Searches, Leases Drawn, Notary.',
  'CHESTERFIELD — Much Milder. Buy the Carton.',
  'MABRY FEED & SEED — Certified Wheat, Cotton Seed, Baling Wire.',
  'SANDOVAL DAIRY — Fresh Milk Delivered Before Sunup.',
  'DEPOT HOTEL — Steam Heat. Traveling Men Welcome. Sunday Dinner $1.25.',
  'HARGROVE MERCANTILE — Work Boots, Khakis, Hard Hats, Dynamite by Permit.',
  'PLAINS PIPE & SUPPLY — Tubing, Sucker Rods, Pumping Units in Stock.',
  'OKLAHOMA TIRE & SUPPLY — Recaps While You Wait.',
  'REV. STROUD, OPEN PRAIRIE CHURCH — Sunday 10 AM. Wildcatters Welcome. Tithing Encouraged.',
  'ALKA-SELTZER — Relief Is Just a Swallow Away.',
  'CLARION JOB PRINTING — Lease Forms, Division Orders, Wedding Announcements.',
  'RED BALL TRUCKING — Crude Hauled Day or Night. Licensed and Bonded.',
  'DUVALL FUNERAL HOME — Dignified Service. Ambulance Available.',
];

export function adFor(state, offset = 0) {
  const seed = (state.seed >>> 0) % ADS.length;
  return ADS[(seed + state.month + offset) % ADS.length];
}

let cache = { key: null, html: '' };

export function renderTicker(state) {
  const key = `${state.seed}:${state.month}:${state.news.length}`;
  if (cache.key === key) return cache.html;
  const m = state.market;
  const oh = m.oilHistory || [];
  const prev = oh.length >= 2 ? oh[oh.length - 2] : m.oil;
  const arrow = m.oil > prev + 0.005 ? '▲' : m.oil < prev - 0.005 ? '▼' : '▬';
  const gh = m.gasHistory || [];
  const gprev = gh.length >= 2 ? gh[gh.length - 2] : m.gas;
  const garrow = m.gas > gprev + 0.001 ? '▲' : m.gas < gprev - 0.001 ? '▼' : '▬';
  const heads = state.news.slice(-6).reverse().map((n) => n.text.replace(/\s+/g, ' ').trim().toUpperCase());
  const parts = [
    `CRUDE $${m.oil.toFixed(2)} ${arrow}`,
    `GAS $${m.gas.toFixed(2)} ${garrow}`,
    `LEASES $${Math.round(state.land.hype)}/AC`,
    ...heads,
    `ADV. — ${adFor(state)}`,
  ];
  const text = parts.map((t) => `<b>${esc(t)}</b>`).join('<i class="sep">·</i>');
  const dur = Math.max(45, Math.round(parts.join(' ').length * 0.11));
  const html = `<div class="tape" style="--tape-dur:${dur}s"><span class="run">${text}<i class="sep">·</i></span><span class="run" aria-hidden="true">${text}<i class="sep">·</i></span></div>`;
  cache = { key, html };
  return html;
}
