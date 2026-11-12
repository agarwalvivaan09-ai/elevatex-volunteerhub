import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { summarise, useData } from '../context/DataContext';
import * as api from '../lib/api';
import { fmtDate } from '../lib/format';
import { Avatar, Empty } from '../components/ui';
import { IconChevronLeft } from '../components/icons';
import { ContributionTable } from './Contributions';
import { PersonModal } from './Members';
import { RoleBadge, displayTitle } from '../components/people';
import { normRole } from '../lib/access';
import { IconMail } from '../components/icons';

export function MemberProfilePage() {
  const { id } = useParams();
  const { profile: me, can } = useMe();
  const isCore = can.isCore;
  const { userById, positionById, departmentById, participations, activityById } = useData();
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState<{ phone?: string; emergencyContact?: string } | null>(null);
  const u = id ? userById.get(id) : undefined;
  const canSeeDetails = isCore || id === me.id;

  useEffect(() => {
    if (id && canSeeDetails) api.getPrivateContact(id).then(setContact).catch(() => setContact(null));
  }, [id, canSeeDetails]);

  if (!u) return <Empty title="Member not found"><Link to="/members">Back to members</Link></Empty>;

  const pos = u.positionId ? positionById.get(u.positionId) : undefined;
  const dept = u.departmentId ? departmentById.get(u.departmentId) : undefined;
  const parts = participations.filter((p) => p.uid === u.id);
  const s = summarise(parts, activityById);

  return (
    <>
      <Link to="/members" className="backlink"><IconChevronLeft width={16} />{can.isCore ? 'People' : 'Contacts'}</Link>
      <section className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <Avatar name={u.name} size="lg" />
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1>{u.name}</h1>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="chip">{displayTitle(u, positionById)}</span>
              {dept && <Link to={`/departments/${dept.id}`} className="chip" style={{ textDecoration: 'none' }}>{dept.name}</Link>}
              <RoleBadge role={u.role} />
              {u.status === 'removed' && <span className="badge bad">Access removed</span>}
            </div>
          </div>
          <a className="btn" href={`mailto:${u.email}`}><IconMail />Email</a>
          {can.canManagePeople && normRole(u.role) !== 'chairman' && (can.isChair || normRole(u.role) !== 'vice_chairman') && (can.isPeopleAdmin || u.id !== me.id) && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}
          {u.id === me.id && <Link className="btn" to="/profile">Edit my profile</Link>}
        </div>
        {u.bio && <p className="prose" style={{ marginTop: 14 }}>{u.bio}</p>}
      </section>

      {canSeeDetails && (
        <div className="stats">
          <div className="card stat"><div className="label">Credits</div><div className="value">{s.credits}</div></div>
          <div className="card stat"><div className="label">Drives attended</div><div className="value">{s.attended}</div></div>
          <div className="card stat"><div className="label">Meetings attended</div><div className="value">{s.meetings}</div></div>
          <div className="card stat"><div className="label">Upcoming</div><div className="value">{s.upcomingAssignments}</div></div>
        </div>
      )}

      <div className="layout-main-side">
        <div className="stack">
          {canSeeDetails ? (
            <section className="card">
              <div className="card-head"><h2>Contribution history</h2></div>
              <ContributionTable parts={parts} />
            </section>
          ) : (
            <section className="card card-pad muted small">Contribution details are visible to the member and the Core Team.</section>
          )}
        </div>
        <div className="stack">
          <section className="card card-pad stack">
            <h2>Responsibilities</h2>
            {pos?.responsibilities.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }} className="stack-sm">{pos.responsibilities.map((r) => <li key={r}>{r}</li>)}</ul>
            ) : <p className="muted small">None listed for this position.</p>}
            {u.responsibilities && <p className="small prose">{u.responsibilities}</p>}
          </section>
          <section className="card card-pad">
            <dl className="detail-list">
              <dt>Email</dt><dd style={{ wordBreak: 'break-all' }}>{u.email}</dd>
              {canSeeDetails && contact?.phone && (<><dt>Phone</dt><dd>{contact.phone}</dd></>)}
              {canSeeDetails && contact?.emergencyContact && (<><dt>Emergency</dt><dd>{contact.emergencyContact}</dd></>)}
              <dt>Joined</dt><dd>{fmtDate(u.joinedAt)}</dd>
            </dl>
          </section>
        </div>
      </div>
      {editing && <PersonModal u={u} onClose={() => setEditing(false)} />}
    </>
  );
}
