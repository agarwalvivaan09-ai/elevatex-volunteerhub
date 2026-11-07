import { Link } from 'react-router-dom';
import type { Activity, Participation } from '../lib/types';
import { fmtTime, monthAbbr, relativeDay } from '../lib/format';
import { ActivityStatusBadge, RequestBadge, TypeBadge } from './ui';
import { IconClock, IconPin } from './icons';

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
              {a.venue && <span className="meta-line"><IconPin />{a.venue}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="foot">
        {mine ? <RequestBadge status={mine.status} /> : <span className="muted">{a.openForRequests && a.status === 'upcoming' ? 'Open for requests' : a.status === 'upcoming' ? 'By assignment' : ''}</span>}
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
          <TypeBadge type={a.type} /> <span style={{ marginLeft: 6 }}>{relativeDay(a.startAt)} · {fmtTime(a.startAt)}{a.venue ? ` · ${a.venue}` : ''}</span>
        </div>
      </div>
      {right}
    </Link>
  );
}
