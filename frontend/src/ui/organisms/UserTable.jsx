import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { ROLE_LABELS, canDeactivate, canEdit } from '../../domain/roles.js';
import { Avatar, Button, Tag } from '../atoms';

export function UserTable({ users, onEdit }) {
  const { me, setUserActive } = useCatalog();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const toggle = async u => {
    if (u.active && !window.confirm(`Deactivate ${u.name}? They're signed out and can't sign in until reactivated. Their time entries are kept.`)) return;
    setBusy(u.id);
    try {
      await setUserActive(u.id, !u.active);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {error && <p className="track-err" role="alert">{error}</p>}
      <table className="table">
        <thead><tr><th>Name</th><th>Role</th><th>Teams</th><th /></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={u.active ? '' : 'is-inactive'}>
              <td><div className="who"><Avatar name={u.name} /><div><b>{u.name}</b>{u.id === me.id && <span className="text-muted"> (you)</span>}<div className="text-muted">{u.email}</div></div></div></td>
              <td>{ROLE_LABELS[u.role]}{!u.active && <div><span className="tag tag-off">Deactivated</span></div>}</td>
              <td>{u.teams.length ? u.teams.map(t => <Tag key={t.id}>{t.name}</Tag>) : <span className="text-muted">No team</span>}</td>
              <td className="row-act">
                {canEdit(me, u) && <Button variant="ghost" onClick={() => onEdit(u)}>Edit</Button>}
                {canDeactivate(me, u) &&
                  <Button variant="ghost" className={u.active ? 'btn-danger' : ''} disabled={busy === u.id} onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Reactivate'}</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
