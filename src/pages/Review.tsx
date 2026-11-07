import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { fmtDateTime, fmtHours, fmtShort } from '../lib/format';
import { Avatar, Empty, useAction } from '../components/ui';
import { IconInbox } from '../components/icons';

/** Everything waiting on the core team: drive proposals and hours to verify. */
export function ReviewPage() {
  const { profile, can } = useMe();
  const { activities, participations, activityById, userById, users } = useData();
  const [tab, setTab] = useState<'proposals' | 'hours'>('proposals');
  const { busy, run } = useAction();

  const proposals = activities.filter((a) => a.status === 'proposed');
  const hours = participations.filter((p) => {
    const a = activityById.get(p.activityId);
    return p.hoursStatus === 'pending' && a && can.canManageActivity(a) && (p.uid !== profile.id || can.isLeadership);
  });

  return (
    <>
      <div className="page-head">
        <div><h1>Approvals</h1><p>Drive proposals from members, and volunteer hours waiting to be verified.</p></div>
      </div>
      <div className="tabs">
        <button className={tab === 'proposals' ? 'on' : ''} onClick={() => setTab('proposals')}>Drive proposals<span className="count">{proposals.length}</span></button>
        <button className={tab === 'hours' ? 'on' : ''} onClick={() => setTab('hours')}>Hours to verify<span className="count">{hours.length}</span></button>
      </div>

      <section className="card">
        {tab === 'proposals' && (proposals.length === 0 ? <Empty title="No proposals waiting" icon={<IconInbox />}>When a member proposes a drive, it appears here and you get a notification.</Empty> : (
          <ul className="list">
            {proposals.map((a) => {
              const by = userById.get(a.createdBy);
              const own = !can.canApproveDrive(a);
              return (
                <li key={a.id} className="spread">
                  <div className="person" style={{ flex: 1, minWidth: 240 }}>
                    <Avatar name={by?.name ?? '?'} />
                    <div style={{ minWidth: 0 }}>
                      <div><Link to={`/activities/${a.id}`}><b>{a.title}</b></Link></div>
                      <div className="small muted">Proposed by {by?.name ?? 'a member'} · {fmtDateTime(a.startAt)} · {a.mode === 'online' ? 'Online' : a.venue}</div>
                      {a.description && <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{a.description}</div>}
                    </div>
                  </div>
                  <div className="row">
                    <Link to={`/activities/${a.id}`} className="btn btn-sm">View details</Link>
                    {own ? <span className="small muted">Your proposal — someone else approves</span> : (
                      <>
                        <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => run(() => api.reviewProposal(a, 'upcoming', '', users), 'Approved — everyone notified')}>Approve</button>
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => api.reviewProposal(a, 'declined', '', users), 'Declined')}>Decline</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ))}

        {tab === 'hours' && (hours.length === 0 ? <Empty title="Nothing to verify" icon={<IconInbox />}>Hours logged by volunteers marked present appear here.</Empty> : (
          <ul className="list">
            {hours.map((p) => {
              const a = activityById.get(p.activityId)!;
              const u = userById.get(p.uid);
              return (
                <li key={p.id} className="spread">
                  <div className="person" style={{ flex: 1, minWidth: 240 }}>
                    <Avatar name={u?.name ?? '?'} />
                    <div>
                      <div><Link to={`/members/${p.uid}`}>{u?.name}</Link> logged <b className="num">{fmtHours(p.hoursLogged ?? 0)}</b></div>
                      <div className="small">at <Link to={`/activities/${a.id}`}>{a.title}</Link> <span className="muted">({fmtShort(a.startAt)})</span></div>
                      {p.hoursNote && <div className="small muted">“{p.hoursNote}”</div>}
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => run(() => api.verifyHours(p, p.hoursLogged!, a.credits), 'Verified')}>Verify {fmtHours(p.hoursLogged ?? 0)}</button>
                    <Link to={`/activities/${a.id}`} className="btn btn-sm">Adjust</Link>
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => api.rejectHours(p), 'Sent back')}>Reject</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
      </section>
    </>
  );
}
