import { useState } from 'react';
import { useAuth } from '../../application/services.jsx';
import { useCompanies } from '../../application/useCompanies.js';
import { ROLE_LABELS } from '../../domain/roles.js';
import { Avatar, Button, Kicker } from '../atoms';
import { Panel } from '../molecules';
import { CompanyForm, PasswordForm } from '../organisms';
import { PageShell } from '../templates/PageShell.jsx';

export function SuperAdminPage() {
  const { signOut, impersonate } = useAuth();
  const { companies, users, error, addCompany, setCompanyActive } = useCompanies();
  const [actionError, setActionError] = useState('');
  const act = p => p.then(() => setActionError(''), err => setActionError(err.message));
  const toggle = c => (!c.active || window.confirm(`Deactivate ${c.name}? Everyone in it is signed out and can't sign in until it's reactivated. No data is deleted.`))
    && act(setCompanyActive(c.id, !c.active));
  return (
    <>
      <header className="nav wp-nav">
        <div className="nav-brand"><i className="mark" />WorkPulse</div>
        <span className="text-muted">Super admin</span>
        <Button variant="ghost" onClick={signOut}>Sign out</Button>
      </header>
      <PageShell className="ins">
        <div className="ins-head"><div><Kicker>Super admin</Kicker><h1>Companies</h1></div></div>
        {(error || actionError) && <p className="track-err" role="alert">{error || actionError}</p>}
        <div className="users-grid">
          <div>
            {companies?.length === 0 && <p className="text-muted">No companies yet. Create the first one.</p>}
            {companies?.map(c => {
              const people = users.filter(u => u.company === c.id);
              return (
                <section key={c.id} className={'panel' + (c.active ? '' : ' is-inactive')}>
                  <div className="panel-h">
                    <h4>{c.name} {!c.active && <span className="tag tag-off">Deactivated</span>}</h4>
                    <span className="row-act">
                      <span className="text-muted">{people.length} {people.length === 1 ? 'person' : 'people'}</span>
                      <Button variant="ghost" className={c.active ? 'btn-danger' : ''} onClick={() => toggle(c)}>{c.active ? 'Deactivate' : 'Reactivate'}</Button>
                    </span>
                  </div>
                  <table className="table">
                    <tbody>
                      {people.map(u => (
                        <tr key={u.id} className={u.active ? '' : 'is-inactive'}>
                          <td><div className="who"><Avatar name={u.name} /><div><b>{u.name}</b><div className="text-muted">{u.email}</div></div></div></td>
                          <td>{ROLE_LABELS[u.role]}{!u.active && <div><span className="tag tag-off">Deactivated</span></div>}</td>
                          <td className="row-act">
                            <Button variant="ghost" disabled={!c.active || !u.active} title={c.active && u.active ? undefined : 'Deactivated accounts can\'t be signed into'}
                              onClick={() => act(impersonate(u.id))}>Sign in as</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
          <div>
            <Panel title="New company"><CompanyForm onCreate={addCompany} /></Panel>
            <Panel title="Your password"><PasswordForm /></Panel>
          </div>
        </div>
      </PageShell>
    </>
  );
}
