import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type DocumentData, type Query } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useAuthState } from '../context/AuthContext';
import { fromFirestore, requestCertificate, withdrawCertificate } from '../lib/api';
import type { Activity, CertKind, CertRequest, Participation } from '../lib/types';
import { CERT_LABEL, TYPE_LABEL } from '../lib/types';
import { fmtDate } from '../lib/format';
import { LOGO } from '../lib/paths';
import { Empty, Field, ToastProvider, useAction } from '../components/ui';

/** What alumni see: their own credits and history, and certificate requests. Read-only otherwise. */
export function AlumniPage() {
  return <ToastProvider><AlumniHome /></ToastProvider>;
}

function useCol<T>(make: () => Query<DocumentData>, key: string): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => onSnapshot(make(), (s) => setRows(s.docs.map((d) => fromFirestore<T>(d.id, d.data()))), () => setRows([])), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

function AlumniHome() {
  const s = useAuthState();
  const profile = s.status === 'alumni' ? s.profile : null;
  const me = profile?.id ?? '';
  const parts = useCol<Participation>(() => query(collection(db, 'participations'), where('uid', '==', me)), `p:${me}`);
  const activities = useCol<Activity>(() => collection(db, 'activities'), 'acts');
  const certs = useCol<CertRequest>(() => query(collection(db, 'certRequests'), where('uid', '==', me)), `c:${me}`);
  const byId = new Map(activities.map((a) => [a.id, a]));
  const present = parts.filter((p) => p.attendance === 'present' && byId.has(p.activityId)).sort((x, y) => byId.get(y.activityId)!.startAt.getTime() - byId.get(x.activityId)!.startAt.getTime());
  const credits = present.reduce((t, p) => t + (p.credits ?? 0), 0);
  const [kind, setKind] = useState<CertKind>('credits');
  const [actId, setActId] = useState('');
  const [name, setName] = useState(profile?.name ?? '');
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  if (!profile) return null;
  const chosen = present.find((p) => p.activityId === actId);

  return (
    <div className="center-page" style={{ alignItems: 'flex-start' }}>
      <div className="stack" style={{ maxWidth: 760, width: '100%' }}>
        <div className="spread">
          <div className="auth-logo"><img src={LOGO} alt="ElevateX logo" /><div><b>ElevateX</b><div className="muted small">Alumni</div></div></div>
          <button className="btn btn-sm" onClick={() => signOut(auth)}>Sign out</button>
        </div>
        <section className="card card-pad">
          <h1>Hi {profile.name.split(' ')[0]}</h1>
          <p className="muted" style={{ marginTop: 6 }}>You're an ElevateX alumnus. Your record stays here, and you can still ask HR for certificates.</p>
          <div className="stats" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="card stat"><div className="label">Credits</div><div className="value">{credits}</div></div>
            <div className="card stat"><div className="label">Activities attended</div><div className="value">{present.length}</div></div>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Your history</h2></div>
          {present.length === 0 ? <Empty title="No attended activities on record" /> : (
            <ul className="list">{present.map((p) => { const a = byId.get(p.activityId)!; return <li key={p.id} className="spread"><span>{a.title} <span className="small muted">· {TYPE_LABEL[a.type]} · {fmtDate(a.startAt)}</span></span><span className="badge ok">{p.credits} cr</span></li>; })}</ul>
          )}
        </section>
        <section className="card card-pad stack">
          <h2>Request a certificate</h2>
          <Field label="Certificate for">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as CertKind)}>{(Object.keys(CERT_LABEL) as CertKind[]).map((k) => <option key={k} value={k}>{CERT_LABEL[k]}</option>)}</select>
          </Field>
          {kind === 'activity' && (
            <Field label="Which one?">
              <select className="select" value={actId} onChange={(e) => setActId(e.target.value)}><option value="">Choose…</option>{present.map((p) => <option key={p.id} value={p.activityId}>{byId.get(p.activityId)!.title}</option>)}</select>
            </Field>
          )}
          <Field label="Name to print"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Note (optional)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p className="small muted">Your {credits} credits are attached automatically.</p>
          <button className="btn btn-primary" disabled={busy || !name.trim() || (kind === 'activity' && !chosen)}
            onClick={() => run(() => requestCertificate({ userName: profile.name, kind, activityId: chosen?.activityId ?? null, activityTitle: chosen ? byId.get(chosen.activityId)!.title : null, creditsAtRequest: credits, positionTitle: profile.title ?? null, nameOnCertificate: name, note }, []), 'Request sent to HR')}>
            Send request to HR
          </button>
          {certs.length > 0 && (
            <ul className="list" style={{ marginTop: 6 }}>
              {certs.map((c) => (
                <li key={c.id} className="spread">
                  <span className="small">{c.activityTitle ?? CERT_LABEL[c.kind] ?? c.kind}</span>
                  {c.status === 'issued' && c.certificateUrl ? <a className="btn btn-sm btn-primary" href={c.certificateUrl} target="_blank" rel="noopener noreferrer">Open certificate</a>
                    : c.status === 'pending' ? <button className="btn btn-sm" onClick={() => run(() => withdrawCertificate(c), 'Withdrawn')}>Withdraw</button>
                    : <span className="badge bad">Declined</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
