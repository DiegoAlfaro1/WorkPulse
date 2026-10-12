import { DAY, sod, sow, hrs, overlap } from './time.js';

export const totalDuration = list => list.reduce((s, e) => s + e.end - e.start, 0);

/** Newest first, grouped by start-of-day: [[dayStart, entries[]], ...] */
export function groupByDay(entries) {
  const g = new Map();
  [...entries].sort((a, b) => b.start - a.start).forEach(e => {
    const k = sod(e.start);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(e);
  });
  return [...g.entries()];
}

/** The id is assigned by the backend when the entry is saved. */
export const entryFromTimer = (t, end, member) => ({
  member, start: t.start, end, project: t.project, task: t.task, desc: t.desc,
  tags: t.tags, billable: t.billable,
});

/** Adds the running timer as a pseudo-entry so live totals (and insights filters) include it. */
export const withRunning = (entries, timer, now, member) =>
  timer.start ? [...entries, { ...entryFromTimer(timer, now, member), id: 'running' }] : entries;

export function weekSummary(entries, now) {
  const ws = sow(now), today = sod(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const a = ws + i * DAY;
    return { a, h: hrs(entries.reduce((s, e) => s + overlap(e, a, a + DAY), 0)), isToday: a === today, isFuture: a > today };
  });
  const byP = {};
  entries.forEach(e => { const o = overlap(e, ws, ws + 7 * DAY); if (o) byP[e.project] = (byP[e.project] || 0) + o; });
  return {
    days,
    total: days.reduce((s, d) => s + d.h, 0),
    max: Math.max(10, ...days.map(d => d.h)),
    todayH: days.find(d => d.isToday)?.h || 0,
    projects: Object.entries(byP).sort((a, b) => b[1] - a[1]),
  };
}
