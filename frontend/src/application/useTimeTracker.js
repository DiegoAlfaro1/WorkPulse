import { useMemo } from 'react';
import { entryFromTimer } from '../domain/entries.js';
import { useCatalog, usePersistentState } from './services.jsx';

const IDLE_TIMER = { desc: '', project: '', task: 'Design', tags: [], billable: true, start: null };

export function useTimeTracker() {
  const { projectById, currentUserId } = useCatalog();
  const [entries, setEntries] = usePersistentState('wp_user_entries', []);
  const [savedTimer, setTimer] = usePersistentState('wp_timer', IDLE_TIMER);

  // Entries/timer pointing at a project that no longer exists (e.g. the old demo p1–p5) are hidden, not deleted.
  const all = useMemo(() => entries.filter(e => projectById[e.project]), [entries, projectById]);
  const mine = useMemo(() => all.filter(e => e.member === currentUserId), [all, currentUserId]);
  const timer = projectById[savedTimer.project] ? savedTimer : { ...savedTimer, project: '', start: null };

  const stopCurrent = t => {
    if (t.start) setEntries(u => [...u, entryFromTimer(t, Date.now(), currentUserId)]);
  };

  return {
    all, mine, timer,
    updateTimer: patch => setTimer({ ...timer, ...patch }),
    start: () => setTimer({ ...timer, start: Date.now() }),
    stop: () => { stopCurrent(timer); setTimer({ ...timer, start: null, desc: '', tags: [] }); },
    resume: e => {
      stopCurrent(timer);
      setTimer({ desc: e.desc, project: e.project, task: e.task, tags: e.tags, billable: e.billable, start: Date.now() });
    },
    remove: e => setEntries(u => u.filter(x => x.id !== e.id)),
  };
}
