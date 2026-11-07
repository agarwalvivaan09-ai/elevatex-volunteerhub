import { Link, useParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { normRole } from '../lib/access';
import { TASK_LABEL } from '../lib/types';
import { fmtShort } from '../lib/format';
import { ActivityRow } from '../components/activity';
import { PersonCard, bySeniority } from '../components/people';
import { Empty } from '../components/ui';
import { IconChevronLeft, IconMail, IconVideo } from '../components/icons';

export function DepartmentPage() {
  const { id } = useParams();
  const { can } = useMe();
  const { departmentById, users, positionById, activities, tasks, userById } = useData();
  const d = id ? departmentById.get(id) : undefined;
  if (!d) return <Empty title="Department not found" />;

  const people = users.filter((u) => u.status === 'active' && u.departmentId === d.id).sort(bySeniority);
  const heads = people.filter((u) => normRole(u.role) === 'hod');
  const members = people.filter((u) => normRole(u.role) !== 'hod');
  const emails = people.map((u) => u.email).join(',');
  const meetings = activities.filter((a) => a.type === 'meeting' && a.status === 'upcoming' && a.departmentId === d.id);
  const work = activities.filter((a) => a.type !== 'meeting' && a.status === 'upcoming' && a.departmentId === d.id);
  const canSeeTasks = can.isLeadership || (can.isHod && can.dept === d.id);
  const deptTasks = tasks.filter((t) => t.departmentId === d.id);

  return (
    <>
      <Link to="/organisation" className="backlink"><IconChevronLeft width={16} />Structure</Link>
      <div className="page-head">
        <div><h1>{d.name}</h1>{d.description && <p>{d.description}</p>}</div>
        <div className="page-actions">
          {emails && <a className="btn" href={`mailto:?bcc=${emails}&subject=${encodeURIComponent(`ElevateX ${d.name}`)}`}><IconMail />Email department</a>}
          {(can.isLeadership || (can.isHod && can.dept === d.id)) && <Link className="btn btn-primary" to="/activities/new?type=meeting"><IconVideo />Schedule meeting</Link>}
        </div>
      </div>

      <div className="layout-main-side">
        <div className="stack">
          <section className="stack-sm">
            <div className="tier">Head{heads.length === 1 ? '' : 's'} of Department</div>
            {heads.length === 0 ? <div className="card card-pad small muted">No head assigned yet.</div> : <div className="people-grid">{heads.map((u) => <PersonCard key={u.id} u={u} positionById={positionById} departmentById={departmentById} showDept={false} />)}</div>}
          </section>
          <section className="stack-sm">
            <div className="tier">Members · {members.length}</div>
            {members.length === 0 ? <div className="card card-pad small muted">No members yet.</div> : <div className="people-grid">{members.map((u) => <PersonCard key={u.id} u={u} positionById={positionById} departmentById={departmentById} showDept={false} />)}</div>}
          </section>
          {canSeeTasks && (
            <section className="card">
              <div className="card-head"><div><h2>Department tasks</h2><p>{deptTasks.filter((t) => t.status === 'done').length} of {deptTasks.length} done</p></div><Link to="/tasks" className="btn btn-sm">Open tasks</Link></div>
              {deptTasks.length === 0 ? <Empty title="No tasks yet" /> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {deptTasks.slice(0, 12).map((t) => {
                        const overdue = t.status !== 'done' && t.dueAt && t.dueAt.getTime() < Date.now();
                        return (
                          <tr key={t.id}>
                            <td>{t.title}{t.progressNote && <div className="tiny muted">“{t.progressNote}”</div>}</td>
                            <td className="small">{userById.get(t.assigneeUid)?.name}</td>
                            <td className="small" style={overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>{t.dueAt ? fmtShort(t.dueAt) : '—'}</td>
                            <td><span className={`badge ${t.status === 'done' ? 'ok' : overdue ? 'bad' : t.status === 'in_progress' ? 'info' : ''}`}>{overdue ? 'Overdue' : TASK_LABEL[t.status]}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Upcoming meetings</h2></div>
            {meetings.length === 0 ? <Empty title="None scheduled" /> : <ul className="list">{meetings.map((a) => <li key={a.id}><ActivityRow a={a} /></li>)}</ul>}
          </section>
          {work.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>{d.id === 'project-operations' ? 'Fundraisers' : d.id === 'drive-execution' ? 'Drives' : 'Activities'}</h2></div>
              <ul className="list">{work.map((a) => <li key={a.id}><ActivityRow a={a} /></li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
