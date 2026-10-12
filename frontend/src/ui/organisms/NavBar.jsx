import { useCatalog } from '../../application/services.jsx';
import { Avatar, NavLink } from '../atoms';
import { RunPill, SegmentedControl } from '../molecules';

const ROLES = [['employee', 'Employee'], ['manager', 'Manager']];

export function NavBar({ page, onNavigate, role, onRoleChange, timer, now }) {
  const { projectById, members, currentUserId } = useCatalog();
  const me = members.find(m => m.id === currentUserId);
  return (
    <header className="nav wp-nav">
      <div className="nav-brand"><i className="mark" />WorkPulse</div>
      {timer.start && page !== 'track' &&
        <RunPill elapsed={now - timer.start} label={projectById[timer.project].name} onClick={() => onNavigate('track')} />}
      <NavLink active={page === 'track'} onClick={() => onNavigate('track')}>Track</NavLink>
      <NavLink active={page === 'insights'} onClick={() => onNavigate('insights')}>Insights</NavLink>
      <div className="rolesw"><SegmentedControl name="role" value={role} onChange={onRoleChange} options={ROLES} /></div>
      <Avatar name={me.name} title={me.name} />
    </header>
  );
}
