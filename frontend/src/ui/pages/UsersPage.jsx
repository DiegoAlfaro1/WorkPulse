import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { Kicker } from '../atoms';
import { Panel } from '../molecules';
import { TeamsPanel, UserForm, UserTable } from '../organisms';
import { PageShell } from '../templates/PageShell.jsx';

export function UsersPage() {
  const { me, members } = useCatalog();
  const [editing, setEditing] = useState(null);
  return (
    <PageShell className="ins">
      <div className="ins-head">
        <div><Kicker>User management</Kicker><h1>{me.role === 'admin' ? 'Everyone in the company' : 'My teams'}</h1></div>
      </div>
      <div className="users-grid">
        <Panel title="People" hint={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}>
          <UserTable users={members} onEdit={setEditing} />
        </Panel>
        <div>
          <Panel title={editing ? 'Edit ' + editing.name : 'New user'}>
            <UserForm key={editing?.id ?? 'new'} user={editing} onDone={() => setEditing(null)} />
          </Panel>
          <Panel title="Teams"><TeamsPanel /></Panel>
        </div>
      </div>
    </PageShell>
  );
}
