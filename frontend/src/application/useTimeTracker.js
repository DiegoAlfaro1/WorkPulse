import { useMemo } from 'react';
import { entryFromTimer } from '../domain/entries.js';
import { useCatalog, usePersistentState } from './services.jsx';

const IDLE_TIMER = { desc: '', project: 'p1', task: 'Design', tags: [], billable: true, issue: null, start: null };

export function useTimeTracker() {
  const { seedEntries, currentUserId } = useCatalog();
  const [userEntries, setUserEntries] = usePersistentState('wp_user_entries', []);
  const [deleted, setDeleted] = usePersistentState('wp_deleted', []);
  const [timer, setTimer] = usePersistentState('wp_timer', IDLE_TIMER);

  const all = useMemo(() => seedEntries.concat(userEntries).filter(e => !deleted.includes(e.id)), [seedEntries, userEntries, deleted]);
  const mine = useMemo(() => all.filter(e => e.member === currentUserId), [all, currentUserId]);

  const stopCurrent = t => {
    if (t.start) setUserEntries(u => [...u, entryFromTimer(t, Date.now(), currentUserId)]);
  };

  return {
    all, mine, timer,
    updateTimer: patch => setTimer(t => ({ ...t, ...patch })),
    start: () => setTimer(t => ({ ...t, start: Date.now() })),
    stop: () => { stopCurrent(timer); setTimer(t => ({ ...t, start: null, desc: '', tags: [], issue: null })); },
    resume: e => {
      stopCurrent(timer);
      setTimer({ desc: e.desc, project: e.project, task: e.task, tags: e.tags, billable: e.billable, issue: e.issue || null, start: Date.now() });
    },
    remove: e => e.id.startsWith('u') ? setUserEntries(u => u.filter(x => x.id !== e.id)) : setDeleted(d => [...d, e.id]),
  };
}
