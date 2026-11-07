import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Role, UserProfile } from '../lib/types';
import { ROLE_LABEL } from '../lib/types';
import { fmtHours } from '../lib/format';
import { Avatar, Confirm, Empty, Field, Modal, useAction } from '../components/ui';
import { IconPlus, IconUsers } from '../components/icons';

const roleTone: Record<Role, string> = { admin: 'brown', core: 'brand', member: '' };
export const RoleBadge = ({ role }: { role: Role }) => <span className={`badge plain ${roleTone[role]}`}>{ROLE_LABEL[role]}</span>;

export function MembersPage() {
  const { isAdmin, isCore } = useMe();
  const { users, positionById, departmentById, participations } = useData();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);

  const hoursBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of participations) if (p.hoursStatus === 'verified') m.set(p.uid, (m.get(p.uid) ?? 0) + (p.verifiedHours ?? 0));
    return m;
  }, [participations]);

  const list = users
    .filter((u) => (showRemoved ? true : u.status === 'active'))
    .filter((u) => role === 'all' || u.role === role)
    .filter((u) => {
      if (!q) return true;
      const pos = u.positionId ? positionById.get(u.positionId)?.title ?? '' : '';
      return `${u.name} ${u.email} ${pos}`.toLowerCase().includes(q.toLowerCase());
    });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isCore ? 'Members' : 'Directory'}</h1>
          <p>{users.filter((u) => u.status === 'active').length} active members of ElevateX.</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus />Add member</button>}
      </div>

      <div className="spread" style={{ marginBottom: 14 }}>
        <div className="segmented" role="group" aria-label="Filter by access level">
          {(['all', 'admin', 'core', 'member'] as const).map((r) => (
            <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r === 'all' ? 'Everyone' : ROLE_LABEL[r]}</button>
          ))}
        </div>
        <div className="row">
          {isAdmin && <label className="check small"><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />Show removed</label>}
          <input className="input" style={{ width: 240 }} placeholder="Search name, email or position…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        </div>
      </div>

      <section className="card">
        {list.length === 0 ? (
          <Empty title="No members match" icon={<IconUsers />} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th><th>Position</th><th>Access</th>
                  {isCore && <th className="num">Verified hours</th>}
                  {isAdmin && <th className="num">Manage</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((u) => {
                  const pos = u.positionId ? positionById.get(u.positionId) : undefined;
                  const dept = pos?.departmentId ? departmentById.get(pos.departmentId)?.name : undefined;
                  return (
                    <tr key={u.id} style={u.status === 'removed' ? { opacity: 0.55 } : undefined}>
                      <td>
                        <div className="person">
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <Link to={`/members/${u.id}`}>{u.name}</Link>
                            <div className="tiny muted">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="small">{pos?.title ?? <span className="muted">Not assigned</span>}{dept && <div className="tiny muted">{dept}</div>}</td>
                      <td><RoleBadge role={u.role} />{u.status === 'removed' && <span className="badge bad" style={{ marginLeft: 6 }}>Removed</span>}</td>
                      {isCore && <td className="num">{fmtHours(hoursBy.get(u.id) ?? 0)}</td>}
                      {isAdmin && <td className="num">{u.role !== 'admin' ? <button className="btn btn-sm" onClick={() => setEditing(u)}>Edit</button> : <span className="tiny muted">You</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && <AddMemberModal onClose={() => setAdding(false)} />}
      {editing && <EditMemberModal u={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PositionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { positions, departmentById } = useData();
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— No position —</option>
      {positions.map((p) => (
        <option key={p.id} value={p.id}>{p.title}{p.departmentId ? ` (${departmentById.get(p.departmentId)?.name ?? ''})` : ''}</option>
      ))}
    </select>
  );
}

function AddMemberModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', role: 'member' as 'member' | 'core', positionId: 'general-member' });
  const [done, setDone] = useState<{ email: string; inviteSent: boolean } | null>(null);
  const { busy, run } = useAction();
  const valid = f.name.trim() && /^\S+@\S+\.\S+$/.test(f.email.trim());

  if (done)
    return (
      <Modal title="Member added" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <div className="callout">
          <b>{f.name}</b> can now sign in.{' '}
          {done.inviteSent
            ? <>An email has been sent to <b>{done.email}</b> with a link to set their password. Ask them to check spam if it doesn't arrive.</>
            : <>The invitation email could not be sent. Use “Resend invite” from their profile, or ask them to use “Forgot password” on the sign-in page.</>}
        </div>
      </Modal>
    );

  return (
    <Modal
      title="Add member"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !valid}
            onClick={() => run(async () => {
              const r = await api.addMember({ ...f, positionId: f.positionId || null });
              setDone({ email: f.email.trim().toLowerCase(), inviteSent: r.inviteSent });
            })}>
            {busy ? 'Adding…' : 'Add and send invite'}
          </button>
        </>
      }
    >
      <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
      <Field label="Email" hint="They'll get a link at this address to set their own password."><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Position"><PositionSelect value={f.positionId} onChange={(v) => setF({ ...f, positionId: v })} /></Field>
      <Field label="Access level">
        <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'member' | 'core' })}>
          <option value="member">Member — own dashboard, request to join, log hours</option>
          <option value="core">Core Team — also manages activities, requests, attendance</option>
        </select>
      </Field>
    </Modal>
  );
}

export function EditMemberModal({ u, onClose }: { u: UserProfile; onClose: () => void }) {
  const [f, setF] = useState({ name: u.name, positionId: u.positionId ?? '', role: u.role as 'member' | 'core', responsibilities: u.responsibilities ?? '' });
  const [confirm, setConfirm] = useState<'remove' | 'restore' | null>(null);
  const { busy, run } = useAction();

  const save = () => run(async () => {
    await api.updateMember(u.id, { name: f.name.trim(), positionId: f.positionId || null, role: f.role, responsibilities: f.responsibilities.trim() || null });
    onClose();
  }, 'Member updated');

  return (
    <Modal
      title={`Edit ${u.name}`}
      onClose={onClose}
      footer={
        <>
          {u.status === 'active'
            ? <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirm('remove')}>Remove access</button>
            : <button className="btn btn-ok" style={{ marginRight: 'auto' }} onClick={() => setConfirm('restore')}>Restore access</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={save}>Save</button>
        </>
      }
    >
      <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Position"><PositionSelect value={f.positionId} onChange={(v) => setF({ ...f, positionId: v })} /></Field>
      <Field label="Access level" hint="Core Team can create activities, handle requests, attendance, hours and EDPI. Only you can manage members and positions.">
        <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'member' | 'core' })}>
          <option value="member">Member</option>
          <option value="core">Core Team</option>
        </select>
      </Field>
      <Field label="Individual responsibilities (optional)" hint="Shown on their dashboard alongside their position's responsibilities.">
        <textarea className="textarea" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} />
      </Field>
      <div className="row small">
        <span className="muted">Sign-in email: {u.email}</span>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(() => api.sendInvite(u.email), 'Password-setup email sent')}>Resend invite</button>
      </div>
      {confirm === 'remove' && (
        <Confirm title={`Remove ${u.name}?`} danger confirmLabel="Remove access"
          message="They will be signed out of everything and can't see any ElevateX data. Their history and verified hours are kept, and you can restore access later."
          onClose={() => setConfirm(null)} onConfirm={async () => { if (await run(() => api.updateMember(u.id, { status: 'removed' }), 'Access removed')) onClose(); }} />
      )}
      {confirm === 'restore' && (
        <Confirm title={`Restore ${u.name}?`} confirmLabel="Restore access" message="They will be able to sign in again with the same account."
          onClose={() => setConfirm(null)} onConfirm={async () => { if (await run(() => api.updateMember(u.id, { status: 'active' }), 'Access restored')) onClose(); }} />
      )}
    </Modal>
  );
}
