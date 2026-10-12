import { useAuth, useCatalog } from '../../application/services.jsx';
import { ROLE_LABELS } from '../../domain/roles.js';
import { Avatar, Button, Kicker, Tag } from '../atoms';
import { Panel } from '../molecules';
import { PasswordForm } from '../organisms';
import { PageShell } from '../templates/PageShell.jsx';

const ROLE_SCOPE = {
  admin: 'You can see and manage everyone in the company.',
  manager: 'You can see your teams and manage their employees.',
  employee: 'You can see your own time.',
};

export function AccountPage() {
  const { me } = useCatalog();
  const { session, signOut } = useAuth();
  return (
    <PageShell className="ins">
      <div className="ins-head"><div><Kicker>Account</Kicker><h1>{me.name}</h1></div></div>
      <div className="ins-row two">
        <Panel title="Profile">
          <div className="profile">
            <div className="who"><Avatar name={me.name} /><div><b>{me.name}</b><div className="text-muted">{me.email}</div></div></div>
            <dl className="facts">
              <dt>Role</dt><dd>{ROLE_LABELS[me.role]}<div className="text-muted">{ROLE_SCOPE[me.role]}</div></dd>
              <dt>Teams</dt><dd>{me.teams.length ? me.teams.map(t => <Tag key={t.id}>{t.name}</Tag>) : <span className="text-muted">Not in a team</span>}</dd>
            </dl>
            {!session.impersonating && <div><Button variant="secondary" onClick={signOut}>Sign out</Button></div>}
          </div>
        </Panel>
        <Panel title="Change password">
          {session.impersonating
            ? <p className="text-muted">You're signed in as {me.name} by the super admin, so their password can't be changed from here.</p>
            : <PasswordForm />}
        </Panel>
      </div>
    </PageShell>
  );
}
