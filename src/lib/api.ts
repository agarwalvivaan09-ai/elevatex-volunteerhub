/**
 * Every write the app makes goes through this file. Firestore security rules
 * (firestore.rules) validate each of these on the server.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  addDoc,
  type DocumentData,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, createAuthAccount, db } from './firebase';
import type { Activity, Department, EdpiRecord, Participation, Position, Role, UserProfile } from './types';
import { computeEdpi, EDPI_SETTINGS } from './edpi';

/** Recursively turn Firestore Timestamps into JS Dates. */
export function fromFirestore<T>(id: string, data: DocumentData): T {
  const walk = (v: unknown): unknown => {
    if (v instanceof Timestamp) return v.toDate();
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { id, ...(walk(data) as object) } as T;
}

const uid = () => {
  const u = auth.currentUser;
  if (!u) throw new Error('You are signed out. Please sign in again.');
  return u.uid;
};

// ---------------------------------------------------------------- setup
export async function adminExists(): Promise<boolean> {
  return (await getDoc(doc(db, 'meta', 'bootstrap'))).exists();
}

export async function bootstrapAdmin(name: string) {
  const u = auth.currentUser!;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', u.uid), {
    name: name.trim(),
    email: (u.email ?? '').toLowerCase(),
    role: 'admin',
    status: 'active',
    positionId: null,
    bio: null,
    responsibilities: null,
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'meta', 'bootstrap'), { adminUid: u.uid, at: serverTimestamp() });
  await batch.commit();
  await seedDefaultStructure(u.uid);
}

/** Starter departments and positions so the organisation page isn't empty. Admin can edit everything. */
async function seedDefaultStructure(adminUid: string) {
  const batch = writeBatch(db);
  const depts: [string, string, string][] = [
    ['leadership', 'Leadership', 'Overall direction of ElevateX.'],
    ['finance', 'Finance', 'Budgets, fundraising accounts and drive spending.'],
    ['operations', 'Operations', 'Logistics, venues, volunteers on the ground.'],
    ['projects', 'Projects', 'Planning and running drives and campaigns.'],
    ['outreach', 'Outreach & Media', 'Partnerships, social media and communications.'],
  ];
  depts.forEach(([id, name, description], i) => batch.set(doc(db, 'departments', id), { name, description, order: i }));
  const positions: [string, string, string | null, string[]][] = [
    ['president', 'President / CEO', 'leadership', ['Sets direction and priorities', 'Represents ElevateX externally', 'Signs off major decisions']],
    ['head-finance', 'Head of Finance', 'finance', ['Owns drive budgets', 'Approves spending', 'Keeps receipts and accounts']],
    ['head-operations', 'Head of Operations', 'operations', ['Runs logistics on drive days', 'Coordinates volunteers', 'Venue and supplies']],
    ['project-head', 'Project Head', 'projects', ['Plans a drive end-to-end', 'Fills and locks the EDPI plan', 'Leads the debrief']],
    ['head-outreach', 'Head of Outreach', 'outreach', ['Partner organisations', 'Social media', 'Announcements']],
    ['general-member', 'General Member', null, ['Take part in drives and events', 'Log hours honestly', 'Help where needed']],
  ];
  positions.forEach(([id, title, departmentId, responsibilities], i) =>
    batch.set(doc(db, 'positions', id), { title, departmentId, responsibilities, description: '', order: i }),
  );
  batch.update(doc(db, 'users', adminUid), { positionId: 'president' });
  await batch.commit();
}

// ---------------------------------------------------------------- members
export async function addMember(input: { name: string; email: string; role: Exclude<Role, 'admin'>; positionId: string | null }) {
  const email = input.email.trim().toLowerCase();
  let newUid: string;
  try {
    newUid = await createAuthAccount(email);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/email-already-in-use')
      throw new Error('This email already has an account. If they were removed, find them in the Members list and reactivate them.');
    if (code === 'auth/invalid-email') throw new Error('That email address is not valid.');
    throw e;
  }
  await setDoc(doc(db, 'users', newUid), {
    name: input.name.trim(),
    email,
    role: input.role,
    status: 'active',
    positionId: input.positionId,
    bio: null,
    responsibilities: null,
    joinedAt: serverTimestamp(),
    createdBy: uid(),
  });
  let inviteSent = true;
  try {
    await sendPasswordResetEmail(auth, email);
  } catch {
    inviteSent = false;
  }
  return { uid: newUid, inviteSent };
}

export async function sendInvite(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function updateMember(memberUid: string, patch: Partial<Pick<UserProfile, 'role' | 'positionId' | 'status' | 'responsibilities' | 'name'>>) {
  await updateDoc(doc(db, 'users', memberUid), { ...patch, updatedAt: serverTimestamp() });
}

export async function updateOwnProfile(patch: { name: string; bio: string | null }) {
  await updateDoc(doc(db, 'users', uid()), { name: patch.name.trim(), bio: patch.bio, updatedAt: serverTimestamp() });
}

export async function getPrivateContact(memberUid: string) {
  const snap = await getDoc(doc(db, 'users', memberUid, 'private', 'contact'));
  return (snap.exists() ? snap.data() : {}) as { phone?: string; emergencyContact?: string };
}

export async function setPrivateContact(memberUid: string, data: { phone: string; emergencyContact: string }) {
  await setDoc(doc(db, 'users', memberUid, 'private', 'contact'), data, { merge: true });
}

// ---------------------------------------------------------------- structure
export async function saveDepartment(d: Omit<Department, 'id'> & { id?: string }) {
  const { id, ...data } = d;
  if (id) await setDoc(doc(db, 'departments', id), data);
  else await addDoc(collection(db, 'departments'), data);
}
export const deleteDepartment = (id: string) => deleteDoc(doc(db, 'departments', id));

export async function savePosition(p: Omit<Position, 'id'> & { id?: string }) {
  const { id, ...data } = p;
  if (id) await setDoc(doc(db, 'positions', id), data);
  else await addDoc(collection(db, 'positions'), data);
}
export const deletePosition = (id: string) => deleteDoc(doc(db, 'positions', id));

// ---------------------------------------------------------------- activities
export type ActivityInput = Omit<Activity, 'id' | 'createdBy' | 'createdAt'>;

export async function saveActivity(input: ActivityInput, id?: string): Promise<string> {
  const data = {
    ...input,
    startAt: Timestamp.fromDate(input.startAt),
    endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, 'activities', id), data);
    return id;
  }
  const ref = await addDoc(collection(db, 'activities'), { ...data, createdBy: uid(), createdAt: serverTimestamp() });
  return ref.id;
}

export async function setActivityStatus(id: string, status: Activity['status']) {
  await updateDoc(doc(db, 'activities', id), { status, updatedAt: serverTimestamp() });
}

/** Admin only: deletes the activity together with its participation records and EDPI record. */
export async function deleteActivity(id: string) {
  const parts = await getDocs(query(collection(db, 'participations'), where('activityId', '==', id)));
  const batch = writeBatch(db);
  parts.forEach((p) => batch.delete(p.ref));
  batch.delete(doc(db, 'edpi', id));
  batch.delete(doc(db, 'activities', id));
  await batch.commit();
}

// ---------------------------------------------------------------- participation
const pid = (activityId: string, memberUid: string) => `${activityId}_${memberUid}`;

const blankParticipation = {
  attendance: null,
  attendanceBy: null,
  hoursLogged: null,
  hoursNote: null,
  hoursStatus: 'none',
  verifiedHours: null,
  credits: 0,
  verifiedBy: null,
  verifiedAt: null,
};

export async function requestToJoin(activityId: string, note: string) {
  const me = uid();
  await setDoc(doc(db, 'participations', pid(activityId, me)), {
    activityId,
    uid: me,
    status: 'requested',
    source: 'request',
    note: note.trim() || null,
    assignment: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    ...blankParticipation,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export const withdrawRequest = (p: Participation) => deleteDoc(doc(db, 'participations', p.id));

export async function reviewRequest(p: Participation, status: 'approved' | 'deferred' | 'rejected', reviewNote: string, assignment?: string) {
  const patch: DocumentData = {
    status,
    reviewNote: reviewNote.trim() || null,
    reviewedBy: uid(),
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (assignment !== undefined) patch.assignment = assignment.trim() || null;
  // A participation that is no longer approved cannot keep attendance/hours/credits.
  if (status !== 'approved') Object.assign(patch, blankParticipation);
  await updateDoc(doc(db, 'participations', p.id), patch);
}

export async function assignMember(activityId: string, memberUid: string, assignment: string) {
  await setDoc(doc(db, 'participations', pid(activityId, memberUid)), {
    activityId,
    uid: memberUid,
    status: 'approved',
    source: 'assigned',
    note: null,
    assignment: assignment.trim() || null,
    reviewNote: null,
    reviewedBy: uid(),
    reviewedAt: serverTimestamp(),
    ...blankParticipation,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function setAssignment(p: Participation, assignment: string) {
  await updateDoc(doc(db, 'participations', p.id), { assignment: assignment.trim() || null, updatedAt: serverTimestamp() });
}

export async function markAttendance(p: Participation, attendance: 'present' | 'absent' | null) {
  const patch: DocumentData = { attendance, attendanceBy: uid(), attendanceAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (attendance !== 'present') {
    // Hours and credits only exist for verified attendance.
    Object.assign(patch, { hoursStatus: p.hoursStatus === 'none' ? 'none' : 'rejected', verifiedHours: null, credits: 0, verifiedBy: null, verifiedAt: null });
  }
  await updateDoc(doc(db, 'participations', p.id), patch);
}

export async function logHours(p: Participation, hours: number, note: string) {
  await updateDoc(doc(db, 'participations', p.id), {
    hoursLogged: hours,
    hoursNote: note.trim() || null,
    hoursStatus: 'pending',
    hoursSubmittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function verifyHours(p: Participation, hours: number, credits: number) {
  await updateDoc(doc(db, 'participations', p.id), {
    hoursLogged: p.hoursLogged ?? hours,
    hoursStatus: 'verified',
    verifiedHours: hours,
    credits,
    verifiedBy: uid(),
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectHours(p: Participation) {
  await updateDoc(doc(db, 'participations', p.id), {
    hoursStatus: 'rejected',
    verifiedHours: null,
    credits: 0,
    verifiedBy: uid(),
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------- EDPI
export async function saveEdpiPlan(activityId: string, plan: EdpiRecord['plan'], exists: boolean) {
  const data = { plan: { ...plan, normalCost: EDPI_SETTINGS.NormalCost }, locked: false, results: null, score: null, flags: [], updatedAt: serverTimestamp(), updatedBy: uid() };
  if (exists) await updateDoc(doc(db, 'edpi', activityId), data);
  else await setDoc(doc(db, 'edpi', activityId), data);
}

export async function lockEdpiPlan(activityId: string) {
  await updateDoc(doc(db, 'edpi', activityId), { locked: true, lockedAt: serverTimestamp(), lockedBy: uid(), updatedAt: serverTimestamp() });
}

export async function saveEdpiResults(
  record: EdpiRecord,
  input: { spent: number; peopleHelped: number; impactDone: number; extraHours: number[] },
  verifiedHours: number[],
) {
  const hoursEach = [...verifiedHours, ...input.extraHours];
  const outcome = computeEdpi(record.plan, { spent: input.spent, peopleHelped: input.peopleHelped, impactDone: input.impactDone, hoursEach });
  if (!outcome.score) throw new Error(outcome.rejections.join(' '));
  await updateDoc(doc(db, 'edpi', record.id), {
    results: { ...input, hoursEach },
    score: outcome.score,
    flags: outcome.flags,
    scoredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid(),
  });
  return outcome;
}
