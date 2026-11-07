import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fromFirestore } from '../lib/api';
import { useMe } from './AuthContext';
import type { Activity, Department, EdpiRecord, Participation, Position, UserProfile } from '../lib/types';

/**
 * Live, shared data for the whole signed-in app. Every list is a realtime
 * Firestore listener, so a change made by anyone shows up everywhere
 * immediately without refreshing.
 */
interface Data {
  ready: boolean;
  users: UserProfile[];
  positions: Position[];
  departments: Department[];
  activities: Activity[];
  /** Core/Admin: every record. Member: only their own. */
  participations: Participation[];
  /** Core/Admin only. */
  edpi: EdpiRecord[];
  userById: Map<string, UserProfile>;
  positionById: Map<string, Position>;
  departmentById: Map<string, Department>;
  activityById: Map<string, Activity>;
}

const DataContext = createContext<Data | null>(null);

/** Subscribes to a query while `key` stays the same; `key === null` means "don't subscribe". */
function useLive<T>(key: string | null, make: () => Query, sort?: (a: T, b: T) => number): [T[], boolean] {
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(key === null);
  useEffect(() => {
    if (key === null) {
      setRows([]);
      setReady(true);
      return;
    }
    return onSnapshot(
      make(),
      (snap) => {
        const list = snap.docs.map((d) => fromFirestore<T>(d.id, d.data()));
        if (sort) list.sort(sort);
        setRows(list);
        setReady(true);
      },
      (err) => {
        console.error(key, err);
        setReady(true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [rows, ready];
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile, isCore } = useMe();

  const col = (name: string) => () => collection(db, name);
  const [users, r1] = useLive<UserProfile>('users', col('users'), (a, b) => a.name.localeCompare(b.name));
  const [positions, r2] = useLive<Position>('positions', col('positions'), (a, b) => a.order - b.order);
  const [departments, r3] = useLive<Department>('departments', col('departments'), (a, b) => a.order - b.order);
  const [activities, r4] = useLive<Activity>('activities', col('activities'), (a, b) => a.startAt.getTime() - b.startAt.getTime());
  const [participations, r5] = useLive<Participation>(
    isCore ? 'participations:all' : `participations:${profile.id}`,
    isCore ? col('participations') : () => query(collection(db, 'participations'), where('uid', '==', profile.id)),
  );
  const [edpi, r6] = useLive<EdpiRecord>(isCore ? 'edpi' : null, col('edpi'));

  const value = useMemo<Data>(
    () => ({
      ready: r1 && r2 && r3 && r4 && r5 && r6,
      users,
      positions,
      departments,
      activities,
      participations,
      edpi,
      userById: new Map(users.map((u) => [u.id, u])),
      positionById: new Map(positions.map((p) => [p.id, p])),
      departmentById: new Map(departments.map((d) => [d.id, d])),
      activityById: new Map(activities.map((a) => [a.id, a])),
    }),
    [users, positions, departments, activities, participations, edpi, r1, r2, r3, r4, r5, r6],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const d = useContext(DataContext);
  if (!d) throw new Error('useData must be used inside DataProvider');
  return d;
}

/** Contribution totals for one member, from verified records only. */
export function summarise(parts: Participation[], activityById: Map<string, Activity>) {
  const verified = parts.filter((p) => p.hoursStatus === 'verified');
  return {
    verifiedHours: verified.reduce((s, p) => s + (p.verifiedHours ?? 0), 0),
    credits: verified.reduce((s, p) => s + (p.credits ?? 0), 0),
    attended: parts.filter((p) => p.attendance === 'present').length,
    pendingRequests: parts.filter((p) => p.status === 'requested').length,
    upcomingAssignments: parts.filter(
      (p) => p.status === 'approved' && activityById.get(p.activityId)?.status === 'upcoming',
    ).length,
  };
}
