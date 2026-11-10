import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { summarise, useData } from '../context/DataContext';
import { canSeeActivity, normRole } from '../lib/access';
import { pollIsOpen } from './Polls';
import { ONBOARDING, onboardingState } from '../lib/onboarding';
import * as api from '../lib/api';
import { useAction } from '../components/ui';
import { fmtShort, relativeDay } from '../lib/format';
import { TASK_LABEL } from '../lib/types';
import { ActivityRow, WhereCard } from '../components/activity';
import { PersonCard, displayTitle } from '../components/people';
import { Avatar, CreditsBadge, Empty, RequestBadge } from '../components/ui';
import { IconCalendar, IconInbox, IconPlus, IconTask, IconVideo } from '../components/icons';

export function DashboardPage() {
  const { profile, can } = useMe();
  const { activities, participations, positionById, departmentById, activityById, tasks, notifications, users, announcements, polls } = useData();
  // Point of contact: your department head(s); otherwise HR head; otherwise the Chairman / Vice Chairman.
  const others = users.filter((u) => u.status === 'active' && u.id !== profile.id);
  const contacts = (() => {
    const heads = others.filter((u) => normRole(u.role) === 'hod' && !!profile.departmentId && u.departmentId === profile.departmentId);
    if (heads.length) return { label: 'Your department head', people: heads };
    const hr = others.filter((u) => normRole(u.role) === 'hod' && u.departmentId === 'hr');
    if (hr.length) return { label: 'Head of HR', people: hr };
    return { label: 'Leadership', people: others.filter((u) => ['chairman', 'vice_chairman'].includes(normRole(u.role))) };
  })();

  const mine = participations.filter((p) => p.uid === profile.id);
  const myByActivity = new Map(mine.map((p) => [p.activityId, p]));
  const volunteering = new Set(mine.filter((p) => p.status === 'approved').map((p) => p.activityId));
  const stats = summarise(mine, activityById);
  const position = profile.positionId ? positionById.get(profile.positionId) : undefined;
  const department = profile.departmentId ? departmentById.get(profile.departmentId) : undefined;

  const now = Date.now();
  const visible = activities.filter((a) => canSeeActivity(a, profile, volunteering));
  const upcoming = visible.filter((a) => a.status === 'upcoming' && (a.endAt ?? a.startAt).getTime() >= now - 3600000);
  const upcomingWork = upcoming.filter((a) => a.type !== 'meeting');
  const meetings = upcoming.filter((a) => a.type === 'meeting');
  const nextMeeting = meetings[0];
  const myTasks = tasks.filter((t) => t.assigneeUid === profile.id && t.status !== 'done');
  const history = mine
    .filter((p) => p.attendance === 'present')
    .map((p) => ({ p, a: activityById.get(p.activityId) }))
    .filter((x) => x.a)
    .sort((x, y) => y.a!.startAt.getTime() - x.a!.startAt.getTime())
    .slice(0, 4);
  const myProposals = activities.filter((a) => a.createdBy === profile.id && (a.status === 'proposed' || a.status === 'declined'));
  const proposalsToReview = can.isCore ? activities.filter((a) => a.status === 'proposed' && can.canApproveDrive(a)).length : 0;
  const unread = notifications.filter((n) => !n.read).slice(0, 4);

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
            <span className="chip">{displayTitle(profile, positionById)}</span>
            {department && <span className="chip">{department.name}</span>}
          </div>
        </div>
        <div className="row">
          {can.canCreateMeeting && <Link to="/activities/new?type=meeting" className="btn" style={{ background: 'rgba(255,255,255,.14)', borderColor: 'transparent', color: '#fff' }}><IconVideo />Meeting</Link>}
          <Link to="/activities/new?type=drive" className="btn" style={{ background: '#fff', borderColor: '#fff', color: 'var(--brand)' }}><IconPlus />{can.canCreateDriveDirectly ? 'New drive' : 'Propose a drive'}</Link>
        </div>
      </section>

      {announcements.filter((x) => x.pinned).slice(0, 2).map((x) => (
        <Link key={x.id} to="/announcements" className="card card-pad pinned-ann" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 14 }}>
          <span className="badge brand">Pinned</span>
          <div style={{ minWidth: 0 }}><b>{x.title}</b><p className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.body}</p></div>
        </Link>
      ))}

      <Onboarding />

      <div className="stats">
        <div className="card stat"><div className="label">Credits</div><div className="value">{stats.credits}</div><div className="hint">From drives, events and meetings</div></div>
        <div className="card stat"><div className="label">Drives attended</div><div className="value">{stats.attended}</div></div>
        <div className="card stat"><div className="label">Meetings attended</div><div className="value">{stats.meetings}</div></div>
        <div className="card stat"><div className="label">Open tasks</div><div className="value">{myTasks.length}</div><div className="hint">{stats.upcomingAssignments} upcoming volunteering</div></div>
      </div>

      {proposalsToReview > 0 && (
        <Link to="/review" className="card card-pad spread" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 20, borderColor: 'var(--warn)' }}>
          <div className="row"><IconInbox width={20} /><b>{proposalsToReview} drive proposal{proposalsToReview === 1 ? '' : 's'} waiting for approval</b></div>
          <span className="btn btn-sm">Review</span>
        </Link>
      )}


      <div className="layout-main-side">
        <div className="stack">
          {nextMeeting && (
            <section className="card card-pad stack">
              <div className="spread"><div><div className="small muted">Next meeting · {relativeDay(nextMeeting.startAt)}</div><h2><Link to={`/activities/${nextMeeting.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{nextMeeting.title}</Link></h2></div><Link to="/meetings" className="btn btn-sm">All meetings</Link></div>
              <WhereCard a={nextMeeting} />
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <div><h2>Upcoming drives & fundraisers</h2><p>Volunteer with one click</p></div>
              <Link to="/activities" className="btn btn-sm">View all</Link>
            </div>
            {upcomingWork.length === 0 ? (
              <Empty title="Nothing scheduled yet" icon={<IconCalendar />}>Anyone can propose a drive.</Empty>
            ) : (
              <ul className="list">
                {upcomingWork.slice(0, 6).map((a) => {
                  const p = myByActivity.get(a.id);
                  return <li key={a.id}><ActivityRow a={a} right={p ? <RequestBadge status={p.status} /> : a.openForRequests ? <span className="badge plain brand">Volunteer</span> : null} /></li>;
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head"><div><h2>Contribution history</h2><p>Drives and events you attended</p></div><Link to="/contributions" className="btn btn-sm">Full history</Link></div>
            {history.length === 0 ? <Empty title="No attended activities yet" /> : (
              <ul className="list">
                {history.map(({ p, a }) => <li key={p.id}><ActivityRow a={a!} right={<CreditsBadge p={p} />} /></li>)}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          {!can.isTop && contacts.people.length > 0 && (
            <section className="stack-sm">
              <div className="spread"><div className="tier">Point of contact · {contacts.label}</div><Link to="/members" className="small">All contacts</Link></div>
              {contacts.people.map((u) => <PersonCard key={u.id} u={u} positionById={positionById} departmentById={departmentById} />)}
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>My tasks</h2><Link to="/tasks" className="btn btn-sm">Open</Link></div>
            {myTasks.length === 0 ? <Empty title="No open tasks" icon={<IconTask />} /> : (
              <ul className="list">
                {myTasks.slice(0, 5).map((t) => {
                  const overdue = t.dueAt && t.dueAt.getTime() < now;
                  return (
                    <li key={t.id}>
                      <Link to="/tasks" className="list-link spread">
                        <div style={{ minWidth: 0 }}><h3>{t.title}</h3><div className="small muted">{TASK_LABEL[t.status]}{t.dueAt ? ` · due ${fmtShort(t.dueAt)}` : ''}</div></div>
                        {overdue && <span className="badge bad">Overdue</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {polls.filter(pollIsOpen).length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Open polls</h2><Link to="/polls" className="btn btn-sm">Vote</Link></div>
              <ul className="list">{polls.filter(pollIsOpen).slice(0, 3).map((p) => <li key={p.id}><Link to="/polls" className="list-link" style={{ display: 'block' }}><h3 style={{ fontSize: 14.5 }}>{p.question}</h3><div className="small muted">{p.options.length} options{p.closesAt ? ` · closes ${fmtShort(p.closesAt)}` : ''}</div></Link></li>)}</ul>
            </section>
          )}

          {meetings.length > 1 && (
            <section className="card">
              <div className="card-head"><h2>Meetings</h2></div>
              <ul className="list">{meetings.slice(1, 5).map((a) => <li key={a.id}><ActivityRow a={a} /></li>)}</ul>
            </section>
          )}

          {unread.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>New for you</h2><Link to="/notifications" className="btn btn-sm">All</Link></div>
              <ul className="list">{unread.map((n) => <li key={n.id}><Link to={n.link ?? '/notifications'} className="list-link" style={{ display: 'block' }}><h3 style={{ fontSize: 14 }}>{n.title}</h3>{n.body && <div className="small muted">{n.body}</div>}</Link></li>)}</ul>
            </section>
          )}

          {myProposals.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>My drive proposals</h2></div>
              <ul className="list">{myProposals.map((a) => <li key={a.id}><Link to={`/activities/${a.id}`} className="list-link spread"><h3>{a.title}</h3><span className={`badge ${a.status === 'declined' ? 'bad' : 'warn'}`}>{a.status === 'declined' ? 'Not approved' : 'Awaiting approval'}</span></Link></li>)}</ul>
            </section>
          )}

          {position && position.responsibilities.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>My responsibilities</h2></div>
              <div className="card-body">
                <ul style={{ margin: 0, paddingLeft: 18 }} className="stack-sm">{position.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
                {profile.responsibilities && <p className="small prose" style={{ marginTop: 10 }}>{profile.responsibilities}</p>}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** New-member checklist; disappears once complete or dismissed. */
function Onboarding() {
  const { profile } = useMe();
  const { participations, activityById } = useData();
  const { busy, run } = useAction();
  const st = onboardingState(profile, participations, activityById);
  if (!st.isNew || st.complete || st.dismissed) return null;
  const tick = (key: string, value: boolean) => run(() => api.setOnboarding({ ...(profile.onboarding ?? {}), [key]: value }));
  return (
    <section className="card" style={{ marginBottom: 20, borderColor: 'var(--brand-2)' }}>
      <div className="card-head">
        <div><h2>Welcome to ElevateX</h2><p>A few things to do in your first weeks · {st.count} of {st.total} done</p></div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => tick('dismissed', true)}>Hide</button>
      </div>
      <ul className="list">
        {ONBOARDING.map((i) => {
          const done = !!st.done[i.key];
          return (
            <li key={i.key} className="spread" style={{ flexWrap: 'nowrap' }}>
              <label className="check" style={{ flex: 1, minWidth: 0, opacity: done ? 0.6 : 1 }}>
                <input type="checkbox" checked={done} disabled={i.auto || busy} onChange={(e) => tick(i.key, e.target.checked)} />
                <span><span style={done ? { textDecoration: 'line-through' } : undefined}>{i.label}</span><span className="tiny muted" style={{ display: 'block' }}>{i.hint}</span></span>
              </label>
              {i.link && !done && (i.link.startsWith('http') ? <a className="btn btn-sm" href={i.link} target="_blank" rel="noopener noreferrer">Open</a> : <Link className="btn btn-sm" to={i.link}>Open</Link>)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
