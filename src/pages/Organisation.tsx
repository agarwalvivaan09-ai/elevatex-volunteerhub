import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Department, Position } from '../lib/types';
import { Avatar, Confirm, Field, Modal, useAction } from '../components/ui';
import { IconPlus } from '../components/icons';

export function OrganisationPage() {
  const { isAdmin } = useMe();
  const { departments, positions, users } = useData();
  const [editDept, setEditDept] = useState<Partial<Department> | null>(null);
  const [editPos, setEditPos] = useState<Partial<Position> | null>(null);
  const active = users.filter((u) => u.status === 'active');

  const groups: { dept: Department | null; positions: Position[] }[] = [
    ...departments.map((d) => ({ dept: d, positions: positions.filter((p) => p.departmentId === d.id) })),
    { dept: null, positions: positions.filter((p) => !p.departmentId || !departments.some((d) => d.id === p.departmentId)) },
  ];
  const unassigned = active.filter((u) => !u.positionId || !positions.some((p) => p.id === u.positionId));

  return (
    <>
      <div className="page-head">
        <div><h1>Structure & positions</h1><p>Departments, positions and who holds them.</p></div>
        {isAdmin && (
          <div className="page-actions">
            <button className="btn" onClick={() => setEditDept({ order: departments.length })}><IconPlus />Department</button>
            <button className="btn btn-primary" onClick={() => setEditPos({ order: positions.length, responsibilities: [], departmentId: null })}><IconPlus />Position</button>
          </div>
        )}
      </div>

      <div className="stack">
        {groups.filter((g) => g.dept || g.positions.length).map(({ dept, positions: ps }) => (
          <section className="card" key={dept?.id ?? 'none'}>
            <div className="card-head">
              <div><h2>{dept?.name ?? 'Across departments'}</h2>{dept?.description && <p>{dept.description}</p>}</div>
              {isAdmin && dept && <button className="btn btn-sm btn-ghost" onClick={() => setEditDept(dept)}>Edit</button>}
            </div>
            {ps.length === 0 ? (
              <div className="card-body small muted">No positions in this department yet.</div>
            ) : (
              <ul className="list">
                {ps.map((p) => {
                  const holders = active.filter((u) => u.positionId === p.id);
                  return (
                    <li key={p.id}>
                      <div className="spread" style={{ alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <h3>{p.title}</h3>
                          {p.responsibilities.length > 0 && <p className="small muted" style={{ marginTop: 2 }}>{p.responsibilities.join(' · ')}</p>}
                          <div className="row" style={{ marginTop: 8 }}>
                            {holders.length === 0 ? <span className="small muted">Vacant</span> : holders.map((u) => (
                              <Link key={u.id} to={`/members/${u.id}`} className="chip" style={{ textDecoration: 'none', paddingLeft: 3 }}>
                                <Avatar name={u.name} size="sm" />{u.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                        {isAdmin && <button className="btn btn-sm btn-ghost" onClick={() => setEditPos(p)}>Edit</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        {unassigned.length > 0 && (
          <section className="card">
            <div className="card-head"><div><h2>Without a position</h2><p>{isAdmin ? 'Assign positions from the Members page.' : 'Positions are assigned by the Admin.'}</p></div></div>
            <div className="card-body row">
              {unassigned.map((u) => <Link key={u.id} to={`/members/${u.id}`} className="chip" style={{ textDecoration: 'none' }}>{u.name}</Link>)}
            </div>
          </section>
        )}
      </div>

      {editDept && <DepartmentModal d={editDept} onClose={() => setEditDept(null)} />}
      {editPos && <PositionModal p={editPos} holders={editPos.id ? active.filter((u) => u.positionId === editPos.id).length : 0} onClose={() => setEditPos(null)} />}
    </>
  );
}

function DepartmentModal({ d, onClose }: { d: Partial<Department>; onClose: () => void }) {
  const { positions } = useData();
  const [f, setF] = useState({ name: d.name ?? '', description: d.description ?? '', order: d.order ?? 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run } = useAction();
  const inUse = d.id ? positions.filter((p) => p.departmentId === d.id).length : 0;
  return (
    <Modal title={d.id ? 'Edit department' : 'New department'} onClose={onClose}
      footer={<>
        {d.id && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={async () => { if (await run(() => api.saveDepartment({ id: d.id, name: f.name.trim(), description: f.description.trim(), order: Number(f.order) || 0 }), 'Department saved')) onClose(); }}>Save</button>
      </>}>
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label="Display order" hint="Lower numbers appear first."><input className="input" type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
      {confirmDelete && (
        <Confirm title="Delete department?" danger confirmLabel="Delete"
          message={inUse ? `${inUse} position(s) belong to it; they will move to “Across departments”.` : 'This cannot be undone.'}
          onClose={() => setConfirmDelete(false)} onConfirm={async () => { if (await run(() => api.deleteDepartment(d.id!), 'Department deleted')) onClose(); }} />
      )}
    </Modal>
  );
}

function PositionModal({ p, holders, onClose }: { p: Partial<Position>; holders: number; onClose: () => void }) {
  const { departments } = useData();
  const [f, setF] = useState({
    title: p.title ?? '',
    departmentId: p.departmentId ?? '',
    description: p.description ?? '',
    responsibilities: (p.responsibilities ?? []).join('\n'),
    order: p.order ?? 0,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { busy, run } = useAction();
  const save = () => run(() => api.savePosition({
    id: p.id,
    title: f.title.trim(),
    departmentId: f.departmentId || null,
    description: f.description.trim(),
    responsibilities: f.responsibilities.split('\n').map((s) => s.trim()).filter(Boolean),
    order: Number(f.order) || 0,
  }), 'Position saved');
  return (
    <Modal title={p.id ? 'Edit position' : 'New position'} onClose={onClose}
      footer={<>
        {p.id && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.title.trim()} onClick={async () => { if (await save()) onClose(); }}>Save</button>
      </>}>
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Head of Finance" autoFocus /></Field>
      <Field label="Department">
        <select className="select" value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
          <option value="">Across departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="Responsibilities" hint="One per line. Shown on the dashboard of everyone in this position.">
        <textarea className="textarea" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} />
      </Field>
      <Field label="Display order" hint="Lower numbers appear first."><input className="input" type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
      <p className="small muted">A position describes someone's job. Their <b>access level</b> (Member / Core Team) is set separately on the Members page.</p>
      {confirmDelete && (
        <Confirm title="Delete position?" danger confirmLabel="Delete"
          message={holders ? `${holders} member(s) hold this position and will show as “No position” until reassigned.` : 'This cannot be undone.'}
          onClose={() => setConfirmDelete(false)} onConfirm={async () => { if (await run(() => api.deletePosition(p.id!), 'Position deleted')) onClose(); }} />
      )}
    </Modal>
  );
}
