import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Activity, Participation, UserProfile } from '../lib/types';
import { fmtHours, fmtRange, fmtDateTime } from '../lib/format';
import {
  ActivityStatusBadge, AttendanceBadge, Avatar, Confirm, Empty, Field, HoursBadge, Modal, RequestBadge, TypeBadge, useAction,
} from '../components/ui';
import { IconCheck, IconChevronLeft, IconClock, IconLead, IconLink, IconPin, IconPlus, IconUsers } from '../components/icons';
import { EdpiPanel } from './EdpiPanel';

type Tab = 'overview' | 'participants' | 'attendance' | 'edpi';

export function ActivityDetailPage() {
  const { id } = useParams();
  const { isCore, isAdmin } = useMe();
  const { activityById, participations, userById, departmentById } = useData();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirm, setConfirm] = useState<null | 'delete' | 'cancel' | 'complete' | 'reopen'>(null);
  const { run } = useAction();

  const a = id ? activityById.get(id) : undefined;
  const parts = useMemo(() => participations.filter((p) => p.activityId === id), [participations, id]);

  if (!a) return <Empty title="Activity not found">It may have been deleted. <Link to="/activities">Back to activities</Link></Empty>;

  const lead = a.leadUid ? userById.get(a.leadUid) : undefined;
  const approved = parts.filter((p) => p.status === 'approved');
  const pending = parts.filter((p) => p.status === 'requested');
  const showEdpi = a.type === 'drive' || a.type === 'fundraiser';

  return (
    <>
      <Link to="/activities" className="backlink"><IconChevronLeft width={16} />All activities</Link>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <TypeBadge type={a.type} />
            <ActivityStatusBadge a={a} />
          </div>
          <h1>{a.title}</h1>
          <div className="row small muted" style={{ marginTop: 6, gap: 16 }}>
            <span className="meta-line"><IconClock />{fmtRange(a.startAt, a.endAt)}</span>
            {a.venue && <span className="meta-line"><IconPin />{a.venue}</span>}
            {lead && <span className="meta-line"><IconLead />Led by {lead.name}</span>}
          </div>
        </div>
        {isCore && (
          <div className="page-actions">
            <Link to={`/activities/${a.id}/edit`} className="btn">Edit</Link>
            {a.status === 'upcoming' && <button className="btn btn-ok" onClick={() => setConfirm('complete')}><IconCheck />Mark completed</button>}
            {a.status !== 'upcoming' && <button className="btn" onClick={() => setConfirm('reopen')}>Reopen</button>}
            {a.status === 'upcoming' && <button className="btn btn-danger" onClick={() => setConfirm('cancel')}>Cancel</button>}
            {isAdmin && <button className="btn btn-danger" onClick={() => setConfirm('delete')}>Delete</button>}
          </div>
        )}
      </div>

      {isCore && (
        <div className="tabs" role="tablist">
          <button className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
          <button className={tab === 'participants' ? 'on' : ''} onClick={() => setTab('participants')}>
            Participants<span className="count">{parts.length}</span>
            {pending.length > 0 && <span className="badge warn" style={{ marginLeft: 6 }}>{pending.length} new</span>}
          </button>
          <button className={tab === 'attendance' ? 'on' : ''} onClick={() => setTab('attendance')}>Attendance & hours<span className="count">{approved.length}</span></button>
          {showEdpi && <button className={tab === 'edpi' ? 'on' : ''} onClick={() => setTab('edpi')}>EDPI score</button>}
        </div>
      )}

      {tab === 'overview' && <Overview a={a} parts={parts} departmentName={a.departmentId ? departmentById.get(a.departmentId)?.name : undefined} lead={lead} />}
      {tab === 'participants' && isCore && <Participants a={a} parts={parts} />}
      {tab === 'attendance' && isCore && <Attendance a={a} parts={approved} />}
      {tab === 'edpi' && isCore && showEdpi && <EdpiPanel a={a} parts={parts} />}

      {confirm === 'delete' && (
        <Confirm title="Delete activity?" danger confirmLabel="Delete permanently"
          message="This permanently deletes the activity, all its participation records, attendance, hours and EDPI score. Verified hours from it will disappear from members' totals. To keep the record, cancel it instead."
          onClose={() => setConfirm(null)}
          onConfirm={async () => { if (await run(() => api.deleteActivity(a.id), 'Activity deleted')) navigate('/activities'); }} />
      )}
      {confirm === 'cancel' && (
        <Confirm title="Cancel this activity?" danger confirmLabel="Cancel activity" message="Members will see it as cancelled. Records are kept and you can reopen it later."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'cancelled'), 'Activity cancelled')} />
      )}
      {confirm === 'complete' && (
        <Confirm title="Mark as completed?" confirmLabel="Mark completed" message="It moves to Completed activities. You can still record attendance, verify hours and score the drive afterwards."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'completed'), 'Marked as completed')} />
      )}
      {confirm === 'reopen' && (
        <Confirm title="Reopen activity?" confirmLabel="Reopen" message="It moves back to Upcoming."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.setActivityStatus(a.id, 'upcoming'), 'Activity reopened')} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ a, parts, departmentName, lead }: { a: Activity; parts: Participation[]; departmentName?: string; lead?: UserProfile }) {
  const { isCore } = useMe();
  const approvedCount = parts.filter((p) => p.status === 'approved').length;
  return (
    <div className="layout-main-side">
      <div className="stack">
        <section className="card card-pad stack">
          <h2>About</h2>
          <p className="prose">{a.description || <span className="muted">No description yet.</span>}</p>
        </section>
        {a.instructions && (
          <section className="card card-pad stack">
            <h2>Instructions</h2>
            <p className="prose">{a.instructions}</p>
          </section>
        )}
        {a.requirements && (
          <section className="card card-pad stack">
            <h2>Participation requirements</h2>
            <p className="prose">{a.requirements}</p>
          </section>
        )}
        {a.links.length > 0 && (
          <section className="card card-pad stack">
            <h2>Useful links</h2>
            <div className="stack-sm">
              {a.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="meta-line"><IconLink />{l.label}</a>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="stack">
        <MyParticipation a={a} />
        <section className="card card-pad">
          <dl className="detail-list">
            <dt>When</dt><dd>{fmtRange(a.startAt, a.endAt)}</dd>
            <dt>Venue</dt><dd>{a.venue || '—'}</dd>
            <dt>Lead</dt><dd>{lead ? <Link to={`/members/${lead.id}`}>{lead.name}</Link> : '—'}</dd>
            {departmentName && (<><dt>Department</dt><dd>{departmentName}</dd></>)}
            <dt>Spots</dt><dd>{a.capacity ? `${isCore ? `${approvedCount} / ` : ''}${a.capacity}` : isCore ? `${approvedCount} approved` : 'Open'}</dd>
            <dt>Credits</dt><dd>{a.credits} per verified volunteer</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

function MyParticipation({ a }: { a: Activity }) {
  const { profile } = useMe();
  const { participations } = useData();
  const p = participations.find((x) => x.activityId === a.id && x.uid === profile.id);
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const [hoursNote, setHoursNote] = useState('');
  const { busy, run } = useAction();

  const body = (() => {
    if (!p) {
      if (a.status !== 'upcoming') return <p className="muted small">You did not take part in this activity.</p>;
      if (!a.openForRequests) return <p className="muted small">Participation is by assignment from the Core Team.</p>;
      return (
        <>
          <Field label="Message for the organisers (optional)">
            <textarea className="textarea" style={{ minHeight: 64 }} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Availability, skills, anything they should know" />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => run(() => api.requestToJoin(a.id, note), 'Request sent')}>Request to participate</button>
        </>
      );
    }
    return (
      <>
        <div className="spread"><span className="small muted">Request</span><RequestBadge status={p.status} /></div>
        {p.reviewNote && <p className="small callout info">“{p.reviewNote}”</p>}
        {p.status === 'approved' && (
          <>
            {p.assignment && <div className="spread"><span className="small muted">Your role</span><b className="small">{p.assignment}</b></div>}
            <div className="spread"><span className="small muted">Attendance</span><AttendanceBadge p={p} /></div>
            {p.attendance === 'present' && <div className="spread"><span className="small muted">Hours</span><HoursBadge p={p} /></div>}
            {p.hoursStatus === 'verified' && (
              <div className="callout"><b>{fmtHours(p.verifiedHours ?? 0)}</b> verified · <b>{p.credits}</b> credit{p.credits === 1 ? '' : 's'} earned. Thank you!</div>
            )}
            {p.hoursStatus === 'pending' && <p className="small muted">You logged {fmtHours(p.hoursLogged ?? 0)}. Waiting for a Core Team member to verify.</p>}
            {p.attendance === 'present' && (p.hoursStatus === 'none' || p.hoursStatus === 'rejected') && (
              <div className="stack-sm">
                {p.hoursStatus === 'rejected' && <p className="small callout warn">Your hours weren't accepted. Check with the organiser and log them again.</p>}
                <Field label="Hours you volunteered" hint="Between 0.5 and 24. 1 hour 30 minutes = 1.5">
                  <input className="input" type="number" min={0.5} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
                </Field>
                <Field label="Note (optional)">
                  <input className="input" maxLength={500} value={hoursNote} onChange={(e) => setHoursNote(e.target.value)} placeholder="e.g. Arrived 9:00, left 12:30" />
                </Field>
                <button
                  className="btn btn-primary"
                  disabled={busy || !(Number(hours) >= 0.5 && Number(hours) <= 24)}
                  onClick={() => run(() => api.logHours(p, Number(hours), hoursNote), 'Hours submitted for verification')}
                >
                  Submit hours
                </button>
              </div>
            )}
            {p.attendance == null && a.status === 'upcoming' && <p className="small muted">Attendance is recorded on the day. After that you can log your hours here.</p>}
          </>
        )}
        {(p.status === 'requested' || p.status === 'deferred') && (
          <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.withdrawRequest(p), 'Request withdrawn')}>Withdraw request</button>
        )}
      </>
    );
  })();

  return (
    <section className="card card-pad stack" aria-label="Your participation">
      <h2>Your participation</h2>
      {body}
    </section>
  );
}

// ------------------------------------------------------------------ participants (Core)
function Participants({ a, parts }: { a: Activity; parts: Participation[] }) {
  const { userById, positionById, users } = useData();
  const [review, setReview] = useState<{ p: Participation; status: 'approved' | 'deferred' | 'rejected' } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const order = { requested: 0, approved: 1, deferred: 2, rejected: 3 };
  const sorted = [...parts].sort((x, y) => order[x.status] - order[y.status]);
  const approvedCount = parts.filter((p) => p.status === 'approved').length;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Participants</h2>
          <p>{approvedCount} approved{a.capacity ? ` of ${a.capacity} spots` : ''} · approve, defer or decline requests, or assign members directly.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAssignOpen(true)}><IconPlus />Assign member</button>
      </div>
      {sorted.length === 0 ? (
        <Empty title="No requests yet" icon={<IconUsers />}>Members can request to join from this page, or you can assign them.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Member</th><th>Status</th><th>Assignment</th><th>Message</th><th className="num">Actions</th></tr></thead>
            <tbody>
              {sorted.map((p) => {
                const u = userById.get(p.uid);
                const pos = u?.positionId ? positionById.get(u.positionId)?.title : undefined;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="person">
                        <Avatar name={u?.name ?? '?'} size="sm" />
                        <div><Link to={`/members/${p.uid}`}>{u?.name ?? 'Unknown member'}</Link><div className="tiny muted">{pos ?? '—'}</div></div>
                      </div>
                    </td>
                    <td><RequestBadge status={p.status} />{p.source === 'assigned' && <div className="tiny muted" style={{ marginTop: 3 }}>Assigned</div>}</td>
                    <td className="small">{p.assignment ?? <span className="muted">—</span>}</td>
                    <td className="small" style={{ maxWidth: 260 }}>{p.note ?? <span className="muted">—</span>}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {p.status !== 'approved' && <button className="btn btn-sm btn-ok" onClick={() => setReview({ p, status: 'approved' })}>Approve</button>}
                        {p.status === 'approved' && <button className="btn btn-sm" onClick={() => setReview({ p, status: 'approved' })}>Edit role</button>}
                        {p.status !== 'deferred' && <button className="btn btn-sm" onClick={() => setReview({ p, status: 'deferred' })}>Defer</button>}
                        {p.status !== 'rejected' && <button className="btn btn-sm btn-danger" onClick={() => setReview({ p, status: 'rejected' })}>Decline</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {review && <ReviewModal {...review} memberName={userById.get(review.p.uid)?.name ?? ''} onClose={() => setReview(null)} />}
      {assignOpen && <AssignModal a={a} existing={new Set(parts.map((p) => p.uid))} users={users} onClose={() => setAssignOpen(false)} />}
    </section>
  );
}

export function ReviewModal({ p, status, memberName, onClose }: { p: Participation; status: 'approved' | 'deferred' | 'rejected'; memberName: string; onClose: () => void }) {
  const [note, setNote] = useState(p.reviewNote ?? '');
  const [assignment, setAssignment] = useState(p.assignment ?? '');
  const { busy, run } = useAction();
  const verb = { approved: 'Approve', deferred: 'Defer', rejected: 'Decline' }[status];
  const warnLoss = status !== 'approved' && (p.attendance || p.hoursStatus !== 'none');
  return (
    <Modal
      title={`${verb} ${memberName}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={`btn ${status === 'rejected' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}
            onClick={async () => { if (await run(() => api.reviewRequest(p, status, note, status === 'approved' ? assignment : undefined), `${verb}d`)) onClose(); }}>
            {verb}
          </button>
        </>
      }
    >
      {p.note && <div className="callout info"><b>Their message:</b> {p.note}</div>}
      {status === 'approved' && (
        <Field label="Assignment / role on the day (optional)" hint="e.g. Registration desk, Distribution team, Photography">
          <input className="input" value={assignment} onChange={(e) => setAssignment(e.target.value)} />
        </Field>
      )}
      <Field label={status === 'approved' ? 'Note to the member (optional)' : 'Reason (shown to the member, optional)'}>
        <textarea className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'deferred' ? 'e.g. We have enough volunteers — you are first on the list for the next one.' : ''} />
      </Field>
      {warnLoss && <div className="callout warn">This clears their attendance and any logged hours for this activity.</div>}
    </Modal>
  );
}

function AssignModal({ a, existing, users, onClose }: { a: Activity; existing: Set<string>; users: UserProfile[]; onClose: () => void }) {
  const [uid, setUid] = useState('');
  const [assignment, setAssignment] = useState('');
  const { busy, run } = useAction();
  const options = users.filter((u) => u.status === 'active' && !existing.has(u.id));
  return (
    <Modal title={`Assign to ${a.title}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !uid} onClick={async () => { if (await run(() => api.assignMember(a.id, uid, assignment), 'Member assigned')) onClose(); }}>Assign</button></>}>
      <Field label="Member">
        <select className="select" value={uid} onChange={(e) => setUid(e.target.value)}>
          <option value="">Choose a member…</option>
          {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="Assignment / role (optional)"><input className="input" value={assignment} onChange={(e) => setAssignment(e.target.value)} /></Field>
      <p className="small muted">Assigned members are approved straight away and see it on their dashboard.</p>
    </Modal>
  );
}

// ------------------------------------------------------------------ attendance & hours (Core)
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
        <b>How this works:</b> mark who was present on the day. Present members can log their own hours, or you can enter them here.
        Hours and <b>{a.credits}</b> participation credit{a.credits === 1 ? '' : 's'} count only after you press <b>Verify</b>, and only for members marked present.
      </div>
      {!started && <div className="callout warn">This activity hasn't started yet ({fmtDateTime(a.startAt)}). Record attendance on the day.</div>}
      <section className="card">
        <div className="card-head">
          <div><h2>Attendance & hours</h2><p>{parts.filter((p) => p.attendance === 'present').length} present · {parts.filter((p) => p.hoursStatus === 'verified').length} verified</p></div>
          {unmarked.length > 0 && (
            <button className="btn btn-sm" disabled={busy} onClick={() => run(async () => { for (const p of unmarked) await api.markAttendance(p, 'present'); }, 'All marked present')}>
              Mark remaining {unmarked.length} present
            </button>
          )}
        </div>
        {parts.length === 0 ? (
          <Empty title="No approved participants">Approve requests or assign members in the Participants tab first.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Member</th><th>Attendance</th><th>Logged by member</th><th>Verified hours</th><th className="num">Status</th></tr></thead>
              <tbody>
                {parts.map((p) => <AttendanceRow key={p.id} a={a} p={p} name={userById.get(p.uid)?.name ?? 'Unknown'} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AttendanceRow({ a, p, name }: { a: Activity; p: Participation; name: string }) {
  const [hours, setHours] = useState(String(p.verifiedHours ?? p.hoursLogged ?? defaultHours(a)));
  // Pick up hours the member logs (or another Core member verifies) while this page is open.
  useEffect(() => {
    const live = p.verifiedHours ?? p.hoursLogged;
    if (live != null) setHours(String(live));
  }, [p.verifiedHours, p.hoursLogged]);
  const { busy, run } = useAction();
  const h = Number(hours);
  const valid = h >= 0.5 && h <= 24;
  return (
    <tr>
      <td><div className="person"><Avatar name={name} size="sm" /><Link to={`/members/${p.uid}`}>{name}</Link></div>{p.assignment && <div className="tiny muted" style={{ marginLeft: 38 }}>{p.assignment}</div>}</td>
      <td>
        <div className="segmented" role="group" aria-label={`Attendance for ${name}`}>
          <button className={p.attendance === 'present' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.markAttendance(p, 'present'))}>Present</button>
          <button className={p.attendance === 'absent' ? 'on' : ''} disabled={busy} onClick={() => run(() => api.markAttendance(p, 'absent'))}>Absent</button>
        </div>
      </td>
      <td className="small">
        {p.hoursLogged != null ? <span className="num">{fmtHours(p.hoursLogged)}</span> : <span className="muted">—</span>}
        {p.hoursNote && <div className="tiny muted">{p.hoursNote}</div>}
      </td>
      <td>
        {p.attendance === 'present' ? (
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" style={{ width: 84 }} type="number" min={0.5} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} aria-label={`Hours for ${name}`} />
            <button className="btn btn-sm btn-ok" disabled={busy || !valid} onClick={() => run(() => api.verifyHours(p, h, a.credits), `${name}: ${fmtHours(h)} verified`)}>
              {p.hoursStatus === 'verified' ? 'Update' : 'Verify'}
            </button>
            {p.hoursStatus === 'pending' && <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => api.rejectHours(p), 'Hours sent back')}>Reject</button>}
          </div>
        ) : (
          <span className="small muted">{p.attendance === 'absent' ? 'Absent — no hours' : 'Mark attendance first'}</span>
        )}
      </td>
      <td className="num"><HoursBadge p={p} />{p.hoursStatus === 'verified' && <div className="tiny muted">{p.credits} cr</div>}</td>
    </tr>
  );
}
