import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { fromFirestore } from '../lib/api';
import { useMe } from './AuthContext';
import type { Activity, AppNotification, DeptRequest, Department, EdpiRecord, Feedback, Participation, Position, Task, UserProfile } from '../lib/types';

/**
 * Live, shared data for the whole signed-in app. Every list is a realtime
 * Firestore listener, so a change made by anyone shows up everywhere immediately.
 */
interface Data {
  ready: boolean;
  users: UserProfile[];
  positions: Position[];
  departments: Department[];
  activities: Activity[];
  /** Core team: every record. Others: their own. Organisers load their activity's list on its page. */
  participations: Participation[];
  /** Core team only. Others load a single record on the drive page. */
  edpi: EdpiRecord[];
  tasks: Task[];
  notifications: AppNotification[];
  feedback: Feedback[];
  /** HR & leadership: all. Others: their own. */
  deptRequests: DeptRequest[];
  /** Core team: everyone. Members: the core team and themselves. */
  userById: Map<string, UserProfile>;
  positionById: Map<string, Position>;
  departmentById: Map<string, Department>;
  activityById: Map<string, Activity>;
}

const DataContext = createContext<Data | null>(null);
const CORE_ROLES = ['chairman', 'admin', 'vice_chairman', 'executive', 'board', 'hod'];

/** Subscribes to a query while `key` stays the same; `key === null` means "don't subscribe". */
export function useLive<T>(key: string | null, make: () => Query, sort?: (a: T, b: T) => number): [T[], boolean] {
  const [rows, setRows] = useState<T[]>([]);
  const [ready, setReady] = useState(key === null);
  useEffect(() => {
    if (key === null) {
      setRows([]);
      setReady(true);
      return;
    }
    setReady(false);
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

const byCreatedDesc = (a: { createdAt?: Date | null }, b: { createdAt?: Date | null }) => (b.createdAt?.getTime() ?? Date.now()) - (a.createdAt?.getTime() ?? Date.now());

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile, can } = useMe();
  const me = profile.id;
  const col = (name: string) => () => collection(db, name);

  // Members only load the core team (their points of contact); the core team loads everyone.
  const [usersRaw, r1] = useLive<UserProfile>(
    can.isCore ? 'users:all' : 'users:core',
    can.isCore ? col('users') : () => query(collection(db, 'users'), where('role', 'in', CORE_ROLES)),
    (a, b) => a.name.localeCompare(b.name),
  );
  const users = useMemo(() => (usersRaw.some((u) => u.id === me) ? usersRaw : [...usersRaw, profile]), [usersRaw, me, profile]);
  const [positions, r2] = useLive<Position>('positions', col('positions'), (a, b) => a.order - b.order);
  const [departments, r3] = useLive<Department>('departments', col('departments'), (a, b) => a.order - b.order);
  const [activities, r4] = useLive<Activity>('activities', col('activities'), (a, b) => a.startAt.getTime() - b.startAt.getTime());
  const [participations, r5] = useLive<Participation>(
    can.isCore ? 'participations:all' : `participations:${me}`,
    can.isCore ? col('participations') : () => query(collection(db, 'participations'), where('uid', '==', me)),
  );
  const [edpi, r6] = useLive<EdpiRecord>(can.isCore ? 'edpi' : null, col('edpi'));

  // Tasks: Leadership sees all; Heads see their department; everyone sees tasks assigned to or created by them.
  const [tasksAll, t1] = useLive<Task>(can.isLeadership ? 'tasks:all' : null, col('tasks'));
  const [tasksDept, t2] = useLive<Task>(!can.isLeadership && can.isHod && can.dept ? `tasks:dept:${can.dept}` : null, () => query(collection(db, 'tasks'), where('departmentId', '==', can.dept)));
  const [tasksMine, t3] = useLive<Task>(can.isLeadership ? null : `tasks:mine:${me}`, () => query(collection(db, 'tasks'), where('assigneeUid', '==', me)));
  const [tasksByMe, t4] = useLive<Task>(can.isLeadership ? null : `tasks:by:${me}`, () => query(collection(db, 'tasks'), where('createdBy', '==', me)));

  const [notifications, r7] = useLive<AppNotification>(`notifications:${me}`, () => query(collection(db, 'notifications'), where('uid', '==', me)), byCreatedDesc);
  const [feedback, r8] = useLive<Feedback>(
    can.canSeeFeedback ? 'feedback:all' : `feedback:${me}`,
    can.canSeeFeedback ? col('feedback') : () => query(collection(db, 'feedback'), where('authorUid', '==', me)),
    byCreatedDesc,
  );

  const [deptRequests, r9] = useLive<DeptRequest>(
    can.canSeeFeedback ? 'deptRequests:all' : `deptRequests:${me}`,
    can.canSeeFeedback ? col('deptRequests') : () => query(collection(db, 'deptRequests'), where('uid', '==', me)),
    byCreatedDesc,
  );

  const tasks = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of [...tasksAll, ...tasksDept, ...tasksMine, ...tasksByMe]) m.set(t.id, t);
    return [...m.values()].sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  }, [tasksAll, tasksDept, tasksMine, tasksByMe]);

  const ready = r1 && r2 && r3 && r4 && r5 && r6 && r7 && r8 && r9 && t1 && t2 && t3 && t4;

  const value = useMemo<Data>(
    () => ({
      ready,
      users,
      positions,
      departments,
      activities,
      participations,
      edpi,
      tasks,
      notifications,
      feedback,
      deptRequests,
      userById: new Map(users.map((u) => [u.id, u])),
      positionById: new Map(positions.map((p) => [p.id, p])),
      departmentById: new Map(departments.map((d) => [d.id, d])),
      activityById: new Map(activities.map((a) => [a.id, a])),
    }),
    [ready, users, positions, departments, activities, participations, edpi, tasks, notifications, feedback, deptRequests],
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
