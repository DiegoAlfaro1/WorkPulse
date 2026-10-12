import { useMemo, useState } from 'react';
import { sod } from '../domain/time.js';
import { buildReport, matchesAttrs, rangeBounds, workingDaysSoFar } from '../domain/insights.js';
import { seesTeam } from '../domain/roles.js';
import { useCatalog, usePersistentState } from './services.jsx';

export function useInsights({ all, role, now }) {
  const catalog = useCatalog();
  const [savedScope, setSavedScope] = usePersistentState('wp_i_scope', 'me');
  const [range, setRange] = usePersistentState('wp_i_range', 'month');
  const [member, setMember] = useState('all');
  const [client, setClient] = useState('all');
  const [project, setProject] = useState('all');
  const [bill, setBill] = useState('all');

  const scope = seesTeam(role) ? savedScope : 'me';
  const today = sod(now); // memo key: changes once a day, not every clock tick
  const [from, to] = useMemo(() => rangeBounds(range, today), [range, today]);
  // Deactivated people still show (their history counts) but don't add to the hours target.
  const active = catalog.members.filter(m => m.active).length;
  const people = scope === 'me' || member !== 'all' ? 1 : active;

  const attrs = useMemo(() => matchesAttrs({ client, project, bill }, catalog.projectById), [client, project, bill, catalog]);
  const scoped = useMemo(() => all.filter(e =>
    (scope === 'me' ? e.member === catalog.currentUserId : member === 'all' || e.member === member) && attrs(e),
  ), [all, scope, member, attrs, catalog]);
  const report = useMemo(
    () => buildReport({ all, scoped, from, to, range, today, catalog, attrs }),
    [all, scoped, from, to, range, today, catalog, attrs],
  );

  return {
    scope, range, member, client, project, bill, people, report,
    wd: workingDaysSoFar(from, to, today),
    target: (report.weekly ? 40 : 8) * people,
    filtered: client !== 'all' || project !== 'all' || bill !== 'all' || member !== 'all',
    scopeName: scope === 'me' ? 'My time'
      : member === 'all' ? `Team · ${active} people`
        : catalog.members.find(m => m.id === member).name,
    setScope: v => { setSavedScope(v); setMember('all'); },
    setRange, setMember, setProject, setBill,
    setClient: v => { setClient(v); setProject('all'); },
    clearFilters: () => { setClient('all'); setProject('all'); setBill('all'); setMember('all'); },
  };
}
