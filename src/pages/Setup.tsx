import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { adminExists, bootstrapAdmin } from '../lib/api';
import { Field, Loading, friendlyError } from '../components/ui';
import { useAuthState } from '../context/AuthContext';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="center-page">
      <div className="card card-pad stack">
        <div className="auth-logo">
          <img src="/logo-icon.png" alt="ElevateX logo" />
          <div><b>ElevateX</b><div className="muted small">Volunteer Hub</div></div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Signed in, but there is no profile for this account. */
export function SetupPage() {
  const s = useAuthState();
  const user = s.status === 'noProfile' ? s.user : null;
  const [canClaim, setCanClaim] = useState<boolean | null>(null);
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminExists().then((exists) => setCanClaim(!exists)).catch(() => setCanClaim(false));
  }, []);

  if (canClaim === null) return <Loading />;

  if (canClaim)
    return (
      <Shell>
        <div>
          <h1>Set up ElevateX Hub</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            No admin exists yet. The first account to complete this step becomes the <b>Admin</b> with full control.
            This can only happen once.
          </p>
        </div>
        {error && <div className="callout bad">{error}</div>}
        <Field label="Your full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Admin email"><input className="input" value={user?.email ?? ''} disabled /></Field>
        <button
          className="btn btn-primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError('');
            try { await bootstrapAdmin(name); } catch (e) { setError(friendlyError(e)); setBusy(false); }
          }}
        >
          {busy ? 'Setting up…' : 'Become Admin and set up'}
        </button>
        <p className="muted small">This also creates starter departments and positions (President / CEO, Finance, Operations, Project Head…) that you can edit later.</p>
      </Shell>
    );

  return (
    <Shell>
      <h1>Account not registered</h1>
      <p className="muted">
        You're signed in as <b>{user?.email}</b>, but this account hasn't been added to ElevateX Hub.
        Ask the Admin to add you using this exact email address, then sign in again.
      </p>
      <button className="btn" onClick={() => signOut(auth)}>Sign out</button>
    </Shell>
  );
}

export function RemovedPage() {
  return (
    <Shell>
      <h1>Access removed</h1>
      <p className="muted">Your ElevateX Hub access has been turned off. If you think this is a mistake, contact the Admin.</p>
      <button className="btn" onClick={() => signOut(auth)}>Sign out</button>
    </Shell>
  );
}

export function NotConfiguredPage() {
  return (
    <Shell>
      <h1>Firebase is not connected</h1>
      <p className="muted">
        Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Firebase web-app settings,
        then restart the dev server. See <b>README.md → Setup</b> for step-by-step instructions.
      </p>
    </Shell>
  );
}
