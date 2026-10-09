// The calendar era: cost index (inflation), historical price anchors, interest rates, seasons.
// Everything here is a pure function of the game month, so tests and the market can call it without a state.
import { START_YEAR, START_MONTH } from './data.js';
import { clamp, yearOf as yearOfMonth, calMonth as calMonthOf, monthOf } from './util.js';

const monthArg = (s) => (typeof s === 'number' ? s : s.month);
export const yearOf = (s) => yearOfMonth(monthArg(s));
export const calMonth = (s) => calMonthOf(monthArg(s));
export const yearFrac = (s) => START_YEAR + (monthArg(s) + START_MONTH) / 12;

// --- Cost index: 1952 = 1.00 -------------------------------------------------
export const COST_INDEX = [[1952, 1.0], [1960, 1.12], [1970, 1.46], [1980, 3.11], [1990, 4.93], [2000, 6.5], [2010, 8.23], [2020, 9.77]];
function interpTable(table, y, geometric = true) {
  if (y <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (y >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [y0, v0] = table[i - 1], [y1, v1] = table[i];
    if (y <= y1) { const t = (y - y0) / (y1 - y0); return geometric ? v0 * Math.pow(v1 / v0, t) : v0 + (v1 - v0) * t; }
  }
  return last[1];
}
export function costIndexAt(yearFraction) {
  const last = COST_INDEX[COST_INDEX.length - 1];
  if (yearFraction > last[0]) return last[1] * Math.pow(1.025, yearFraction - last[0]);
  return interpTable(COST_INDEX, yearFraction);
}
export const costIndex = (s) => costIndexAt(yearFrac(s));
// 1952 dollars -> current dollars, rounded sensibly for display and ledgers.
export function inflate(s, v) {
  const r = v * costIndex(s);
  const a = Math.abs(r);
  if (a >= 10_000) return Math.round(r / 10) * 10;
  if (a >= 20) return Math.round(r);
  return Math.round(r * 100) / 100;
}
// Oilfield service costs run ahead of general inflation when oil is high (rigs, crews, casing all get scarce).
export function serviceCostMult(s) {
  const m = s.market; if (!m) return 1;
  return clamp(0.8 + 0.25 * (m.oil / oilAnchor(monthArg(s))), 0.8, 1.6);
}
export const inflateSvc = (s, v) => Math.round(inflate(s, v) * serviceCostMult(s));
// Shale-era formulas in wells.js are written in ~2020 dollars; this scales them to the current year.
export const shaleScale = (s) => costIndex(s) / 8.94;

// --- Interest -------------------------------------------------------------------
const INTEREST = [[1952, 0.05], [1965, 0.055], [1974, 0.10], [1980, 0.16], [1982, 0.18], [1985, 0.11], [1990, 0.10], [2000, 0.09], [2010, 0.05], [2020, 0.045]];
export const interestRate = (s) => interpTable(INTEREST, yearFrac(s), false);

// --- Historical price anchors (nominal $/bbl wellhead, $/mcf) -------------------
export const OIL_ANCHORS = {
  1952: 2.53, 1953: 2.68, 1954: 2.78, 1955: 2.77, 1956: 2.79, 1957: 3.09, 1958: 3.01, 1959: 2.90, 1960: 2.88, 1961: 2.89, 1962: 2.90, 1963: 2.89, 1964: 2.88, 1965: 2.86,
  1966: 2.88, 1967: 2.92, 1968: 2.94, 1969: 3.09, 1970: 3.18, 1971: 3.39, 1972: 3.39, 1973: 3.89, 1974: 6.87, 1975: 7.67, 1976: 8.19, 1977: 8.57, 1978: 9.00, 1979: 12.64,
  1980: 21.59, 1981: 31.77, 1982: 28.52, 1983: 26.19, 1984: 25.88, 1985: 24.09, 1986: 12.51, 1987: 15.40, 1988: 12.58, 1989: 15.86, 1990: 20.03, 1991: 16.54, 1992: 15.99,
  1993: 14.25, 1994: 13.19, 1995: 14.62, 1996: 18.46, 1997: 17.23, 1998: 10.87, 1999: 15.56, 2000: 26.72, 2001: 21.84, 2002: 22.51, 2003: 27.56, 2004: 36.77, 2005: 50.28,
  2006: 59.69, 2007: 66.52, 2008: 94.04, 2009: 56.35, 2010: 74.71, 2011: 95.73, 2012: 94.52, 2013: 95.99, 2014: 87.39, 2015: 44.39, 2016: 38.29, 2017: 48.05, 2018: 61.42,
  2019: 55.60, 2020: 36.86, 2021: 65.84, 2022: 94.90, 2023: 76.10, 2024: 76.00,
};
export const GAS_ANCHORS = {
  1952: 0.08, 1955: 0.10, 1960: 0.14, 1965: 0.16, 1970: 0.17, 1973: 0.22, 1975: 0.44, 1978: 0.91, 1980: 1.59, 1982: 2.46, 1985: 2.51, 1990: 1.71, 1995: 1.55, 2000: 3.68,
  2003: 4.88, 2005: 7.33, 2008: 7.97, 2010: 4.48, 2012: 2.66, 2015: 2.62, 2018: 3.16, 2020: 1.99, 2022: 6.45, 2024: 2.20,
};
const OIL_TABLE = Object.entries(OIL_ANCHORS).map(([y, v]) => [+y, v]);
const GAS_TABLE = Object.entries(GAS_ANCHORS).map(([y, v]) => [+y, v]);
// Months where the anchor jumps instead of ramping: the year-average table would otherwise smear the step.
// Each entry: game month index at which the price moves from year A's anchor to year B's.
export const PRICE_STEPS = [
  { month: monthOf(1957, 0), from: 1956, to: 1957 },   // posted price rise after Suez
  { month: monthOf(1973, 9), from: 1973, to: 1974 },   // Arab embargo, Oct 1973
  { month: monthOf(1979, 2), from: 1978, to: 1979 },   // Iran
  { month: monthOf(1986, 0), from: 1985, to: 1986 },   // Saudi netback crash
  { month: monthOf(1990, 7), from: 1989, to: 1990 },   // Kuwait
  { month: monthOf(1998, 0), from: 1997, to: 1998 },   // Asian crisis glut
  { month: monthOf(2008, 8), from: 2008, to: 2009 },   // Lehman
  { month: monthOf(2014, 10), from: 2014, to: 2015 },  // OPEC declines to cut
];
function anchorAt(table, month) {
  // Interpolate between mid-year points, but hold flat across a step month so the jump is a jump.
  const yf = yearFrac(month) - 0.5; // centre of each calendar year = that year's average
  const y0 = Math.floor(yf), t = yf - y0;
  const step = PRICE_STEPS.find((s) => s.from === y0 && s.to === y0 + 1);
  if (step) return month < step.month ? interpTable(table, y0, false) : interpTable(table, y0 + 1, false);
  return interpTable(table, y0 + t, false);
}
export const oilAnchor = (month) => anchorAt(OIL_TABLE, month);
export const gasAnchor = (month) => anchorAt(GAS_TABLE, month);
export const oilAnchorYear = (year) => interpTable(OIL_TABLE, year);
export const gasAnchorYear = (year) => interpTable(GAS_TABLE, year);

// --- Flavour ----------------------------------------------------------------------
export function season(s) { const m = calMonth(s); return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'fall'; }
export function eraLabel(s) {
  const y = yearOf(s);
  if (y < 1960) return 'Postwar boom';
  if (y < 1973) return 'Proration years';
  if (y < 1982) return 'Embargo and boom';
  if (y < 1986) return 'The slide';
  if (y < 2000) return 'The long bust';
  if (y < 2009) return 'Supercycle';
  return 'Shale age';
}
