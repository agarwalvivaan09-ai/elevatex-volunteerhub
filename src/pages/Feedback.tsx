import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { DEPT } from '../lib/access';
import type { Feedback } from '../lib/types';
import { fmtDate, fmtNum } from '../lib/format';
import { Avatar, Empty, Field, Modal, useAction } from '../components/ui';
import { IconChat } from '../components/icons';

const CATEGORIES = ['General experience', 'Drives & events', 'My department', 'Leadership & communication', 'Workload', 'Suggestion'];
const FACES = ['', 'Very unhappy', 'Unhappy', 'Okay', 'Happy', 'Very happy'];

export function FeedbackPage() {
  const { profile, can } = useMe();
  const { feedback, users } = useData();
  const [tab, setTab] = useState<'give' | 'review'>(can.canSeeFeedback ? 'review' : 'give');
  const mine = feedback.filter((f) => f.authorUid === profile.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{can.canSeeFeedback ? 'Member feedback' : 'Feedback to HR'}</h1>
          <p>{can.canSeeFeedback ? 'How members feel about ElevateX. Only HR and leadership can see this.' : 'Tell HR how things are going. Only the HR department and leadership can read it.'}</p>
        </div>
        {can.canSeeFeedback && <RequestButton users={users} />}
      </div>
      {can.canSeeFeedback && (
        <div className="tabs">
          <button className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>All feedback<span className="count">{feedback.length}</span></button>
          <button className={tab === 'give' ? 'on' : ''} onClick={() => setTab('give')}>Give feedback</button>
        </div>
      )}
      {tab === 'review' && can.canSeeFeedback ? <Review list={feedback} /> : <Give mine={mine} />}
    </>
  );
}

function RequestButton({ users }: { users: ReturnType<typeof useData>['users'] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const { busy, run } = useAction();
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Request feedback from everyone</button>
      {open && (
        <Modal title="Request feedback" onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.requestFeedback(users, msg), 'Everyone has been notified')) setOpen(false); }}>Send to all members</button></>}>
          <Field label="Message (optional)"><textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Monthly check-in: how was November for you?" /></Field>
        </Modal>
      )}
    </>
  );
}

function Give({ mine }: { mine: Feedback[] }) {
  const { users } = useData();
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [message, setMessage] = useState('');
  const { busy, run } = useAction();
  const hrUids = users.filter((u) => u.status === 'active' && u.departmentId === DEPT.hr).map((u) => u.id);

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
        <div>
          <button className="btn btn-primary" disabled={busy || !rating || !message.trim()}
            onClick={async () => { if (await run(() => api.submitFeedback({ rating, category, message }, hrUids), 'Thanks — HR has received your feedback')) { setRating(0); setMessage(''); } }}>
            Send to HR
          </button>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Your past feedback</h2></div>
        {mine.length === 0 ? <Empty title="Nothing sent yet" /> : (
          <ul className="list">
            {mine.map((f) => (
              <li key={f.id}>
                <div className="spread"><b className="small">{f.category}</b><span className={`badge ${f.status === 'reviewed' ? 'ok' : ''}`}>{f.status === 'reviewed' ? 'Reviewed by HR' : 'Sent'}</span></div>
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

function Review({ list }: { list: Feedback[] }) {
  const { userById } = useData();
  const [open, setOpen] = useState<Feedback | null>(null);
  const [filter, setFilter] = useState<'all' | 'new'>('new');
  const shown = list.filter((f) => filter === 'all' || f.status === 'new');
  const avg = list.length ? list.reduce((s, f) => s + f.rating, 0) / list.length : null;
  const last30 = list.filter((f) => f.createdAt && f.createdAt.getTime() > Date.now() - 30 * 86400000);
  const low = list.filter((f) => f.rating <= 2 && f.status === 'new').length;

  return (
    <>
      <div className="stats">
        <div className="card stat"><div className="label">Average satisfaction</div><div className="value">{avg === null ? '—' : `${fmtNum(avg, 1)} / 5`}</div><div className="hint">{list.length} responses</div></div>
        <div className="card stat"><div className="label">Last 30 days</div><div className="value">{last30.length}</div><div className="hint">responses</div></div>
        <div className="card stat"><div className="label">Waiting for review</div><div className="value">{list.filter((f) => f.status === 'new').length}</div></div>
        <div className="card stat"><div className="label">Unhappy (1–2) to follow up</div><div className="value">{low}</div></div>
      </div>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={filter === 'new' ? 'on' : ''} onClick={() => setFilter('new')}>Needs review</button>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
      </div>
      <section className="card">
        {shown.length === 0 ? <Empty title="Nothing to review" icon={<IconChat />} /> : (
          <ul className="list">
            {shown.map((f) => {
              const u = userById.get(f.authorUid);
              return (
                <li key={f.id}>
                  <button className="list-link" style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => setOpen(f)}>
                    <Avatar name={u?.name ?? '?'} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div><b>{u?.name ?? 'Former member'}</b> <span className="small muted">· {f.category} · {fmtDate(f.createdAt)}</span></div>
                      <p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.message}</p>
                    </div>
                    <span className={`badge ${f.rating <= 2 ? 'bad' : f.rating === 3 ? 'warn' : 'ok'}`}>{f.rating}/5</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {open && <ReviewModal f={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReviewModal({ f, onClose }: { f: Feedback; onClose: () => void }) {
  const { userById } = useData();
  const [note, setNote] = useState(f.hrNote ?? '');
  const { busy, run } = useAction();
  const u = userById.get(f.authorUid);
  return (
    <Modal title={`Feedback from ${u?.name ?? 'a member'}`} onClose={onClose}
      footer={<>{u && <a className="btn" style={{ marginRight: 'auto' }} href={`mailto:${u.email}?subject=${encodeURIComponent('Your ElevateX feedback')}`}>Reply by email</a>}<button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.reviewFeedback(f, note), 'Marked as reviewed')) onClose(); }}>Mark reviewed</button></>}>
      <div className="row"><span className={`badge ${f.rating <= 2 ? 'bad' : f.rating === 3 ? 'warn' : 'ok'}`}>{f.rating}/5 · {FACES[f.rating]}</span><span className="small muted">{f.category} · {fmtDate(f.createdAt)}</span></div>
      <p className="prose">{f.message}</p>
      {u && <Link to={`/members/${u.id}`} className="small">View {u.name.split(' ')[0]}'s profile and activity →</Link>}
      <Field label="HR note (the member sees this)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Thanks — we've spoken to your department head about the workload." /></Field>
    </Modal>
  );
}
