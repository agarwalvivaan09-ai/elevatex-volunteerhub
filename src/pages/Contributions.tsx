import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { summarise, useData } from '../context/DataContext';
import type { Participation } from '../lib/types';
import { fmtDate } from '../lib/format';
import { AttendanceBadge, CreditsBadge, Empty, RequestBadge, TypeBadge } from '../components/ui';

/** Contribution history table: used for "My credits" and on member profiles. */
export function ContributionTable({ parts }: { parts: Participation[] }) {
  const { activityById } = useData();
  const rows = parts
    .map((p) => ({ p, a: activityById.get(p.activityId) }))
    .filter((x) => x.a)
    .sort((x, y) => y.a!.startAt.getTime() - x.a!.startAt.getTime());
  if (rows.length === 0) return <Empty title="Nothing yet">Drives, events and meetings you take part in appear here.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Activity</th><th>Date</th><th>Status</th><th>Attendance</th><th className="num">Credits</th></tr>
        </thead>
        <tbody>
          {rows.map(({ p, a }) => (
            <tr key={p.id}>
              <td>
                <Link to={`/activities/${a!.id}`} style={{ fontWeight: 500, color: 'var(--text)', textDecoration: 'none' }}>{a!.title}</Link>
                <div className="tiny" style={{ marginTop: 2 }}><TypeBadge type={a!.type} />{p.assignment && <span className="muted"> · {p.assignment}</span>}</div>
              </td>
              <td className="small nowrap">{fmtDate(a!.startAt)}</td>
              <td>{a!.type === 'meeting' ? <span className="badge plain">Invited</span> : <RequestBadge status={p.status} />}</td>
              <td>{p.status === 'approved' ? <AttendanceBadge p={p} /> : <span className="muted small">—</span>}</td>
              <td className="num"><CreditsBadge p={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContributionsPage() {
  const { profile } = useMe();
  const { participations, activityById } = useData();
  const mine = participations.filter((p) => p.uid === profile.id);
  const s = summarise(mine, activityById);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My credits</h1>
          <p>You get credits whenever you're marked present at a drive, event or meeting. Your total is attached automatically when you request a certificate.</p>
        </div>
        <Link to="/hr?tab=mycerts" className="btn">Request a certificate</Link>
      </div>
      <div className="stats">
        <div className="card stat"><div className="label">Credits</div><div className="value">{s.credits}</div></div>
        <div className="card stat"><div className="label">Drives &amp; events attended</div><div className="value">{s.attended}</div></div>
        <div className="card stat"><div className="label">Meetings attended</div><div className="value">{s.meetings}</div></div>
        <div className="card stat"><div className="label">Coming up</div><div className="value">{s.upcomingAssignments}</div><div className="hint">{s.waitlisted ? `${s.waitlisted} on a waitlist` : 'signed up'}</div></div>
      </div>
      <section className="card"><ContributionTable parts={mine} /></section>
    </>
  );
}
