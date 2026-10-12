import { DAY, H, sod, sow, addDays, overlap, fmtDay } from './time.js';

export function niceMax(v) {
  for (const step of [2, 4, 5, 10, 20, 25, 50, 100, 200, 250, 500]) {
    if (v <= step * 5) return { step, max: Math.ceil(v / step) * step || step };
  }
  return { step: 1000, max: Math.ceil(v / 1000) * 1000 };
}

export function axisScale(top) {
  const { step, max } = niceMax(top || 1);
  const ticks = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  return { max, ticks };
}

/** [from, to) for 'week' | 'month' | '90' (last 90 days). */
export function rangeBounds(range, now) {
  const today = sod(now), d = new Date(now);
  if (range === 'week') return [sow(now), sow(now) + 7 * DAY];
  if (range === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()];
  return [sod(today - 89 * DAY + 2 * H), today + DAY];
}

export function workingDaysSoFar(from, to, now) {
  const today = sod(now);
  let wd = 0;
  for (let t = from; t <= today && t < to; t = addDays(t)) { const g = new Date(t).getDay(); if (g && g < 6) wd++; }
  return wd;
}

/** Client / project / billing filter — shared by the scoped view and the team table. */
export const matchesAttrs = ({ client, project, bill }, projectById) => e =>
  (client === 'all' || projectById[e.project].client === client) &&
  (project === 'all' || e.project === project) &&
  (bill === 'all' || (bill === 'b') === e.billable);

export function buildReport({ all, scoped, from, to, range, today, catalog, attrs }) {
  const { projectById, clients, members } = catalog;
  const inRange = scoped.filter(e => e.end > from && e.start < to);
  const hIn = e => overlap(e, from, to) / H;
  const sumH = list => list.reduce((s, e) => s + hIn(e), 0);

  const byP = {}, byT = {};
  inRange.forEach(e => { const h = hIn(e); byP[e.project] = (byP[e.project] || 0) + h; byT[e.task] = (byT[e.task] || 0) + h; });
  const pRows = Object.entries(byP)
    .map(([k, h]) => ({ k, h, name: projectById[k].name, sub: clients[projectById[k].client], color: projectById[k].color }))
    .sort((a, b) => b.h - a.h);
  const tRows = Object.entries(byT).map(([k, h]) => ({ k, h, name: k })).sort((a, b) => b.h - a.h);

  const weekly = range === '90', step = weekly ? 7 : 1, buckets = [];
  for (let t = weekly ? sow(from) : from; t < to; t = addDays(t, step)) {
    const t1 = addDays(t, step), bp = {};
    let total = 0;
    inRange.forEach(e => { const o = overlap(e, t, t1) / H; if (o) { bp[e.project] = (bp[e.project] || 0) + o; total += o; } });
    const d = new Date(t);
    buckets.push({
      byP: bp, total, future: t > today,
      label: weekly ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : range === 'week' ? d.toLocaleDateString('en-GB', { weekday: 'short' })
          : (d.getDate() % 2 ? d.getDate() : ''),
      long: weekly ? 'Week of ' + fmtDay(t) : fmtDay(t),
    });
  }

  const heat = new Map();
  scoped.forEach(e => { const k = sod(e.start); heat.set(k, (heat.get(k) || 0) + (e.end - e.start) / H); });

  const team = members.map(m => {
    const es = all.filter(e => e.member === m.id && e.end > from && e.start < to && attrs(e));
    const bp = {};
    es.forEach(e => { bp[e.project] = (bp[e.project] || 0) + e.end - e.start; });
    const top = Object.entries(bp).sort((a, b) => b[1] - a[1])[0];
    return { m, h: sumH(es), b: sumH(es.filter(e => e.billable)), top: top ? top[0] : null, days: new Set(es.map(e => sod(e.start))).size };
  });

  return {
    tot: sumH(inRange),
    billH: sumH(inRange.filter(e => e.billable)),
    days: new Set(inRange.map(e => e.member + sod(e.start))).size,
    pRows, tRows, buckets, weekly, heat, team,
  };
}

export function heatWeeks(heat, people, now) {
  const ws = sow(now) - 25 * 7 * DAY, today = sod(now);
  return Array.from({ length: 26 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const t = sod(ws + (w * 7 + d) * DAY + 2 * H);
    return { t, h: (heat.get(t) || 0) / people, future: t > today };
  }));
}

export const heatLevel = h => h <= 0 ? 0 : h < 4 ? 1 : h < 6 ? 2 : h < 8 ? 3 : 4;
