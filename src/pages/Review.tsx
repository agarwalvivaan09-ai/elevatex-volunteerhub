import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Avatar, Empty, useAction } from '../components/ui';
import { IconInbox } from '../components/icons';

/** Drive proposals waiting for the core team. */
export function ReviewPage() {
  const { can } = useMe();
  const { activities, userById, users } = useData();

  const { busy, run } = useAction();

  const proposals = activities.filter((a) => a.status === 'proposed');

  return (
    <>
      <div className="page-head">
        <div><h1>Approvals</h1><p>Drive proposals from members, waiting for someone on the core team.</p></div>
      </div>
      <section className="card">
        {(proposals.length === 0 ? <Empty title="No proposals waiting" icon={<IconInbox />}>When a member proposes a drive, it appears here and you get a notification.</Empty> : (
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
                      <div className="small muted">Proposed by {by?.name ?? a.createdByName ?? 'a member'} · {fmtDateTime(a.startAt)} · {a.mode === 'online' ? 'Online' : a.venue}</div>
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

      </section>
    </>
  );
}
