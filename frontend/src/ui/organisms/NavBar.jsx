import { useAuth, useCatalog } from '../../application/services.jsx';
import { ROLE_LABELS, seesTeam } from '../../domain/roles.js';
import { Avatar, Button, NavLink } from '../atoms';
import { RunPill } from '../molecules';

export function NavBar({ page, onNavigate, timer, now }) {
  const { projectById, me } = useCatalog();
  const { session, signOut, stopImpersonating } = useAuth();
  return (
    <header className="nav wp-nav">
      <div className="nav-brand"><i className="mark" />WorkPulse</div>
      {timer.start && page !== 'track' &&
        <RunPill elapsed={now - timer.start} label={projectById[timer.project].name} onClick={() => onNavigate('track')} />}
      <NavLink active={page === 'track'} onClick={() => onNavigate('track')}>Track</NavLink>
      <NavLink active={page === 'insights'} onClick={() => onNavigate('insights')}>Insights</NavLink>
      {seesTeam(me.role) && <NavLink active={page === 'users'} onClick={() => onNavigate('users')}>Users</NavLink>}
      <button className={'who nav-user' + (page === 'account' ? ' on' : '')} aria-current={page === 'account' ? 'page' : undefined}
        title="Account and password" onClick={() => onNavigate('account')}>
        <Avatar name={me.name} />
        <div><b>{me.name}</b><div className="text-muted">{ROLE_LABELS[me.role]}{session.impersonating && ' · impersonated'}</div></div>
      </button>
      {session.impersonating
        ? <Button variant="secondary" onClick={stopImpersonating}>Exit</Button>
        : <Button variant="ghost" onClick={signOut}>Sign out</Button>}
    </header>
  );
}
