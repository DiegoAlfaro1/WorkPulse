import { useEffect } from 'react';
import { useAuth, useCatalog, useNow, usePersistentState } from '../application/services.jsx';
import { useTimeTracker } from '../application/useTimeTracker.js';
import { withRunning } from '../domain/entries.js';
import { seesTeam } from '../domain/roles.js';
import { fmtClock } from '../domain/time.js';
import { NavBar } from './organisms';
import { AccountPage } from './pages/AccountPage.jsx';
import { InsightsPage } from './pages/InsightsPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { SuperAdminPage } from './pages/SuperAdminPage.jsx';
import { TrackPage } from './pages/TrackPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';

export function App() {
  const { session } = useAuth();
  if (!session) return <LoginPage />;
  if (session.user.role === 'superadmin') return <SuperAdminPage />;
  // Keyed by user: switching accounts (impersonation) starts from that user's own timer and filters.
  return <Workspace key={session.user.id} />;
}

function Workspace() {
  const { me, currentUserId } = useCatalog();
  const [savedPage, setPage] = usePersistentState('wp_page', 'track');
  const page = savedPage === 'users' && !seesTeam(me.role) ? 'track' : savedPage;
  const now = useNow();
  const tracker = useTimeTracker();
  const { timer } = tracker;

  useEffect(() => {
    document.title = timer.start ? fmtClock(now - timer.start) + ' · WorkPulse' : 'WorkPulse';
  }, [now, timer.start]);

  return (
    <>
      <NavBar page={page} onNavigate={setPage} timer={timer} now={now} />
      {page === 'track' ? <TrackPage tracker={tracker} now={now} />
        : page === 'users' ? <UsersPage />
          : page === 'account' ? <AccountPage />
          : <InsightsPage all={withRunning(tracker.all, timer, now, currentUserId)} role={me.role} now={now} />}
    </>
  );
}
