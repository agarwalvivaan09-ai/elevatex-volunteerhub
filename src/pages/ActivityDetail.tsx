import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useMe } from '../context/AuthContext';
import { useData, useLive } from '../context/DataContext';
import * as api from '../lib/api';
import { fromFirestore } from '../lib/api';
import type { Activity, EdpiRecord, Participation, UserProfile } from '../lib/types';
import { AUDIENCE_LABEL } from '../lib/types';
import { canSeeActivity, meetingInvitees } from '../lib/access';
import { fmtDateTime, fmtHours, fmtRange } from '../lib/format';
import {
  ActivityStatusBadge, AttendanceBadge, Avatar, Confirm, Empty, Field, HoursBadge, Modal, RequestBadge, TypeBadge, useAction,
} from '../components/ui';
import { WhereCard } from '../components/activity';
import { displayTitle } from '../components/people';
import { IconCalendar, IconCheck, IconChevronLeft, IconClock, IconLead, IconLink, IconMail, IconPin, IconPlus, IconUsers } from '../components/icons';
import { EdpiPanel } from './EdpiPanel';

type Tab = 'overview' | 'volunteers' | 'attendance' | 'edpi';

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

  // Organisers (and attended volunteers) who aren't core team load this activity's volunteer list directly.
  const needOwnList = !!a && !can.isCore && (canManage || attended);
  const [ownList] = useLive<Participation>(needOwnList ? `parts:${id}` : null, () => query(collection(db, 'participations'), where('activityId', '==', id)));
  const parts = useMemo(() => (needOwnList ? ownList : participations.filter((p) => p.activityId === id)), [needOwnList, ownList, participations, id]);

  // EDPI record: core team has it live already; organisers / attended volunteers subscribe to the one doc.
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
          {canManage && <Link to={`/activities/${a.id}/edit`} className="btn">Edit</Link>}
          {canManage && a.status === 'upcoming' && <button className="btn btn-ok" onClick={() => setConfirm('complete')}><IconCheck />Mark completed</button>}
          {canManage && (a.status === 'completed' || a.status === 'cancelled') && <button className="btn" onClick={() => setConfirm('reopen')}>Reopen</button>}
          {canManage && a.status === 'upcoming' && <button className="btn btn-danger" onClick={() => setConfirm('cancel')}>Cancel</button>}
          {can.canDeleteActivity(a) && <button className="btn btn-danger" onClick={() => setConfirm('delete')}>Delete</button>}
        </div>
      </div>

      <ProposalBanner a={a} users={users} />

      {(canManage || showEdpiTab) && (
        <div className="tabs" role="tablist">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
          {canManage && !isMeeting && <button className={tab === 'volunteers' ? 'on' : ''} onClick={() => setTab('volunteers')}>Volunteer list<span className="count">{volunteers.length}</span></button>}
          {canManage && !isMeeting && <button className={tab === 'attendance' ? 'on' : ''} onClick={() => setTab('attendance')}>Attendance & hours</button>}
          {showEdpiTab && <button className={tab === 'edpi' ? 'on' : ''} onClick={() => setTab('edpi')}>EDPI score</button>}
        </div>
      )}

      {tab === 'overview' && <Overview a={a} lead={lead} leadName={leadName} volunteerCount={volunteers.length} showCount={canManage || can.isCore} myPart={myPart} />}
      {tab === 'volunteers' && canManage && <Volunteers a={a} parts={parts} />}
      {tab === 'attendance' && canManage && <Attendance a={a} parts={volunteers} />}
      {tab === 'edpi' && showEdpiTab && <EdpiPanel a={a} parts={parts} record={record} canManage={canManage} />}

      {confirm === 'delete' && (
        <Confirm title="Delete permanently?" danger confirmLabel="Delete"
          message="This deletes it with its volunteer list, attendance, hours and EDPI score. Verified hours from it disappear from members' totals. To keep the record, cancel instead."
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
        <Confirm title="Mark as completed?" confirmLabel="Mark completed" message="You can still record attendance and verify hours afterwards. For drives, attended volunteers can then help fill in the EDPI results."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'completed'), 'Marked as completed')} />
      )}
      {confirm === 'reopen' && (
        <Confirm title="Reopen?" confirmLabel="Reopen" message="It moves back to Upcoming."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'upcoming'), 'Reopened')} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ proposals
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
function Overview({ a, lead, leadName, volunteerCount, showCount, myPart }: { a: Activity; lead?: UserProfile; leadName: string | null; volunteerCount: number; showCount: boolean; myPart?: Participation }) {
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
        {a.type !== 'meeting' && <MyParticipation a={a} p={myPart} />}
        <section className="card card-pad">
          <dl className="detail-list">
            <dt>When</dt><dd>{fmtRange(a.startAt, a.endAt)}</dd>
            <dt>Where</dt><dd>{a.mode === 'online' ? 'Online' : a.venue}</dd>
            <dt>{a.type === 'meeting' ? 'Host' : 'Organiser'}</dt><dd>{lead ? <><Link to={`/members/${lead.id}`}>{lead.name}</Link> · <a href={`mailto:${lead.email}`}>email</a></> : leadName ?? '—'}</dd>
            {a.departmentId && (<><dt>Department</dt><dd>{departmentById.get(a.departmentId)?.name ?? '—'}</dd></>)}
            {related && (<><dt>For</dt><dd><Link to={`/activities/${related.id}`}>{related.title}</Link></dd></>)}
            {a.type !== 'meeting' && (<><dt>Volunteers</dt><dd>{showCount ? `${volunteerCount}${a.capacity ? ` / ${a.capacity}` : ''}` : a.capacity ? `${a.capacity} spots` : 'Open'}</dd></>)}
            {a.type !== 'meeting' && (<><dt>Credits</dt><dd>{a.credits} per verified volunteer</dd></>)}
          </dl>
        </section>
      </div>
    </div>
  );
}

function MyParticipation({ a, p }: { a: Activity; p?: Participation }) {
  const { profile } = useMe();
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const [hoursNote, setHoursNote] = useState('');
  const { busy, run } = useAction();

  const body = (() => {
    if (a.status === 'proposed' || a.status === 'declined') return <p className="muted small">Volunteering opens once the drive is approved.</p>;
    if (!p || p.status !== 'approved') {
      if (p?.status === 'rejected') return <><RequestBadge status="rejected" />{p.reviewNote && <p className="small muted">“{p.reviewNote}”</p>}</>;
      if (a.status !== 'upcoming') return <p className="muted small">You didn't volunteer for this.</p>;
      if (!a.openForRequests) return <p className="muted small">Volunteers for this are added by the organiser.</p>;
      return (
        <>
          <Field label="Note for the organiser (optional)">
            <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Availability, skills…" />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => api.volunteer(a, note, profile.name), "You're on the volunteer list!")}>
            <IconUsers />Volunteer
          </button>
        </>
      );
    }
    return (
      <>
        <div className="callout"><b>You're volunteering.</b>{p.assignment && <> Your role: <b>{p.assignment}</b>.</>}</div>
        <div className="spread"><span className="small muted">Attendance</span><AttendanceBadge p={p} /></div>
        {p.attendance === 'present' && <div className="spread"><span className="small muted">Hours</span><HoursBadge p={p} /></div>}
        {p.hoursStatus === 'verified' && <div className="callout"><b>{fmtHours(p.verifiedHours ?? 0)}</b> verified · <b>{p.credits}</b> credit{p.credits === 1 ? '' : 's'} earned. Thank you!</div>}
        {p.hoursStatus === 'pending' && <p className="small muted">You logged {fmtHours(p.hoursLogged ?? 0)}. Waiting for the organiser to verify.</p>}
        {p.attendance === 'present' && (p.hoursStatus === 'none' || p.hoursStatus === 'rejected') && (
          <div className="stack-sm">
            {p.hoursStatus === 'rejected' && <p className="small callout warn">Your hours weren't accepted. Check with the organiser and log them again.</p>}
            <Field label="Hours you volunteered" hint="Between 0.5 and 24. 1 h 30 min = 1.5">
              <input className="input" type="number" min={0.5} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
            <Field label="Note (optional)"><input className="input" maxLength={500} value={hoursNote} onChange={(e) => setHoursNote(e.target.value)} placeholder="e.g. 9:00 to 12:30" /></Field>
            <button className="btn btn-primary" disabled={busy || !(Number(hours) >= 0.5 && Number(hours) <= 24)} onClick={() => run(() => api.logHours(p, Number(hours), hoursNote), 'Hours submitted')}>Submit hours</button>
          </div>
        )}
        {p.attendance == null && a.status === 'upcoming' && (
          <>
            <p className="small muted">Attendance is recorded on the day. Afterwards you can log your hours here.</p>
            <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.withdraw(p), "You've been removed from the list")}>I can't make it</button>
          </>
        )}
      </>
    );
  })();

  return <section className="card card-pad stack" aria-label="Your participation"><h2>Volunteer</h2>{body}</section>;
}

// ------------------------------------------------------------------ volunteer list (organiser)
function Volunteers({ a, parts }: { a: Activity; parts: Participation[] }) {
  const { can } = useMe();
  const { userById, positionById, departmentById, users } = useData();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Participation | null>(null);
  const [editing, setEditing] = useState<Participation | null>(null);
  const { busy, run } = useAction();
  const sorted = [...parts].sort((x, y) => (x.status === 'approved' ? 0 : 1) - (y.status === 'approved' ? 0 : 1));
  const emails = parts.filter((p) => p.status === 'approved').map((p) => userById.get(p.uid)?.email).filter(Boolean).join(',');

  return (
    <section className="card">
      <div className="card-head">
        <div><h2>Volunteer list</h2><p>{parts.filter((p) => p.status === 'approved').length} volunteering{a.capacity ? ` of ${a.capacity} spots` : ''}.</p></div>
        <div className="row">
          {emails && <a className="btn btn-sm" href={`mailto:?bcc=${emails}&subject=${encodeURIComponent(a.title)}`}><IconMail />Email all</a>}
          {can.isCore && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><IconPlus />Add volunteer</button>}
        </div>
      </div>
      {sorted.length === 0 ? (
        <Empty title="No volunteers yet" icon={<IconUsers />}>Members volunteer from this page and you'll be notified.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Volunteer</th><th>Role on the day</th><th>Note</th><th>Status</th><th className="num">Actions</th></tr></thead>
            <tbody>
              {sorted.map((p) => {
                const u = userById.get(p.uid);
                const dept = u?.departmentId ? departmentById.get(u.departmentId)?.name : undefined;
                return (
                  <tr key={p.id} style={p.status !== 'approved' ? { opacity: 0.55 } : undefined}>
                    <td>
                      <div className="person">
                        <Avatar name={u?.name ?? '?'} size="sm" />
                        <div>{u ? <Link to={`/members/${p.uid}`}>{u.name}</Link> : <b>{p.userName ?? 'Volunteer'}</b>}<div className="tiny muted">{u ? displayTitle(u, positionById) : ''}{dept ? ` · ${dept}` : ''}</div></div>
                      </div>
                    </td>
                    <td className="small">{p.assignment ?? <span className="muted">—</span>}</td>
                    <td className="small" style={{ maxWidth: 240 }}>{p.note ?? <span className="muted">—</span>}</td>
                    <td><RequestBadge status={p.status} /></td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {u && <a className="btn btn-sm" href={`mailto:${u.email}`} aria-label={`Email ${u.name}`}><IconMail /></a>}
                        {p.status === 'approved' ? (
                          <>
                            <button className="btn btn-sm" onClick={() => setEditing(p)}>Set role</button>
                            <button className="btn btn-sm btn-danger" onClick={() => setRemoving(p)}>Remove</button>
                          </>
                        ) : <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.restoreVolunteer(p), 'Added back')}>Add back</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {adding && <AddVolunteerModal a={a} existing={new Set(parts.map((p) => p.uid))} users={users} onClose={() => setAdding(false)} />}
      {editing && <RoleModal p={editing} name={userById.get(editing.uid)?.name ?? editing.userName ?? ''} onClose={() => setEditing(null)} />}
      {removing && <RemoveModal p={removing} a={a} name={userById.get(removing.uid)?.name ?? removing.userName ?? ''} onClose={() => setRemoving(null)} />}
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

function RemoveModal({ p, a, name, onClose }: { p: Participation; a: Activity; name: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal title={`Remove ${name}?`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={async () => { if (await run(() => api.removeVolunteer(p, a, reason), 'Removed')) onClose(); }}>Remove</button></>}>
      <Field label="Reason (shown to them, optional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {(p.attendance || p.hoursStatus !== 'none') && <div className="callout warn">This clears their attendance and any logged hours.</div>}
    </Modal>
  );
}

function AddVolunteerModal({ a, existing, users, onClose }: { a: Activity; existing: Set<string>; users: UserProfile[]; onClose: () => void }) {
  const [uid, setUid] = useState('');
  const [assignment, setAssignment] = useState('');
  const { busy, run } = useAction();
  const options = users.filter((u) => u.status === 'active' && !existing.has(u.id));
  return (
    <Modal title={`Add to ${a.title}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !uid} onClick={async () => { if (await run(() => api.addVolunteer(a, users.find((x) => x.id === uid)!, assignment), 'Added and notified')) onClose(); }}>Add</button></>}>
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

// ------------------------------------------------------------------ attendance & hours (organiser)
function defaultHours(a: Activity) {
  if (!a.endAt) return '';
  const h = (a.endAt.getTime() - a.startAt.getTime()) / 3600000;
  return h >= 0.5 && h <= 24 ? String(Math.round(h * 4) / 4) : '';
}

function Attendance({ a, parts }: { a: Activity; parts: Participation[] }) {
  const { userById } = useData();
  const { busy, run } = useAction();
  const unmarked = parts.filter((p) => p.attendance == null);
  const started = a.startAt.getTime() <= Date.now();
  return (
    <div className="stack">
      <div className="callout">
        Mark who came. Present volunteers can log their own hours, or you can enter them here. Hours and <b>{a.credits}</b> credit{a.credits === 1 ? '' : 's'} count only after you press <b>Verify</b>.
        You can't verify your own hours — another organiser or leadership must.
      </div>
      {!started && <div className="callout warn">This hasn't started yet ({fmtDateTime(a.startAt)}). Record attendance on the day.</div>}
      <section className="card">
        <div className="card-head">
          <div><h2>Attendance & hours</h2><p>{parts.filter((p) => p.attendance === 'present').length} present · {parts.filter((p) => p.hoursStatus === 'verified').length} verified</p></div>
          {unmarked.length > 0 && (
            <button className="btn btn-sm" disabled={busy} onClick={() => run(async () => { for (const p of unmarked) await api.markAttendance(p, 'present'); }, 'All marked present')}>Mark remaining {unmarked.length} present</button>
          )}
        </div>
        {parts.length === 0 ? <Empty title="No volunteers yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Volunteer</th><th>Attendance</th><th>Logged</th><th>Verified hours</th><th className="num">Status</th></tr></thead>
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
  const [hours, setHours] = useState(String(p.verifiedHours ?? p.hoursLogged ?? defaultHours(a)));
  useEffect(() => {
    const live = p.verifiedHours ?? p.hoursLogged;
    if (live != null) setHours(String(live));
  }, [p.verifiedHours, p.hoursLogged]);
  const { busy, run } = useAction();
  const h = Number(hours);
  const valid = h >= 0.5 && h <= 24;
  const self = p.uid === profile.id && !can.isLeadership;
  return (
    <tr>
      <td><div className="person"><Avatar name={name} size="sm" /><Link to={`/members/${p.uid}`}>{name}</Link></div>{p.assignment && <div className="tiny muted" style={{ marginLeft: 38 }}>{p.assignment}</div>}</td>
      <td>
        <div className="segmented" role="group" aria-label={`Attendance for ${name}`}>
          <button className={p.attendance === 'present' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.markAttendance(p, 'present'))}>Present</button>
          <button className={p.attendance === 'absent' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.markAttendance(p, 'absent'))}>Absent</button>
        </div>
      </td>
      <td className="small">{p.hoursLogged != null ? <span className="num">{fmtHours(p.hoursLogged)}</span> : <span className="muted">—</span>}{p.hoursNote && <div className="tiny muted">{p.hoursNote}</div>}</td>
      <td>
        {p.attendance === 'present' ? (
          self ? <span className="small muted">Someone else verifies yours</span> : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" style={{ width: 84 }} type="number" min={0.5} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} aria-label={`Hours for ${name}`} />
              <button className="btn btn-sm btn-ok" disabled={busy || !valid} onClick={() => run(() => api.verifyHours(p, h, a.credits), `${name}: ${fmtHours(h)} verified`)}>{p.hoursStatus === 'verified' ? 'Update' : 'Verify'}</button>
              {p.hoursStatus === 'pending' && <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => api.rejectHours(p), 'Hours sent back')}>Reject</button>}
            </div>
          )
        ) : <span className="small muted">{p.attendance === 'absent' ? 'Absent — no hours' : 'Mark attendance first'}</span>}
      </td>
      <td className="num"><HoursBadge p={p} />{p.hoursStatus === 'verified' && <div className="tiny muted">{p.credits} cr</div>}</td>
    </tr>
  );
}
