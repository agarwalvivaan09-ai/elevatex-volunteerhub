import { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { auth } from '../lib/firebase';
import { ROLE_LABEL } from '../lib/types';
import { Field, useAction } from '../components/ui';

/** Members can edit only their own personal details. Position and access are managed by the Chairman and Vice Chairman. */
export function ProfilePage() {
  const { profile } = useMe();
  const { positionById, departmentById } = useData();
  const [f, setF] = useState({ name: profile.name, bio: profile.bio ?? '', phone: '', emergencyContact: '' });
  const { busy, run } = useAction();
  const pos = profile.positionId ? positionById.get(profile.positionId) : undefined;
  const dept = pos?.departmentId ? departmentById.get(pos.departmentId) : undefined;

  useEffect(() => {
    api.getPrivateContact(profile.id).then((c) => setF((x) => ({ ...x, phone: c.phone ?? '', emergencyContact: c.emergencyContact ?? '' })));
  }, [profile.id]);

  return (
    <>
      <div className="page-head"><div><h1>My profile</h1><p>Your personal details. Your position and department are set by the Chairman or Vice Chairman.</p></div></div>
      <div className="layout-main-side">
        <section className="card card-pad stack">
          <div className="form-grid">
            <Field label="Full name" className="full"><input className="input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="About me" className="full" hint="Visible to other members on your profile.">
              <textarea className="textarea" maxLength={1000} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="School, interests, skills you can offer…" />
            </Field>
            <Field label="Phone" hint="Only you and the Core Team can see this."><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Emergency contact" hint="Name and number. Only you and the Core Team can see this."><input className="input" value={f.emergencyContact} onChange={(e) => setF({ ...f, emergencyContact: e.target.value })} /></Field>
          </div>
          <div>
            <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={() => run(async () => {
              await api.updateOwnProfile({ name: f.name, bio: f.bio.trim() || null });
              await api.setPrivateContact(profile.id, { phone: f.phone.trim(), emergencyContact: f.emergencyContact.trim() });
            }, 'Profile saved')}>Save changes</button>
          </div>
        </section>
        <div className="stack">
          <section className="card card-pad">
            <dl className="detail-list">
              <dt>Position</dt><dd>{pos?.title ?? 'Not assigned'}</dd>
              {dept && (<><dt>Department</dt><dd>{dept.name}</dd></>)}
              <dt>Access</dt><dd>{ROLE_LABEL[profile.role]}</dd>
              <dt>Email</dt><dd style={{ wordBreak: 'break-all' }}>{profile.email}</dd>
            </dl>
          </section>
          <section className="card card-pad stack">
            <h2>Password</h2>
            <p className="small muted">We'll email you a secure link to set a new password.</p>
            <button className="btn" disabled={busy} onClick={() => run(() => sendPasswordResetEmail(auth, profile.email), 'Check your email for the link')}>Send password reset email</button>
          </section>
        </div>
      </div>
    </>
  );
}
