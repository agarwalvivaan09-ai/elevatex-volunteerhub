import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { saveActivity, type ActivityInput } from '../lib/api';
import { DEPT, meetingInvitees } from '../lib/access';
import type { ActivityLink, ActivityType, Audience, Mode } from '../lib/types';
import { AUDIENCE_LABEL, TYPE_LABEL } from '../lib/types';
import { fmtDateTime, toLocalInput } from '../lib/format';
import { Field, useAction } from '../components/ui';
import { IconChevronLeft, IconMap, IconPlus, IconVideo, IconX } from '../components/icons';

const isHttps = (s: string) => /^https:\/\/\S+\.\S+/i.test(s.trim());

function calendarUrl(title: string, start: Date, end: Date, details: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title || 'ElevateX meeting', dates: `${f(start)}/${f(end)}`, details });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function ActivityFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { profile, can } = useMe();
  const { activityById, users, departments, activities, participations } = useData();
  const existing = id ? activityById.get(id) : undefined;
  const navigate = useNavigate();
  const { busy, run } = useAction();

  // Types this person can create (drives can always be proposed).
  const allowedTypes: ActivityType[] = [
    'drive',
    ...(can.canCreateFundraiser ? (['fundraiser'] as ActivityType[]) : []),
    ...(can.canCreateEvent ? (['event'] as ActivityType[]) : []),
    ...(can.canCreateMeeting ? (['meeting'] as ActivityType[]) : []),
  ];
  const requested = params.get('type') as ActivityType | null;
  const initialType = existing?.type ?? (requested && allowedTypes.includes(requested) ? requested : allowedTypes[0]!);

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() + 7);
  defaultStart.setHours(10, 0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 2 * 3600000);
  const deptOptions = can.meetingDepartments(departments.map((d) => d.id));

  const [f, setF] = useState({
    title: existing?.title ?? '',
    type: initialType,
    startAt: toLocalInput(existing?.startAt ?? defaultStart),
    endAt: toLocalInput(existing?.endAt ?? defaultEnd),
    mode: (existing?.mode ?? (initialType === 'meeting' ? 'online' : 'in_person')) as Mode,
    venue: existing?.venue ?? '',
    mapUrl: existing?.mapUrl ?? '',
    meetingUrl: existing?.meetingUrl ?? '',
    audience: (existing?.audience ?? (initialType === 'meeting' ? can.meetingAudiences[can.meetingAudiences.length - 1] ?? 'department' : 'all')) as Audience,
    relatedActivityId: existing?.relatedActivityId ?? '',
    description: existing?.description ?? '',
    instructions: existing?.instructions ?? '',
    requirements: existing?.requirements ?? '',
    capacity: existing?.capacity?.toString() ?? '',
    leadUid: existing?.leadUid ?? profile.id,
    departmentId: existing?.departmentId ?? (can.isHod ? can.dept ?? '' : ''),
    credits: existing?.credits?.toString() ?? '1',
    openForRequests: existing?.openForRequests ?? true,
  });
  const [links, setLinks] = useState<ActivityLink[]>(existing?.links ?? []);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const isMeeting = f.type === 'meeting';
  const proposing = !existing && f.type === 'drive' && !can.canCreateDriveDirectly;
  const relatedOptions = useMemo(
    () => activities.filter((a) => (a.type === 'drive' || a.type === 'fundraiser') && a.status === 'upcoming' && (can.isLeadership || a.departmentId === can.dept)),
    [activities, can],
  );

  if (id && !existing) return <p className="muted">Activity not found.</p>;
  if (existing && !can.canManageActivity(existing)) return <p className="muted">You can't edit this activity.</p>;

  // Department follows the type: drives belong to Drive Execution, fundraisers to Project Operations.
  const departmentFor = () => {
    if (f.type === 'drive') return DEPT.driveExec;
    if (f.type === 'fundraiser') return DEPT.projectOps;
    if (isMeeting && (f.audience === 'department' || f.audience === 'volunteers')) return f.departmentId || null;
    if (f.type === 'event') return f.departmentId || null;
    return null;
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const startAt = new Date(f.startAt);
    const endAt = new Date(f.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return setError('Please choose the date, start time and end time.');
    if (endAt <= startAt) return setError('The end time must be after the start time.');
    if (f.mode === 'in_person') {
      if (!f.venue.trim()) return setError('Add the venue address.');
      if (!isHttps(f.mapUrl)) return setError('Add the Google Maps location link (it starts with https://). Use “Find on Google Maps”, then Share → Copy link.');
    } else if (!isHttps(f.meetingUrl)) {
      return setError('Add the meeting link (it starts with https://). Use “Create Google Meet”, then copy the link from the meeting.');
    }
    if (isMeeting && (f.audience === 'department' || f.audience === 'volunteers') && !f.departmentId) return setError('Choose the department for this meeting.');
    if (isMeeting && f.audience === 'volunteers' && !f.relatedActivityId) return setError('Choose which drive or fundraiser’s volunteers to invite.');
    const cleanLinks = links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url);
    for (const l of cleanLinks) if (!/^https?:\/\//i.test(l.url)) return setError(`Links must start with https:// — check “${l.label || l.url}”.`);

    const input: ActivityInput = {
      title: f.title.trim(),
      type: f.type,
      status: existing?.status ?? (proposing ? 'proposed' : 'upcoming'),
      startAt,
      endAt,
      mode: f.mode,
      venue: f.mode === 'online' ? 'Online' : f.venue.trim(),
      mapUrl: f.mode === 'in_person' ? f.mapUrl.trim() : null,
      meetingUrl: f.mode === 'online' ? f.meetingUrl.trim() : null,
      audience: isMeeting ? f.audience : 'all',
      relatedActivityId: isMeeting && f.audience === 'volunteers' ? f.relatedActivityId : null,
      description: f.description.trim(),
      instructions: f.instructions.trim(),
      requirements: f.requirements.trim(),
      links: cleanLinks.map((l) => ({ label: l.label || l.url, url: l.url })),
      capacity: !isMeeting && f.capacity ? Math.max(1, parseInt(f.capacity, 10)) : null,
      leadUid: f.leadUid || profile.id,
      departmentId: departmentFor(),
      credits: isMeeting ? 0 : Math.min(10, Math.max(0, Number(f.credits) || 0)),
      openForRequests: isMeeting ? false : f.openForRequests,
    };
    const volunteerUids = new Set(participations.filter((p) => p.activityId === input.relatedActivityId && p.status === 'approved').map((p) => p.uid));
    const invitees = isMeeting ? meetingInvitees({ ...input, id: '', createdBy: profile.id }, users, volunteerUids).map((u) => u.id) : undefined;
    let newId = id;
    const ok = await run(async () => { newId = await saveActivity(input, { users, invitees }, id); },
      id ? 'Saved' : proposing ? 'Proposal sent to the core team for approval' : isMeeting ? `Meeting scheduled — ${invitees?.length ?? 0} people notified` : 'Published — everyone has been notified');
    if (ok) navigate(`/activities/${newId}`);
  }

  const start = new Date(f.startAt);
  const end = new Date(f.endAt);
  const datesOk = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());

  return (
    <form onSubmit={submit}>
      <Link to={id ? `/activities/${id}` : isMeeting ? '/meetings' : '/activities'} className="backlink"><IconChevronLeft width={16} />Back</Link>
      <div className="page-head">
        <div>
          <h1>{id ? `Edit ${TYPE_LABEL[f.type].toLowerCase()}` : proposing ? 'Propose a drive' : isMeeting ? 'Schedule a meeting' : `New ${TYPE_LABEL[f.type].toLowerCase()}`}</h1>
          <p>{proposing ? 'Your proposal goes to the core team. Once any core member approves it, everyone is notified and can volunteer.' : 'Be specific — date, time and exact location help everyone turn up prepared.'}</p>
        </div>
      </div>

      {!id && allowedTypes.length > 1 && (
        <div className="segmented" role="group" aria-label="Type" style={{ marginBottom: 16 }}>
          {allowedTypes.map((t) => (
            <button type="button" key={t} className={f.type === t ? 'on' : ''}
              onClick={() => setF((x) => ({ ...x, type: t, mode: t === 'meeting' ? 'online' : x.mode, audience: t === 'meeting' ? (can.meetingAudiences[can.meetingAudiences.length - 1] ?? 'department') : 'all' }))}>
              {t === 'drive' && !can.canCreateDriveDirectly ? 'Propose a drive' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}

      <div className="layout-main-side">
        <div className="stack">
          <section className="card card-pad">
            <div className="form-grid">
              <Field label="Title" className="full">
                <input className="input" required maxLength={160} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={isMeeting ? 'e.g. Marketing weekly sync' : 'e.g. Winter Blanket Drive'} />
              </Field>
              <Field label="Starts"><input className="input" type="datetime-local" required value={f.startAt} onChange={(e) => set('startAt', e.target.value)} /></Field>
              <Field label="Ends"><input className="input" type="datetime-local" required value={f.endAt} onChange={(e) => set('endAt', e.target.value)} /></Field>
              <Field label={isMeeting ? 'Agenda' : 'Description'} className="full">
                <textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder={isMeeting ? 'What will be discussed?' : 'What is this and why does it matter?'} />
              </Field>
            </div>
          </section>

          <section className="card card-pad stack">
            <div className="spread">
              <h2>Location</h2>
              <div className="segmented" role="group" aria-label="Where">
                <button type="button" className={f.mode === 'in_person' ? 'on' : ''} onClick={() => set('mode', 'in_person')}>In person</button>
                <button type="button" className={f.mode === 'online' ? 'on' : ''} onClick={() => set('mode', 'online')}>Online</button>
              </div>
            </div>
            {f.mode === 'in_person' ? (
              <div className="form-grid">
                <Field label="Venue address" className="full">
                  <input className="input" value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="e.g. Shelter Home, Sector 12, Kolkata" />
                </Field>
                <Field label="Google Maps location link" className="full" hint="Members open this to navigate. On Google Maps: find the place → Share → Copy link → paste here.">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="input" value={f.mapUrl} onChange={(e) => set('mapUrl', e.target.value)} placeholder="https://maps.app.goo.gl/…" />
                    <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.venue || 'Kolkata')}`}><IconMap />Find on Google Maps</a>
                  </div>
                </Field>
              </div>
            ) : (
              <Field label="Meeting link" hint="Members join straight from the Hub with this link.">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" value={f.meetingUrl} onChange={(e) => set('meetingUrl', e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
                  <a className="btn" target="_blank" rel="noopener noreferrer" href="https://meet.google.com/new"><IconVideo />Create Google Meet</a>
                </div>
                {datesOk && (
                  <span className="small muted">
                    Want it on your calendar with a Meet link?{' '}
                    <a target="_blank" rel="noopener noreferrer" href={calendarUrl(f.title, start, end, f.description)}>Schedule it in Google Calendar</a>, click “Add Google Meet video conferencing”, save, then paste the Meet link above.
                  </span>
                )}
              </Field>
            )}
          </section>

          {!isMeeting && (
            <section className="card card-pad">
              <div className="form-grid">
                <Field label="Instructions for volunteers" className="full">
                  <textarea className="textarea" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Where to meet, what to bring, dress code, who to report to…" />
                </Field>
                <Field label="Requirements" className="full">
                  <textarea className="textarea" value={f.requirements} onChange={(e) => set('requirements', e.target.value)} placeholder="e.g. Available 9am–1pm, consent form signed" />
                </Field>
              </div>
            </section>
          )}

          <section className="card card-pad stack">
            <div className="spread">
              <div><h2>Useful links</h2><p className="muted small">Forms, WhatsApp groups, documents.</p></div>
              <button type="button" className="btn btn-sm" onClick={() => setLinks((l) => [...l, { label: '', url: '' }])}><IconPlus />Add link</button>
            </div>
            {links.map((l, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" style={{ maxWidth: 200 }} placeholder="Label" value={l.label} onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Link label" />
                <input className="input" placeholder="https://…" value={l.url} onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} aria-label="Link URL" />
                <button type="button" className="icon-btn" aria-label="Remove link" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}><IconX /></button>
              </div>
            ))}
          </section>
        </div>

        <div className="stack">
          <section className="card card-pad stack">
            <h2>{isMeeting ? 'Who is invited' : 'Organising'}</h2>
            {isMeeting && (
              <>
                <Field label="Meeting type">
                  <select className="select" value={f.audience} onChange={(e) => set('audience', e.target.value as Audience)} disabled={!!existing && !can.isLeadership}>
                    {can.meetingAudiences.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                  </select>
                </Field>
                {(f.audience === 'department' || f.audience === 'volunteers') && (
                  <Field label="Department">
                    <select className="select" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                      <option value="">Choose…</option>
                      {departments.filter((d) => deptOptions.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                )}
                {f.audience === 'volunteers' && (
                  <Field label="Volunteers of">
                    <select className="select" value={f.relatedActivityId} onChange={(e) => set('relatedActivityId', e.target.value)}>
                      <option value="">Choose a drive or fundraiser…</option>
                      {relatedOptions.map((a) => <option key={a.id} value={a.id}>{a.title} · {fmtDateTime(a.startAt)}</option>)}
                    </select>
                  </Field>
                )}
              </>
            )}
            <Field label={isMeeting ? 'Host' : 'Organiser'} hint={isMeeting ? undefined : 'Sees the volunteer list, records attendance and verifies hours.'}>
              <select className="select" value={f.leadUid} onChange={(e) => set('leadUid', e.target.value)}>
                {users.filter((u) => u.status === 'active').map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === profile.id ? ' (you)' : ''}</option>)}
              </select>
            </Field>
            {f.type === 'event' && (
              <Field label="Department (optional)">
                <select className="select" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                  <option value="">Whole organisation</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            {!isMeeting && (
              <>
                <Field label="Volunteer spots (optional)">
                  <input className="input" type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="No limit" />
                </Field>
                <Field label="Participation credits" hint="Each volunteer earns these once attendance and hours are verified (0–10).">
                  <input className="input" type="number" min={0} max={10} step={1} value={f.credits} onChange={(e) => set('credits', e.target.value)} />
                </Field>
                <label className="check">
                  <input type="checkbox" checked={f.openForRequests} onChange={(e) => set('openForRequests', e.target.checked)} />
                  Members can volunteer from the Hub
                </label>
              </>
            )}
          </section>
          {proposing && <div className="callout info">This will be sent to the core team (Heads, Board, Chairman, Vice Chairman, CEO, COO) for approval.</div>}
          {error && <div className="callout bad" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Saving…' : id ? 'Save changes' : proposing ? 'Send for approval' : isMeeting ? 'Schedule & notify' : 'Publish & notify everyone'}
          </button>
        </div>
      </div>
    </form>
  );
}
