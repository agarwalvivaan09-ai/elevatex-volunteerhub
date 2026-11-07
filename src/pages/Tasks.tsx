import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import type { Task, TaskStatus } from '../lib/types';
import { TASK_LABEL } from '../lib/types';
import { fmtDateTime, relativeDay, toLocalInput } from '../lib/format';
import { Avatar, Confirm, Empty, Field, Modal, useAction } from '../components/ui';
import { IconPlus, IconTask } from '../components/icons';

type View = 'mine' | 'assigned' | 'all';

export function TasksPage() {
  const { profile, can } = useMe();
  const { tasks, userById, departments } = useData();
  const [view, setView] = useState<View>('mine');
  const [dept, setDept] = useState('all');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Task | null>(null);

  const list = useMemo(() => {
    let l = tasks;
    if (view === 'mine') l = l.filter((t) => t.assigneeUid === profile.id);
    else if (view === 'assigned') l = l.filter((t) => t.createdBy === profile.id);
    if (dept !== 'all') l = l.filter((t) => t.departmentId === dept);
    return l;
  }, [tasks, view, dept, profile.id]);

  const cols: TaskStatus[] = ['todo', 'in_progress', 'done'];
  const views: [View, string][] = [['mine', 'My tasks'], ...(can.canAssignTasks ? ([['assigned', 'Assigned by me'], ['all', can.isLeadership ? 'All tasks' : 'My department']] as [View, string][]) : [])];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p>{can.isLeadership ? 'Assign tasks to anyone and track progress.' : can.isHod ? 'Assign tasks to members of your department and track progress.' : 'Tasks from your department head. Update the status as you go.'}</p>
        </div>
        {can.canAssignTasks && <button className="btn btn-primary" onClick={() => setCreating(true)}><IconPlus />Assign task</button>}
      </div>

      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="segmented" role="group" aria-label="Which tasks">
          {views.map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {can.isLeadership && view !== 'mine' && (
          <select className="select" style={{ width: 200 }} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty title={view === 'mine' ? 'No tasks for you right now' : 'No tasks yet'} icon={<IconTask />}>{can.canAssignTasks ? 'Use “Assign task” to give someone work.' : 'When your department head assigns you something, it appears here and you get a notification.'}</Empty></div>
      ) : (
        <div className="kanban">
          {cols.map((c) => {
            const items = list.filter((t) => t.status === c);
            return (
              <div className="col" key={c}>
                <h3>{TASK_LABEL[c]}<span>{items.length}</span></h3>
                {items.map((t) => {
                  const assignee = userById.get(t.assigneeUid);
                  const overdue = t.status !== 'done' && t.dueAt && t.dueAt.getTime() < Date.now();
                  return (
                    <button key={t.id} className={`task-card ${overdue ? 'overdue' : ''}`} onClick={() => setOpen(t)}>
                      <b>{t.title}</b>
                      {t.progressNote && <span className="small muted">“{t.progressNote}”</span>}
                      <div className="spread small">
                        <span className="row" style={{ gap: 6 }}><Avatar name={assignee?.name ?? '?'} size="sm" />{assignee?.name.split(' ')[0]}</span>
                        {t.dueAt && <span className={overdue ? '' : 'muted'} style={overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{overdue ? `Overdue · ${relativeDay(t.dueAt).toLowerCase()}` : `Due ${relativeDay(t.dueAt).replace(/^In /, 'in ')}`}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {creating && <TaskModal onClose={() => setCreating(false)} />}
      {open && <TaskDetail t={tasks.find((x) => x.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </>
  );
}

function TaskModal({ t, onClose }: { t?: Task; onClose: () => void }) {
  const { can, profile } = useMe();
  const { users, departments, departmentById } = useData();
  const assignable = users.filter((u) => u.status === 'active' && u.id !== profile.id && can.canAssignTaskTo(u));
  const [f, setF] = useState({
    title: t?.title ?? '',
    description: t?.description ?? '',
    assigneeUid: t?.assigneeUid ?? '',
    dueAt: toLocalInput(t?.dueAt ?? null),
  });
  const { busy, run } = useAction();
  const assignee = users.find((u) => u.id === f.assigneeUid);
  const departmentId = can.isLeadership ? assignee?.departmentId ?? null : can.dept;
  const save = () => run(async () => {
    const data = { title: f.title, description: f.description, assigneeUid: f.assigneeUid, departmentId, dueAt: f.dueAt ? new Date(f.dueAt) : null };
    if (t) await api.editTask(t, data);
    else await api.createTask(data);
    onClose();
  }, t ? 'Task updated' : 'Task assigned — they have been notified');

  // Group people by department for the picker.
  const groups = [...departments.map((d) => ({ name: d.name, people: assignable.filter((u) => u.departmentId === d.id) })), { name: 'No department', people: assignable.filter((u) => !u.departmentId || !departmentById.has(u.departmentId)) }].filter((g) => g.people.length);

  return (
    <Modal title={t ? 'Edit task' : 'Assign a task'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.title.trim() || !f.assigneeUid} onClick={save}>{t ? 'Save' : 'Assign'}</button></>}>
      <Field label="Task"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Film and edit the blanket drive reel" autoFocus /></Field>
      <Field label="Details (optional)"><textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What exactly needs to be done, links, expectations" /></Field>
      <div className="form-grid">
        <Field label="Assign to" hint={can.isLeadership ? undefined : 'Members of your department only.'}>
          <select className="select" value={f.assigneeUid} onChange={(e) => setF({ ...f, assigneeUid: e.target.value })}>
            <option value="">Choose…</option>
            {groups.map((g) => <optgroup key={g.name} label={g.name}>{g.people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Due (optional)"><input className="input" type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
      </div>
      {assignable.length === 0 && <div className="callout warn">No one to assign to yet. Members need to be placed in your department first.</div>}
    </Modal>
  );
}

function TaskDetail({ t, onClose }: { t: Task; onClose: () => void }) {
  const { profile, can } = useMe();
  const { userById, departmentById } = useData();
  const [status, setStatus] = useState<TaskStatus>(t.status);
  const [note, setNote] = useState(t.progressNote ?? '');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { busy, run } = useAction();
  const isAssignee = t.assigneeUid === profile.id;
  const canEdit = t.createdBy === profile.id || can.isLeadership || (can.isHod && t.departmentId === can.dept);
  const assignee = userById.get(t.assigneeUid);
  const creator = userById.get(t.createdBy);

  if (editing) return <TaskModal t={t} onClose={onClose} />;
  return (
    <Modal title={t.title} onClose={onClose}
      footer={<>
        {canEdit && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setDeleting(true)}>Delete</button>}
        {canEdit && <button className="btn" onClick={() => setEditing(true)}>Edit</button>}
        {(isAssignee || canEdit) && <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await run(() => api.updateTaskProgress(t, status, note), 'Updated')) onClose(); }}>Save progress</button>}
      </>}>
      {t.description && <p className="prose">{t.description}</p>}
      <dl className="detail-list">
        <dt>Assigned to</dt><dd>{assignee ? <Link to={`/members/${assignee.id}`}>{assignee.name}</Link> : '—'}</dd>
        <dt>Assigned by</dt><dd>{creator?.name ?? '—'}{creator && <> · <a href={`mailto:${creator.email}`}>email</a></>}</dd>
        {t.departmentId && (<><dt>Department</dt><dd>{departmentById.get(t.departmentId)?.name}</dd></>)}
        <dt>Due</dt><dd>{t.dueAt ? fmtDateTime(t.dueAt) : 'No deadline'}</dd>
        {t.completedAt && (<><dt>Completed</dt><dd>{fmtDateTime(t.completedAt)}</dd></>)}
      </dl>
      {(isAssignee || canEdit) ? (
        <>
          <Field label="Status">
            <div className="segmented" role="group">
              {(['todo', 'in_progress', 'done'] as TaskStatus[]).map((s) => <button key={s} type="button" className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{TASK_LABEL[s]}</button>)}
            </div>
          </Field>
          <Field label="Progress note"><input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Draft shared on WhatsApp, final by Friday" /></Field>
        </>
      ) : <p className="small muted">Status: {TASK_LABEL[t.status]}{t.progressNote ? ` — “${t.progressNote}”` : ''}</p>}
      {deleting && <Confirm title="Delete task?" danger confirmLabel="Delete" message="This can't be undone." onClose={() => setDeleting(false)} onConfirm={async () => { if (await run(() => api.deleteTask(t), 'Task deleted')) onClose(); }} />}
    </Modal>
  );
}
