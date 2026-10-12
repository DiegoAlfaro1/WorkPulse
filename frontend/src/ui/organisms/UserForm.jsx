import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { ROLE_LABELS, assignableRoles, assignableTeams } from '../../domain/roles.js';
import { Button, Select } from '../atoms';
import { Field, TeamChecklist } from '../molecules';

/** Creates a user, or edits `user`. Managers editing someone can only change which of their teams they're in. */
export function UserForm({ user, onDone }) {
  const { me, teams, addUser, updateUser } = useCatalog();
  const roles = assignableRoles(me), teamOptions = assignableTeams(me, teams);
  const teamsOnly = user && me.role !== 'admin';
  const init = () => ({
    name: user?.name ?? '', email: user?.email ?? '', password: '', role: user?.role ?? roles[0],
    teams: (user?.teams ?? []).map(t => t.id).filter(id => teamOptions.some(t => t.id === id)),
  });
  const [form, setForm] = useState(init);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      if (!user) await addUser(form);
      else if (teamsOnly) await updateUser(user.id, { teams: form.teams });
      else await updateUser(user.id, { name: form.name, role: form.role, teams: form.teams, ...(form.password && { password: form.password }) });
      setForm(init());
      setError('');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pform" onSubmit={submit}>
      <Field label="Name"><input className="input" aria-label="Name" value={form.name} onChange={e => set({ name: e.target.value })} required disabled={teamsOnly} /></Field>
      <Field label="Email"><input className="input" type="email" aria-label="Email" value={form.email} onChange={e => set({ email: e.target.value })} required disabled={!!user} /></Field>
      {!teamsOnly && (
        <Field label={user ? 'New password (optional)' : 'Password'}>
          <input className="input" type="password" aria-label="Password" autoComplete="new-password" minLength={8} maxLength={72}
            value={form.password} onChange={e => set({ password: e.target.value })} required={!user} placeholder="At least 8 characters" />
        </Field>
      )}
      <Field label="Role">
        <Select aria-label="Role" value={form.role} onChange={e => set({ role: e.target.value })} disabled={teamsOnly || roles.length < 2 || user?.id === me.id}>
          {(teamsOnly ? [form.role] : roles).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
      </Field>
      <Field label="Teams"><TeamChecklist teams={teamOptions} value={form.teams} onChange={v => set({ teams: v })} /></Field>
      {error && <p className="track-err" role="alert">{error}</p>}
      <div className="form-btns">
        <Button variant="primary" type="submit" disabled={busy}>{user ? 'Save' : 'Add user'}</Button>
        {user && <Button variant="secondary" type="button" onClick={onDone}>Cancel</Button>}
      </div>
    </form>
  );
}
