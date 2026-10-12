import { useEffect } from 'react';
import { useNow, usePersistentState } from '../application/services.jsx';
import { useTimeTracker } from '../application/useTimeTracker.js';
import { fmtClock } from '../domain/time.js';
import { NavBar } from './organisms';
import { InsightsPage } from './pages/InsightsPage.jsx';
import { TrackPage } from './pages/TrackPage.jsx';

export function App() {
  const [page, setPage] = usePersistentState('wp_page', 'track');
  const [role, setRole] = usePersistentState('wp_role', 'manager');
  const now = useNow();
  const tracker = useTimeTracker();
  const { timer } = tracker;

  useEffect(() => {
    document.title = timer.start ? fmtClock(now - timer.start) + ' · WorkPulse' : 'WorkPulse';
  }, [now, timer.start]);

  return (
    <>
      <NavBar page={page} onNavigate={setPage} role={role} onRoleChange={setRole} timer={timer} now={now} />
      {page === 'track'
        ? <TrackPage tracker={tracker} now={now} />
        : <InsightsPage all={tracker.all} role={role} now={now} />}
    </>
  );
}
