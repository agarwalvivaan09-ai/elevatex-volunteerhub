import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Participation } from '../lib/types';
import { fmtHours, fmtShort } from '../lib/format';
import { Avatar, Empty, useAction } from '../components/ui';
import { IconInbox } from '../components/icons';
import { ReviewModal } from './ActivityDetail';

/** One queue for everything waiting on the Core Team. */
export function ReviewPage() {
  const { profile } = useMe();
  const { participations, activityById, userById, positionById } = useData();
  const [tab, setTab] = useState<'requests' | 'hours'>('requests');
  const [mineOnly, setMineOnly] = useState(false);
  const [review, setReview] = useState<{ p: Participation; status: 'approved' | 'deferred' | 'rejected' } | null>(null);
  const { busy, run } = useAction();

  const scoped = participations.filter((p) => {
    const a = activityById.get(p.activityId);
    return a && (!mineOnly || a.leadUid === profile.id);
  });
  const requests = scoped.filter((p) => p.status === 'requested').sort((x, y) => activityById.get(x.activityId)!.startAt.getTime() - activityById.get(y.activityId)!.startAt.getTime());
  const hours = scoped.filter((p) => p.hoursStatus === 'pending');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p>Participation requests and logged hours waiting for a Core Team decision.</p>
        </div>
        <label className="check"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />Only activities I lead</label>
      </div>
      <div className="tabs">
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Participation requests<span className="count">{requests.length}</span></button>
        <button className={tab === 'hours' ? 'on' : ''} onClick={() => setTab('hours')}>Hours to verify<span className="count">{hours.length}</span></button>
      </div>

      <section className="card">
        {tab === 'requests' && (requests.length === 0 ? (
          <Empty title="All caught up" icon={<IconInbox />}>No participation requests are waiting.</Empty>
        ) : (
          <ul className="list">
            {requests.map((p) => {
              const a = activityById.get(p.activityId)!;
              const u = userById.get(p.uid);
              const pos = u?.positionId ? positionById.get(u.positionId)?.title : undefined;
              return (
                <li key={p.id} className="spread">
                  <div className="person" style={{ flex: 1, minWidth: 220 }}>
                    <Avatar name={u?.name ?? '?'} />
                    <div style={{ minWidth: 0 }}>
                      <div><Link to={`/members/${p.uid}`}>{u?.name}</Link> <span className="small muted">· {pos ?? 'No position'}</span></div>
                      <div className="small">wants to join <Link to={`/activities/${a.id}`}>{a.title}</Link> <span className="muted">({fmtShort(a.startAt)})</span></div>
                      {p.note && <div className="small muted">“{p.note}”</div>}
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn btn-sm btn-ok" onClick={() => setReview({ p, status: 'approved' })}>Approve</button>
                    <button className="btn btn-sm" onClick={() => setReview({ p, status: 'deferred' })}>Defer</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setReview({ p, status: 'rejected' })}>Decline</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}

        {tab === 'hours' && (hours.length === 0 ? (
          <Empty title="Nothing to verify" icon={<IconInbox />}>Logged hours from members marked present show up here.</Empty>
        ) : (
          <ul className="list">
            {hours.map((p) => {
              const a = activityById.get(p.activityId)!;
              const u = userById.get(p.uid);
              return (
                <li key={p.id} className="spread">
                  <div className="person" style={{ flex: 1, minWidth: 220 }}>
                    <Avatar name={u?.name ?? '?'} />
                    <div>
                      <div><Link to={`/members/${p.uid}`}>{u?.name}</Link> logged <b className="num">{fmtHours(p.hoursLogged ?? 0)}</b></div>
                      <div className="small">at <Link to={`/activities/${a.id}`}>{a.title}</Link> <span className="muted">({fmtShort(a.startAt)}) · attendance: present</span></div>
                      {p.hoursNote && <div className="small muted">“{p.hoursNote}”</div>}
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => run(() => api.verifyHours(p, p.hoursLogged!, a.credits), 'Hours verified')}>Verify {fmtHours(p.hoursLogged ?? 0)}</button>
                    <Link to={`/activities/${a.id}`} className="btn btn-sm">Adjust</Link>
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => api.rejectHours(p), 'Hours sent back')}>Reject</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
      </section>
      {review && <ReviewModal {...review} memberName={userById.get(review.p.uid)?.name ?? ''} onClose={() => setReview(null)} />}
    </>
  );
}
