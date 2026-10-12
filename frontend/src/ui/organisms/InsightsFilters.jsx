import { useCatalog } from '../../application/services.jsx';
import { Button, Icon, Select } from '../atoms';
import { Field, ProjectSelect } from '../molecules';

export function InsightsFilters({ scope, member, setMember, client, setClient, project, setProject, bill, setBill, filtered, clearFilters }) {
  const { members, clients } = useCatalog();
  return (
    <div className="filters">
      {scope === 'team' && (
        <Field label="Member">
          <Select value={member} onChange={e => setMember(e.target.value)}>
            <option value="all">All members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Client">
        <Select value={client} onChange={e => setClient(e.target.value)}>
          <option value="all">All clients</option>
          {Object.entries(clients).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Project"><ProjectSelect all value={project} onChange={setProject} /></Field>
      <Field label="Billing">
        <Select value={bill} onChange={e => setBill(e.target.value)}>
          <option value="all">All hours</option>
          <option value="b">Billable</option>
          <option value="n">Non-billable</option>
        </Select>
      </Field>
      {filtered && <Button variant="ghost" onClick={clearFilters}><Icon n="x" s={14} />Clear filters</Button>}
    </div>
  );
}
