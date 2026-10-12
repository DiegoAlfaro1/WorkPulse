import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { Button, Icon } from '../atoms';

/** The teams the user can see, with member counts; admins can also create, rename and delete teams. */
export function TeamsPanel() {
  const { me, teams, members, addTeam, renameTeam, removeTeam } = useCatalog();
  const isAdmin = me.role === 'admin';
  const [renaming, setRenaming] = useState(null); // team id being renamed
  const [error, setError] = useState('');
  const run = async fn => {
    try { await fn(); setError(''); return true; } catch (err) { setError(err.message); return false; }
  };
  const create = e => {
    e.preventDefault();
    const form = e.target, name = new FormData(form).get('name').trim();
    if (name) run(async () => { await addTeam(name); form.reset(); });
  };
  const rename = async (e, t) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    if (name === t.name || await run(() => renameTeam(t.id, name))) setRenaming(null);
  };
  const remove = t => window.confirm(`Delete the team "${t.name}"? Its members stay, but are no longer in it.`) && run(() => removeTeam(t.id));
  return (
    <div className="pform">
      <div className="team-list">
        {teams.length ? teams.map(t => renaming === t.id ? (
          <form key={t.id} className="team-row team-new" onSubmit={e => rename(e, t)} onKeyDown={e => e.key === 'Escape' && setRenaming(null)}>
            <input className="input" name="name" aria-label={'New name for ' + t.name} defaultValue={t.name} maxLength={100} required autoFocus />
            <Button variant="secondary" type="submit">Save</Button>
            <Button variant="ghost" type="button" onClick={() => setRenaming(null)}>Cancel</Button>
          </form>
        ) : (
          <div key={t.id} className="team-row">
            <span><b>{t.name}</b> <span className="text-muted">· {members.filter(u => u.teams.some(x => x.id === t.id)).length} people</span></span>
            {isAdmin && (
              <span className="row-act">
                <Button variant="icon" title={'Rename ' + t.name} aria-label={'Rename team ' + t.name} onClick={() => setRenaming(t.id)}><Icon n="edit" /></Button>
                <Button variant="icon" title={'Delete ' + t.name} aria-label={'Delete team ' + t.name} onClick={() => remove(t)}><Icon n="trash" /></Button>
              </span>
            )}
          </div>
        )) : <p className="text-muted">{isAdmin ? 'No teams yet.' : "You're not in a team."}</p>}
      </div>
      {isAdmin && (
        <form className="team-new" onSubmit={create}>
          <input className="input" name="name" aria-label="New team name" placeholder="New team name" maxLength={100} required />
          <Button variant="secondary" type="submit">Add team</Button>
        </form>
      )}
      {error && <p className="track-err" role="alert">{error}</p>}
    </div>
  );
}
