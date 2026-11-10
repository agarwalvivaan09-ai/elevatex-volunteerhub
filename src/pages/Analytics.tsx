import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { weakestPillar } from '../lib/edpi';
import { fmtDate, fmtNum, fmtShort } from '../lib/format';
import { TYPE_LABEL } from '../lib/types';
import { BarChart } from '../components/BarChart';
import { Avatar, Empty } from '../components/ui';
import { IconChart } from '../components/icons';

type Range = '3m' | '12m' | 'all';

export function AnalyticsPage() {
  const { activities, participations, edpi, userById, activityById, users } = useData();
  const [range, setRange] = useState<Range>('12m');

  const since = useMemo(() => {
    if (range === 'all') return 0;
    const d = new Date();
    d.setMonth(d.getMonth() - (range === '3m' ? 3 : 12));
    return d.getTime();
  }, [range]);

  const inRange = (d: Date) => d.getTime() >= since && d.getTime() <= Date.now() + 86400000 * 366;
  const verified = participations.filter((p) => p.attendance === 'present' && activityById.get(p.activityId) && inRange(activityById.get(p.activityId)!.startAt));
  const totalCredits = verified.reduce((s, p) => s + (p.credits ?? 0), 0);
  const volunteersActive = new Set(verified.map((p) => p.uid)).size;
  const completed = activities.filter((a) => a.status === 'completed' && inRange(a.startAt));

  const scored = edpi
    .filter((r) => r.score && activityById.get(r.id) && inRange(activityById.get(r.id)!.startAt))
    .map((r) => ({ r, a: activityById.get(r.id)! }))
    .sort((x, y) => x.a.startAt.getTime() - y.a.startAt.getTime());
  const avgEdpi = scored.length ? scored.reduce((s, x) => s + x.r.score!.edpi, 0) / scored.length : null;
  const peopleHelped = scored.reduce((s, x) => s + (x.r.results?.peopleHelped ?? 0), 0);

  // Credits given, by month of the activity.
  const months = useMemo(() => {
    const m = new Map<string, { label: string; hours: number; t: number }>();
    for (const p of verified) {
      const d = activityById.get(p.activityId)!.startAt;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const e = m.get(key) ?? { label: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), hours: 0, t: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
      e.hours += p.credits ?? 0;
      m.set(key, e);
    }
    return [...m.entries()].sort((a, b) => a[1].t - b[1].t);
  }, [verified, activityById]);

  const leaders = useMemo(() => {
    const m = new Map<string, { hours: number; credits: number; count: number }>();
    for (const p of verified) {
      const e = m.get(p.uid) ?? { hours: 0, credits: 0, count: 0 };
      e.hours += p.credits ?? 0;
      e.credits += p.credits;
      e.count += 1;
      m.set(p.uid, e);
    }
    return [...m.entries()].sort((a, b) => b[1].credits - a[1].credits).slice(0, 8);
  }, [verified]);

  const pendingRequests = activities.filter((a) => a.status === 'proposed').length;
  const activeMembers = users.filter((u) => u.status === 'active').length;

  return (
    <>
      <div className="page-head">
        <div><h1>Analytics</h1><p>Credits, attendance and drive performance (EDPI).</p></div>
        <div className="segmented" role="group" aria-label="Time range">
          {([['3m', 'Last 3 months'], ['12m', 'Last 12 months'], ['all', 'All time']] as [Range, string][]).map(([k, l]) => (
            <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><div className="label">Credits given</div><div className="value">{totalCredits}</div><div className="hint">{volunteersActive} of {activeMembers} members took part</div></div>
        <div className="card stat"><div className="label">Completed activities</div><div className="value">{completed.length}</div><div className="hint">{scored.length} drives scored</div></div>
        <div className="card stat"><div className="label">Average EDPI</div><div className="value">{avgEdpi === null ? '—' : fmtNum(avgEdpi, 1)}</div><div className="hint">100 = did what was planned</div></div>
        <div className="card stat"><div className="label">People helped</div><div className="value">{fmtNum(peopleHelped)}</div><div className="hint">From scored drives</div></div>
      </div>

      {pendingRequests > 0 && (
        <div className="callout warn" style={{ marginBottom: 20 }}>
          <b>{pendingRequests}</b> drive proposal{pendingRequests === 1 ? ' is' : 's are'} waiting for approval. <Link to="/review">Open approvals</Link>.
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <section className="card">
          <div className="card-head"><div><h2>EDPI by drive</h2><p>Dashed line: 100 — the drive did what it planned.</p></div></div>
          <div className="card-body">
            {scored.length === 0
              ? <Empty title="No scored drives yet" icon={<IconChart />}>Lock a plan and enter results on a drive's EDPI tab.</Empty>
              : <BarChart bars={scored.map(({ r, a }) => ({ key: r.id, label: fmtShort(a.startAt), value: r.score!.edpi, tip: `${a.title}: ${r.score!.edpi.toFixed(2)}` }))} reference={100} referenceLabel="Plan = 100" max={115} format={(n) => n.toFixed(1)} />}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><div><h2>Credits by month</h2><p>Given to people marked present at drives, events and meetings.</p></div></div>
          <div className="card-body">
            {months.length === 0
              ? <Empty title="No credits given yet" icon={<IconChart />} />
              : <BarChart bars={months.map(([k, m]) => ({ key: k, label: m.label, value: m.hours, tip: `${m.label}: ${m.hours} credits` }))} format={(n) => String(Math.round(n))} />}
          </div>
        </section>
      </div>

      <div className="layout-main-side">
        <section className="card">
          <div className="card-head"><div><h2>Drive scores</h2><p>Look at the pillar furthest below 100 first.</p></div></div>
          {scored.length === 0 ? <Empty title="Nothing scored in this range" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Drive</th><th className="num">Money</th><th className="num">Volunteers</th><th className="num">Impact</th><th className="num">EDPI</th><th>Focus</th></tr></thead>
                <tbody>
                  {[...scored].reverse().map(({ r, a }) => {
                    const s = r.score!;
                    const w = weakestPillar(s);
                    return (
                      <tr key={r.id}>
                        <td><Link to={`/activities/${a.id}`} style={{ fontWeight: 500, color: 'var(--text)', textDecoration: 'none' }}>{a.title}</Link><div className="tiny muted">{TYPE_LABEL[a.type]} · {fmtDate(a.startAt)}</div></td>
                        <td className="num">{s.moneyScore.toFixed(1)}</td>
                        <td className="num">{s.volunteerScore.toFixed(1)}</td>
                        <td className="num">{s.impactScore.toFixed(1)}</td>
                        <td className="num"><b>{s.edpi.toFixed(2)}</b>{r.flags?.length ? <div><span className="badge warn" title={r.flags.join('\n')}>Flagged</span></div> : null}</td>
                        <td className="small">{w.value < 100 ? w.label : <span className="muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>Top contributors</h2></div>
          {leaders.length === 0 ? <Empty title="No credits given yet" /> : (
            <ul className="list">
              {leaders.map(([uid, e]) => {
                const u = userById.get(uid);
                return (
                  <li key={uid} className="spread">
                    <div className="person"><Avatar name={u?.name ?? '?'} size="sm" /><Link to={`/members/${uid}`}>{u?.name ?? 'Former member'}</Link></div>
                    <div className="small num" style={{ textAlign: 'right' }}><b>{e.credits} credits</b><div className="tiny muted">{e.count} activities</div></div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
