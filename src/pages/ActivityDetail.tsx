import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData, useLive } from '../context/DataContext';
import * as api from '../lib/api';
import { fromFirestore } from '../lib/api';
import type { Activity, ActivityStats, EdpiRecord, Participation, Photo, UserProfile } from '../lib/types';
import { AUDIENCE_LABEL } from '../lib/types';
import { canSeeActivity, meetingInvitees } from '../lib/access';
import { fmtDateTime, fmtRange } from '../lib/format';
import {
  ActivityStatusBadge, AttendanceBadge, Avatar, Confirm, CreditsBadge, Empty, Field, Modal, RequestBadge, TypeBadge, useAction,
} from '../components/ui';
import { WhereCard } from '../components/activity';
import { displayTitle } from '../components/people';
import { IconCalendar, IconCheck, IconChevronLeft, IconClock, IconLead, IconLink, IconMail, IconPin, IconPlus, IconUsers } from '../components/icons';
import { EdpiPanel } from './EdpiPanel';

type Tab = 'overview' | 'volunteers' | 'attendance' | 'photos' | 'edpi';

function calendarLink(a: Activity) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = a.endAt ?? new Date(a.startAt.getTime() + 3600000);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.title,
    dates: `${f(a.startAt)}/${f(end)}`,
    details: [a.description, a.meetingUrl ? `Join: ${a.meetingUrl}` : '', a.mapUrl ? `Map: ${a.mapUrl}` : ''].filter(Boolean).join('\n\n'),
    location: a.mode === 'online' ? a.meetingUrl ?? 'Online' : a.venue,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

/** Live spot counter + waitlist for one activity (readable by every member). */
export function useStats(id: string | undefined) {
  const [stats, setStats] = useState<ActivityStats | null>(null);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, 'activityStats', id), (s) => setStats(s.exists() ? fromFirestore<ActivityStats>(s.id, s.data()) : { id, count: 0, waitlist: [] }), () => setStats(null));
  }, [id]);
  return stats;
}

export function ActivityDetailPage() {
  const { id } = useParams();
  const { profile, can } = useMe();
  const { activityById, participations, userById, departmentById, edpi, users } = useData();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirm, setConfirm] = useState<null | 'delete' | 'cancel' | 'complete' | 'reopen'>(null);
  const { run } = useAction();

  const a = id ? activityById.get(id) : undefined;
  const canManage = a ? can.canManageActivity(a) : false;
  const myPart = participations.find((p) => p.activityId === id && p.uid === profile.id);
  const attended = myPart?.attendance === 'present';
  const stats = useStats(id);

  // Organisers (and attended volunteers) who aren't core team load this activity's list directly.
  const needOwnList = !!a && !can.isCore && (canManage || attended);
  const [ownList] = useLive<Participation>(needOwnList ? `parts:${id}` : null, () => query(collection(db, 'participations'), where('activityId', '==', id)));
  const parts = useMemo(() => (needOwnList ? ownList : participations.filter((p) => p.activityId === id)), [needOwnList, ownList, participations, id]);

  const [ownEdpi, setOwnEdpi] = useState<EdpiRecord | undefined>();
  const isScorable = a?.type === 'drive' || a?.type === 'fundraiser';
  const needOwnEdpi = !!a && isScorable && !can.isCore && (canManage || attended);
  useEffect(() => {
    if (!needOwnEdpi || !id) return;
    return onSnapshot(doc(db, 'edpi', id), (s) => setOwnEdpi(s.exists() ? fromFirestore<EdpiRecord>(s.id, s.data()) : undefined), () => setOwnEdpi(undefined));
  }, [needOwnEdpi, id]);
  const record = can.isCore ? edpi.find((r) => r.id === id) : ownEdpi;

  if (!a) return <Empty title="Activity not found">It may have been deleted. <Link to="/activities">Back</Link></Empty>;
  const myVolunteering = new Set(participations.filter((p) => p.uid === profile.id && p.status === 'approved').map((p) => p.activityId));
  if (!canSeeActivity(a, profile, myVolunteering)) return <Empty title="This meeting isn't for you">It's only visible to the people invited.</Empty>;

  const lead = a.leadUid ? userById.get(a.leadUid) : userById.get(a.createdBy);
  const leadName = lead?.name ?? a.leadName ?? a.createdByName ?? null;
  const volunteers = parts.filter((p) => p.status === 'approved');
  const isMeeting = a.type === 'meeting';
  const showEdpiTab = isScorable && a.status !== 'proposed' && a.status !== 'declined' && (can.isCore || canManage || attended);
  const showPhotos = a.status !== 'proposed' && a.status !== 'declined' && !isMeeting;
  const back = isMeeting ? '/meetings' : '/activities';

  return (
    <>
      <Link to={back} className="backlink"><IconChevronLeft width={16} />{isMeeting ? 'Meetings' : 'Drives & fundraisers'}</Link>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <TypeBadge type={a.type} />
            <ActivityStatusBadge a={a} />
            {isMeeting && <span className="badge plain">{AUDIENCE_LABEL[a.audience]}{a.departmentId && (a.audience === 'department' || a.audience === 'volunteers') ? ` · ${departmentById.get(a.departmentId)?.name ?? ''}` : ''}</span>}
          </div>
          <h1>{a.title}</h1>
          <div className="row small muted" style={{ marginTop: 6, gap: 16 }}>
            <span className="meta-line"><IconClock />{fmtRange(a.startAt, a.endAt)}</span>
            <span className="meta-line"><IconPin />{a.mode === 'online' ? 'Online' : a.venue}</span>
            {leadName && <span className="meta-line"><IconLead />{isMeeting ? 'Host' : 'Organised by'} {leadName}</span>}
          </div>
        </div>
        <div className="page-actions">
          {a.status === 'upcoming' && <a className="btn" href={calendarLink(a)} target="_blank" rel="noopener noreferrer"><IconCalendar />Add to calendar</a>}
          {!isMeeting && (canManage || can.isCore) && a.status === 'completed' && <Link to={`/activities/${a.id}/report`} className="btn">Drive report</Link>}
          {canManage && <Link to={`/activities/${a.id}/edit`} className="btn">Edit</Link>}
          {canManage && a.status === 'upcoming' && <button className="btn btn-ok" onClick={() => setConfirm('complete')}><IconCheck />Mark completed</button>}
          {canManage && (a.status === 'completed' || a.status === 'cancelled') && <button className="btn" onClick={() => setConfirm('reopen')}>Reopen</button>}
          {canManage && a.status === 'upcoming' && <button className="btn btn-danger" onClick={() => setConfirm('cancel')}>Cancel</button>}
          {can.canDeleteActivity(a) && <button className="btn btn-danger" onClick={() => setConfirm('delete')}>Delete</button>}
        </div>
      </div>

      <ProposalBanner a={a} users={users} />

      <div className="tabs" role="tablist">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
        {canManage && !isMeeting && <button className={tab === 'volunteers' ? 'on' : ''} onClick={() => setTab('volunteers')}>Volunteer list<span className="count">{volunteers.length}</span></button>}
        {canManage && <button className={tab === 'attendance' ? 'on' : ''} onClick={() => setTab('attendance')}>Attendance &amp; credits</button>}
        {showPhotos && <button className={tab === 'photos' ? 'on' : ''} onClick={() => setTab('photos')}>Photos</button>}
        {showEdpiTab && <button className={tab === 'edpi' ? 'on' : ''} onClick={() => setTab('edpi')}>EDPI score</button>}
      </div>

      {tab === 'overview' && <Overview a={a} lead={lead} leadName={leadName} stats={stats} myPart={myPart} />}
      {tab === 'volunteers' && canManage && <Volunteers a={a} parts={parts} stats={stats} />}
      {tab === 'attendance' && canManage && (isMeeting ? <MeetingAttendance a={a} parts={parts} /> : <Attendance a={a} parts={volunteers} />)}
      {tab === 'photos' && showPhotos && <Photos a={a} canUpload={can.isCore || canManage || attended} />}
      {tab === 'edpi' && showEdpiTab && <EdpiPanel a={a} parts={parts} record={record} canManage={canManage} />}

      {confirm === 'delete' && (
        <Confirm title="Delete permanently?" danger confirmLabel="Delete"
          message="This deletes it with its volunteer list, attendance, credits and EDPI score. Credits from it disappear from members' totals. To keep the record, cancel instead."
          onClose={() => setConfirm(null)}
          onConfirm={async () => { if (await run(() => api.deleteActivity(a.id), 'Deleted')) navigate(back); }} />
      )}
      {confirm === 'cancel' && (
        <Confirm title="Cancel this?" danger confirmLabel="Cancel it" message="Everyone will see it as cancelled. Records are kept and you can reopen it later."
          onClose={() => setConfirm(null)} onConfirm={() => run(async () => {
            await api.setActivityStatus(a.id, 'cancelled');
            await api.notify(isMeeting ? meetingInvitees(a, users, new Set()).map((u) => u.id) : volunteers.map((p) => p.uid), { kind: 'cancelled', title: `Cancelled: ${a.title}`, body: fmtDateTime(a.startAt), link: `/activities/${a.id}` }).catch(() => {});
          }, 'Cancelled and people notified')} />
      )}
      {confirm === 'complete' && (
        <Confirm title="Mark as completed?" confirmLabel="Mark completed" message="You can still record attendance afterwards. Everyone marked present gets the credits."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'completed'), 'Marked as completed')} />
      )}
      {confirm === 'reopen' && (
        <Confirm title="Reopen?" confirmLabel="Reopen" message="It moves back to Upcoming."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'upcoming'), 'Reopened')} />
      )}
    </>
  );
}

function ProposalBanner({ a, users }: { a: Activity; users: UserProfile[] }) {
  const { profile, can } = useMe();
  const { userById } = useData();
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  if (a.status === 'declined')
    return <div className="callout bad" style={{ marginBottom: 18 }}><b>This drive proposal was not approved.</b>{a.reviewNote && <> “{a.reviewNote}”</>}{a.reviewedBy && <> — {userById.get(a.reviewedBy)?.name}</>}</div>;
  if (a.status !== 'proposed') return null;
  if (!can.canApproveDrive(a))
    return <div className="callout warn" style={{ marginBottom: 18 }}><b>Awaiting approval.</b> {a.createdBy === profile.id ? 'The core team has been notified. You can still edit the details while you wait.' : 'A core team member needs to approve this drive.'}</div>;
  return (
    <section className="card card-pad stack" style={{ marginBottom: 18, borderColor: 'var(--warn)' }}>
      <div><h2>Drive proposal from {userById.get(a.createdBy)?.name ?? a.createdByName ?? 'a member'}</h2><p className="small muted">Approving publishes it and notifies every member so they can volunteer.</p></div>
      <Field label="Note to the organiser (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.reviewProposal(a, 'upcoming', note, users), 'Approved — everyone notified')}><IconCheck />Approve & publish</button>
        <button className="btn btn-danger" disabled={busy} onClick={() => run(() => api.reviewProposal(a, 'declined', note, users), 'Proposal declined')}>Decline</button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ a, lead, leadName, stats, myPart }: { a: Activity; lead?: UserProfile; leadName: string | null; stats: ActivityStats | null; myPart?: Participation }) {
  const volunteerCount = stats?.count ?? 0;
  const { departmentById, activityById } = useData();
  const related = a.relatedActivityId ? activityById.get(a.relatedActivityId) : undefined;
  return (
    <div className="layout-main-side">
      <div className="stack">
        <WhereCard a={a} />
        <section className="card card-pad stack">
          <h2>{a.type === 'meeting' ? 'Agenda' : 'About'}</h2>
          <p className="prose">{a.description || <span className="muted">No description yet.</span>}</p>
        </section>
        {a.instructions && <section className="card card-pad stack"><h2>Instructions</h2><p className="prose">{a.instructions}</p></section>}
        {a.requirements && <section className="card card-pad stack"><h2>Requirements</h2><p className="prose">{a.requirements}</p></section>}
        {a.links.length > 0 && (
          <section className="card card-pad stack">
            <h2>Useful links</h2>
            <div className="stack-sm">{a.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="meta-line"><IconLink />{l.label}</a>)}</div>
          </section>
        )}
      </div>
      <div className="stack">
        {a.type !== 'meeting' && <MyParticipation a={a} p={myPart} stats={stats} />}
        <section className="card card-pad">
          <dl className="detail-list">
            <dt>When</dt><dd>{fmtRange(a.startAt, a.endAt)}</dd>
            <dt>Where</dt><dd>{a.mode === 'online' ? 'Online' : a.venue}</dd>
            <dt>{a.type === 'meeting' ? 'Host' : 'Organiser'}</dt><dd>{lead ? <><Link to={`/members/${lead.id}`}>{lead.name}</Link> · <a href={`mailto:${lead.email}`}>email</a></> : leadName ?? '—'}</dd>
            {a.departmentId && (<><dt>Department</dt><dd>{departmentById.get(a.departmentId)?.name ?? '—'}</dd></>)}
            {related && (<><dt>For</dt><dd><Link to={`/activities/${related.id}`}>{related.title}</Link></dd></>)}
            {a.type !== 'meeting' && (<><dt>Volunteers</dt><dd>{volunteerCount}{a.capacity ? ` of ${a.capacity} spots taken` : ' volunteering'}{stats?.waitlist.length ? ` · ${stats.waitlist.length} waiting` : ''}</dd></>)}
            <dt>Credits</dt><dd>{a.credits} for everyone marked present</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

function MyParticipation({ a, p, stats }: { a: Activity; p?: Participation; stats: ActivityStats | null }) {
  const { profile } = useMe();
  const [note, setNote] = useState('');
  const { busy, run } = useAction();
  const full = a.capacity != null && (stats?.count ?? 0) >= a.capacity;
  const spotsLeft = a.capacity != null ? Math.max(0, a.capacity - (stats?.count ?? 0)) : null;
  const myPlace = stats ? stats.waitlist.indexOf(profile.id) + 1 : 0;

  const body = (() => {
    if (a.status === 'proposed' || a.status === 'declined') return <p className="muted small">Volunteering opens once the drive is approved.</p>;
    if (!p || p.status === 'rejected' || p.status === 'requested' || p.status === 'deferred') {
      if (p?.status === 'rejected') return <><RequestBadge status="rejected" />{p.reviewNote && <p className="small muted">“{p.reviewNote}”</p>}</>;
      if (a.status !== 'upcoming') return <p className="muted small">You didn't volunteer for this.</p>;
      if (!a.openForRequests) return <p className="muted small">Volunteers for this are added by the organiser.</p>;
      return (
        <>
          {spotsLeft != null && <p className="small">{full ? <b>All {a.capacity} spots are taken.</b> : <><b>{spotsLeft}</b> of {a.capacity} spots left.</>}</p>}
          <Field label="Note for the organiser (optional)">
            <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Availability, skills…" />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}
            onClick={() => run(async () => {
              const status = await api.volunteer(a, note, profile.name);
              return status;
            }, full ? "You're on the waitlist. We'll tell you if a spot opens." : "You're on the volunteer list!")}>
            <IconUsers />{full ? 'Join the waitlist' : 'Volunteer'}
          </button>
        </>
      );
    }
    if (p.status === 'waitlisted') {
      return (
        <>
          <div className="callout info"><b>You're on the waitlist</b>{myPlace > 0 && <> (number {myPlace})</>}. If someone drops out, the first person waiting is notified.</div>
          {!full && a.status === 'upcoming' && <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => api.claimSpot(p, a), "You're in!")}>A spot is free: take it</button>}
          <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.withdraw(p, a), 'Removed from the waitlist')}>Leave the waitlist</button>
        </>
      );
    }
    return (
      <>
        <div className="callout"><b>You're volunteering.</b>{p.assignment && <> Your role: <b>{p.assignment}</b>.</>}</div>
        <div className="spread"><span className="small muted">Attendance</span><AttendanceBadge p={p} /></div>
        {p.attendance === 'present' && <div className="callout"><b>{p.credits}</b> credit{p.credits === 1 ? '' : 's'} earned. Thank you!</div>}
        {p.attendance == null && a.status === 'upcoming' && (
          <>
            <p className="small muted">Attendance is taken on the day. Everyone marked present gets {a.credits} credit{a.credits === 1 ? '' : 's'}.</p>
            <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.withdraw(p, a), "You've been taken off the list")}>I can't make it</button>
          </>
        )}
      </>
    );
  })();

  return <section className="card card-pad stack" aria-label="Your participation"><h2>Volunteer</h2>{body}</section>;
}

// ------------------------------------------------------------------ volunteer list (organiser)
function Volunteers({ a, parts, stats }: { a: Activity; parts: Participation[]; stats: ActivityStats | null }) {
  const { can } = useMe();
  const { userById, positionById, departmentById, users } = useData();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Participation | null>(null);
  const [editing, setEditing] = useState<Participation | null>(null);
  const { busy, run } = useAction();
  const approved = parts.filter((p) => p.status === 'approved');
  const waitlist = parts.filter((p) => p.status === 'waitlisted').sort((x, y) => (x.createdAt?.getTime() ?? 0) - (y.createdAt?.getTime() ?? 0));
  const removed = parts.filter((p) => p.status === 'rejected');
  const emails = approved.map((p) => userById.get(p.uid)?.email).filter(Boolean).join(',');
  const spotFree = a.capacity == null || approved.length < a.capacity;
  const nameOf = (p: Participation) => userById.get(p.uid)?.name ?? p.userName ?? 'Volunteer';

  // Keep the shared counter honest if it ever drifts from the real list.
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current || !stats) return;
    if (stats.count !== approved.length || stats.waitlist.length !== waitlist.length) {
      synced.current = true;
      api.syncStats(a, parts).catch(() => {});
    }
  }, [stats, approved.length, waitlist.length, a, parts]);

  const row = (p: Participation, kind: 'approved' | 'waitlisted' | 'removed', i?: number) => {
    const u = userById.get(p.uid);
    const dept = u?.departmentId ? departmentById.get(u.departmentId)?.name : undefined;
    return (
      <tr key={p.id} style={kind === 'removed' ? { opacity: 0.55 } : undefined}>
        <td>
          <div className="person">
            <Avatar name={nameOf(p)} size="sm" />
            <div>{u ? <Link to={`/members/${p.uid}`}>{u.name}</Link> : <b>{nameOf(p)}</b>}<div className="tiny muted">{u ? displayTitle(u, positionById) : ''}{dept ? ` · ${dept}` : ''}</div></div>
          </div>
        </td>
        <td className="small">{kind === 'waitlisted' ? <span className="badge info">Waiting #{(i ?? 0) + 1}</span> : p.assignment ?? <span className="muted">—</span>}</td>
        <td className="small" style={{ maxWidth: 240 }}>{p.note ?? <span className="muted">—</span>}</td>
        <td className="num">
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            {u && <a className="btn btn-sm" href={`mailto:${u.email}`} aria-label={`Email ${u.name}`}><IconMail /></a>}
            {kind === 'approved' && (<><button className="btn btn-sm" onClick={() => setEditing(p)}>Set role</button><button className="btn btn-sm btn-danger" onClick={() => setRemoving(p)}>Remove</button></>)}
            {kind === 'waitlisted' && <button className="btn btn-sm btn-ok" disabled={busy} onClick={() => run(() => api.approveVolunteer(p, a, parts), `${nameOf(p)} moved up and told`)}>{spotFree ? 'Move up' : 'Move up anyway'}</button>}
            {kind === 'removed' && <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.approveVolunteer(p, a, parts), 'Added back')}>Add back</button>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <section className="card">
      <div className="card-head">
        <div><h2>Volunteer list</h2><p>{approved.length} volunteering{a.capacity ? ` of ${a.capacity} spots` : ''}{waitlist.length ? ` · ${waitlist.length} on the waitlist` : ''}.</p></div>
        <div className="row">
          {emails && <a className="btn btn-sm" href={`mailto:?bcc=${emails}&subject=${encodeURIComponent(a.title)}`}><IconMail />Email all</a>}
          {can.isCore && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><IconPlus />Add volunteer</button>}
        </div>
      </div>
      {parts.length === 0 ? (
        <Empty title="No volunteers yet" icon={<IconUsers />}>Members volunteer from this page and you'll be notified.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Volunteer</th><th>Role / place</th><th>Note</th><th className="num">Actions</th></tr></thead>
            <tbody>
              {approved.map((p) => row(p, 'approved'))}
              {waitlist.map((p, i) => row(p, 'waitlisted', i))}
              {removed.map((p) => row(p, 'removed'))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddVolunteerModal a={a} parts={parts} users={users} onClose={() => setAdding(false)} />}
      {editing && <RoleModal p={editing} name={nameOf(editing)} onClose={() => setEditing(null)} />}
      {removing && <RemoveModal p={removing} a={a} parts={parts} name={nameOf(removing)} onClose={() => setRemoving(null)} />}
    </section>
  );
}

function RoleModal({ p, name, onClose }: { p: Participation; name: string; onClose: () => void }) {
  const [v, setV] = useState(p.assignment ?? '');
  const { busy, run } = useAction();
  return (
    <Modal title={`Role for ${name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.setAssignment(p, v), 'Saved')) onClose(); }}>Save</button></>}>
      <Field label="Role on the day" hint="e.g. Registration desk, Distribution team, Photography"><input className="input" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
    </Modal>
  );
}

function RemoveModal({ p, a, parts, name, onClose }: { p: Participation; a: Activity; parts: Participation[]; name: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal title={`Remove ${name}?`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={async () => { if (await run(() => api.removeVolunteer(p, a, reason, parts), 'Removed')) onClose(); }}>Remove</button></>}>
      <Field label="Reason (shown to them, optional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {p.credits > 0 && <div className="callout warn">This also takes away their {p.credits} credit{p.credits === 1 ? '' : 's'} for this activity.</div>}
    </Modal>
  );
}

function AddVolunteerModal({ a, parts, users, onClose }: { a: Activity; parts: Participation[]; users: UserProfile[]; onClose: () => void }) {
  const [uid, setUid] = useState('');
  const [assignment, setAssignment] = useState('');
  const { busy, run } = useAction();
  const existing = new Set(parts.map((p) => p.uid));
  const options = users.filter((u) => u.status === 'active' && !existing.has(u.id));
  return (
    <Modal title={`Add to ${a.title}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !uid} onClick={async () => { if (await run(() => api.addVolunteer(a, users.find((x) => x.id === uid)!, assignment, parts), 'Added and notified')) onClose(); }}>Add</button></>}>
      <Field label="Member">
        <select className="select" value={uid} onChange={(e) => setUid(e.target.value)}>
          <option value="">Choose a member…</option>
          {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Role on the day (optional)"><input className="input" value={assignment} onChange={(e) => setAssignment(e.target.value)} /></Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ attendance & credits
function Attendance({ a, parts }: { a: Activity; parts: Participation[] }) {
  const { userById } = useData();
  const { busy, run } = useAction();
  const unmarked = parts.filter((p) => p.attendance == null);
  const started = a.startAt.getTime() <= Date.now();
  return (
    <div className="stack">
      <div className="callout">Mark who came. Everyone marked <b>present</b> gets <b>{a.credits}</b> credit{a.credits === 1 ? '' : 's'} straight away. You can change one person's credits if needed. Nobody can mark or credit themselves, except leadership.</div>
      {!started && <div className="callout warn">This hasn't started yet ({fmtDateTime(a.startAt)}). Take attendance on the day.</div>}
      <section className="card">
        <div className="card-head">
          <div><h2>Attendance</h2><p>{parts.filter((p) => p.attendance === 'present').length} present · {parts.reduce((s, p) => s + (p.attendance === 'present' ? p.credits : 0), 0)} credits given</p></div>
          {unmarked.length > 0 && (
            <button className="btn btn-sm" disabled={busy} onClick={() => run(async () => { for (const p of unmarked) await api.setAttendance(p, a, 'present'); }, 'Everyone marked present')}>Mark remaining {unmarked.length} present</button>
          )}
        </div>
        {parts.length === 0 ? <Empty title="No volunteers yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Volunteer</th><th>Attendance</th><th className="num">Credits</th></tr></thead>
              <tbody>{parts.map((p) => <AttendanceRow key={p.id} a={a} p={p} name={userById.get(p.uid)?.name ?? p.userName ?? 'Volunteer'} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AttendanceRow({ a, p, name }: { a: Activity; p: Participation; name: string }) {
  const { profile, can } = useMe();
  const { busy, run } = useAction();
  const [credits, setCreditsVal] = useState(String(p.credits));
  useEffect(() => setCreditsVal(String(p.credits)), [p.credits]);
  const self = p.uid === profile.id && !can.isLeadership;
  const c = Number(credits);
  return (
    <tr>
      <td><div className="person"><Avatar name={name} size="sm" /><Link to={`/members/${p.uid}`}>{name}</Link></div>{p.assignment && <div className="tiny muted" style={{ marginLeft: 38 }}>{p.assignment}</div>}</td>
      <td>
        {self ? <span className="small muted">Someone else marks yours</span> : (
          <div className="segmented" role="group" aria-label={`Attendance for ${name}`}>
            <button className={p.attendance === 'present' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.setAttendance(p, a, 'present'))}>Present</button>
            <button className={p.attendance === 'absent' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.setAttendance(p, a, 'absent'))}>Absent</button>
          </div>
        )}
      </td>
      <td className="num">
        {p.attendance === 'present' && !self ? (
          <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <input className="input" style={{ width: 70 }} type="number" min={0} max={20} step={1} value={credits} onChange={(e) => setCreditsVal(e.target.value)} aria-label={`Credits for ${name}`} />
            {c !== p.credits && <button className="btn btn-sm btn-ok" disabled={busy || !(c >= 0 && c <= 20)} onClick={() => run(() => api.setCredits(p, a, c), 'Credits updated')}>Save</button>}
          </div>
        ) : <CreditsBadge p={p} />}
      </td>
    </tr>
  );
}

/** Meetings: the host marks invitees present; present people get the meeting's credits. */
function MeetingAttendance({ a, parts }: { a: Activity; parts: Participation[] }) {
  const { users, participations } = useData();
  const { profile, can } = useMe();
  const { busy, run } = useAction();
  const relatedVolunteers = new Set(participations.filter((p) => p.activityId === a.relatedActivityId && p.status === 'approved').map((p) => p.uid));
  const invitees = meetingInvitees(a, users, relatedVolunteers);
  const byUid = new Map(parts.map((p) => [p.uid, p]));
  const people = [...invitees, ...users.filter((u) => byUid.has(u.id) && !invitees.includes(u))].sort((x, y) => x.name.localeCompare(y.name));
  const present = parts.filter((p) => p.attendance === 'present').length;
  return (
    <div className="stack">
      <div className="callout">Tick who attended. Everyone marked <b>present</b> gets <b>{a.credits}</b> credit{a.credits === 1 ? '' : 's'}.</div>
      <section className="card">
        <div className="card-head"><div><h2>Meeting attendance</h2><p>{present} of {people.length} invited were present</p></div></div>
        {people.length === 0 ? <Empty title="No one invited" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Invited</th><th>Attendance</th><th className="num">Credits</th></tr></thead>
              <tbody>
                {people.map((u) => {
                  const p = byUid.get(u.id);
                  const self = u.id === profile.id && !can.isLeadership;
                  return (
                    <tr key={u.id}>
                      <td><div className="person"><Avatar name={u.name} size="sm" />{u.name}</div></td>
                      <td>{self ? <span className="small muted">Someone else marks yours</span> : (
                        <div className="segmented" role="group" aria-label={`Attendance for ${u.name}`}>
                          <button className={p?.attendance === 'present' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.markMeetingAttendance(a, u, p, 'present'))}>Present</button>
                          <button className={p?.attendance === 'absent' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.markMeetingAttendance(a, u, p, 'absent'))}>Absent</button>
                        </div>
                      )}</td>
                      <td className="num">{p ? <CreditsBadge p={p} /> : <span className="badge">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ photos
/** Shrinks a photo in the browser so it fits in the database (no paid storage needed). */
async function compress(file: File): Promise<{ data: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  let w = bmp.width, h = bmp.height;
  const max = 1280;
  if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  let q = 0.75;
  let data = canvas.toDataURL('image/jpeg', q);
  while (data.length > 900000 && q > 0.35) { q -= 0.1; data = canvas.toDataURL('image/jpeg', q); }
  if (data.length > 900000) throw new Error('That photo is too large even after shrinking. Try a smaller one.');
  return { data, w, h };
}

export function usePhotos(activityId: string | undefined) {
  return useLive<Photo>(activityId ? `photos:${activityId}` : null, () => query(collection(db, 'photos'), where('activityId', '==', activityId)), (x, y) => (x.createdAt?.getTime() ?? 0) - (y.createdAt?.getTime() ?? 0));
}

function Photos({ a, canUpload }: { a: Activity; canUpload: boolean }) {
  const { profile, can } = useMe();
  const [photos] = usePhotos(a.id);
  const [open, setOpen] = useState<Photo | null>(null);
  const { busy, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    run(async () => {
      for (const f of [...files].slice(0, 10)) {
        const img = await compress(f);
        await api.addPhoto(a.id, img, profile.name);
      }
    }, files.length === 1 ? 'Photo added' : `${Math.min(files.length, 10)} photos added`);
  };
  return (
    <section className="card">
      <div className="card-head">
        <div><h2>Photos</h2><p>{photos.length} photo{photos.length === 1 ? '' : 's'}{canUpload ? '. Volunteers who were there can add theirs.' : ''}</p></div>
        {canUpload && (
          <>
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => input.current?.click()}><IconPlus />{busy ? 'Uploading…' : 'Add photos'}</button>
          </>
        )}
      </div>
      {photos.length === 0 ? <Empty title="No photos yet">{canUpload ? 'Add the first one.' : 'Photos appear here once volunteers add them.'}</Empty> : (
        <div className="card-body photo-grid">
          {photos.map((p) => (
            <button key={p.id} className="photo" onClick={() => setOpen(p)} aria-label={`Photo by ${p.uploaderName}`}><img src={p.data} alt={p.caption ?? `Photo from ${a.title}`} loading="lazy" /></button>
          ))}
        </div>
      )}
      {open && (
        <Modal title={`Photo by ${open.uploaderName}`} onClose={() => setOpen(null)} wide
          footer={<>{(open.uid === profile.id || can.isCore || can.canManageActivity(a)) && <button className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={async () => { if (await run(() => api.deletePhoto(open), 'Photo deleted')) setOpen(null); }}>Delete</button>}<a className="btn" href={open.data} download={`${a.title}.jpg`}>Download</a><button className="btn" onClick={() => setOpen(null)}>Close</button></>}>
          <img src={open.data} alt={open.caption ?? ''} style={{ width: '100%', borderRadius: 10 }} />
        </Modal>
      )}
    </section>
  );
}
