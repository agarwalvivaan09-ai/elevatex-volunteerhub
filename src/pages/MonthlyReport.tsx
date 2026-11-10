import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { TYPE_LABEL } from '../lib/types';
import { fmtDate, fmtNum } from '../lib/format';
import { round2 } from '../lib/edpi';
import { LOGO } from '../lib/paths';

/** A one-page summary of a month, ready to print for board meetings. Core team only. */
export function MonthlyReportPage() {
  const { can } = useMe();
  const { activities, participations, users, edpi, tasks, departments, certRequests, feedback, polls } = useData();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const inMonth = (d?: Date | null) => !!d && d >= from && d < to;
  const label = from.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const r = useMemo(() => {
    const acts = activities.filter((a) => inMonth(a.startAt) && a.status !== 'proposed' && a.status !== 'declined');
    const done = acts.filter((a) => a.status === 'completed' || (a.status === 'upcoming' && a.startAt < now));
    const ids = new Set(acts.map((a) => a.id));
    const present = participations.filter((p) => ids.has(p.activityId) && p.attendance === 'present');
    const credits = present.reduce((s, p) => s + p.credits, 0);
    const activeUids = new Set(present.map((p) => p.uid));
    const members = users.filter((u) => u.status === 'active');
    const joined = users.filter((u) => inMonth(u.joinedAt));
    const scored = edpi.filter((e) => e.score && ids.has(e.id));
    const avgEdpi = scored.length ? scored.reduce((s, e) => s + e.score!.edpi, 0) / scored.length : null;
    const tasksDue = tasks.filter((t) => inMonth(t.dueAt));
    const tasksDone = tasks.filter((t) => inMonth(t.completedAt));
    const proposals = activities.filter((a) => inMonth(a.createdAt) && (a.status === 'proposed' || a.reviewedBy));
    const byType = (['drive', 'fundraiser', 'event', 'meeting'] as const).map((t) => ({ t, n: done.filter((a) => a.type === t).length }));
    const userDept = new Map(users.map((u) => [u.id, u.departmentId ?? null]));
    const byDept = departments.map((d) => {
      const people = members.filter((u) => u.departmentId === d.id);
      const active = people.filter((u) => activeUids.has(u.id)).length;
      return {
        d,
        people: people.length,
        active,
        credits: present.filter((p) => userDept.get(p.uid) === d.id).reduce((s, p) => s + p.credits, 0),
        tasksDone: tasksDone.filter((t) => t.departmentId === d.id).length,
        tasksDue: tasksDue.filter((t) => t.departmentId === d.id).length,
      };
    });
    const certs = certRequests.filter((c) => inMonth(c.createdAt));
    const fb = feedback.filter((f) => inMonth(f.createdAt));
    return { acts, done, present, credits, activeUids, members, joined, scored, avgEdpi, tasksDue, tasksDone, proposals, byType, byDept, certs, fb, pollsRun: polls.filter((p) => inMonth(p.createdAt)).length };
  }, [activities, participations, users, edpi, tasks, departments, certRequests, feedback, polls, month]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!can.isCore) return <Navigate to="/" replace />;
  const pct = r.members.length ? Math.round((r.activeUids.size / r.members.length) * 100) : 0;

  return (
    <>
      <div className="no-print page-head">
        <div><h1>Monthly report</h1><p>Everything that happened in one month, ready to print or save as a PDF for board meetings.</p></div>
        <div className="page-actions">
          <input className="input" type="month" value={month} max={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          <button className="btn btn-primary" onClick={() => window.print()}>Download as PDF</button>
        </div>
      </div>
      <article className="report card">
        <header className="report-head">
          <img src={LOGO} alt="" />
          <div><div className="small muted">ElevateX · Monthly report</div><h1>{label}</h1></div>
        </header>

        <div className="report-stats">
          <div><b>{r.done.filter((a) => a.type !== 'meeting').length}</b><span>drives, fundraisers &amp; events</span></div>
          <div><b>{r.byType.find((x) => x.t === 'meeting')!.n}</b><span>meetings</span></div>
          <div><b>{r.credits}</b><span>credits given</span></div>
          <div><b>{r.activeUids.size}</b><span>members took part ({pct}%)</span></div>
          <div><b>{r.joined.length}</b><span>new members</span></div>
          {r.avgEdpi != null && <div className="edpi-stat"><b>{round2(r.avgEdpi).toFixed(1)}</b><span>average EDPI</span></div>}
        </div>

        <section>
          <h2>Activities</h2>
          {r.done.length === 0 ? <p className="small muted">Nothing took place this month.</p> : (
            <table className="table report-table">
              <thead><tr><th>Date</th><th>Activity</th><th className="num">Present</th><th className="num">EDPI</th></tr></thead>
              <tbody>
                {r.done.sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).map((a) => {
                  const e = r.scored.find((x) => x.id === a.id);
                  return (
                    <tr key={a.id}>
                      <td className="small nowrap">{fmtDate(a.startAt)}</td>
                      <td><Link to={`/activities/${a.id}`} style={{ color: 'inherit' }}>{a.title}</Link> <span className="small muted">· {TYPE_LABEL[a.type]}</span></td>
                      <td className="num">{r.present.filter((p) => p.activityId === a.id).length}</td>
                      <td className="num">{e?.score ? round2(e.score.edpi).toFixed(1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>Departments</h2>
          <table className="table report-table">
            <thead><tr><th>Department</th><th className="num">Members</th><th className="num">Took part</th><th className="num">Credits</th><th className="num">Tasks done</th></tr></thead>
            <tbody>
              {r.byDept.map((x) => (
                <tr key={x.d.id}><td>{x.d.name}</td><td className="num">{x.people}</td><td className="num">{x.active}</td><td className="num">{x.credits}</td><td className="num">{x.tasksDone}{x.tasksDue ? ` / ${x.tasksDue} due` : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Also this month</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            <li>{r.proposals.length} drive proposal{r.proposals.length === 1 ? '' : 's'} from members</li>
            <li>{r.tasksDone.length} task{r.tasksDone.length === 1 ? '' : 's'} completed across all departments</li>
            <li>{r.pollsRun} poll{r.pollsRun === 1 ? '' : 's'} run</li>
            {(can.canSeeFeedback) && <li>{r.certs.length} certificate request{r.certs.length === 1 ? '' : 's'}, {r.certs.filter((c) => c.status === 'issued').length} issued</li>}
            {(can.canSeeFeedback) && r.fb.length > 0 && <li>{r.fb.length} feedback response{r.fb.length === 1 ? '' : 's'}, average happiness {fmtNum(r.fb.reduce((s, f) => s + f.rating, 0) / r.fb.length, 1)}/5</li>}
            {r.joined.length > 0 && <li>New members: {r.joined.map((u) => u.name).join(', ')}</li>}
          </ul>
        </section>
        <footer className="small muted report-foot">ElevateX · elevate-x.in · Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</footer>
      </article>
    </>
  );
}
