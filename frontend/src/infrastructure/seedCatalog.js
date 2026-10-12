import { DAY, H, M, sod } from '../domain/time.js';

// Demo catalog + ~6 months of generated history. Swap this adapter for an API-backed one.

const clients = { hb: 'Halden Bank', nw: 'Northwind', in: 'Internal' };
const projects = [
  { id: 'p1', name: 'Mobile Banking App', client: 'hb', billable: true, color: 'var(--color-accent)' },
  { id: 'p2', name: 'Checkout Redesign', client: 'nw', billable: true, color: 'var(--color-neutral-900)' },
  { id: 'p3', name: 'Data Platform', client: 'nw', billable: true, color: 'var(--color-accent-300)' },
  { id: 'p4', name: 'Internal Ops', client: 'in', billable: false, color: 'var(--color-neutral-500)' },
  { id: 'p5', name: 'Hiring', client: 'in', billable: false, color: 'var(--color-accent-800)' },
];
const tasks = ['Meeting', 'Design', 'Development', 'Code review', 'Research', 'Planning', 'Admin'];
const tags = ['client-call', 'standup', 'workshop', 'deep-work', 'bugfix', 'travel'];
const descs = {
  Meeting: ['Sprint planning', 'Client sync', 'Weekly 1:1', 'Design review', 'Retro', 'Stakeholder demo'],
  Design: ['Wireframes for onboarding', 'Component audit', 'Prototype review prep', 'Transfer flow screens'],
  Development: ['Payment flow API', 'Fix login regression', 'Refactor settings screen', 'Build export job'],
  'Code review': ['Review PR #482', 'Review PR #497', 'Review migration script'],
  Research: ['Competitor teardown', 'User interview synthesis', 'Spike: offline sync'],
  Planning: ['Backlog grooming', 'Roadmap draft', 'Estimate Q4 scope'],
  Admin: ['Email & Slack', 'Expense report', 'Timesheet cleanup'],
};
// w = project weights, t = task weights used by the generator.
const members = [
  { id: 'm0', name: 'Lena Ortiz', role: 'Product Designer', w: { p1: 5, p2: 3, p4: 2, p5: 1 }, t: { Meeting: 4, Design: 5, Research: 2, Planning: 1, Admin: 1 } },
  { id: 'm1', name: 'Tomás Weber', role: 'Engineer', w: { p1: 6, p3: 2, p4: 1 }, t: { Development: 6, 'Code review': 3, Meeting: 3, Admin: 1 } },
  { id: 'm2', name: 'Priya Nair', role: 'Engineer', w: { p2: 5, p3: 4, p4: 1 }, t: { Development: 6, 'Code review': 3, Meeting: 2, Research: 1 } },
  { id: 'm3', name: 'Jonas Berg', role: 'Engineering Manager', w: { p1: 2, p2: 2, p3: 2, p4: 3, p5: 3 }, t: { Meeting: 7, Planning: 3, 'Code review': 2, Admin: 2 } },
  { id: 'm4', name: 'Mei Chen', role: 'Data Engineer', w: { p3: 7, p4: 1 }, t: { Development: 5, Research: 2, Meeting: 2, 'Code review': 2 } },
  { id: 'm5', name: 'Sam Okafor', role: 'QA Engineer', w: { p1: 3, p2: 4, p4: 1 }, t: { Development: 2, 'Code review': 3, Meeting: 2, Admin: 1, Research: 1 } },
];
const issues = [
  { key: 'MBA-128', title: 'Onboarding redesign', project: 'p1', type: 'epic', status: 'In Progress' },
  { key: 'MBA-142', title: 'Transfer limits screen', project: 'p1', type: 'story', status: 'In Progress' },
  { key: 'MBA-151', title: 'Biometric login fails on Android 15', project: 'p1', type: 'bug', status: 'In Review' },
  { key: 'MBA-160', title: 'Card freeze toggle', project: 'p1', type: 'story', status: 'To Do' },
  { key: 'CHK-88', title: 'One-page checkout', project: 'p2', type: 'epic', status: 'In Progress' },
  { key: 'CHK-93', title: 'Address autocomplete', project: 'p2', type: 'story', status: 'In Progress' },
  { key: 'CHK-97', title: 'Promo code validation error', project: 'p2', type: 'bug', status: 'To Do' },
  { key: 'DATA-212', title: 'Nightly export job', project: 'p3', type: 'story', status: 'In Progress' },
  { key: 'DATA-219', title: 'Migrate events to new schema', project: 'p3', type: 'task', status: 'In Review' },
  { key: 'DATA-224', title: 'Offline sync spike', project: 'p3', type: 'task', status: 'To Do' },
  { key: 'OPS-31', title: 'Laptop refresh rollout', project: 'p4', type: 'task', status: 'In Progress' },
  { key: 'OPS-36', title: 'Sprint rituals', project: 'p4', type: 'task', status: 'Ongoing' },
  { key: 'HIRE-12', title: 'Senior designer pipeline', project: 'p5', type: 'task', status: 'In Progress' },
  { key: 'HIRE-14', title: 'Backend engineer interviews', project: 'p5', type: 'task', status: 'In Progress' },
];

// mulberry32: deterministic, so the demo history is identical on every load.
function mulberry32(seed) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateEntries(now, projectById) {
  const rnd = mulberry32(20261012);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const wpick = o => {
    const ks = Object.keys(o);
    let r = rnd() * ks.reduce((a, k) => a + o[k], 0);
    for (const k of ks) { r -= o[k]; if (r <= 0) return k; }
    return ks[0];
  };
  const today = sod(now), entries = [];
  let id = 0;
  members.forEach(m => {
    for (let i = 181; i >= 0; i--) {
      const day = sod(today - i * DAY + 2 * H);
      const wd = new Date(day).getDay();
      if (wd === 0 || wd === 6 || rnd() < 0.04) continue;
      let t = day + (8.75 + rnd() * 0.75) * H;
      let end = day + (16.75 + rnd() * 1.25) * H;
      if (i === 0) end = Math.min(end, now - 20 * M);
      let first = true, lunch = false;
      while (t < end - 10 * M) {
        let task, desc, dur, tg = [];
        if (first) { task = 'Meeting'; desc = 'Daily standup'; dur = 15; tg = ['standup']; first = false; }
        else {
          task = wpick(m.t); desc = pick(descs[task]);
          dur = task === 'Meeting' ? pick([30, 30, 45, 60, 60, 90]) : pick([30, 45, 60, 75, 90, 120, 150]);
          if (desc === 'Client sync' || desc === 'Stakeholder demo') tg = ['client-call'];
          if (task === 'Development' && dur >= 90) tg = ['deep-work'];
          if (desc.startsWith('Fix')) tg = ['bugfix'];
          if (desc === 'Design review' && rnd() < 0.5) tg = ['workshop'];
        }
        const p = wpick(m.w);
        const e0 = Math.min(t + dur * M, end);
        const iss = task === 'Admin' || rnd() < 0.16 ? null : pick(issues.filter(x => x.project === p)).key;
        entries.push({ id: 'e' + id++, member: m.id, start: t, end: e0, project: p, task, desc, tags: tg, billable: projectById[p].billable && task !== 'Admin', issue: iss, sync: iss ? 'synced' : null });
        t = e0 + pick([0, 0, 5, 10, 15]) * M;
        if (!lunch && t > day + 12.5 * H) { t += 45 * M; lunch = true; }
      }
    }
  });
  return entries;
}

/** @returns {import('../application/ports.js').CatalogPort} */
export function createSeedCatalog(now = Date.now()) {
  const projectById = Object.fromEntries(projects.map(p => [p.id, p]));
  return { clients, projects, projectById, tasks, tags, members, issues, currentUserId: 'm0', seedEntries: generateEntries(now, projectById) };
}
