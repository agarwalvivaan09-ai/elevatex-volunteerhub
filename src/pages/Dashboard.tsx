import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { summarise, useData } from '../context/DataContext';
import { ROLE_LABEL } from '../lib/types';
import { fmtHours, fmtShort } from '../lib/format';
import { ActivityRow } from '../components/activity';
import { Avatar, Empty, HoursBadge, RequestBadge } from '../components/ui';
import { IconCalendar, IconInbox, IconPlus } from '../components/icons';

export function DashboardPage() {
  const { profile, isCore } = useMe();
  const { activities, participations, positionById, departmentById, activityById, users } = useData();

  const mine = participations.filter((p) => p.uid === profile.id);
  const myByActivity = new Map(mine.map((p) => [p.activityId, p]));
  const stats = summarise(mine, activityById);
  const position = profile.positionId ? positionById.get(profile.positionId) : undefined;
  const department = position?.departmentId ? departmentById.get(position.departmentId) : undefined;

  const now = Date.now();
  const upcoming = activities.filter((a) => a.status === 'upcoming' && (a.endAt ?? a.startAt).getTime() >= now - 86400000);
  const assignments = mine
    .filter((p) => p.status === 'approved' && activityById.get(p.activityId)?.status === 'upcoming')
    .map((p) => ({ p, a: activityById.get(p.activityId)! }))
    .sort((x, y) => x.a.startAt.getTime() - y.a.startAt.getTime());
  const openRequests = mine.filter((p) => p.status !== 'approved' && activityById.get(p.activityId)?.status === 'upcoming');
  const needsHours = mine.filter((p) => p.attendance === 'present' && (p.hoursStatus === 'none' || p.hoursStatus === 'rejected'));
  const history = mine
    .filter((p) => p.attendance === 'present')
    .map((p) => ({ p, a: activityById.get(p.activityId) }))
    .filter((x) => x.a)
    .sort((x, y) => y.a!.startAt.getTime() - x.a!.startAt.getTime())
    .slice(0, 5);

  const pendingReview = isCore ? participations.filter((p) => p.status === 'requested').length : 0;
  const pendingHours = isCore ? participations.filter((p) => p.hoursStatus === 'pending').length : 0;
  const activeMembers = users.filter((u) => u.status === 'active').length;

  const firstName = profile.name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <section className="card hero-card">
        <Avatar name={profile.name} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="muted small">{greeting},</p>
          <h1>{firstName}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="chip">{position?.title ?? 'No position assigned yet'}</span>
            {department && <span className="chip">{department.name}</span>}
            <span className="chip">{ROLE_LABEL[profile.role]}</span>
          </div>
        </div>
        {isCore && (
          <Link to="/activities/new" className="btn" style={{ background: '#fff', borderColor: '#fff', color: 'var(--brand)' }}>
            <IconPlus />New activity
          </Link>
        )}
      </section>

      <div className="stats">
        <div className="card stat"><div className="label">Verified hours</div><div className="value">{fmtHours(stats.verifiedHours)}</div><div className="hint">Confirmed after attendance</div></div>
        <div className="card stat"><div className="label">Participation credits</div><div className="value">{stats.credits}</div><div className="hint">From verified activities</div></div>
        <div className="card stat"><div className="label">Activities attended</div><div className="value">{stats.attended}</div><div className="hint">Marked present</div></div>
        <div className="card stat"><div className="label">Upcoming assignments</div><div className="value">{stats.upcomingAssignments}</div><div className="hint">{stats.pendingRequests} request{stats.pendingRequests === 1 ? '' : 's'} pending</div></div>
      </div>

      {isCore && (pendingReview > 0 || pendingHours > 0) && (
        <Link to="/review" className="card card-pad spread" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 20, borderColor: 'var(--warn)' }}>
          <div className="row"><IconInbox width={20} /><b>Needs your review</b></div>
          <div className="row small">
            <span className="badge warn">{pendingReview} participation request{pendingReview === 1 ? '' : 's'}</span>
            <span className="badge warn">{pendingHours} hours to verify</span>
            <span className="muted">· {activeMembers} active members</span>
          </div>
        </Link>
      )}

      {needsHours.length > 0 && (
        <div className="callout warn" style={{ marginBottom: 20 }}>
          <b>Log your hours:</b> you were marked present at{' '}
          {needsHours.map((p, i) => (
            <span key={p.id}>{i > 0 && ', '}<Link to={`/activities/${p.activityId}`}>{activityById.get(p.activityId)?.title}</Link></span>
          ))}
          . Your hours count once a Core Team member verifies them.
        </div>
      )}

      <div className="layout-main-side">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div><h2>Upcoming activities</h2><p>Drives, fundraisers, events and meetings</p></div>
              <Link to="/activities" className="btn btn-sm">View all</Link>
            </div>
            {upcoming.length === 0 ? (
              <Empty title="Nothing scheduled yet" icon={<IconCalendar />}>{isCore ? 'Create the first activity.' : 'New activities will appear here.'}</Empty>
            ) : (
              <ul className="list">
                {upcoming.slice(0, 6).map((a) => {
                  const p = myByActivity.get(a.id);
                  return (
                    <li key={a.id}>
                      <ActivityRow a={a} right={p ? <RequestBadge status={p.status} /> : a.openForRequests ? <span className="badge plain brand">Open</span> : null} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div><h2>Contribution history</h2><p>Activities you attended</p></div>
              <Link to="/contributions" className="btn btn-sm">Full history</Link>
            </div>
            {history.length === 0 ? (
              <Empty title="No attended activities yet">Once you take part and attendance is marked, it shows up here.</Empty>
            ) : (
              <ul className="list">
                {history.map(({ p, a }) => (
                  <li key={p.id}>
                    <ActivityRow a={a!} right={<div className="stack-sm" style={{ alignItems: 'flex-end' }}><HoursBadge p={p} />{p.verifiedHours != null && <span className="small num">{fmtHours(p.verifiedHours)} · {p.credits} cr</span>}</div>} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>My assignments</h2></div>
            {assignments.length === 0 ? (
              <Empty title="No approved assignments">Request to join an activity to get started.</Empty>
            ) : (
              <ul className="list">
                {assignments.map(({ p, a }) => (
                  <li key={p.id}>
                    <Link to={`/activities/${a.id}`} className="list-link" style={{ display: 'block' }}>
                      <h3>{a.title}</h3>
                      <div className="small muted">{fmtShort(a.startAt)}{a.venue ? ` · ${a.venue}` : ''}</div>
                      {p.assignment && <div className="small" style={{ marginTop: 4 }}>Your role: <b>{p.assignment}</b></div>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head"><h2>My requests</h2></div>
            {openRequests.length === 0 ? (
              <Empty title="No open requests" />
            ) : (
              <ul className="list">
                {openRequests.map((p) => {
                  const a = activityById.get(p.activityId)!;
                  return (
                    <li key={p.id}>
                      <Link to={`/activities/${a.id}`} className="list-link spread">
                        <div style={{ minWidth: 0 }}>
                          <h3>{a.title}</h3>
                          <div className="small muted">{fmtShort(a.startAt)}</div>
                        </div>
                        <RequestBadge status={p.status} />
                      </Link>
                      {p.reviewNote && <p className="small muted" style={{ marginTop: 6 }}>“{p.reviewNote}”</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {position && position.responsibilities.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>My responsibilities</h2></div>
              <div className="card-body">
                <ul style={{ margin: 0, paddingLeft: 18 }} className="stack-sm">
                  {position.responsibilities.map((r) => <li key={r}>{r}</li>)}
                </ul>
                {profile.responsibilities && <p className="small prose" style={{ marginTop: 10 }}>{profile.responsibilities}</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
