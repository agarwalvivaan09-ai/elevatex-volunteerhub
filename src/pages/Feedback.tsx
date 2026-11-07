import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { DEPT, normRole } from '../lib/access';
import type { DeptRequest, Feedback, UserProfile } from '../lib/types';
import { fmtDate, fmtNum } from '../lib/format';
import { Avatar, Empty, Field, Modal, useAction } from '../components/ui';
import { IconChat } from '../components/icons';

const CATEGORIES = ['General experience', 'Drives & events', 'My department', 'Leadership & communication', 'Workload', 'Suggestion'];
const FACES = ['', 'Very unhappy', 'Unhappy', 'Okay', 'Happy', 'Very happy'];
type Tab = 'feedback' | 'department' | 'inbox' | 'requests';

/** Who receives HR notifications: the HR department (as far as this person can see), else top leadership. */
function hrRecipients(users: UserProfile[]) {
  const hr = users.filter((u) => u.status === 'active' && u.departmentId === DEPT.hr).map((u) => u.id);
  return hr.length ? hr : users.filter((u) => u.status === 'active' && ['chairman', 'vice_chairman'].includes(normRole(u.role))).map((u) => u.id);
}

export function HrPage() {
  const { can, profile } = useMe();
  const { feedback, deptRequests } = useData();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || (can.canSeeFeedback ? 'inbox' : 'feedback');
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  const pendingReq = deptRequests.filter((r) => r.status === 'pending' && r.uid !== profile.id).length;
  const newFb = feedback.filter((f) => f.status === 'new').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>HR</h1>
          <p>Tell HR how things are going, or ask to move to another department. Only the HR department and leadership can read what you send.</p>
        </div>
        {can.canSeeFeedback && can.isCore && <RequestButton />}
      </div>
      <div className="tabs">
        {can.canSeeFeedback && <button className={tab === 'inbox' ? 'on' : ''} onClick={() => setTab('inbox')}>Feedback inbox{newFb > 0 && <span className="count">{newFb}</span>}</button>}
        {can.canSeeFeedback && <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Department requests{pendingReq > 0 && <span className="count">{pendingReq}</span>}</button>}
        <button className={tab === 'feedback' ? 'on' : ''} onClick={() => setTab('feedback')}>Give feedback</button>
        <button className={tab === 'department' ? 'on' : ''} onClick={() => setTab('department')}>Change department</button>
      </div>
      {tab === 'inbox' && can.canSeeFeedback && <Inbox list={feedback} />}
      {tab === 'requests' && can.canSeeFeedback && <Requests list={deptRequests} />}
      {tab === 'feedback' && <Give mine={feedback.filter((f) => f.authorUid === profile.id)} />}
      {tab === 'department' && <ChangeDept mine={deptRequests.filter((r) => r.uid === profile.id)} />}
    </>
  );
}

function RequestButton() {
  const { users } = useData();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const { busy, run } = useAction();
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Ask everyone for feedback</button>
      {open && (
        <Modal title="Ask everyone for feedback" onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.requestFeedback(users, msg), 'Everyone has been notified')) setOpen(false); }}>Send to all members</button></>}>
          <Field label="Message (optional)"><textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Monthly check-in: how was November for you?" /></Field>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- give feedback
function Give({ mine }: { mine: Feedback[] }) {
  const { profile } = useMe();
  const { users } = useData();
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [message, setMessage] = useState('');
  const { busy, run } = useAction();
  return (
    <div className="layout-main-side">
      <section className="card card-pad stack">
        <Field label="How happy are you at ElevateX right now?">
          <div className="stars" role="group" aria-label="Rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={rating >= n ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} — ${FACES[n]}`}>{n}</button>)}
          </div>
          {rating > 0 && <small>{FACES[rating]}</small>}
        </Field>
        <Field label="About"><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Your feedback"><textarea className="textarea" style={{ minHeight: 120 }} maxLength={3000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What's going well, what isn't, what would you change?" /></Field>
        <button className="btn btn-primary" disabled={busy || !rating || !message.trim()}
          onClick={async () => { if (await run(() => api.submitFeedback({ rating, category, message }, hrRecipients(users), profile.name), 'Thanks — HR has received it')) { setRating(0); setMessage(''); } }}>
          Send to HR
        </button>
      </section>
      <section className="card">
        <div className="card-head"><h2>What you've sent</h2></div>
        {mine.length === 0 ? <Empty title="Nothing sent yet" /> : (
          <ul className="list">
            {mine.map((f) => (
              <li key={f.id}>
                <div className="spread"><b className="small">{f.category}</b><span className={`badge ${f.status === 'reviewed' ? 'ok' : ''}`}>{f.status === 'reviewed' ? 'Read by HR' : 'Sent'}</span></div>
                <p className="small muted">{f.rating}/5 · {fmtDate(f.createdAt)}</p>
                {f.hrNote && <p className="small callout" style={{ marginTop: 6 }}>HR: {f.hrNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- change department
function ChangeDept({ mine }: { mine: DeptRequest[] }) {
  const { profile } = useMe();
  const { users, departments, departmentById } = useData();
  const [toDept, setToDept] = useState('');
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  const pending = mine.find((r) => r.status === 'pending');
  const current = profile.departmentId ? departmentById.get(profile.departmentId)?.name : null;
  return (
    <div className="layout-main-side">
      <section className="card card-pad stack">
        <div><h2>Ask to change department</h2><p className="small muted">You're currently in <b>{current ?? 'no department'}</b>. HR reviews your request and lets you know.</p></div>
        {pending ? (
          <div className="callout info">You already have a request waiting: move to <b>{departmentById.get(pending.toDept)?.name}</b>. You can withdraw it on the right.</div>
        ) : (
          <>
            <Field label="Move me to">
              <select className="select" value={toDept} onChange={(e) => setToDept(e.target.value)}>
                <option value="">Choose a department…</option>
                {departments.filter((d) => d.id !== profile.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}{d.description ? ` — ${d.description}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Why?"><textarea className="textarea" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I'd like to help with filming and Instagram." /></Field>
            <button className="btn btn-primary" disabled={busy || !toDept || !reason.trim()}
              onClick={async () => { if (await run(() => api.requestDeptChange({ userName: profile.name, fromDept: profile.departmentId ?? null, toDept, reason }, hrRecipients(users)), 'Request sent to HR')) { setToDept(''); setReason(''); } }}>
              Send request to HR
            </button>
          </>
        )}
      </section>
      <section className="card">
        <div className="card-head"><h2>Your requests</h2></div>
        {mine.length === 0 ? <Empty title="No requests" /> : (
          <ul className="list">
            {mine.map((r) => (
              <li key={r.id}>
                <div className="spread">
                  <b className="small">→ {departmentById.get(r.toDept)?.name ?? r.toDept}</b>
                  <span className={`badge ${r.status === 'approved' ? 'ok' : r.status === 'declined' ? 'bad' : 'warn'}`}>{r.status === 'pending' ? 'Waiting for HR' : r.status === 'approved' ? 'Approved' : 'Declined'}</span>
                </div>
                <p className="small muted">{fmtDate(r.createdAt)}</p>
                {r.hrNote && <p className="small callout" style={{ marginTop: 6 }}>HR: {r.hrNote}</p>}
                {r.status === 'pending' && <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(() => api.withdrawDeptRequest(r), 'Withdrawn')}>Withdraw</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Requests({ list }: { list: DeptRequest[] }) {
  const { profile, can } = useMe();
  const { departmentById } = useData();
  const [open, setOpen] = useState<DeptRequest | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const shown = list.filter((r) => r.uid !== profile.id && (filter === 'all' || r.status === 'pending'));
  const canDecide = can.isHodOf(DEPT.hr) || can.isTop;
  return (
    <>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>Waiting</button>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
      </div>
      {!canDecide && <div className="callout info" style={{ marginBottom: 14 }}>You can add notes. The Head of HR (or the Chairman, Vice Chairman, CEO or COO) approves.</div>}
      <section className="card">
        {shown.length === 0 ? <Empty title="No department requests" icon={<IconChat />} /> : (
          <ul className="list">
            {shown.map((r) => (
              <li key={r.id}>
                <button className="list-link" style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => setOpen(r)}>
                  <Avatar name={r.userName} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div><b>{r.userName}</b> <span className="small muted">· {departmentById.get(r.fromDept ?? '')?.name ?? 'No department'} → <b>{departmentById.get(r.toDept)?.name}</b></span></div>
                    <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</p>
                  </div>
                  <span className={`badge ${r.status === 'approved' ? 'ok' : r.status === 'declined' ? 'bad' : 'warn'}`}>{r.status === 'pending' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Declined'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && <DecideModal r={open} canDecide={canDecide} onClose={() => setOpen(null)} />}
    </>
  );
}

function DecideModal({ r, canDecide, onClose }: { r: DeptRequest; canDecide: boolean; onClose: () => void }) {
  const { departmentById } = useData();
  const [note, setNote] = useState(r.hrNote ?? '');
  const { busy, run } = useAction();
  const act = (s: 'approved' | 'declined' | 'pending', msg: string) => async () => { if (await run(() => api.decideDeptRequest(r, s, note), msg)) onClose(); };
  return (
    <Modal title={`${r.userName}: change department`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={act('pending', 'Note saved')} disabled={busy}>Save note</button>
        {canDecide && r.status === 'pending' && <button className="btn btn-danger" onClick={act('declined', 'Declined — they have been told')} disabled={busy}>Decline</button>}
        {canDecide && r.status === 'pending' && <button className="btn btn-primary" onClick={act('approved', 'Approved — they have been moved')} disabled={busy}>Approve & move</button>}
      </>}>
      <p><b>{departmentById.get(r.fromDept ?? '')?.name ?? 'No department'}</b> → <b>{departmentById.get(r.toDept)?.name}</b></p>
      <p className="prose">{r.reason}</p>
      <Field label="Note (they see this)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}

// ---------------------------------------------------------------- feedback inbox (HR + leadership)
function Inbox({ list }: { list: Feedback[] }) {
  const { userById } = useData();
  const [open, setOpen] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState<'all' | 'new'>('new');
  const shown = list.filter((f) => filter === 'all' || f.status === 'new');
  const avg = list.length ? list.reduce((s, f) => s + f.rating, 0) / list.length : null;
  const low = list.filter((f) => f.rating <= 2 && f.status === 'new').length;
  const nameOf = (f: Feedback) => userById.get(f.authorUid)?.name ?? f.authorName ?? 'A member';
  return (
    <>
      <div className="stats">
        <div className="card stat"><div className="label">Average happiness</div><div className="value">{avg === null ? '—' : `${fmtNum(avg, 1)}/5`}</div><div className="hint">{list.length} responses</div></div>
        <div className="card stat"><div className="label">Not read yet</div><div className="value">{list.filter((f) => f.status === 'new').length}</div></div>
        <div className="card stat"><div className="label">Unhappy — follow up</div><div className="value">{low}</div></div>
        <div className="card stat"><div className="label">Last 30 days</div><div className="value">{list.filter((f) => f.createdAt && f.createdAt.getTime() > Date.now() - 30 * 86400000).length}</div></div>
      </div>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={filter === 'new' ? 'on' : ''} onClick={() => setFilter('new')}>Not read</button>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
      </div>
      <section className="card">
        {shown.length === 0 ? <Empty title="Nothing new" icon={<IconChat />} /> : (
          <ul className="list">
            {shown.map((f) => (
              <li key={f.id}>
                <button className="list-link" style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => setOpen(f)}>
                  <Avatar name={nameOf(f)} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div><b>{nameOf(f)}</b> <span className="small muted">· {f.category} · {fmtDate(f.createdAt)}</span></div>
                    <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.message}</p>
                  </div>
                  <span className={`badge ${f.rating <= 2 ? 'bad' : f.rating === 3 ? 'warn' : 'ok'}`}>{f.rating}/5</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && <FeedbackModal f={open} name={nameOf(open)} onClose={() => setOpen(null)} />}
    </>
  );
}

function FeedbackModal({ f, name, onClose }: { f: Feedback; name: string; onClose: () => void }) {
  const { userById } = useData();
  const [note, setNote] = useState(f.hrNote ?? '');
  const { busy, run } = useAction();
  const u = userById.get(f.authorUid);
  return (
    <Modal title={`Feedback from ${name}`} onClose={onClose}
      footer={<>{u && <a className="btn" style={{ marginRight: 'auto' }} href={`mailto:${u.email}?subject=${encodeURIComponent('Your ElevateX feedback')}`}>Reply by email</a>}<button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.reviewFeedback(f, note), 'Marked as read')) onClose(); }}>Mark as read</button></>}>
      <div className="row"><span className={`badge ${f.rating <= 2 ? 'bad' : f.rating === 3 ? 'warn' : 'ok'}`}>{f.rating}/5 · {FACES[f.rating]}</span><span className="small muted">{f.category} · {fmtDate(f.createdAt)}</span></div>
      <p className="prose">{f.message}</p>
      {u && <Link to={`/members/${u.id}`} className="small">View their profile →</Link>}
      <Field label="Reply note (they see this)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Thanks — we've spoken to your department head." /></Field>
    </Modal>
  );
}
