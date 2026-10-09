import { START_YEAR, START_MONTH } from './data.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, d = 0) => { const m = 10 ** d; return Math.round(v * m) / m; };
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

export function money(v, opts = {}) {
  const neg = v < 0; const a = Math.abs(v);
  let s;
  if (a >= 1e9) s = '$' + (a / 1e9).toFixed(2) + 'B';
  else if (a >= 1e6) s = '$' + (a / 1e6).toFixed(opts.d ?? 2) + 'M';
  else if (a >= 1e3) s = '$' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  else s = '$' + a.toFixed(0);
  return neg ? '-' + s : s;
}
export const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';

// Calendar. Game month 0 = Sep 1952. yearOf/calMonth take a game month index.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const yearOf = (month) => START_YEAR + Math.floor((month + START_MONTH) / 12);
export const calMonth = (month) => (((month + START_MONTH) % 12) + 12) % 12; // 0 = January
export const monthOf = (year, cal = 0) => (year - START_YEAR) * 12 + cal - START_MONTH; // game month index of a calendar date
export function dateStr(month) { return `${MONTHS[calMonth(month)]} ${yearOf(month)}`; }
export const monthName = (m) => MONTHS[calMonth(m)];

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export const nextId = (state) => (state.nextId = (state.nextId || 1) + 1);
