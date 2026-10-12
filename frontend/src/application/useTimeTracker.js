import { useEffect, useMemo, useRef, useState } from 'react';
import { entryFromTimer } from '../domain/entries.js';
import { useCatalog, usePersistentState, useServices } from './services.jsx';

const IDLE_TIMER = { desc: '', project: '', task: 'Design', tags: [], billable: true, start: null };

export function useTimeTracker() {
  const { api } = useServices();
  const { projectById, currentUserId } = useCatalog();
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const [deleting, setDeleting] = useState(() => new Set()); // entry ids with a delete in flight
  const [savedTimer, setTimer] = usePersistentState('wp_timer:' + currentUserId, IDLE_TIMER);
  useEffect(() => { api.listEntries().then(setEntries, err => setError(err.message)); }, [api]);

  // Entries/timer pointing at a project that no longer exists (e.g. the old demo p1–p5) are hidden, not deleted.
  const all = useMemo(() => entries.filter(e => projectById[e.project]), [entries, projectById]);
  const mine = useMemo(() => all.filter(e => e.member === currentUserId), [all, currentUserId]);
  const timer = projectById[savedTimer.project] ? savedTimer : { ...savedTimer, project: '', start: null };

  // Saves the running timer as an entry and only then applies next(), so a failed save leaves the timer running.
  // The ref stops a double-clicked Stop from saving the same entry twice.
  const stopThen = async next => {
    if (saving.current) return;
    saving.current = true;
    try {
      if (timer.start) {
        const saved = await api.createEntry(entryFromTimer(timer, Date.now(), currentUserId));
        setEntries(u => [saved, ...u]);
      }
      setError('');
      setTimer(next);
    } catch (err) {
      setError(err.message);
    } finally {
      saving.current = false;
    }
  };

  return {
    all, mine, timer, error, deleting,
    updateTimer: patch => setTimer({ ...timer, ...patch }),
    start: () => setTimer({ ...timer, start: Date.now() }),
    stop: () => stopThen(t => ({ ...t, start: null, desc: '', tags: [] })),
    resume: e => stopThen({ desc: e.desc, project: e.project, task: e.task, tags: e.tags, billable: e.billable, start: Date.now() }),
    // The UI disables an entry's delete button while it's in `deleting`; the guard covers any other caller.
    remove: async e => {
      if (deleting.has(e.id)) return;
      setDeleting(d => new Set(d).add(e.id));
      try {
        await api.deleteEntry(e.id);
        setEntries(u => u.filter(x => x.id !== e.id));
        setError('');
      } catch (err) {
        setError(err.message);
      } finally {
        setDeleting(d => { const n = new Set(d); n.delete(e.id); return n; });
      }
    },
  };
}
