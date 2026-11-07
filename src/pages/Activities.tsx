import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { canSeeActivity } from '../lib/access';
import type { ActivityType } from '../lib/types';
import { AUDIENCE_LABEL } from '../lib/types';
import { ActivityCard } from '../components/activity';
import { Empty } from '../components/ui';
import { IconCalendar, IconPlus, IconVideo } from '../components/icons';

type When = 'upcoming' | 'completed' | 'cancelled' | 'proposals';

export function ActivitiesPage({ kind }: { kind: 'activities' | 'meetings' }) {
  const { profile, can } = useMe();
  const { activities, participations, departmentById } = useData();
  const [params, setParams] = useSearchParams();
  const when = (params.get('when') as When) || 'upcoming';
  const type = (params.get('type') as ActivityType | 'all') || 'all';
  const [q, setQ] = useState('');
  const isMeetings = kind === 'meetings';

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const mine = useMemo(() => new Map(participations.filter((p) => p.uid === profile.id).map((p) => [p.activityId, p])), [participations, profile.id]);
  const volunteering = useMemo(() => new Set([...mine.values()].filter((p) => p.status === 'approved').map((p) => p.activityId)), [mine]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of participations) if (p.status === 'approved') c.set(p.activityId, (c.get(p.activityId) ?? 0) + 1);
    return c;
  }, [participations]);

  const visible = activities
    .filter((a) => (isMeetings ? a.type === 'meeting' : a.type !== 'meeting'))
    .filter((a) => canSeeActivity(a, profile, volunteering));
  const inTab = (w: When) => visible.filter((a) => (w === 'proposals' ? a.status === 'proposed' || a.status === 'declined' : a.status === w));
  const list = inTab(when)
    .filter((a) => isMeetings || type === 'all' || a.type === type)
    .filter((a) => !q || `${a.title} ${a.venue} ${a.description}`.toLowerCase().includes(q.toLowerCase()));
  if (when !== 'upcoming' && when !== 'proposals') list.reverse();

  const tabs: When[] = ['upcoming', 'completed', 'cancelled', ...(!isMeetings && inTab('proposals').length ? (['proposals'] as When[]) : [])];
  const tabLabel: Record<When, string> = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled', proposals: 'Proposals' };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isMeetings ? 'Meetings' : 'Drives, fundraisers & events'}</h1>
          <p>{isMeetings ? 'Meetings you are invited to. Join online meetings straight from here.' : 'Volunteer with one click. Anyone can propose a drive.'}</p>
        </div>
        <div className="page-actions">
          {isMeetings ? (
            can.canCreateMeeting && <Link to="/activities/new?type=meeting" className="btn btn-primary"><IconVideo />Schedule meeting</Link>
          ) : (
            <>
              {can.canCreateFundraiser && <Link to="/activities/new?type=fundraiser" className="btn">New fundraiser</Link>}
              <Link to="/activities/new?type=drive" className="btn btn-primary"><IconPlus />{can.canCreateDriveDirectly ? 'New drive' : 'Propose a drive'}</Link>
            </>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((w) => (
          <button key={w} role="tab" aria-selected={when === w} className={when === w ? 'on' : ''} onClick={() => set('when', w)}>
            {tabLabel[w]}<span className="count">{inTab(w).length}</span>
          </button>
        ))}
      </div>

      <div className="spread" style={{ marginBottom: 16 }}>
        {!isMeetings ? (
          <div className="segmented" role="group" aria-label="Filter by type">
            {(['all', 'drive', 'fundraiser', 'event'] as const).map((t) => (
              <button key={t} className={type === t ? 'on' : ''} onClick={() => set('type', t)}>{t === 'all' ? 'All' : t === 'drive' ? 'Drives' : t === 'fundraiser' ? 'Fundraisers' : 'Events'}</button>
            ))}
          </div>
        ) : <span />}
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty title={`No ${tabLabel[when].toLowerCase()} ${isMeetings ? 'meetings' : 'activities'}`} icon={isMeetings ? <IconVideo /> : <IconCalendar />}>Check back later.</Empty></div>
      ) : (
        <div className="activity-grid">
          {list.map((a) => (
            <ActivityCard
              key={a.id}
              a={a}
              mine={mine.get(a.id)}
              extra={
                a.type === 'meeting'
                  ? <span className="small muted">{AUDIENCE_LABEL[a.audience].replace(' meeting', '')}{a.departmentId && (a.audience === 'department' || a.audience === 'volunteers') ? ` · ${departmentById.get(a.departmentId)?.name ?? ''}` : ''}</span>
                  : <span className="small muted">{counts.get(a.id) ?? 0}{a.capacity ? ` / ${a.capacity}` : ''} volunteers</span>
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
