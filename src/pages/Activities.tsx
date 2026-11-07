import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import type { ActivityType } from '../lib/types';
import { ActivityCard } from '../components/activity';
import { Empty } from '../components/ui';
import { IconCalendar, IconPlus } from '../components/icons';

const TYPES: { key: ActivityType | 'all'; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'drive', label: 'Drives' },
  { key: 'fundraiser', label: 'Fundraisers' },
  { key: 'event', label: 'Events' },
  { key: 'meeting', label: 'Meetings' },
];
type When = 'upcoming' | 'completed' | 'cancelled';

export function ActivitiesPage() {
  const { profile, isCore } = useMe();
  const { activities, participations } = useData();
  const [params, setParams] = useSearchParams();
  const when = (params.get('when') as When) || 'upcoming';
  const type = (params.get('type') as ActivityType | 'all') || 'all';
  const [q, setQ] = useState('');

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const mine = useMemo(() => new Map(participations.filter((p) => p.uid === profile.id).map((p) => [p.activityId, p])), [participations, profile.id]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of participations) if (p.status === 'approved') c.set(p.activityId, (c.get(p.activityId) ?? 0) + 1);
    return c;
  }, [participations]);

  const list = activities
    .filter((a) => a.status === when)
    .filter((a) => type === 'all' || a.type === type)
    .filter((a) => !q || `${a.title} ${a.venue} ${a.description}`.toLowerCase().includes(q.toLowerCase()));
  if (when !== 'upcoming') list.reverse();

  const countFor = (w: When) => activities.filter((a) => a.status === w && (type === 'all' || a.type === type)).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activities</h1>
          <p>Drives, fundraisers, organisational events and meetings.</p>
        </div>
        {isCore && <Link to="/activities/new" className="btn btn-primary"><IconPlus />New activity</Link>}
      </div>

      <div className="tabs" role="tablist">
        {(['upcoming', 'completed', 'cancelled'] as When[]).map((w) => (
          <button key={w} role="tab" aria-selected={when === w} className={when === w ? 'on' : ''} onClick={() => set('when', w)}>
            {w[0]!.toUpperCase() + w.slice(1)}<span className="count">{countFor(w)}</span>
          </button>
        ))}
      </div>

      <div className="spread" style={{ marginBottom: 16 }}>
        <div className="segmented" role="group" aria-label="Filter by type">
          {TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? 'on' : ''} onClick={() => set('type', t.key)}>{t.label}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search activities…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activities" />
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty title={`No ${when} activities`} icon={<IconCalendar />}>{isCore && when === 'upcoming' ? 'Create one with “New activity”.' : 'Check back later.'}</Empty></div>
      ) : (
        <div className="activity-grid">
          {list.map((a) => (
            <ActivityCard
              key={a.id}
              a={a}
              mine={mine.get(a.id)}
              extra={isCore ? <span className="small muted">{counts.get(a.id) ?? 0}{a.capacity ? ` / ${a.capacity}` : ''} approved</span> : null}
            />
          ))}
        </div>
      )}
    </>
  );
}
