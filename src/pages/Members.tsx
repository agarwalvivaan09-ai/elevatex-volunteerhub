import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { normRole } from '../lib/access';
import { MAX_HODS } from '../lib/structure';
import type { Position, UserProfile } from '../lib/types';
import { Avatar, Confirm, Empty, Field, Modal, useAction } from '../components/ui';
import { PersonCard, RoleBadge, bySeniority, displayTitle } from '../components/people';
import { IconMail, IconPlus, IconUsers } from '../components/icons';

export { RoleBadge };

/** Core team: the full people list. Members: their contacts (the core team) only. */
export function MembersPage() {
  const { can } = useMe();
  return can.isCore ? <PeoplePage /> : <ContactsPage />;
}

function PeoplePage() {
  const { can, profile } = useMe();
  const { users, positionById, departmentById, departments, participations } = useData();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'directory' | 'table'>(can.canManagePeople ? 'table' : 'directory');
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);

  const creditsBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of participations) if (p.attendance === 'present') m.set(p.uid, (m.get(p.uid) ?? 0) + (p.credits ?? 0));
    return m;
  }, [participations]);

  const match = (u: UserProfile) => !q || `${u.name} ${u.email} ${displayTitle(u, positionById)} ${u.departmentId ? departmentById.get(u.departmentId)?.name ?? '' : ''}`.toLowerCase().includes(q.toLowerCase());
  const active = users.filter((u) => u.status === 'active').filter(match).sort(bySeniority);
  const tableRows = users.filter((u) => showRemoved || u.status === 'active').filter(match).sort(bySeniority);

  const leadership = active.filter((u) => ['chairman', 'vice_chairman', 'executive'].includes(normRole(u.role)));
  const board = active.filter((u) => normRole(u.role) === 'board');
  const heads = active.filter((u) => normRole(u.role) === 'hod');
  const members = active.filter((u) => normRole(u.role) === 'member');
  const card = (u: UserProfile) => <PersonCard key={u.id} u={u} positionById={positionById} departmentById={departmentById} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p>{users.filter((u) => u.status === 'active').length} active members. Email anyone directly from here.</p>
        </div>
        <div className="page-actions">
          {can.canManagePeople && <button className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus />Add person</button>}
        </div>
      </div>

      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="segmented" role="group" aria-label="View">
          <button className={view === 'directory' ? 'on' : ''} onClick={() => setView('directory')}>By role</button>
          <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>{can.canManagePeople ? 'Manage' : 'List'}</button>
        </div>
        <div className="row">
          {can.canManagePeople && view === 'table' && <label className="check small"><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />Show alumni &amp; removed</label>}
          <input className="input" style={{ width: 240 }} placeholder="Search name, position, department…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        </div>
      </div>

      {view === 'directory' ? (
        <div className="stack">
          {leadership.length > 0 && <section className="stack-sm"><div className="tier">Leadership</div><div className="people-grid">{leadership.map(card)}</div></section>}
          {board.length > 0 && <section className="stack-sm"><div className="tier">Board of Advisors</div><div className="people-grid">{board.map(card)}</div></section>}
          {heads.length > 0 && <section className="stack-sm"><div className="tier">Heads of Department</div><div className="people-grid">{heads.map(card)}</div></section>}
          {departments.map((d) => {
            const list = members.filter((u) => u.departmentId === d.id);
            return list.length ? <section key={d.id} className="stack-sm"><div className="tier"><Link to={`/departments/${d.id}`} style={{ color: 'inherit' }}>{d.name}</Link> · {list.length}</div><div className="people-grid">{list.map(card)}</div></section> : null;
          })}
          {members.filter((u) => !u.departmentId || !departmentById.has(u.departmentId)).length > 0 && (
            <section className="stack-sm"><div className="tier">Members without a department</div><div className="people-grid">{members.filter((u) => !u.departmentId || !departmentById.has(u.departmentId)).map(card)}</div></section>
          )}
          {active.length === 0 && <div className="card"><Empty title="No one matches" icon={<IconUsers />} /></div>}
        </div>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Person</th><th>Position</th><th>Department</th><th>Access</th>{can.isCore && <th className="num">Credits</th>}<th className="num">{can.canManagePeople ? 'Manage' : ''}</th></tr>
              </thead>
              <tbody>
                {tableRows.map((u) => {
                  const editable = can.canManagePeople && normRole(u.role) !== 'chairman' && (can.isChair || normRole(u.role) !== 'vice_chairman') && (can.isPeopleAdmin || u.id !== profile.id);
                  return (
                    <tr key={u.id} style={u.status === 'removed' ? { opacity: 0.55 } : undefined}>
                      <td><div className="person"><Avatar name={u.name} size="sm" /><div><Link to={`/members/${u.id}`}>{u.name}</Link><div className="tiny muted">{u.email}</div></div></div></td>
                      <td className="small">{displayTitle(u, positionById)}</td>
                      <td className="small">{u.departmentId ? departmentById.get(u.departmentId)?.name ?? '—' : <span className="muted">—</span>}</td>
                      <td><RoleBadge role={u.role} />{u.status === 'removed' && <span className="badge bad" style={{ marginLeft: 6 }}>Removed</span>}{u.status === 'alumni' && <span className="badge info" style={{ marginLeft: 6 }}>Alumni</span>}</td>
                      {can.isCore && <td className="num">{creditsBy.get(u.id) ?? 0}</td>}
                      <td className="num">
                        <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <a className="btn btn-sm" href={`mailto:${u.email}`} aria-label={`Email ${u.name}`}><IconMail /></a>
                          {editable && <button className="btn btn-sm" onClick={() => setEditing(u)}>Edit</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {adding && <PersonModal onClose={() => setAdding(false)} />}
      {editing && <PersonModal u={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** What members see instead of the people list: the core team, their points of contact. */
function ContactsPage() {
  const { profile } = useMe();
  const { users, positionById, departmentById } = useData();
  const core = users.filter((u) => u.status === 'active' && u.id !== profile.id).sort(bySeniority);
  const myHeads = core.filter((u) => normRole(u.role) === 'hod' && u.departmentId && u.departmentId === profile.departmentId);
  const leadership = core.filter((u) => ['chairman', 'vice_chairman', 'executive'].includes(normRole(u.role)));
  const board = core.filter((u) => normRole(u.role) === 'board');
  const heads = core.filter((u) => normRole(u.role) === 'hod' && !myHeads.includes(u));
  const card = (u: UserProfile) => <PersonCard key={u.id} u={u} positionById={positionById} departmentById={departmentById} />;
  return (
    <>
      <div className="page-head">
        <div><h1>Contacts</h1><p>The core team is your point of contact for anything at ElevateX. Tap the envelope to email them.</p></div>
      </div>
      <div className="stack">
        {myHeads.length > 0 && <section className="stack-sm"><div className="tier">Your department head{myHeads.length > 1 ? 's' : ''} — start here</div><div className="people-grid">{myHeads.map(card)}</div></section>}
        {leadership.length > 0 && <section className="stack-sm"><div className="tier">Leadership</div><div className="people-grid">{leadership.map(card)}</div></section>}
        {heads.length > 0 && <section className="stack-sm"><div className="tier">{myHeads.length ? 'Other heads of department' : 'Heads of department'}</div><div className="people-grid">{heads.map(card)}</div></section>}
        {board.length > 0 && <section className="stack-sm"><div className="tier">Board of Advisors</div><div className="people-grid">{board.map(card)}</div></section>}
        {core.length === 0 && <div className="card"><Empty title="No contacts yet" icon={<IconUsers />} /></div>}
      </div>
    </>
  );
}

/** Add or edit a person. The position decides their access; members also pick a department. */
export function PersonModal({ u, onClose, prefill, onAdded, memberOnly }: { u?: UserProfile; onClose: () => void; prefill?: { name: string; email: string; departmentId: string | null }; onAdded?: (uid: string) => Promise<void> | void; /** CEO, COO and Head of HR adding an applicant: position is fixed to Member. */ memberOnly?: boolean }) {
  const { can } = useMe();
  const { positions, departments, users } = useData();
  const [f, setF] = useState({
    name: u?.name ?? prefill?.name ?? '',
    email: u?.email ?? prefill?.email ?? '',
    positionId: u?.positionId && positions.some((p) => p.id === u.positionId) ? u.positionId : 'member',
    departmentId: u?.departmentId ?? prefill?.departmentId ?? '',
    title: u?.title ?? '',
    responsibilities: u?.responsibilities ?? '',
  });
  const [done, setDone] = useState<{ inviteSent: boolean } | null>(null);
  const [confirm, setConfirm] = useState<'remove' | 'restore' | 'alumni' | null>(null);
  const { busy, run } = useAction();

  const choosable = memberOnly ? positions.filter((p) => p.id === 'member') : positions.filter((p) => p.role !== 'chairman' && (p.role !== 'vice_chairman' || can.isChair));
  const pos: Position | undefined = positions.find((p) => p.id === f.positionId);
  const role = pos?.role ?? 'member';
  const needsDept = role === 'member';
  const departmentId = role === 'hod' ? pos?.departmentId ?? null : needsDept ? f.departmentId || null : f.departmentId || null;
  const hodCount = role === 'hod' && departmentId ? users.filter((x) => x.status === 'active' && x.id !== u?.id && normRole(x.role) === 'hod' && x.departmentId === departmentId).length : 0;
  const tooManyHods = hodCount >= MAX_HODS;
  const valid = f.name.trim() && /^\S+@\S+\.\S+$/.test(f.email.trim()) && pos && (!needsDept || f.departmentId) && !tooManyHods;

  async function save() {
    const data = { name: f.name, email: f.email, positionId: f.positionId, role, departmentId, title: f.title.trim() || null };
    if (u) {
      const ok = await run(() => api.updateMember(u.id, { name: f.name.trim(), positionId: f.positionId, role, departmentId, title: data.title, responsibilities: f.responsibilities.trim() || null }, u), 'Saved');
      if (ok) onClose();
    } else {
      await run(async () => { const r = await api.addMember(data); await onAdded?.(r.uid); setDone(r); });
    }
  }

  if (done)
    return (
      <Modal title="Person added" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <div className="callout"><b>{f.name}</b> can now sign in as <b>{pos?.title}</b>. {done.inviteSent ? <>An email has been sent to <b>{f.email}</b> to set their password (ask them to check spam).</> : <>The invitation email could not be sent — use “Resend invite” from Edit, or ask them to use “Forgot password”.</>}</div>
      </Modal>
    );

  return (
    <Modal title={u ? `Edit ${u.name}` : 'Add a person'} onClose={onClose}
      footer={<>
        {u && (u.status === 'active'
          ? <div className="row" style={{ marginRight: 'auto' }}><button className="btn btn-danger" onClick={() => setConfirm('remove')}>Remove access</button><button className="btn" onClick={() => setConfirm('alumni')}>Mark as alumni</button></div>
          : <button className="btn btn-ok" style={{ marginRight: 'auto' }} onClick={() => setConfirm('restore')}>{u.status === 'alumni' ? 'Make active again' : 'Restore access'}</button>)}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !valid} onClick={save}>{u ? 'Save' : busy ? 'Adding…' : 'Add and send invite'}</button>
      </>}>
      <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
      <Field label="Email" hint={u ? 'The sign-in email cannot be changed.' : 'They get a link at this address to set their password.'}><input className="input" type="email" value={f.email} disabled={!!u} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Position" hint="The position decides what they can access.">
        <select className="select" value={f.positionId} onChange={(e) => setF({ ...f, positionId: e.target.value })}>
          {choosable.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      {pos && <p className="small muted" style={{ marginTop: -6 }}>{ACCESS_TEXT[role]}</p>}
      {(needsDept || role !== 'hod') && (
        <Field label={needsDept ? 'Department' : 'Department (optional)'}>
          <select className="select" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">{needsDept ? 'Choose…' : 'None'}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      )}
      {tooManyHods && <div className="callout bad">This department already has {MAX_HODS} heads. Change one of them first.</div>}
      {!memberOnly && (
        <Field label="Display title (optional)" hint="Shown instead of the position, e.g. “Founder, Former CEO & Chairman” or “Former Head of Drives”.">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
      )}
      {u && <Field label="Individual responsibilities (optional)"><textarea className="textarea" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} /></Field>}
      {u && <div className="row small"><span className="muted">Sign-in email: {u.email}</span><button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => api.sendInvite(u.email), 'Password-setup email sent')}>Resend invite</button></div>}
      {u && confirm === 'remove' && (
        <Confirm title={`Remove ${u.name}?`} danger confirmLabel="Remove access" message="They lose access to everything immediately. Their history and credits are kept and you can restore them later. To keep their access to their own history, mark them as alumni instead."
          onClose={() => setConfirm(null)} onConfirm={async () => { if (await run(() => api.updateMember(u.id, { status: 'removed' }, u), 'Access removed')) onClose(); }} />
      )}
      {u && confirm === 'restore' && (
        <Confirm title={`Restore ${u.name}?`} confirmLabel="Restore" message="They can sign in again with the same account."
          onClose={() => setConfirm(null)} onConfirm={async () => { if (await run(() => api.updateMember(u.id, { status: 'active' }, u), 'Access restored')) onClose(); }} />
      )}
      {u && confirm === 'alumni' && (
        <Confirm title={`Mark ${u.name} as alumni?`} confirmLabel="Mark as alumni"
          message="For members who have graduated or moved on. They keep read-only access to their own credits and history and can still request certificates, but they no longer get notifications, tasks or meetings, and don't count as active."
          onClose={() => setConfirm(null)} onConfirm={async () => { if (await run(() => api.updateMember(u.id, { status: 'alumni' }, u), 'Marked as alumni')) onClose(); }} />
      )}
    </Modal>
  );
}

const ACCESS_TEXT: Record<string, string> = {
  chairman: 'Full access, including adding and removing people.',
  vice_chairman: 'Full access, including adding and removing people and assigning positions.',
  executive: 'Overall access to every department: drives, fundraisers, all meetings, tasks for anyone. Can add, promote and remove people (not the Chairman or Vice Chairman).',
  board: 'Full view; can add drives, fundraisers and tasks for anyone, and call board meetings.',
  hod: 'Runs their own department: department meetings and tasks for their members only. Approves drive proposals. The Head of HR can also add, promote and remove people.',
  member: 'Own dashboard, volunteering, proposing drives, tasks from their head.',
};
