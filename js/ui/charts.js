// Minimal inline-SVG charts (no dependencies), drawn as ink on paper.
// Colours resolve through CSS variables so they follow the theme; legacy hex colours used by
// older callers are mapped onto the ink palette.
export const INK = {
  ink: 'var(--ink, #2b2418)', ink2: 'var(--ink2, #5a4d38)', muted: 'var(--muted, #7a6a50)', rule: 'var(--rule, rgba(43,36,24,0.28))',
  red: 'var(--red, #a8322a)', blue: 'var(--blue, #2f4f7f)', green: 'var(--green, #4b6b3a)', gold: 'var(--gold, #b58a2f)', purple: 'var(--purple, #6b4a7a)',
};
const LEGACY = { '#5aa7e0': INK.blue, '#b07fe0': INK.purple, '#5fbf74': INK.green, '#f0a830': INK.gold, '#e0574f': INK.red, '#ffc45a': INK.gold, '#9a9fab': INK.muted };
export const inkColor = (c) => (c && INK[c]) || LEGACY[c] || c || INK.ink;

export function sparkline(values, { w = 90, h = 24, color = 'blue' } = {}) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / rng) * (h - 2) - 1}`).join(' ');
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" style="stroke:${inkColor(color)}" stroke-width="1.5" stroke-linejoin="round" points="${pts}"/></svg>`;
}

// series: [{ name, values, color }], all same length.
export function lineChart(series, { h = 120, yFmt = (v) => v, title = '' } = {}) {
  const w = 600, padL = 46, padR = 8, padT = 8, padB = 18;
  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (!all.length) return `<div class="muted">No data yet.</div>`;
  let min = Math.min(...all, 0), max = Math.max(...all); if (max === min) max = min + 1;
  const n = Math.max(...series.map((s) => s.values.length));
  const x = (i) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  let g = '';
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) { const v = min + ((max - min) * t) / ticks; g += `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" style="stroke:${INK.rule}" stroke-width="1" stroke-dasharray="3 3"/><text x="${padL - 4}" y="${y(v) + 4}" font-size="10" style="fill:${INK.ink2};font-family:var(--type, monospace)" text-anchor="end">${yFmt(v)}</text>`; }
  if (min < 0) g += `<line x1="${padL}" x2="${w - padR}" y1="${y(0)}" y2="${y(0)}" style="stroke:${INK.ink2}" stroke-width="1"/>`;
  g += `<line x1="${padL}" x2="${padL}" y1="${padT}" y2="${h - padB}" style="stroke:${INK.ink}" stroke-width="1"/><line x1="${padL}" x2="${w - padR}" y1="${h - padB}" y2="${h - padB}" style="stroke:${INK.ink}" stroke-width="1"/>`;
  const dashes = ['', '6 3', '2 3', '8 3 2 3'];
  series.forEach((s, i) => {
    const pts = s.values.map((v, j) => `${x(j)},${y(v)}`).join(' ');
    g += `<polyline fill="none" style="stroke:${inkColor(s.color)}" stroke-width="1.8" stroke-linejoin="round" ${dashes[i % dashes.length] ? `stroke-dasharray="${dashes[i % dashes.length]}"` : ''} points="${pts}"/>`;
  });
  const legend = series.map((s, i) => `<text x="${w - padR - 4}" y="${padT + 10 + i * 12}" font-size="10" style="fill:${inkColor(s.color)};font-family:var(--type, monospace)" text-anchor="end">${s.name}</text>`).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet" style="height:auto;max-height:${h * 1.6}px">${g}${legend}</svg>`;
}

export function bar(value, max = 100, cls = '') {
  const p = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="bar ${cls}"><i style="width:${p}%"></i></div>`;
}
export function stars(n) { let s = ''; for (let i = 1; i <= 10; i++) s += `<span class="${i <= n ? '' : 'off'}">★</span>`; return `<span class="stars" title="Skill ${n}/10">${s}</span>`; }
