import { LOGO } from '../lib/paths';
import { useState, type FormEvent } from 'react';
import { GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Field, friendlyError, useToast } from '../components/ui';

export function LoginPage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function forgot() {
    if (!email.trim()) return setError('Type your email above first, then click "Forgot password".');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast('If that email has an account, a reset link is on its way.');
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-side">
        <div className="auth-logo">
          <img src={LOGO} alt="" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.25))' }} />
          <b style={{ fontSize: 18 }}>ElevateX</b>
        </div>
        <div>
          <h2>The internal home for every ElevateX volunteer.</h2>
          <p>Drives, fundraisers, events and meetings in one place, with the credits you earn tracked automatically.</p>
          <ul>
            <li>See what's coming up and request to join</li>
            <li>Get approved and see your assignment</li>
            <li>Earn credits every time you're marked present</li>
            <li>Build a verified record of your contribution</li>
          </ul>
        </div>
        <p className="small" style={{ opacity: 0.75 }}>© {new Date().getFullYear()} ElevateX · <a href="https://elevate-x.in" style={{ color: '#fff' }}>elevate-x.in</a></p>
      </section>
      <main className="auth-main">
        <form className="auth-box" onSubmit={submit}>
          <div className="auth-logo">
            <img src={LOGO} alt="ElevateX logo" />
            <div>
              <h1>Sign in</h1>
              <p className="muted small">ElevateX Volunteer Hub</p>
            </div>
          </div>
          {error && <div className="callout bad" role="alert">{error}</div>}
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={forgot}>Forgot password?</button>
          <div className="divider">or</div>
          <button type="button" className="btn btn-block" onClick={google}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>
            Continue with Google
          </button>
          <p className="muted small">
            Accounts are created by the Chairman or Vice Chairman. New members get an email with a link to set their password.
            Google sign-in works if your Gmail address is the one you were registered with.
          </p>
          <a className="small" href="https://elevate-x.in" style={{ textAlign: 'center' }}>← Back to elevate-x.in</a>
        </form>
      </main>
    </div>
  );
}
