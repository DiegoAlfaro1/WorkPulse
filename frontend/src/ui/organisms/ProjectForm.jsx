import { useState } from 'react';
import { useCatalog } from '../../application/services.jsx';
import { Button, Kicker } from '../atoms';
import { BillableToggle, Field } from '../molecules';

export function ProjectForm() {
  const { clients, addProject } = useCatalog();
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault();
    const form = e.target, f = new FormData(form), name = f.get('name').trim();
    if (!name) return;
    try {
      await addProject({ name, client: f.get('client').trim() || 'No client', billable });
      form.reset();
      setError('');
    } catch (err) {
      setError(err.message === 'already exists' ? 'That project already exists for this client.' : err.message);
    }
  };
  return (
    <form className="week-sec pform" onSubmit={submit}>
      <Kicker>New project</Kicker>
      <Field label="Name"><input className="input" name="name" required /></Field>
      <Field label="Client"><input className="input" name="client" list="wp-clients" placeholder="No client" /></Field>
      <datalist id="wp-clients">{Object.keys(clients).map(c => <option key={c} value={c} />)}</datalist>
      <Field label="Billing"><BillableToggle value={billable} onChange={setBillable} /></Field>
      {error && <p className="text-muted" role="alert">{error}</p>}
      <Button variant="secondary" type="submit">Add project</Button>
    </form>
  );
}
