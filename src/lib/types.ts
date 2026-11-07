import type { EdpiBreakdown } from './edpi';

/**
 * Access tier. Derived from a member's position (see positions collection).
 * Legacy v1 values ('admin', 'core') are still accepted and mapped in access.ts.
 */
export type Role = 'chairman' | 'vice_chairman' | 'executive' | 'board' | 'hod' | 'member' | 'admin' | 'core';
export type UserStatus = 'active' | 'removed';

export interface UserProfile {
  id: string; // = Firebase Auth uid
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  positionId: string | null;
  departmentId?: string | null;
  /** Optional display title, e.g. "Founder, Former CEO & Chairman" or "Former Head of Drives". */
  title?: string | null;
  bio?: string | null;
  responsibilities?: string | null;
  joinedAt?: Date | null;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  order: number;
}

export interface Position {
  id: string;
  title: string;
  /** The access tier anyone holding this position gets. */
  role: Exclude<Role, 'admin' | 'core'>;
  /** Heads of Department: their department. Others: null. */
  departmentId: string | null;
  description?: string;
  responsibilities: string[];
  order: number;
}

export type ActivityType = 'drive' | 'fundraiser' | 'event' | 'meeting';
export type ActivityStatus = 'proposed' | 'upcoming' | 'completed' | 'cancelled' | 'declined';
export type Audience = 'all' | 'core' | 'hod' | 'board' | 'department' | 'volunteers';
export type Mode = 'in_person' | 'online';

export interface ActivityLink {
  label: string;
  url: string;
}

export interface Activity {
  id: string;
  title: string;
  type: ActivityType;
  status: ActivityStatus;
  description: string;
  startAt: Date;
  endAt: Date | null;
  mode: Mode;
  venue: string;
  /** Google Maps link for in-person activities. */
  mapUrl: string | null;
  /** Google Meet / Zoom link for online activities. */
  meetingUrl: string | null;
  audience: Audience;
  /** For "volunteers" meetings: the drive/fundraiser whose volunteers are invited. */
  relatedActivityId: string | null;
  instructions: string;
  requirements: string;
  links: ActivityLink[];
  capacity: number | null;
  leadUid: string | null;
  departmentId: string | null;
  credits: number;
  openForRequests: boolean;
  createdBy: string;
  createdAt?: Date | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
}

export type ParticipationStatus = 'requested' | 'approved' | 'deferred' | 'rejected';
export type HoursStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface Participation {
  id: string; // `${activityId}_${uid}`
  activityId: string;
  uid: string;
  status: ParticipationStatus;
  source: 'request' | 'assigned' | 'volunteer';
  note: string | null;
  assignment: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  attendance: 'present' | 'absent' | null;
  attendanceBy?: string | null;
  hoursLogged: number | null;
  hoursNote?: string | null;
  hoursStatus: HoursStatus;
  verifiedHours: number | null;
  credits: number;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
  createdAt?: Date | null;
}

export interface EdpiRecord {
  id: string; // activity id
  plan: {
    plannedVolunteers: number;
    plannedHours: number;
    impactTarget: number;
    impactUnit: string;
    budget: number;
    normalCost: number;
    hasPartner: 0 | 1;
  };
  locked: boolean;
  lockedAt?: Date | null;
  lockedBy?: string | null;
  results: {
    spent: number;
    peopleHelped: number;
    impactDone: number;
    extraHours: number[];
    hoursEach: number[];
  } | null;
  score: EdpiBreakdown | null;
  flags: string[];
  scoredAt?: Date | null;
  updatedBy?: string | null;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigneeUid: string;
  departmentId: string | null;
  dueAt: Date | null;
  status: TaskStatus;
  progressNote: string | null;
  createdBy: string;
  createdAt?: Date | null;
  completedAt?: Date | null;
}

export interface AppNotification {
  id: string;
  uid: string;
  title: string;
  body: string | null;
  link: string | null;
  kind: string;
  read: boolean;
  createdBy: string;
  createdAt?: Date | null;
}

export interface Feedback {
  id: string;
  authorUid: string;
  rating: number;
  category: string;
  message: string;
  status: 'new' | 'reviewed';
  hrNote: string | null;
  createdAt?: Date | null;
}

export const ROLE_LABEL: Record<Role, string> = {
  chairman: 'Chairman',
  vice_chairman: 'Vice Chairman',
  executive: 'Executive',
  board: 'Board of Advisors',
  hod: 'Head of Department',
  member: 'Member',
  admin: 'Chairman',
  core: 'Member',
};

export const TYPE_LABEL: Record<ActivityType, string> = {
  drive: 'Drive',
  fundraiser: 'Fundraiser',
  event: 'Event',
  meeting: 'Meeting',
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'All-member meeting',
  core: 'Core team meeting (Board + Heads)',
  hod: 'Heads of Department meeting',
  board: 'Board meeting',
  department: 'Department meeting',
  volunteers: 'Volunteers meeting',
};

export const PARTICIPATION_LABEL: Record<ParticipationStatus, string> = {
  requested: 'Pending review',
  approved: 'Volunteering',
  deferred: 'Deferred',
  rejected: 'Removed',
};

export const TASK_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
