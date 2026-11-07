import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { summarise, useData } from '../context/DataContext';
import type { Participation } from '../lib/types';
import { fmtDate, fmtHours } from '../lib/format';
import { AttendanceBadge, Empty, HoursBadge, RequestBadge, TypeBadge } from '../components/ui';

/** Contribution history table — used for "My contributions" and on member profiles. */
export function ContributionTable({ parts }: { parts: Participation[] }) {
  const { activityById } = useData();
  const rows = parts
    .map((p) => ({ p, a: activityById.get(p.activityId) }))
    .filter((x) => x.a)
    .sort((x, y) => y.a!.startAt.getTime() - x.a!.startAt.getTime());
  if (rows.length === 0) return <Empty title="No activity yet">Requests, assignments and attended activities appear here.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Activity</th><th>Date</th><th>Request</th><th>Attendance</th><th>Hours</th><th className="num">Verified</th><th className="num">Credits</th></tr>
        </thead>
        <tbody>
          {rows.map(({ p, a }) => (
            <tr key={p.id}>
              <td>
                <Link to={`/activities/${a!.id}`} style={{ fontWeight: 500, color: 'var(--text)', textDecoration: 'none' }}>{a!.title}</Link>
                <div className="tiny" style={{ marginTop: 2 }}><TypeBadge type={a!.type} />{p.assignment && <span className="muted"> · {p.assignment}</span>}</div>
              </td>
              <td className="small nowrap">{fmtDate(a!.startAt)}</td>
              <td><RequestBadge status={p.status} /></td>
              <td>{p.status === 'approved' ? <AttendanceBadge p={p} /> : <span className="muted small">—</span>}</td>
              <td>{p.attendance === 'present' ? <HoursBadge p={p} /> : <span className="muted small">—</span>}</td>
              <td className="num">{p.hoursStatus === 'verified' ? fmtHours(p.verifiedHours ?? 0) : '—'}</td>
              <td className="num">{p.hoursStatus === 'verified' ? p.credits : '—'}</td>
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
  const pendingHours = mine.filter((p) => p.hoursStatus === 'pending').reduce((t, p) => t + (p.hoursLogged ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My contributions</h1>
          <p>Every request, assignment and verified hour. Only verified hours count towards your total.</p>
        </div>
      </div>
      <div className="stats">
        <div className="card stat"><div className="label">Verified hours</div><div className="value">{fmtHours(s.verifiedHours)}</div></div>
        <div className="card stat"><div className="label">Awaiting verification</div><div className="value">{fmtHours(pendingHours)}</div></div>
        <div className="card stat"><div className="label">Credits</div><div className="value">{s.credits}</div></div>
        <div className="card stat"><div className="label">Attended</div><div className="value">{s.attended}</div></div>
      </div>
      <section className="card"><ContributionTable parts={mine} /></section>
    </>
  );
}
