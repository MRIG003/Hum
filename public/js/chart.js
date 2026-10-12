import { esc, formatClock } from './common.js';

const DEFAULT_W = 800;
const H = 190;
const PAD = { l: 8, r: 8, t: 12, b: 24 };
const MIN_SPAN_MS = 10 * 60_000;

/** Render the engagement-over-time chart into an <svg> element. */
export const renderChart = (svg, { series, dips, events, startedAt, now }) => {
  const W = Math.round(svg.getBoundingClientRect().width) || DEFAULT_W;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const end = Math.max(now, series.at(-1)?.t ?? now, startedAt + MIN_SPAN_MS);
  const span = end - startedAt;
  const x = (t) => PAD.l + ((t - startedAt) / span) * (W - PAD.l - PAD.r);
  const y = (pct) => PAD.t + (1 - pct / 100) * (H - PAD.t - PAD.b);

  const parts = [];
  parts.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(50)}" y2="${y(50)}"/>`);

  for (const dip of dips) {
    const x1 = x(dip.from);
    const x2 = Math.max(x(dip.to), x1 + 26);
    parts.push(`<rect class="dip" x="${x1}" y="${PAD.t}" width="${x2 - x1}" height="${H - PAD.t - PAD.b}" rx="6"/>`);
    parts.push(`<text x="${x1 + 6}" y="${PAD.t + 14}">Dip at ${Math.round((dip.from - startedAt) / 60_000)} min</text>`);
  }

  for (const event of events) {
    if (event.type !== 'pulse' && event.type !== 'floor') continue;
    const ex = x(event.t);
    parts.push(`<line class="marker" x1="${ex}" x2="${ex}" y1="${PAD.t}" y2="${H - PAD.b}"/>`);
    parts.push(`<text x="${ex + 4}" y="${H - PAD.b - 6}">${event.type === 'pulse' ? 'Pulse check' : 'Floor opened'}</text>`);
  }

  if (series.length > 1) {
    const points = series.map((s) => `${x(s.t).toFixed(1)},${y(s.pct).toFixed(1)}`);
    parts.push(`<polygon class="area" points="${points[0].split(',')[0]},${y(0)} ${points.join(' ')} ${points.at(-1).split(',')[0]},${y(0)}"/>`);
    parts.push(`<polyline class="line" points="${points.join(' ')}"/>`);
  } else if (series.length === 1) {
    parts.push(`<circle cx="${x(series[0].t)}" cy="${y(series[0].pct)}" r="4" fill="var(--accent)"/>`);
  } else {
    parts.push(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Waiting for the first participants</text>`);
  }

  parts.push(`<text x="${PAD.l}" y="${H - 6}">0 min</text>`);
  parts.push(`<text x="${W - PAD.r}" y="${H - 6}" text-anchor="end">${esc(formatClock(span))}</text>`);
  parts.push(`<text x="${W - PAD.r}" y="${y(50) - 4}" text-anchor="end">50%</text>`);
  svg.innerHTML = parts.join('');
};
