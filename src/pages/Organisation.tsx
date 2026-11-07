import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { normRole } from '../lib/access';
import type { Department, Position } from '../lib/types';
import { ROLE_LABEL } from '../lib/types';
import { Confirm, Field, Modal, useAction } from '../components/ui';
import { PersonCard, bySeniority } from '../components/people';
import { IconPlus } from '../components/icons';

export function OrganisationPage() {
  const { can } = useMe();
  const { departments, positions, users, positionById, departmentById } = useData();
  const [editDept, setEditDept] = useState<Partial<Department> | null>(null);
  const [editPos, setEditPos] = useState<Partial<Position> | null>(null);
  const active = users.filter((u) => u.status === 'active').sort(bySeniority);
  const card = (u: (typeof users)[number]) => <PersonCard key={u.id} u={u} positionById={positionById} departmentById={departmentById} />;

  const leadership = active.filter((u) => ['chairman', 'vice_chairman', 'executive'].includes(normRole(u.role)));
  const board = active.filter((u) => normRole(u.role) === 'board');

  return (
    <>
      <div className="page-head">
        <div><h1>Structure</h1><p>How ElevateX is organised: leadership, the Board of Advisors and five departments.</p></div>
        {can.isPeopleAdmin && (
          <div className="page-actions">
            <button className="btn" onClick={() => setEditDept({ order: departments.length })}><IconPlus />Department</button>
            <button className="btn" onClick={() => setEditPos({ order: positions.length, responsibilities: [], departmentId: null, role: 'member' })}><IconPlus />Position</button>
          </div>
        )}
      </div>

      <div className="stack">
        <section className="stack-sm">
          <div className="tier">Leadership — Chairman, Vice Chairman, CEO, COO</div>
          {leadership.length ? <div className="people-grid">{leadership.map(card)}</div> : <div className="card card-pad small muted">Not assigned yet.</div>}
        </section>
        <section className="stack-sm">
          <div className="tier">Board of Advisors</div>
          {board.length ? <div className="people-grid">{board.map(card)}</div> : <div className="card card-pad small muted">No advisors added yet.</div>}
        </section>

        <div className="tier">Departments</div>
        <div className="grid-2">
          {departments.map((d) => {
            const heads = active.filter((u) => normRole(u.role) === 'hod' && u.departmentId === d.id);
            const members = active.filter((u) => normRole(u.role) !== 'hod' && u.departmentId === d.id);
            const headTitle = positions.find((p) => p.role === 'hod' && p.departmentId === d.id)?.title ?? 'Head';
            return (
              <section className="card" key={d.id}>
                <div className="card-head">
                  <div><h2><Link to={`/departments/${d.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{d.name}</Link></h2>{d.description && <p>{d.description}</p>}</div>
                  {can.isPeopleAdmin && <button className="btn btn-sm btn-ghost" onClick={() => setEditDept(d)}>Edit</button>}
                </div>
                <div className="card-body stack-sm">
                  <div className="small muted">{headTitle}{heads.length > 1 ? 's' : ''}</div>
                  {heads.length ? heads.map((u) => <Link key={u.id} to={`/members/${u.id}`} className="chip" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>{u.name}</Link>) : <span className="small muted">Vacant</span>}
                  <div className="spread small" style={{ marginTop: 6 }}>
                    <span className="muted">{members.length} member{members.length === 1 ? '' : 's'}</span>
                    <Link to={`/departments/${d.id}`}>Open department →</Link>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <section className="card">
          <div className="card-head"><div><h2>Positions</h2><p>Each position grants an access level. {can.isPeopleAdmin ? 'Assign them from People.' : ''}</p></div></div>
          <ul className="list">
            {positions.map((p) => (
              <li key={p.id} className="spread">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h3>{p.title} <span className="badge plain" style={{ marginLeft: 6 }}>{ROLE_LABEL[p.role]}</span>{p.departmentId && <span className="small muted"> · {departmentById.get(p.departmentId)?.name}</span>}</h3>
                  {p.responsibilities.length > 0 && <p className="small muted">{p.responsibilities.join(' · ')}</p>}
                </div>
                {can.isPeopleAdmin && p.role !== 'chairman' && <button className="btn btn-sm btn-ghost" onClick={() => setEditPos(p)}>Edit</button>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {editDept && <DepartmentModal d={editDept} onClose={() => setEditDept(null)} />}
      {editPos && <PositionModal p={editPos} holders={editPos.id ? active.filter((u) => u.positionId === editPos.id).length : 0} onClose={() => setEditPos(null)} />}
    </>
  );
}

function DepartmentModal({ d, onClose }: { d: Partial<Department>; onClose: () => void }) {
  const [f, setF] = useState({ name: d.name ?? '', description: d.description ?? '', order: d.order ?? 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run } = useAction();
  return (
    <Modal title={d.id ? 'Edit department' : 'New department'} onClose={onClose}
      footer={<>
        {d.id && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={async () => { if (await run(() => api.saveDepartment({ id: d.id, name: f.name.trim(), description: f.description.trim(), order: Number(f.order) || 0 }), 'Saved')) onClose(); }}>Save</button>
      </>}>
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
      <Field label="What this department does"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Display order"><input className="input" type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
      {confirmDelete && <Confirm title="Delete department?" danger confirmLabel="Delete" message="Members and heads in it will show without a department until reassigned." onClose={() => setConfirmDelete(false)} onConfirm={async () => { if (await run(() => api.deleteDepartment(d.id!), 'Deleted')) onClose(); }} />}
    </Modal>
  );
}

function PositionModal({ p, holders, onClose }: { p: Partial<Position>; holders: number; onClose: () => void }) {
  const { can } = useMe();
  const { departments } = useData();
  const [f, setF] = useState({ title: p.title ?? '', role: p.role ?? 'member', departmentId: p.departmentId ?? '', responsibilities: (p.responsibilities ?? []).join('\n'), order: p.order ?? 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run } = useAction();
  const roles: Position['role'][] = ['executive', 'board', 'hod', 'member', ...(can.isChair ? (['vice_chairman'] as Position['role'][]) : [])];
  const valid = f.title.trim() && (f.role !== 'hod' || f.departmentId);
  return (
    <Modal title={p.id ? 'Edit position' : 'New position'} onClose={onClose}
      footer={<>
        {p.id && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !valid} onClick={async () => {
          if (await run(() => api.savePosition({ id: p.id, title: f.title.trim(), role: f.role, departmentId: f.role === 'hod' ? f.departmentId : null, description: '', responsibilities: f.responsibilities.split('\n').map((s) => s.trim()).filter(Boolean), order: Number(f.order) || 0 }), 'Saved')) onClose();
        }}>Save</button>
      </>}>
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
      <Field label="Access level" hint="Changing this does not update people who already hold the position — re-save them from People.">
        <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Position['role'] })}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>
      {f.role === 'hod' && (
        <Field label="Heads which department">
          <select className="select" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">Choose…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Responsibilities" hint="One per line."><textarea className="textarea" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} /></Field>
      <Field label="Display order"><input className="input" type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
      {confirmDelete && <Confirm title="Delete position?" danger confirmLabel="Delete" message={holders ? `${holders} people hold this position; they keep their access level but show no position until reassigned.` : 'This cannot be undone.'} onClose={() => setConfirmDelete(false)} onConfirm={async () => { if (await run(() => api.deletePosition(p.id!), 'Deleted')) onClose(); }} />}
    </Modal>
  );
}
