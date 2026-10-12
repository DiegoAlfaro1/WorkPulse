import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, H, sod, sow, overlap, fmtDur, fmtClock } from './time.js';
import { groupByDay, weekSummary } from './entries.js';
import { niceMax, matchesAttrs, buildReport } from './insights.js';

const day = sod(new Date(2026, 9, 14).getTime()); // a Wednesday
const catalog = {
  projectById: { a: { id: 'a', name: 'A', client: 'c', color: 'red', billable: true }, b: { id: 'b', name: 'B', client: 'c', color: 'blue', billable: false } },
  clients: { c: 'C' },
  members: [{ id: 'm0', name: 'Me' }],
};
const entries = [
  { id: '1', member: 'm0', project: 'a', task: 'Design', billable: true, start: day + 9 * H, end: day + 11 * H },
  { id: '2', member: 'm0', project: 'b', task: 'Admin', billable: false, start: day + 13 * H, end: day + 14 * H },
  { id: '3', member: 'm0', project: 'a', task: 'Design', billable: true, start: day - DAY + 9 * H, end: day - DAY + 10 * H },
];

test('time helpers', () => {
  assert.equal(overlap({ start: 0, end: 10 }, 5, 20), 5);
  assert.equal(overlap({ start: 0, end: 10 }, 10, 20), 0);
  assert.equal(fmtDur(90 * 6e4), '1:30:00');
  assert.equal(fmtDur(12345), '0:00:12');
  assert.equal(fmtClock(3723e3), '01:02:03');
  assert.equal(fmtClock(-400), '00:00:00');
  assert.equal(sow(day + 15 * H), sod(new Date(2026, 9, 12).getTime()));
});

test('entries grouping and week summary', () => {
  const g = groupByDay(entries);
  assert.deepEqual(g.map(([k, l]) => [k, l.length]), [[day, 2], [day - DAY, 1]]);
  const w = weekSummary(entries, day + 15 * H);
  assert.equal(w.todayH, 3);
  assert.equal(w.total, 4);
  assert.deepEqual(w.projects.map(([p]) => p), ['a', 'b']);
});

test('niceMax', () => {
  assert.deepEqual(niceMax(9), { step: 2, max: 10 });
  assert.deepEqual(niceMax(43), { step: 10, max: 50 });
});

test('buildReport', () => {
  const attrs = matchesAttrs({ client: 'all', project: 'all', bill: 'all' }, catalog.projectById);
  const R = buildReport({ all: entries, scoped: entries, from: day, to: day + DAY, range: 'month', today: day, catalog, attrs });
  assert.equal(R.tot, 3);
  assert.equal(R.billH, 2);
  assert.equal(R.days, 1);
  assert.equal(R.pRows[0].k, 'a');
  assert.equal(R.buckets.length, 1);
  assert.equal(R.team[0].top, 'a');
  const nonBill = matchesAttrs({ client: 'all', project: 'all', bill: 'n' }, catalog.projectById);
  assert.deepEqual(entries.filter(nonBill).map(e => e.id), ['2']);
});
