import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { Button, Kicker } from '../atoms';
import { BillableToggle, Field } from '../molecules';

export function ProjectForm() {
  const { clients, addProject } = useCatalog();
  const [billable, setBillable] = useState(true);
  const submit = e => {
    e.preventDefault();
    const f = new FormData(e.target), name = f.get('name').trim();
    if (!name) return;
    addProject({ name, client: f.get('client').trim() || 'No client', billable });
    e.target.reset();
  };
  return (
    <form className="week-sec pform" onSubmit={submit}>
      <Kicker>New project</Kicker>
      <Field label="Name"><input className="input" name="name" required /></Field>
      <Field label="Client"><input className="input" name="client" list="wp-clients" placeholder="No client" /></Field>
      <datalist id="wp-clients">{Object.keys(clients).map(c => <option key={c} value={c} />)}</datalist>
      <Field label="Billing"><BillableToggle value={billable} onChange={setBillable} /></Field>
      <Button variant="secondary" type="submit">Add project</Button>
    </form>
  );
}
