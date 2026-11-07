import { LOGO } from '../lib/paths';
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { adminExists, bootstrapChairman } from '../lib/api';
import { Field, Loading, friendlyError } from '../components/ui';
import { useAuthState } from '../context/AuthContext';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="center-page">
      <div className="card card-pad stack">
        <div className="auth-logo">
          <img src={LOGO} alt="ElevateX logo" />
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
            No Chairman exists yet. The first account to complete this step becomes the <b>Chairman</b> with full control.
            This can only happen once.
          </p>
        </div>
        {error && <div className="callout bad">{error}</div>}
        <Field label="Your full name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Email"><input className="input" value={user?.email ?? ''} disabled /></Field>
        <button
          className="btn btn-primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError('');
            try { await bootstrapChairman(name); } catch (e) { setError(friendlyError(e)); setBusy(false); }
          }}
        >
          {busy ? 'Setting up…' : 'Become Chairman and set up'}
        </button>
        <p className="muted small">This also creates the five departments (Finance, Marketing, HR, Project Operations, Drive Execution) and all ElevateX positions.</p>
      </Shell>
    );

  return (
    <Shell>
      <h1>Account not registered</h1>
      <p className="muted">
        You're signed in as <b>{user?.email}</b>, but this account hasn't been added to ElevateX Hub.
        Ask the Chairman or Vice Chairman to add you using this exact email address, then sign in again.
      </p>
      <button className="btn" onClick={() => signOut(auth)}>Sign out</button>
    </Shell>
  );
}

export function RemovedPage() {
  return (
    <Shell>
      <h1>Access removed</h1>
      <p className="muted">Your ElevateX Hub access has been turned off. If you think this is a mistake, contact the Chairman or Vice Chairman.</p>
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
        then restart the dev server. See <b>README.md → Setup</b>.
      </p>
    </Shell>
  );
}
