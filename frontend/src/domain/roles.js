// Mirrors the backend's rules (backend/users.go); the backend is what enforces them.

export const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', employee: 'Employee' };

/** Admins see the whole company, managers their teams; employees only themselves. */
export const seesTeam = role => role === 'admin' || role === 'manager';

/** Roles `me` may give a new user. */
export const assignableRoles = me => (me.role === 'admin' ? ['employee', 'manager', 'admin'] : ['employee']);

/** Teams `me` may put people in. */
export const assignableTeams = (me, teams) => (me.role === 'admin' ? teams : teams.filter(t => me.teams.some(m => m.id === t.id)));

/** Whether `me` may deactivate/reactivate `u`: admins anyone else; managers employees who are only in their teams. */
export const canDeactivate = (me, u) => u.id !== me.id && (me.role === 'admin' ||
  (me.role === 'manager' && u.role === 'employee' && u.teams.length > 0 && u.teams.every(t => me.teams.some(m => m.id === t.id))));

/** Whether `me` may edit `u` at all (managers: only an employee's teams). */
export const canEdit = (me, u) => me.role === 'admin' || (me.role === 'manager' && u.role === 'employee');
