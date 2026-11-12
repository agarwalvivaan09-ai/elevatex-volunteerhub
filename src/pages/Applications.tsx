import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Application, ApplicationStatus } from '../lib/types';
import { fmtDateTime } from '../lib/format';
import { Avatar, Empty, Field, Modal, useAction } from '../components/ui';
import { IconInbox, IconMail } from '../components/icons';
import { PersonModal } from './Members';

const STATUS: Record<ApplicationStatus, { label: string; tone: string }> = {
  new: { label: 'New', tone: 'warn' },
  reviewing: { label: 'Reviewing', tone: 'info' },
  interview: { label: 'Interview', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'ok' },
  rejected: { label: 'Not this time', tone: 'bad' },
  added: { label: 'On the Hub', tone: 'brand' },
};
const TABS: [string, string, ApplicationStatus[]][] = [
  ['open', 'To review', ['new', 'reviewing', 'interview']],
  ['accepted', 'Accepted', ['accepted']],
  ['done', 'Done', ['added', 'rejected']],
];

/** Applications submitted on elevate-x.in. HR and the top four review; the top four and the Head of HR add accepted people to the Hub. */
export function ApplicationsPage() {
  const { can } = useMe();
  const { applications } = useData();
  const [tab, setTab] = useState('open');
  const [open, setOpen] = useState<Application | null>(null);
  if (!can.canReviewApplications) return <Navigate to="/" replace />;
  const statuses = TABS.find((t) => t[0] === tab)![2];
  const list = applications.filter((a) => statuses.includes(a.status));
  return (
    <>
      <div className="page-head">
        <div><h1>Applications</h1><p>People who applied on elevate-x.in. HR reviews them; once accepted, the Head of HR or the Chairman, Vice Chairman, CEO or COO adds them to the Hub in one click.</p></div>
      </div>
      <div className="tabs">
        {TABS.map(([k, l, st]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}<span className="count">{applications.filter((a) => st.includes(a.status)).length}</span></button>)}
      </div>
      <section className="card">
        {list.length === 0 ? <Empty title="Nothing here" icon={<IconInbox />}>New applications from the website appear here straight away.</Empty> : (
          <ul className="list">
            {list.map((a) => (
              <li key={a.id}>
                <button className="list-link" style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => setOpen(a)}>
                  <Avatar name={a.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div><b>{a.name}</b> <span className="small muted">· {a.school}{a.grade ? `, ${a.grade}` : ''}</span></div>
                    <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.why}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}><span className={`badge ${STATUS[a.status].tone}`}>{STATUS[a.status].label}</span><div className="tiny muted" style={{ marginTop: 4 }}>{a.createdAt ? fmtDateTime(a.createdAt) : ''}</div></div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && <ApplicationModal a={applications.find((x) => x.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ApplicationModal({ a, onClose }: { a: Application; onClose: () => void }) {
  const { can } = useMe();
  const { departmentById } = useData();
  const [notes, setNotes] = useState(a.hrNotes ?? '');
  const [adding, setAdding] = useState(false);
  const { busy, run } = useAction();
  const set = (status: ApplicationStatus, msg: string) => run(() => api.setApplicationStatus(a, status, notes), msg);
  const depts = a.departments.map((d) => departmentById.get(d)?.name ?? d);

  if (adding)
    return (
      <PersonModal
        prefill={{ name: a.name, email: a.email, departmentId: a.departments[0] ?? null }}
        memberOnly={!can.isPeopleAdmin}
        onAdded={(uid) => api.markApplicationAdded(a, uid)}
        onClose={() => { setAdding(false); onClose(); }}
      />
    );

  return (
    <Modal title={a.name} wide onClose={onClose}
      footer={<>
        <a className="btn" style={{ marginRight: 'auto' }} href={`mailto:${a.email}?subject=${encodeURIComponent('Your application to ElevateX')}`}><IconMail />Email them</a>
        {a.status !== 'added' && a.status !== 'rejected' && <button className="btn btn-danger" disabled={busy} onClick={() => set('rejected', 'Marked as not this time')}>Not this time</button>}
        {(a.status === 'new') && <button className="btn" disabled={busy} onClick={() => set('reviewing', 'Marked as reviewing')}>Reviewing</button>}
        {(a.status === 'new' || a.status === 'reviewing') && <button className="btn" disabled={busy} onClick={() => set('interview', 'Moved to interview')}>Interview</button>}
        {a.status !== 'accepted' && a.status !== 'added' && <button className="btn btn-ok" disabled={busy} onClick={() => set('accepted', can.canAddApplicant ? 'Accepted. You can now add them to the Hub.' : 'Accepted. The Head of HR or leadership will add them to the Hub.')}>Accept</button>}
        {a.status === 'accepted' && can.canAddApplicant && <button className="btn btn-primary" onClick={() => setAdding(true)}>Add to the Hub</button>}
      </>}>
      <div className="row"><span className={`badge ${STATUS[a.status].tone}`}>{STATUS[a.status].label}</span><span className="small muted">Applied {a.createdAt ? fmtDateTime(a.createdAt) : ''}</span></div>
      <dl className="detail-list">
        <dt>Email</dt><dd style={{ wordBreak: 'break-all' }}><a href={`mailto:${a.email}`}>{a.email}</a></dd>
        {a.phone && (<><dt>Phone</dt><dd><a href={`tel:${a.phone}`}>{a.phone}</a></dd></>)}
        <dt>School</dt><dd>{a.school}{a.grade ? `, ${a.grade}` : ''}</dd>
        {a.city && (<><dt>City</dt><dd>{a.city}</dd></>)}
        <dt>Interested in</dt><dd>{depts.length ? depts.join(', ') : 'Not sure yet'}</dd>
        {a.availability && (<><dt>Availability</dt><dd>{a.availability}</dd></>)}
        {a.heard && (<><dt>Heard about us</dt><dd>{a.heard}</dd></>)}
      </dl>
      <div><div className="small muted" style={{ marginBottom: 4 }}>Why they want to join</div><p className="prose">{a.why}</p></div>
      <Field label="HR notes (only HR and the top four see these)"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Interview on Friday, good fit for Marketing." /></Field>
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={busy || notes === (a.hrNotes ?? '')} onClick={() => run(() => api.setApplicationStatus(a, a.status, notes), 'Notes saved')}>Save notes</button>
      {a.status === 'accepted' && !can.canAddApplicant && <div className="callout info">Accepted. The Head of HR or leadership will add them to the Hub, and they'll get an email to set their password.</div>}
    </Modal>
  );
}
