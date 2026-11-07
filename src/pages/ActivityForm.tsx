import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { saveActivity, type ActivityInput } from '../lib/api';
import type { ActivityLink, ActivityType } from '../lib/types';
import { toLocalInput } from '../lib/format';
import { Field, useAction } from '../components/ui';
import { IconChevronLeft, IconPlus, IconX } from '../components/icons';

export function ActivityFormPage() {
  const { id } = useParams();
  const { activityById, users, departments } = useData();
  const existing = id ? activityById.get(id) : undefined;
  const navigate = useNavigate();
  const { busy, run } = useAction();

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() + 7);
  defaultStart.setHours(10, 0, 0, 0);

  const [f, setF] = useState({
    title: existing?.title ?? '',
    type: existing?.type ?? ('drive' as ActivityType),
    startAt: toLocalInput(existing?.startAt ?? defaultStart),
    endAt: toLocalInput(existing?.endAt ?? null),
    venue: existing?.venue ?? '',
    description: existing?.description ?? '',
    instructions: existing?.instructions ?? '',
    requirements: existing?.requirements ?? '',
    capacity: existing?.capacity?.toString() ?? '',
    leadUid: existing?.leadUid ?? '',
    departmentId: existing?.departmentId ?? '',
    credits: existing?.credits?.toString() ?? '1',
    openForRequests: existing?.openForRequests ?? true,
  });
  const [links, setLinks] = useState<ActivityLink[]>(existing?.links ?? []);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  if (id && !existing) return <p className="muted">Activity not found.</p>;

  const coreMembers = users.filter((u) => u.status === 'active' && (u.role === 'core' || u.role === 'admin'));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const startAt = new Date(f.startAt);
    const endAt = f.endAt ? new Date(f.endAt) : null;
    if (Number.isNaN(startAt.getTime())) return setError('Please choose a start date and time.');
    if (endAt && endAt < startAt) return setError('The end time must be after the start time.');
    const cleanLinks = links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url);
    for (const l of cleanLinks) {
      if (!/^https?:\/\//i.test(l.url)) return setError(`Links must start with https:// — check “${l.label || l.url}”.`);
    }
    const input: ActivityInput = {
      title: f.title.trim(),
      type: f.type,
      status: existing?.status ?? 'upcoming',
      startAt,
      endAt,
      venue: f.venue.trim(),
      description: f.description.trim(),
      instructions: f.instructions.trim(),
      requirements: f.requirements.trim(),
      links: cleanLinks.map((l) => ({ label: l.label || l.url, url: l.url })),
      capacity: f.capacity ? Math.max(1, parseInt(f.capacity, 10)) : null,
      leadUid: f.leadUid || null,
      departmentId: f.departmentId || null,
      credits: Math.min(10, Math.max(0, Number(f.credits) || 0)),
      openForRequests: f.openForRequests,
    };
    let newId = id;
    const ok = await run(async () => { newId = await saveActivity(input, id); }, id ? 'Activity updated' : 'Activity created');
    if (ok) navigate(`/activities/${newId}`);
  }

  return (
    <form onSubmit={submit}>
      <Link to={id ? `/activities/${id}` : '/activities'} className="backlink"><IconChevronLeft width={16} />Back</Link>
      <div className="page-head">
        <div>
          <h1>{id ? 'Edit activity' : 'New activity'}</h1>
          <p>Everything volunteers need to know before they request to join.</p>
        </div>
      </div>

      <div className="layout-main-side">
        <div className="stack">
          <section className="card card-pad">
            <div className="form-grid">
              <Field label="Title" className="full">
                <input className="input" required maxLength={160} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Winter Blanket Drive" />
              </Field>
              <Field label="Type">
                <select className="select" value={f.type} onChange={(e) => set('type', e.target.value as ActivityType)}>
                  <option value="drive">Drive</option>
                  <option value="fundraiser">Fundraiser</option>
                  <option value="event">Organisational event</option>
                  <option value="meeting">Meeting</option>
                </select>
              </Field>
              <Field label="Venue">
                <input className="input" value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Address or “Online”" />
              </Field>
              <Field label="Starts">
                <input className="input" type="datetime-local" required value={f.startAt} onChange={(e) => set('startAt', e.target.value)} />
              </Field>
              <Field label="Ends (optional)">
                <input className="input" type="datetime-local" value={f.endAt} onChange={(e) => set('endAt', e.target.value)} />
              </Field>
              <Field label="Description" className="full">
                <textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="What is this activity and why does it matter?" />
              </Field>
              <Field label="Instructions for volunteers" className="full">
                <textarea className="textarea" value={f.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="Where to meet, what to bring, dress code, who to report to…" />
              </Field>
              <Field label="Participation requirements" className="full">
                <textarea className="textarea" value={f.requirements} onChange={(e) => set('requirements', e.target.value)} placeholder="e.g. Must be available 9am–1pm, parental consent form signed" />
              </Field>
            </div>
          </section>

          <section className="card card-pad stack">
            <div className="spread">
              <div><h2>Useful links</h2><p className="muted small">Registration forms, WhatsApp groups, documents, maps.</p></div>
              <button type="button" className="btn btn-sm" onClick={() => setLinks((l) => [...l, { label: '', url: '' }])}><IconPlus />Add link</button>
            </div>
            {links.length === 0 && <p className="muted small">No links yet.</p>}
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
            <h2>Organising</h2>
            <Field label="Lead (Core Team)" hint="The person responsible for requests and attendance.">
              <select className="select" value={f.leadUid} onChange={(e) => set('leadUid', e.target.value)}>
                <option value="">— Not set —</option>
                {coreMembers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select className="select" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Volunteer spots (optional)">
              <input className="input" type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="No limit" />
            </Field>
            <Field label="Participation credits" hint="Given to each volunteer once their attendance and hours are verified (0–10).">
              <input className="input" type="number" min={0} max={10} step={1} value={f.credits} onChange={(e) => set('credits', e.target.value)} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={f.openForRequests} onChange={(e) => set('openForRequests', e.target.checked)} />
              Members can request to join
            </label>
          </section>
          {error && <div className="callout bad" role="alert">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Create activity'}</button>
          {f.type === 'drive' || f.type === 'fundraiser' ? (
            <p className="small muted">After creating it, open the <b>EDPI</b> tab to fill in and lock the plan before the drive starts.</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
