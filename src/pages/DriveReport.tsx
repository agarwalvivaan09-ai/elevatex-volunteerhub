import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData, useLive } from '../context/DataContext';
import { fromFirestore } from '../lib/api';
import type { EdpiRecord, Participation } from '../lib/types';
import { TYPE_LABEL } from '../lib/types';
import { fmtNum, fmtRange, fmtRs } from '../lib/format';
import { round2, weakestPillar } from '../lib/edpi';
import { LOGO } from '../lib/paths';
import { Empty } from '../components/ui';
import { IconChevronLeft } from '../components/icons';
import { usePhotos } from './ActivityDetail';

/** One printable page summarising a completed drive: for debriefs, sponsors, schools and the website. */
export function DriveReportPage() {
  const { id } = useParams();
  const { can } = useMe();
  const { activityById, participations, edpi, userById, departmentById } = useData();
  const a = id ? activityById.get(id) : undefined;
  const canManage = a ? can.canManageActivity(a) : false;
  const [ownList] = useLive<Participation>(a && !can.isCore && canManage ? `report-parts:${id}` : null, () => query(collection(db, 'participations'), where('activityId', '==', id)));
  const parts = can.isCore ? participations.filter((p) => p.activityId === id) : ownList;
  const [ownEdpi, setOwnEdpi] = useState<EdpiRecord | undefined>();
  useEffect(() => {
    if (!id || can.isCore || !canManage) return;
    return onSnapshot(doc(db, 'edpi', id), (s) => setOwnEdpi(s.exists() ? fromFirestore<EdpiRecord>(s.id, s.data()) : undefined), () => {});
  }, [id, can.isCore, canManage]);
  const record = can.isCore ? edpi.find((r) => r.id === id) : ownEdpi;
  const [photos] = usePhotos(id);

  if (!a) return <Empty title="Not found" />;
  if (!can.isCore && !canManage) return <Empty title="Only organisers and the core team can open drive reports" />;

  const present = parts.filter((p) => p.attendance === 'present');
  const credits = present.reduce((s, p) => s + p.credits, 0);
  const lead = a.leadUid ? userById.get(a.leadUid)?.name ?? a.leadName : a.createdByName;
  const s = record?.score;
  const res = record?.results;
  const weak = s ? weakestPillar(s) : null;

  return (
    <>
      <div className="no-print spread" style={{ marginBottom: 16 }}>
        <Link to={`/activities/${a.id}`} className="backlink" style={{ margin: 0 }}><IconChevronLeft width={16} />Back to {a.title}</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>Download as PDF</button>
      </div>
      <article className="report card">
        <header className="report-head">
          <img src={LOGO} alt="" />
          <div>
            <div className="small muted">ElevateX · {TYPE_LABEL[a.type]} report{a.departmentId ? ` · ${departmentById.get(a.departmentId)?.name ?? ''}` : ''}</div>
            <h1>{a.title}</h1>
            <div className="small muted">{fmtRange(a.startAt, a.endAt)} · {a.mode === 'online' ? 'Online' : a.venue}{lead ? ` · Organised by ${lead}` : ''}</div>
          </div>
        </header>

        <div className="report-stats">
          <div><b>{present.length + (res?.extraHours?.length ?? 0)}</b><span>volunteers</span></div>
          <div><b>{credits}</b><span>credits given</span></div>
          {res && <div><b>{fmtNum(res.peopleHelped)}</b><span>people helped</span></div>}
          {res && record && <div><b>{fmtNum(res.impactDone)}</b><span>{record.plan.impactUnit} (target {fmtNum(record.plan.impactTarget)})</span></div>}
          {s && <div className="edpi-stat"><b>{round2(s.edpi).toFixed(2)}</b><span>EDPI score</span></div>}
        </div>

        {a.description && <section><h2>About</h2><p className="prose">{a.description}</p></section>}

        {s && record && res && (
          <section>
            <h2>How it went against the plan</h2>
            <table className="table report-table">
              <tbody>
                <tr><td>Money</td><td className="num">{round2(s.moneyScore).toFixed(1)}</td><td className="small muted">Spent {fmtRs(res.spent)} of a {fmtRs(record.plan.budget)} budget · {fmtRs(round2(s.costPerPerson))} per person helped</td></tr>
                <tr><td>Volunteers</td><td className="num">{round2(s.volunteerScore).toFixed(1)}</td><td className="small muted">{s.volunteers} came (planned {record.plan.plannedVolunteers}) · {round2(s.avgHours)} h each on average</td></tr>
                <tr><td>Impact</td><td className="num">{round2(s.impactScore).toFixed(1)}</td><td className="small muted">{fmtNum(res.impactDone)} of {fmtNum(record.plan.impactTarget)} {record.plan.impactUnit}</td></tr>
                {s.partnerBonus > 0 && <tr><td>Partner bonus</td><td className="num">+{s.partnerBonus}</td><td className="small muted">Worked with an outside partner</td></tr>}
              </tbody>
            </table>
            {weak && weak.value < 100 && <p className="small" style={{ marginTop: 10 }}>Area to discuss in the debrief: <b>{weak.label.toLowerCase()}</b>.</p>}
          </section>
        )}
        {!s && (a.type === 'drive' || a.type === 'fundraiser') && <p className="small muted no-print">No EDPI score yet. Add one on the drive's EDPI tab and it will appear here.</p>}

        {photos.length > 0 && (
          <section>
            <h2>Photos</h2>
            <div className="report-photos">{photos.slice(0, 6).map((p) => <img key={p.id} src={p.data} alt="" />)}</div>
          </section>
        )}

        {present.length > 0 && (
          <section>
            <h2>Volunteers</h2>
            <p className="small">{present.map((p) => userById.get(p.uid)?.name ?? p.userName ?? 'Volunteer').sort().join(', ')}</p>
          </section>
        )}
        <footer className="small muted report-foot">ElevateX · elevate-x.in · Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</footer>
      </article>
    </>
  );
}
