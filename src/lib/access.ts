/**
 * Who can do what. Mirrors firestore.rules — the rules are what actually enforce it;
 * this module decides which buttons and pages to show.
 */
import type { Activity, Audience, Role, UserProfile } from './types';

export const DEPT = {
  finance: 'finance',
  marketing: 'marketing',
  hr: 'hr',
  projectOps: 'project-operations',
  driveExec: 'drive-execution',
} as const;

/** Map legacy v1 roles. */
export function normRole(r: Role): Exclude<Role, 'admin' | 'core'> {
  if (r === 'admin') return 'chairman';
  if (r === 'core') return 'member';
  return r;
}

export const isCoreRole = (r: Role) => normRole(r) !== 'member';

export function access(u: UserProfile) {
  const role = normRole(u.role);
  const dept = u.departmentId ?? null;
  const isChair = role === 'chairman';
  const isVice = role === 'vice_chairman';
  const isTop = isChair || isVice || role === 'executive';
  const isBoard = role === 'board';
  const isLeadership = isTop || isBoard;
  const isHod = role === 'hod';
  const isCore = isLeadership || isHod;
  const isHodOf = (d: string) => isHod && dept === d;

  const meetingAudiences: Audience[] = [
    ...(isTop ? (['all', 'core', 'hod'] as Audience[]) : []),
    ...(isLeadership ? (['board'] as Audience[]) : []),
    ...(isCore ? (['department', 'volunteers'] as Audience[]) : []),
  ];

  return {
    role,
    dept,
    isChair,
    isTop,
    isBoard,
    isLeadership,
    isHod,
    isCore,
    isHodOf,
    /** Chairman, Vice Chairman, CEO, COO: record past drives/events and assign hours. */
    canRecordPast: isTop,
    /** Add / remove people, change positions and access. */
    isPeopleAdmin: isChair || isVice,
    canCreateDriveDirectly: isLeadership || isHodOf(DEPT.driveExec),
    canCreateFundraiser: isCore,
    canCreateEvent: isCore,
    canCreateMeeting: meetingAudiences.length > 0,
    meetingAudiences,
    /** Which departments' meetings this person can call. */
    meetingDepartments: (all: string[]) => (isLeadership ? all : isHod && dept ? [dept] : []),
    canApproveDrive: (a: Activity) => isCore && (a.createdBy !== u.id || isLeadership),
    canManageActivity: (a: Activity) =>
      isLeadership || a.createdBy === u.id || a.leadUid === u.id || (isHod && !!a.departmentId && a.departmentId === dept),
    canAssignTaskTo: (m: UserProfile) => isLeadership || (isHod && !!dept && m.departmentId === dept),
    canAssignTasks: isLeadership || isHod,
    canSeeFeedback: isLeadership || dept === DEPT.hr,
    canSeeAnalytics: isCore,
    canSeeContacts: isCore,
    canDeleteActivity: (a: Activity) => isLeadership || (a.createdBy === u.id && (a.status === 'proposed' || a.status === 'declined')),
  };
}

export type Access = ReturnType<typeof access>;

/** Can this person see this activity in their lists? (Meetings are shown only to their audience.) */
export function canSeeActivity(a: Activity, u: UserProfile, myVolunteering: Set<string>): boolean {
  const x = access(u);
  if (x.isLeadership) return true;
  if (a.createdBy === u.id || a.leadUid === u.id) return true;
  if (a.status === 'proposed' || a.status === 'declined') return x.isCore;
  if (a.type !== 'meeting') return true;
  switch (a.audience) {
    case 'all': return true;
    case 'core': return x.isCore;
    case 'hod': return x.isHod;
    case 'board': return false;
    case 'department': return !!a.departmentId && a.departmentId === x.dept;
    case 'volunteers': return !!a.relatedActivityId && myVolunteering.has(a.relatedActivityId) || (x.isHod && a.departmentId === x.dept);
  }
}

/** Members who should be notified about / invited to a meeting. */
export function meetingInvitees(a: Activity, users: UserProfile[], volunteerUids: Set<string>): UserProfile[] {
  const active = users.filter((u) => u.status === 'active');
  switch (a.audience) {
    case 'all': return active;
    case 'core': return active.filter((u) => access(u).isCore);
    case 'hod': return active.filter((u) => access(u).isHod || access(u).isTop);
    case 'board': return active.filter((u) => access(u).isLeadership);
    case 'department': return active.filter((u) => u.departmentId === a.departmentId || access(u).isTop);
    case 'volunteers': return active.filter((u) => volunteerUids.has(u.id));
  }
}
