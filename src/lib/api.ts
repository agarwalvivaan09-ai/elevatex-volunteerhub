/**
 * Every write the app makes goes through this file. Firestore security rules
 * (firestore.rules) validate each of these on the server.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, createAuthAccount, db } from './firebase';
import type { Activity, CertKind, CertRequest, DeptRequest, Department, EdpiRecord, Feedback, Participation, Position, Role, Task, TaskStatus, UserProfile } from './types';
import { TYPE_LABEL } from './types';
import { computeEdpi, EDPI_SETTINGS } from './edpi';
import { DEPARTMENTS, LEGACY_DEPARTMENTS, LEGACY_POSITIONS, POSITIONS } from './structure';
import { isCoreRole } from './access';
import { fmtDateTime } from './format';

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

// ---------------------------------------------------------------- notifications
export interface NotifyInput { title: string; body?: string; link?: string; kind: string }

/**
 * In-app notifications, fanned out in batches. The sender is skipped unless includeSelf is set
 * (meeting hosts want their meeting in their own list too). Returns how many were sent.
 */
export async function notify(uids: Iterable<string>, n: NotifyInput, includeSelf = false): Promise<number> {
  const me = auth.currentUser?.uid;
  const targets = [...new Set(uids)].filter((u) => u && (includeSelf || u !== me));
  for (let i = 0; i < targets.length; i += 400) {
    const batch = writeBatch(db);
    for (const t of targets.slice(i, i + 400)) {
      batch.set(doc(collection(db, 'notifications')), {
        uid: t,
        title: n.title.slice(0, 200),
        body: n.body?.slice(0, 500) ?? null,
        link: n.link ?? null,
        kind: n.kind,
        read: false,
        createdBy: me,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return targets.length;
}
/** Notifications are best-effort: a failure never blocks the main action. */
const notifySafe = (uids: Iterable<string>, n: NotifyInput) => notify(uids, n).catch((e) => { console.warn('notify failed', e); return -1; });

/** Result of saving something that also notifies people: how many were notified, or -1 if sending failed. */
export interface SaveResult { id: string; notified: number }

export const markRead = (id: string) => updateDoc(doc(db, 'notifications', id), { read: true, readAt: serverTimestamp() });
export async function markAllRead(ids: string[]) {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.update(doc(db, 'notifications', id), { read: true, readAt: serverTimestamp() }));
    await b.commit();
  }
}
export async function clearNotifications(ids: string[]) {
  for (let i = 0; i < ids.length; i += 400) {
    const b = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => b.delete(doc(db, 'notifications', id)));
    await b.commit();
  }
}

const nameOf = (users: UserProfile[], id: string) => users.find((u) => u.id === id)?.name ?? auth.currentUser?.displayName ?? null;
const activeIds = (users: UserProfile[]) => users.filter((u) => u.status === 'active').map((u) => u.id);
const coreIds = (users: UserProfile[]) => users.filter((u) => u.status === 'active' && isCoreRole(u.role)).map((u) => u.id);

// ---------------------------------------------------------------- setup & migration
export async function adminExists(): Promise<boolean> {
  return (await getDoc(doc(db, 'meta', 'bootstrap'))).exists();
}

async function writeStructure() {
  const batch = writeBatch(db);
  DEPARTMENTS.forEach(({ id, ...d }) => batch.set(doc(db, 'departments', id), d));
  POSITIONS.forEach(({ id, ...p }) => batch.set(doc(db, 'positions', id), { ...p, description: p.description ?? '' }));
  LEGACY_DEPARTMENTS.forEach((id) => batch.delete(doc(db, 'departments', id)));
  LEGACY_POSITIONS.forEach((id) => batch.delete(doc(db, 'positions', id)));
  await batch.commit();
}

export async function bootstrapChairman(name: string) {
  const u = auth.currentUser!;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', u.uid), {
    name: name.trim(),
    email: (u.email ?? '').toLowerCase(),
    role: 'chairman',
    status: 'active',
    positionId: 'chairman',
    departmentId: null,
    title: null,
    bio: null,
    responsibilities: null,
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'meta', 'bootstrap'), { adminUid: u.uid, at: serverTimestamp() });
  await batch.commit();
  await writeStructure();
}

/** v1 → v2: the original Admin becomes Chairman and the ElevateX structure is installed. */
export async function migrateToV2(me: UserProfile) {
  if (me.role === 'admin') {
    await updateDoc(doc(db, 'users', me.id), { role: 'chairman', positionId: 'chairman', departmentId: null, updatedAt: serverTimestamp() });
  }
  await writeStructure();
}

// ---------------------------------------------------------------- members
export interface MemberInput { name: string; email: string; positionId: string; role: Role; departmentId: string | null; title: string | null }

export async function addMember(input: MemberInput) {
  const email = input.email.trim().toLowerCase();
  let newUid: string;
  try {
    newUid = await createAuthAccount(email);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/email-already-in-use')
      throw new Error('This email already has an account. If they were removed, find them in the Members list and restore them.');
    if (code === 'auth/invalid-email') throw new Error('That email address is not valid.');
    throw e;
  }
  await setDoc(doc(db, 'users', newUid), {
    name: input.name.trim(),
    email,
    role: input.role,
    status: 'active',
    positionId: input.positionId,
    departmentId: input.departmentId,
    title: input.title?.trim() || null,
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

export const sendInvite = (email: string) => sendPasswordResetEmail(auth, email);

export async function updateMember(memberUid: string, patch: Partial<Pick<UserProfile, 'role' | 'positionId' | 'departmentId' | 'title' | 'status' | 'responsibilities' | 'name'>>) {
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
export type ActivityInput = Omit<Activity, 'id' | 'createdBy' | 'createdAt' | 'reviewedBy' | 'reviewNote'>;

function activityAnnouncement(a: { type: Activity['type']; title: string; startAt: Date; venue: string; mode: Activity['mode'] }) {
  const where = a.mode === 'online' ? 'Online' : a.venue;
  return { title: `New ${TYPE_LABEL[a.type].toLowerCase()}: ${a.title}`, body: `${fmtDateTime(a.startAt)}${where ? ` · ${where}` : ''}` };
}

/**
 * Creates or updates an activity, then notifies the right people:
 *  - a published drive / fundraiser / event → everyone
 *  - a proposed drive → the core team, for approval
 *  - a meeting → its invitees
 */
export async function saveActivity(input: ActivityInput, ctx: { users: UserProfile[]; invitees?: string[] }, id?: string): Promise<SaveResult> {
  const data = {
    ...input,
    leadName: input.leadUid ? nameOf(ctx.users, input.leadUid) : null,
    startAt: Timestamp.fromDate(input.startAt),
    endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
    updatedAt: serverTimestamp(),
  };
  if (id) {
    await updateDoc(doc(db, 'activities', id), data);
    return { id, notified: 0 };
  }
  const ref = await addDoc(collection(db, 'activities'), { ...data, createdBy: uid(), createdByName: nameOf(ctx.users, uid()), createdAt: serverTimestamp(), reviewedBy: null, reviewNote: null });
  const link = `/activities/${ref.id}`;
  let notified: number;
  if (input.status === 'proposed') {
    notified = await notifySafe(coreIds(ctx.users), { kind: 'proposal', title: `Drive proposal needs approval: ${input.title}`, body: `Proposed for ${fmtDateTime(input.startAt)}`, link });
  } else if (input.type === 'meeting') {
    const me = uid();
    notified = await notify([...(ctx.invitees ?? []), me], { kind: 'meeting', ...activityAnnouncement(input), title: `Meeting: ${input.title}`, link }, true)
      .catch((e) => { console.warn('notify failed', e); return -1; });
  } else {
    notified = await notifySafe(activeIds(ctx.users), { kind: input.type, ...activityAnnouncement(input), link });
  }
  return { id: ref.id, notified };
}

export async function reviewProposal(a: Activity, decision: 'upcoming' | 'declined', note: string, users: UserProfile[]) {
  // Atomic: if two core members click at the same moment, only one decision (and one set of notifications) wins.
  const ref = doc(db, 'activities', a.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.status !== 'proposed') throw new Error('Someone on the core team has already reviewed this proposal.');
    tx.update(ref, { status: decision, reviewedBy: uid(), reviewNote: note.trim() || null, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  const link = `/activities/${a.id}`;
  if (decision === 'upcoming') {
    await notifySafe([a.createdBy], { kind: 'proposal', title: `Your drive was approved: ${a.title}`, body: note || 'It is now live and members can volunteer.', link });
    await notifySafe(activeIds(users).filter((x) => x !== a.createdBy), { kind: 'drive', ...activityAnnouncement(a), link });
  } else {
    await notifySafe([a.createdBy], { kind: 'proposal', title: `Your drive proposal was declined: ${a.title}`, body: note || undefined, link });
  }
}

export async function setActivityStatus(id: string, status: Activity['status']) {
  await updateDoc(doc(db, 'activities', id), { status, updatedAt: serverTimestamp() });
}

/** Deletes the activity together with its volunteer records and EDPI record. */
export async function deleteActivity(id: string) {
  const batch = writeBatch(db);
  try {
    const parts = await getDocs(query(collection(db, 'participations'), where('activityId', '==', id)));
    parts.forEach((p) => batch.delete(p.ref));
  } catch {
    /* proposals have no volunteers, and their creator may not be able to list them */
  }
  batch.delete(doc(db, 'activities', id));
  await batch.commit();
  await deleteDoc(doc(db, 'edpi', id)).catch(() => {});
}

// ---------------------------------------------------------------- volunteering
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

export async function volunteer(a: Activity, note: string, myName: string) {
  const me = uid();
  await setDoc(doc(db, 'participations', pid(a.id, me)), {
    activityId: a.id,
    uid: me,
    userName: myName,
    status: 'approved',
    source: 'volunteer',
    note: note.trim() || null,
    assignment: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    ...blankParticipation,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const organiser = a.leadUid ?? a.createdBy;
  await notifySafe([organiser], { kind: 'volunteer', title: `New volunteer for ${a.title}`, body: myName, link: `/activities/${a.id}` });
}

export const withdraw = (p: Participation) => deleteDoc(doc(db, 'participations', p.id));

export async function addVolunteer(a: Activity, member: UserProfile, assignment: string) {
  const memberUid = member.id;
  await setDoc(doc(db, 'participations', pid(a.id, memberUid)), {
    activityId: a.id,
    uid: memberUid,
    userName: member.name,
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
  await notifySafe([memberUid], { kind: 'volunteer', title: `You've been added to ${a.title}`, body: assignment ? `Your role: ${assignment}` : fmtDateTime(a.startAt), link: `/activities/${a.id}` });
}

export async function setAssignment(p: Participation, assignment: string) {
  await updateDoc(doc(db, 'participations', p.id), { assignment: assignment.trim() || null, updatedAt: serverTimestamp() });
}

export async function removeVolunteer(p: Participation, a: Activity, reason: string) {
  await updateDoc(doc(db, 'participations', p.id), { status: 'rejected', reviewNote: reason.trim() || null, reviewedBy: uid(), reviewedAt: serverTimestamp(), ...blankParticipation, updatedAt: serverTimestamp() });
  await notifySafe([p.uid], { kind: 'volunteer', title: `You were removed from ${a.title}`, body: reason || undefined, link: `/activities/${a.id}` });
}

export async function restoreVolunteer(p: Participation) {
  await updateDoc(doc(db, 'participations', p.id), { status: 'approved', reviewNote: null, updatedAt: serverTimestamp() });
}

export async function markAttendance(p: Participation, attendance: 'present' | 'absent' | null) {
  const patch: DocumentData = { attendance, attendanceBy: uid(), attendanceAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (attendance !== 'present') {
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

// ---------------------------------------------------------------- tasks
export async function createTask(t: { title: string; description: string; assigneeUid: string; departmentId: string | null; dueAt: Date | null }) {
  await addDoc(collection(db, 'tasks'), {
    title: t.title.trim(),
    description: t.description.trim() || null,
    assigneeUid: t.assigneeUid,
    departmentId: t.departmentId,
    dueAt: t.dueAt ? Timestamp.fromDate(t.dueAt) : null,
    status: 'todo',
    progressNote: null,
    createdBy: uid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    completedAt: null,
  });
  await notifySafe([t.assigneeUid], { kind: 'task', title: `New task: ${t.title.trim()}`, body: t.dueAt ? `Due ${fmtDateTime(t.dueAt)}` : undefined, link: '/tasks' });
}

export async function updateTaskProgress(t: Task, status: TaskStatus, progressNote: string) {
  await updateDoc(doc(db, 'tasks', t.id), {
    status,
    progressNote: progressNote.trim() || null,
    updatedAt: serverTimestamp(),
    completedAt: status === 'done' ? serverTimestamp() : null,
  });
  if (status === 'done' && t.status !== 'done') await notifySafe([t.createdBy], { kind: 'task', title: `Task completed: ${t.title}`, body: progressNote || undefined, link: '/tasks' });
}

export async function editTask(t: Task, patch: { title: string; description: string; dueAt: Date | null; assigneeUid: string; departmentId: string | null }) {
  await updateDoc(doc(db, 'tasks', t.id), {
    title: patch.title.trim(),
    description: patch.description.trim() || null,
    dueAt: patch.dueAt ? Timestamp.fromDate(patch.dueAt) : null,
    assigneeUid: patch.assigneeUid,
    departmentId: patch.departmentId,
    updatedAt: serverTimestamp(),
  });
  if (patch.assigneeUid !== t.assigneeUid) await notifySafe([patch.assigneeUid], { kind: 'task', title: `New task: ${patch.title}`, link: '/tasks' });
}

export const deleteTask = (t: Task) => deleteDoc(doc(db, 'tasks', t.id));

// ---------------------------------------------------------------- HR feedback
export async function submitFeedback(f: { rating: number; category: string; message: string }, hrUids: string[], myName: string) {
  await addDoc(collection(db, 'feedback'), {
    authorUid: uid(),
    authorName: myName,
    rating: f.rating,
    category: f.category,
    message: f.message.trim(),
    status: 'new',
    hrNote: null,
    createdAt: serverTimestamp(),
  });
  await notifySafe(hrUids, { kind: 'feedback', title: 'New member feedback received', body: `${f.category} · ${f.rating}/5`, link: '/feedback' });
}

export async function reviewFeedback(f: Feedback, hrNote: string) {
  await updateDoc(doc(db, 'feedback', f.id), { status: 'reviewed', hrNote: hrNote.trim() || null, reviewedBy: uid(), reviewedAt: serverTimestamp() });
}

export async function requestFeedback(users: UserProfile[], message: string) {
  await notify(activeIds(users), { kind: 'feedback', title: 'HR would like your feedback', body: message || 'Tell us how your experience at ElevateX is going.', link: '/feedback' });
}

// ---------------------------------------------------------------- department change requests
export async function requestDeptChange(r: { userName: string; fromDept: string | null; toDept: string; reason: string }, hrUids: string[]) {
  await addDoc(collection(db, 'deptRequests'), {
    uid: uid(),
    userName: r.userName,
    fromDept: r.fromDept,
    toDept: r.toDept,
    reason: r.reason.trim(),
    status: 'pending',
    hrNote: null,
    createdAt: serverTimestamp(),
  });
  await notifySafe(hrUids, { kind: 'feedback', title: `Department change request from ${r.userName}`, body: r.reason.slice(0, 120), link: '/hr' });
}

export const withdrawDeptRequest = (r: DeptRequest) => deleteDoc(doc(db, 'deptRequests', r.id));

/** Approve moves the member to the new department in the same batch. */
export async function decideDeptRequest(r: DeptRequest, status: 'approved' | 'declined' | 'pending', hrNote: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'deptRequests', r.id), { status, hrNote: hrNote.trim() || null, reviewedBy: uid(), reviewedAt: serverTimestamp() });
  if (status === 'approved') batch.update(doc(db, 'users', r.uid), { departmentId: r.toDept, updatedAt: serverTimestamp() });
  await batch.commit();
  if (status !== 'pending')
    await notifySafe([r.uid], { kind: 'feedback', title: status === 'approved' ? 'Your department change was approved' : 'Your department change request was declined', body: hrNote || undefined, link: '/hr' });
}

// ---------------------------------------------------------------- past records (Chairman, Vice Chairman, CEO, COO)
export interface PastAttendee { user: UserProfile; hours: number }

/** Writes verified attendance + hours for each attendee. Nobody is notified. */
async function writeVerifiedHours(activityId: string, credits: number, attendees: PastAttendee[]) {
  const me = uid();
  for (let i = 0; i < attendees.length; i += 400) {
    const batch = writeBatch(db);
    for (const { user, hours } of attendees.slice(i, i + 400)) {
      batch.set(doc(db, 'participations', pid(activityId, user.id)), {
        activityId,
        uid: user.id,
        userName: user.name,
        status: 'approved',
        source: 'assigned',
        note: null,
        assignment: null,
        reviewNote: null,
        reviewedBy: me,
        reviewedAt: serverTimestamp(),
        attendance: 'present',
        attendanceBy: me,
        hoursLogged: hours,
        hoursNote: 'Recorded after the event',
        hoursStatus: 'verified',
        verifiedHours: hours,
        credits,
        verifiedBy: me,
        verifiedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function recordPastActivity(input: ActivityInput, attendees: PastAttendee[], users: UserProfile[]): Promise<string> {
  const ref = await addDoc(collection(db, 'activities'), {
    ...input,
    status: 'completed',
    backfilled: true,
    openForRequests: false,
    leadName: input.leadUid ? nameOf(users, input.leadUid) : null,
    startAt: Timestamp.fromDate(input.startAt),
    endAt: input.endAt ? Timestamp.fromDate(input.endAt) : null,
    createdBy: uid(),
    createdByName: nameOf(users, uid()),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    reviewedBy: null,
    reviewNote: null,
  });
  await writeVerifiedHours(ref.id, input.credits, attendees);
  return ref.id;
}

export const addPastHours = (a: Activity, attendees: PastAttendee[]) => writeVerifiedHours(a.id, a.credits, attendees);

// ---------------------------------------------------------------- certificate requests (to HR)
export async function requestCertificate(
  r: { userName: string; kind: CertKind; activityId: string | null; activityTitle: string | null; hoursAtRequest: number | null; positionTitle: string | null; nameOnCertificate: string; note: string },
  hrUids: string[],
) {
  await addDoc(collection(db, 'certRequests'), {
    uid: uid(),
    ...r,
    nameOnCertificate: r.nameOnCertificate.trim(),
    note: r.note.trim() || null,
    status: 'pending',
    hrNote: null,
    certificateUrl: null,
    certificateId: null,
    createdAt: serverTimestamp(),
  });
  await notifySafe(hrUids, { kind: 'feedback', title: `Certificate request from ${r.userName}`, body: r.activityTitle ?? r.kind, link: '/hr?tab=certinbox' });
}

export const withdrawCertificate = (r: CertRequest) => deleteDoc(doc(db, 'certRequests', r.id));

export async function decideCertificate(r: CertRequest, patch: { status: CertRequest['status']; hrNote: string; certificateUrl: string; certificateId: string }) {
  await updateDoc(doc(db, 'certRequests', r.id), {
    status: patch.status,
    hrNote: patch.hrNote.trim() || null,
    certificateUrl: patch.certificateUrl.trim() || null,
    certificateId: patch.certificateId.trim() || null,
    reviewedBy: uid(),
    reviewedAt: serverTimestamp(),
  });
  if (patch.status !== 'pending' && patch.status !== r.status)
    await notifySafe([r.uid], {
      kind: 'feedback',
      title: patch.status === 'issued' ? 'Your certificate is ready' : 'Your certificate request was declined',
      body: patch.hrNote || undefined,
      link: '/hr?tab=mycerts',
    });
}

// ---------------------------------------------------------------- EDPI
/** lockNow: recording the plan of a past drive (top leadership only), saved already locked. */
export async function saveEdpiPlan(activityId: string, plan: EdpiRecord['plan'], exists: boolean, lockNow = false) {
  const data = {
    plan: { ...plan, normalCost: EDPI_SETTINGS.NormalCost }, locked: lockNow, results: null, score: null, flags: [],
    ...(lockNow ? { lockedAt: serverTimestamp(), lockedBy: uid() } : {}),
    updatedAt: serverTimestamp(), updatedBy: uid(),
  };
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
