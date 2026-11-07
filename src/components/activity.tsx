import { Link } from 'react-router-dom';
import type { Activity, Participation } from '../lib/types';
import { fmtTime, monthAbbr, relativeDay } from '../lib/format';
import { ActivityStatusBadge, RequestBadge, TypeBadge } from './ui';
import { IconClock, IconMap, IconPin, IconVideo } from './icons';

export function DateBox({ d }: { d: Date }) {
  return (
    <div className="datebox" aria-hidden="true">
      <div className="m">{monthAbbr(d)}</div>
      <div className="d">{d.getDate()}</div>
    </div>
  );
}

export function ActivityCard({ a, mine, extra }: { a: Activity; mine?: Participation; extra?: React.ReactNode }) {
  return (
    <Link to={`/activities/${a.id}`} className="card activity-card">
      <div className="top">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <TypeBadge type={a.type} />
          {a.status !== 'upcoming' ? <ActivityStatusBadge a={a} /> : <span className="small muted">{relativeDay(a.startAt)}</span>}
        </div>
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <DateBox d={a.startAt} />
          <div style={{ minWidth: 0 }}>
            <h3>{a.title}</h3>
            <div className="meta" style={{ marginTop: 4 }}>
              <span className="meta-line"><IconClock />{fmtTime(a.startAt)}{a.endAt ? ` – ${fmtTime(a.endAt)}` : ''}</span>
              <span className="meta-line">{a.mode === 'online' ? <><IconVideo />Online</> : <><IconPin />{a.venue}</>}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="foot">
        {mine && a.type !== 'meeting' ? <RequestBadge status={mine.status} /> : <span className="muted">{a.type !== 'meeting' && a.status === 'upcoming' ? (a.openForRequests ? 'Open to volunteers' : 'By invitation') : ''}</span>}
        {extra}
      </div>
    </Link>
  );
}

/** Compact row used in dashboard lists. */
export function ActivityRow({ a, right }: { a: Activity; right?: React.ReactNode }) {
  return (
    <Link to={`/activities/${a.id}`} className="list-link">
      <DateBox d={a.startAt} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</h3>
        <div className="small muted">
          <TypeBadge type={a.type} /> <span style={{ marginLeft: 6 }}>{relativeDay(a.startAt)} · {fmtTime(a.startAt)} · {a.mode === 'online' ? 'Online' : a.venue}</span>
        </div>
      </div>
      {right}
    </Link>
  );
}

/** Big "Join meeting" / "Open in Maps" card shown on an activity's page. */
export function WhereCard({ a }: { a: Activity }) {
  if (a.mode === 'online' && a.meetingUrl) {
    const live = Date.now() >= a.startAt.getTime() - 15 * 60000 && Date.now() <= (a.endAt ?? a.startAt).getTime() + 30 * 60000;
    return (
      <div className="join-card">
        <div className="ico"><IconVideo /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{live ? 'Happening now' : 'Online meeting'}</b>
          <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.meetingUrl.replace(/^https:\/\//, '')}</div>
        </div>
        <a className="btn btn-primary" href={a.meetingUrl} target="_blank" rel="noopener noreferrer">Join meeting</a>
      </div>
    );
  }
  return (
    <div className="join-card place">
      <div className="ico"><IconPin /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{a.venue || 'Venue'}</b>
        <div className="small muted">Tap for directions</div>
      </div>
      {a.mapUrl && <a className="btn" href={a.mapUrl} target="_blank" rel="noopener noreferrer"><IconMap />Open in Maps</a>}
    </div>
  );
}
