import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { DEPT } from '../lib/access';
import type { Activity, ActivityType, UserProfile } from '../lib/types';
import { TYPE_LABEL } from '../lib/types';
import { fmtDate, fmtHours } from '../lib/format';
import { Avatar, Empty, Field, useAction } from '../components/ui';

/**
 * Chairman, Vice Chairman, CEO and COO: record drives and events that already happened,
 * with verified hours for everyone who took part. Nobody is notified.
 */
export function RecordPage() {
  const { can } = useMe();
  const [tab, setTab] = useState<'new' | 'hours'>('new');
  if (!can.canRecordPast) return <Navigate to="/" replace />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Record past activity</h1>
          <p>Add drives and events that already happened, and the hours people gave. Hours are saved as verified straight away. Nobody is notified.</p>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>A past drive or event</button>
        <button className={tab === 'hours' ? 'on' : ''} onClick={() => setTab('hours')}>Add hours to an existing one</button>
      </div>
      {tab === 'new' ? <NewPast /> : <AddHours />}
    </>
  );
}

const hoursBetween = (date: string, start: string, end: string) => {
  if (!date || !start || !end) return 0;
  const h = (new Date(`${date}T${end}`).getTime() - new Date(`${date}T${start}`).getTime()) / 3600000;
  return h > 0 ? Math.round(h * 4) / 4 : 0;
};

function NewPast() {
  const { profile } = useMe();
  const { users } = useData();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({
    type: 'drive' as Exclude<ActivityType, 'meeting'>,
    title: '',
    date: yesterday,
    start: '10:00',
    end: '13:00',
    venue: '',
    mapUrl: '',
    description: '',
    credits: '1',
    leadUid: profile.id,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const defaultHours = hoursBetween(f.date, f.start, f.end) || 2;
  const [picked, setPicked] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const startAt = new Date(`${f.date}T${f.start}`);
    const endAt = new Date(`${f.date}T${f.end}`);
    if (Number.isNaN(startAt.getTime()) || endAt <= startAt) return setError('Check the date and times: the end must be after the start.');
    if (startAt.getTime() > Date.now()) return setError('This is for activities that already happened. For future ones, use “New drive” or “New fundraiser”.');
    if (!f.title.trim() || !f.venue.trim()) return setError('Add a title and the venue.');
    if (f.mapUrl && !/^https:\/\//i.test(f.mapUrl.trim())) return setError('The maps link must start with https://');
    const bad = [...picked.values()].some((h) => !(h >= 0.5 && h <= 24));
    if (bad) return setError('Every hours value must be between 0.5 and 24.');
    const attendees = [...picked.entries()].map(([id, hours]) => ({ user: users.find((u) => u.id === id)!, hours }));
    let id = '';
    const ok = await run(async () => {
      id = await api.recordPastActivity(
        {
          title: f.title.trim(),
          type: f.type,
          status: 'completed',
          startAt,
          endAt,
          mode: 'in_person',
          venue: f.venue.trim(),
          mapUrl: f.mapUrl.trim() || null,
          meetingUrl: null,
          audience: 'all',
          relatedActivityId: null,
          description: f.description.trim(),
          instructions: '',
          requirements: '',
          links: [],
          capacity: null,
          leadUid: f.leadUid,
          departmentId: f.type === 'drive' ? DEPT.driveExec : f.type === 'fundraiser' ? DEPT.projectOps : null,
          credits: Math.min(10, Math.max(0, Number(f.credits) || 0)),
          openForRequests: false,
        },
        attendees,
        users,
      );
    }, `Recorded with hours for ${attendees.length} ${attendees.length === 1 ? "person" : "people"}`);
    if (ok) navigate(`/activities/${id}`);
  }

  return (
    <form onSubmit={submit} className="layout-main-side">
      <div className="stack">
        <section className="card card-pad">
          <div className="form-grid">
            <Field label="What was it?">
              <select className="select" value={f.type} onChange={(e) => set('type', e.target.value as typeof f.type)}>
                <option value="drive">Drive</option>
                <option value="fundraiser">Fundraiser</option>
                <option value="event">Event</option>
              </select>
            </Field>
            <Field label="Title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Blanket Drive, Sealdah" /></Field>
            <Field label="Date"><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Field label="Start"><input className="input" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
              <Field label="End"><input className="input" type="time" value={f.end} onChange={(e) => set('end', e.target.value)} /></Field>
            </div>
            <Field label="Venue"><input className="input" value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Address" /></Field>
            <Field label="Google Maps link (optional)"><input className="input" value={f.mapUrl} onChange={(e) => set('mapUrl', e.target.value)} placeholder="https://maps.app.goo.gl/…" /></Field>
            <Field label="What happened (optional)" className="full"><textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 80 blankets handed out near Sealdah station." /></Field>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><div><h2>Who took part</h2><p>Tick everyone who was there. Hours start at the activity's length ({fmtHours(defaultHours)}); change any of them.</p></div></div>
          <AttendeePicker users={users} picked={picked} setPicked={setPicked} defaultHours={defaultHours} />
        </section>
      </div>
      <div className="stack">
        <section className="card card-pad stack">
          <h2>Details</h2>
          <Field label="Organiser">
            <select className="select" value={f.leadUid} onChange={(e) => set('leadUid', e.target.value)}>
              {users.filter((u) => u.status === 'active').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Credits per person" hint="0–10"><input className="input" type="number" min={0} max={10} value={f.credits} onChange={(e) => set('credits', e.target.value)} /></Field>
          <div className="callout"><b>{picked.size}</b> {picked.size === 1 ? 'person' : 'people'} · <b>{fmtHours([...picked.values()].reduce((s, h) => s + h, 0))}</b> in total</div>
        </section>
        {f.type === 'drive' && <p className="small muted">After saving, open the drive's <b>EDPI score</b> tab to record its plan and results.</p>}
        {error && <div className="callout bad" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save past activity'}</button>
      </div>
    </form>
  );
}

function AddHours() {
  const { activities, participations, users, userById } = useData();
  const { busy, run } = useAction();
  const past = activities.filter((a) => a.type !== 'meeting' && (a.status === 'completed' || a.startAt.getTime() < Date.now())).sort((x, y) => y.startAt.getTime() - x.startAt.getTime());
  const [id, setId] = useState('');
  const a: Activity | undefined = past.find((x) => x.id === id);
  const existing = useMemo(() => participations.filter((p) => p.activityId === id && p.hoursStatus === 'verified'), [participations, id]);
  const defaultHours = a?.endAt ? Math.max(0.5, Math.round(((a.endAt.getTime() - a.startAt.getTime()) / 3600000) * 4) / 4) : 2;
  const [picked, setPicked] = useState<Map<string, number>>(new Map());

  return (
    <div className="stack">
      <section className="card card-pad">
        <Field label="Activity">
          <select className="select" value={id} onChange={(e) => { setId(e.target.value); setPicked(new Map()); }}>
            <option value="">Choose a past drive or event…</option>
            {past.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.startAt)} · {TYPE_LABEL[x.type]} · {x.title}</option>)}
          </select>
        </Field>
      </section>
      {a && (
        <>
          <section className="card">
            <div className="card-head"><div><h2>Already recorded</h2><p>{existing.length} people with verified hours. To change someone's hours, use the activity's Attendance tab.</p></div><Link className="btn btn-sm" to={`/activities/${a.id}`}>Open activity</Link></div>
            {existing.length === 0 ? <Empty title="No verified hours yet" /> : (
              <div className="card-body row">{existing.map((p) => <span key={p.id} className="chip">{userById.get(p.uid)?.name ?? p.userName} · {fmtHours(p.verifiedHours ?? 0)}</span>)}</div>
            )}
          </section>
          <section className="card">
            <div className="card-head"><div><h2>Add people and hours</h2><p>Saved as verified, with {a.credits} credit{a.credits === 1 ? '' : 's'} each.</p></div></div>
            <AttendeePicker users={users.filter((u) => !existing.some((p) => p.uid === u.id))} picked={picked} setPicked={setPicked} defaultHours={defaultHours} />
            <div className="card-body">
              <button className="btn btn-primary" disabled={busy || picked.size === 0 || [...picked.values()].some((h) => !(h >= 0.5 && h <= 24))}
                onClick={async () => {
                  const list = [...picked.entries()].map(([uid, hours]) => ({ user: users.find((u) => u.id === uid)!, hours }));
                  if (await run(() => api.addPastHours(a, list), `Hours added for ${list.length} ${list.length === 1 ? "person" : "people"}`)) setPicked(new Map());
                }}>
                Save hours for {picked.size} {picked.size === 1 ? 'person' : 'people'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Searchable list of members with a tick box and an hours box each. */
function AttendeePicker({ users, picked, setPicked, defaultHours }: { users: UserProfile[]; picked: Map<string, number>; setPicked: (m: Map<string, number>) => void; defaultHours: number }) {
  const { departments, departmentById } = useData();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const list = users
    .filter((u) => u.status === 'active')
    .filter((u) => dept === 'all' || u.departmentId === dept)
    .filter((u) => !q || u.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (u: UserProfile) => {
    const m = new Map(picked);
    if (m.has(u.id)) m.delete(u.id);
    else m.set(u.id, defaultHours);
    setPicked(m);
  };
  const setHours = (id: string, h: number) => { const m = new Map(picked); m.set(id, h); setPicked(m); };
  const allShown = list.length > 0 && list.every((u) => picked.has(u.id));

  return (
    <div>
      <div className="card-body row" style={{ borderBottom: '1px solid var(--border)' }}>
        <input className="input" style={{ flex: '1 1 180px' }} placeholder="Search names…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        <select className="select" style={{ flex: '1 1 160px' }} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="all">Everyone</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => {
          const m = new Map(picked);
          if (allShown) list.forEach((u) => m.delete(u.id));
          else list.forEach((u) => { if (!m.has(u.id)) m.set(u.id, defaultHours); });
          setPicked(m);
        }}>{allShown ? 'Untick all shown' : `Tick all shown (${list.length})`}</button>
      </div>
      {list.length === 0 ? <Empty title="No one matches" /> : (
        <ul className="list" style={{ maxHeight: 460, overflowY: 'auto' }}>
          {list.map((u) => {
            const on = picked.has(u.id);
            return (
              <li key={u.id} className="spread" style={{ flexWrap: 'nowrap', padding: '10px 20px' }}>
                <label className="check" style={{ flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(u)} />
                  <Avatar name={u.name} size="sm" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}<span className="tiny muted" style={{ display: 'block' }}>{u.departmentId ? departmentById.get(u.departmentId)?.name : '—'}</span></span>
                </label>
                {on && (
                  <input className="input" style={{ width: 84 }} type="number" min={0.5} max={24} step={0.25} value={picked.get(u.id)}
                    onChange={(e) => setHours(u.id, Number(e.target.value))} aria-label={`Hours for ${u.name}`} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
