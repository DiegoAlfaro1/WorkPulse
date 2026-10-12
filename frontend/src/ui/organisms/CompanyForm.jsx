import { useState } from 'react';
import { Button, Kicker } from '../atoms';
import { Field } from '../molecules';

/** New company plus its first admin (the backend creates both or neither). */
export function CompanyForm({ onCreate }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    setBusy(true);
    try {
      await onCreate({ name: f.get('company'), admin: { name: f.get('name'), email: f.get('email'), password: f.get('password') } });
      form.reset();
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pform" onSubmit={submit}>
      <Field label="Company name"><input className="input" name="company" aria-label="Company name" maxLength={100} required /></Field>
      <Kicker>First admin</Kicker>
      <Field label="Name"><input className="input" name="name" aria-label="Admin name" maxLength={100} required /></Field>
      <Field label="Email"><input className="input" name="email" type="email" aria-label="Admin email" required /></Field>
      <Field label="Password">
        <input className="input" name="password" type="password" aria-label="Admin password" autoComplete="new-password" minLength={8} maxLength={72} required placeholder="At least 8 characters" />
      </Field>
      {error && <p className="track-err" role="alert">{error}</p>}
      <Button variant="primary" type="submit" disabled={busy}>Create company</Button>
    </form>
  );
}
