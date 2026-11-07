import type { EdpiBreakdown } from './edpi';

export type Role = 'admin' | 'core' | 'member';
export type UserStatus = 'active' | 'removed';

export interface UserProfile {
  id: string; // = Firebase Auth uid
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  positionId: string | null;
  bio?: string | null;
  responsibilities?: string | null; // individual responsibilities set by Admin
  joinedAt?: Date | null;
}

export interface PrivateContact {
  phone?: string;
  emergencyContact?: string;
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
  departmentId: string | null;
  description?: string;
  responsibilities: string[];
  order: number;
}

export type ActivityType = 'drive' | 'fundraiser' | 'event' | 'meeting';
export type ActivityStatus = 'upcoming' | 'completed' | 'cancelled';

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
  venue: string;
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
}

export type ParticipationStatus = 'requested' | 'approved' | 'deferred' | 'rejected';
export type HoursStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface Participation {
  id: string; // `${activityId}_${uid}`
  activityId: string;
  uid: string;
  status: ParticipationStatus;
  source: 'request' | 'assigned';
  note: string | null; // member's message with the request
  assignment: string | null; // role on the day, e.g. "Registration desk"
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
    /** Hours for volunteers who are not registered on the hub (from the sign-in sheet). */
    extraHours: number[];
    /** Snapshot of every HoursEach entry used for the score. */
    hoursEach: number[];
  } | null;
  score: EdpiBreakdown | null;
  flags: string[];
  scoredAt?: Date | null;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  core: 'Core Team',
  member: 'Member',
};

export const TYPE_LABEL: Record<ActivityType, string> = {
  drive: 'Drive',
  fundraiser: 'Fundraiser',
  event: 'Event',
  meeting: 'Meeting',
};

export const PARTICIPATION_LABEL: Record<ParticipationStatus, string> = {
  requested: 'Pending review',
  approved: 'Approved',
  deferred: 'Deferred',
  rejected: 'Not selected',
};
