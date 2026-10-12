import { useState } from 'react';
import { useAuth, useNow } from '../../application/services.jsx';
import { fmtClock, sod } from '../../domain/time.js';
import { Button, Kicker, RecDot } from '../atoms';
import { Field } from '../molecules';

export function LoginPage() {
  const { signIn } = useAuth();
  const now = useNow();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true);
    try {
      await signIn(f.get('email'), f.get('password')); // on success this page unmounts
    } catch (err) {
      setError(err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : err.message);
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <section className="login-brand">
        <div className="nav-brand"><i className="mark" />WorkPulse</div>
        <div>
          <Kicker>Time tracking + insights</Kicker>
          <h1 className="login-title">Track the work.<br /><em>See the pulse.</em></h1>
        </div>
        <div className="login-clock" aria-hidden="true">
          <div className="clock-label"><RecDot />Local time</div>
          <div className="clock">{fmtClock(now - sod(now))}</div>
        </div>
      </section>
      <section className="login-form">
        <form className="pform" onSubmit={submit}>
          <div>
            <Kicker>Sign in</Kicker>
            <h2>Welcome back</h2>
            <p className="text-muted">Use the email and password your admin gave you.</p>
          </div>
          <Field label="Email"><input className="input" name="email" type="email" aria-label="Email" autoComplete="username" required autoFocus /></Field>
          <Field label="Password"><input className="input" name="password" type="password" aria-label="Password" autoComplete="current-password" required /></Field>
          {error && <p className="track-err" role="alert">{error}</p>}
          <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </section>
    </main>
  );
}
