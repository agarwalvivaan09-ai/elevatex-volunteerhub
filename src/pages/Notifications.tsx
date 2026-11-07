import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import * as api from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { Empty, useAction } from '../components/ui';
import { IconBell, IconCalendar, IconChat, IconInbox, IconTask, IconUsers, IconVideo } from '../components/icons';

const ICONS: Record<string, JSX.Element> = {
  drive: <IconCalendar />, fundraiser: <IconCalendar />, event: <IconCalendar />, meeting: <IconVideo />, cancelled: <IconCalendar />,
  proposal: <IconInbox />, task: <IconTask />, volunteer: <IconUsers />, feedback: <IconChat />,
};

export function NotificationsPage() {
  const { notifications } = useData();
  const { busy, run } = useAction();
  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);

  return (
    <>
      <div className="page-head">
        <div><h1>Notifications</h1><p>New drives, fundraisers, meetings, tasks and approvals.</p></div>
        <div className="page-actions">
          {unread.length > 0 && <button className="btn" disabled={busy} onClick={() => run(() => api.markAllRead(unread.map((n) => n.id)), 'All marked as read')}>Mark all as read</button>}
          {read.length > 0 && <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => api.clearNotifications(read.map((n) => n.id)), 'Cleared')}>Clear read</button>}
        </div>
      </div>
      <section className="card">
        {notifications.length === 0 ? (
          <Empty title="You're all caught up" icon={<IconBell />}>You'll be notified here about new drives, fundraisers, meetings and tasks.</Empty>
        ) : (
          <ul className="list">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link to={n.link ?? '/'} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => { if (!n.read) api.markRead(n.id).catch(() => {}); }}>
                  <span className="ico">{ICONS[n.kind] ?? <IconBell />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontWeight: n.read ? 500 : 600 }}>{n.title}</h3>
                    {n.body && <p className="small muted">{n.body}</p>}
                    <p className="tiny muted" style={{ marginTop: 2 }}>{n.createdAt ? fmtDateTime(n.createdAt) : 'Just now'}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
