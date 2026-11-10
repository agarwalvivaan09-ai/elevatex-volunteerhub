import type { EdpiBreakdown } from './edpi';

/**
 * Access tier. Derived from a member's position (see positions collection).
 * Legacy v1 values ('admin', 'core') are still accepted and mapped in access.ts.
 */
export type Role = 'chairman' | 'vice_chairman' | 'executive' | 'board' | 'hod' | 'member' | 'admin' | 'core';
export type UserStatus = 'active' | 'removed' | 'alumni';

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
  /** Onboarding checklist ticks, e.g. { whatsapp: true }. */
  onboarding?: Record<string, boolean> | null;
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
  /** Names copied at save time, so members (who can't read other members' profiles) still see who organises. */
  createdByName?: string | null;
  leadName?: string | null;
  createdAt?: Date | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  /** Recorded after the fact by top leadership (past drives, events). */
  backfilled?: boolean;
}

export type ParticipationStatus = 'requested' | 'approved' | 'deferred' | 'rejected' | 'waitlisted';
export type HoursStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface Participation {
  id: string; // `${activityId}_${uid}`
  activityId: string;
  uid: string;
  /** Copied at sign-up so a member-organiser can see who volunteered. */
  userName?: string | null;
  status: ParticipationStatus;
  source: 'request' | 'assigned' | 'volunteer';
  note: string | null;
  assignment: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  attendance: 'present' | 'absent' | null;
  attendanceBy?: string | null;
  /** Legacy (before credits replaced hours). Not used any more. */
  hoursLogged?: number | null;
  hoursNote?: string | null;
  hoursStatus?: HoursStatus;
  verifiedHours?: number | null;
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
  authorName?: string | null;
  rating: number;
  category: string;
  message: string;
  status: 'new' | 'reviewed';
  hrNote: string | null;
  createdAt?: Date | null;
}

export interface DeptRequest {
  id: string;
  uid: string;
  userName: string;
  fromDept: string | null;
  toDept: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  hrNote: string | null;
  createdAt?: Date | null;
}

export type CertKind = 'activity' | 'credits' | 'membership' | 'role';
export interface CertRequest {
  id: string;
  uid: string;
  userName: string;
  kind: CertKind;
  /** For 'activity' certificates. */
  activityId: string | null;
  activityTitle: string | null;
  /** The requester's total credits when they asked, attached automatically. */
  creditsAtRequest: number;
  /** Their position when they asked (for 'role' certificates). */
  positionTitle: string | null;
  nameOnCertificate: string;
  note: string | null;
  status: 'pending' | 'issued' | 'declined';
  hrNote: string | null;
  certificateUrl: string | null;
  certificateId: string | null;
  createdAt?: Date | null;
}

export const CERT_LABEL: Record<CertKind, string> = {
  activity: 'Participation in a drive or event',
  credits: 'Credits earned',
  membership: 'Membership of ElevateX',
  role: 'Position or role held',
};

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
  waitlisted: 'On the waitlist',
};

export const TASK_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

export interface ActivityStats { id: string; count: number; waitlist: string[] }

export interface Photo { id: string; activityId: string; uid: string; uploaderName: string; data: string; w: number; h: number; caption: string | null; createdAt?: Date | null }

export type PostAudience = 'all' | 'core' | 'department';
export interface Announcement { id: string; title: string; body: string; audience: PostAudience; departmentId: string | null; pinned: boolean; createdBy: string; createdByName: string | null; createdAt?: Date | null }

export interface Poll {
  id: string;
  question: string;
  options: string[];
  audience: 'all' | 'departments' | 'people';
  departmentIds: string[];
  uids: string[];
  multi: boolean;
  closed: boolean;
  closesAt: Date | null;
  createdBy: string;
  createdByName: string | null;
  createdAt?: Date | null;
}

export interface LibraryDoc { id: string; title: string; description: string | null; url: string; audience: PostAudience; departmentId: string | null; createdBy: string; createdByName: string | null; createdAt?: Date | null }

export interface AuditEntry { id: string; action: string; actorUid: string; actorName: string | null; targetType: string | null; targetId: string | null; targetName: string | null; detail: string | null; at?: Date | null }

export type ApplicationStatus = 'new' | 'reviewing' | 'interview' | 'accepted' | 'rejected' | 'added';
export interface Application {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  school: string;
  grade: string | null;
  city: string | null;
  departments: string[];
  why: string;
  heard: string | null;
  availability: string | null;
  status: ApplicationStatus;
  hrNotes?: string | null;
  accountUid?: string | null;
  createdAt?: Date | null;
}
