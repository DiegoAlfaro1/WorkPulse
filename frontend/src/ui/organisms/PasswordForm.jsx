import { useState } from 'react';
import { useAuth } from '../../application/services.jsx';
import { Button } from '../atoms';
import { Field } from '../molecules';

/** Changes the signed-in user's password; the backend signs out their other sessions. */
export function PasswordForm() {
  const { changePassword } = useAuth();
  const [status, setStatus] = useState({ error: '', done: false });
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    if (f.get('next') !== f.get('confirm')) return setStatus({ error: "The new passwords don't match.", done: false });
    setBusy(true);
    try {
      await changePassword(f.get('current'), f.get('next'));
      form.reset();
      setStatus({ error: '', done: true });
    } catch (err) {
      setStatus({ error: err.message, done: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pform" onSubmit={submit}>
      <Field label="Current password"><input className="input" name="current" type="password" aria-label="Current password" autoComplete="current-password" required /></Field>
      <Field label="New password">
        <input className="input" name="next" type="password" aria-label="New password" autoComplete="new-password" minLength={8} maxLength={72} required placeholder="At least 8 characters" />
      </Field>
      <Field label="Repeat new password"><input className="input" name="confirm" type="password" aria-label="Repeat new password" autoComplete="new-password" required /></Field>
      {status.error && <p className="track-err" role="alert">{status.error}</p>}
      {status.done && <p className="form-ok" role="status">Password changed. Your other sessions were signed out.</p>}
      <Button variant="primary" type="submit" disabled={busy}>Change password</Button>
    </form>
  );
}
