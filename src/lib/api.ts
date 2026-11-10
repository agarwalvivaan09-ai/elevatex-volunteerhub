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
import type { Activity, Announcement, Application, ApplicationStatus, CertKind, CertRequest, LibraryDoc, Photo, Poll, PostAudience, DeptRequest, Department, EdpiRecord, Feedback, Participation, Position, Role, Task, TaskStatus, UserProfile } from './types';
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
  await audit('member.added', { type: 'user', id: newUid, name: input.name.trim() }, `${email} as ${input.positionId}`);
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

export async function updateMember(memberUid: string, patch: Partial<Pick<UserProfile, 'role' | 'positionId' | 'departmentId' | 'title' | 'status' | 'responsibilities' | 'name'>>, before?: UserProfile) {
  await updateDoc(doc(db, 'users', memberUid), { ...patch, updatedAt: serverTimestamp() });
  const changes = (Object.keys(patch) as (keyof typeof patch)[])
    .filter((k) => !before || before[k] !== patch[k])
    .filter((k) => k !== 'responsibilities')
    .map((k) => `${k}: ${before ? String(before[k] ?? '—') + ' → ' : ''}${String(patch[k] ?? '—')}`);
  if (changes.length) await audit(patch.status ? `member.${patch.status}` : 'member.updated', { type: 'user', id: memberUid, name: before?.name ?? patch.name ?? null }, changes.join(', '));
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
  await audit(decision === 'upcoming' ? 'drive.approved' : 'drive.declined', { type: 'activity', id: a.id, name: a.title }, note || undefined);
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
  await audit('activity.deleted', { type: 'activity', id });
  await deleteDoc(doc(db, 'edpi', id)).catch(() => {});
}

// ---------------------------------------------------------------- change history
/** Append-only record of important changes (read by Leadership on the Change history page). */
export async function audit(action: string, target: { type?: string; id?: string; name?: string | null } = {}, detail?: string) {
  const u = auth.currentUser;
  if (!u) return;
  await addDoc(collection(db, 'audit'), {
    action,
    actorUid: u.uid,
    actorName: actorName,
    targetType: target.type ?? null,
    targetId: target.id ?? null,
    targetName: target.name ?? null,
    detail: detail?.slice(0, 500) ?? null,
    at: serverTimestamp(),
  }).catch((e) => console.warn('audit failed', e));
}
let actorName: string | null = null;
/** Called once the signed-in profile is known, so history entries carry a readable name. */
export const setActorName = (name: string) => { actorName = name; };

// ---------------------------------------------------------------- volunteering, waitlist, attendance & credits
const pid = (activityId: string, memberUid: string) => `${activityId}_${memberUid}`;
const statsRef = (activityId: string) => doc(db, 'activityStats', activityId);

const freshParticipation = {
  note: null,
  assignment: null,
  reviewNote: null,
  reviewedBy: null,
  reviewedAt: null,
  attendance: null,
  attendanceBy: null,
  credits: 0,
};

/**
 * Volunteer with one tap. If the activity is full you join the waitlist instead.
 * The shared counter is updated in the same write (the rules check it).
 */
export async function volunteer(a: Activity, note: string, myName: string): Promise<'approved' | 'waitlisted'> {
  const me = uid();
  return runTransaction(db, async (tx) => {
    const st = await tx.get(statsRef(a.id));
    const count = st.exists() ? (st.data().count as number) : 0;
    const waitlist = st.exists() ? ((st.data().waitlist as string[]) ?? []) : [];
    const full = a.capacity != null && count >= a.capacity;
    const status = full ? 'waitlisted' : 'approved';
    tx.set(doc(db, 'participations', pid(a.id, me)), {
      activityId: a.id, uid: me, userName: myName, status, source: 'volunteer',
      ...freshParticipation, note: note.trim() || null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    tx.set(statsRef(a.id), full ? { count, waitlist: [...waitlist, me] } : { count: count + 1, waitlist });
    return status;
  }).then(async (status) => {
    if (status === 'approved')
      await notifySafe([a.leadUid ?? a.createdBy], { kind: 'volunteer', title: `New volunteer for ${a.title}`, body: myName, link: `/activities/${a.id}` });
    return status;
  });
}

/** Leave an activity (or its waitlist). If a spot frees up, the first person waiting is told they can take it. */
export async function withdraw(p: Participation, a: Activity) {
  const me = uid();
  let next: string | undefined;
  await runTransaction(db, async (tx) => {
    const st = await tx.get(statsRef(a.id));
    const count = st.exists() ? (st.data().count as number) : 0;
    const waitlist = st.exists() ? ((st.data().waitlist as string[]) ?? []) : [];
    tx.delete(doc(db, 'participations', p.id));
    if (p.status === 'waitlisted') tx.set(statsRef(a.id), { count, waitlist: waitlist.filter((x) => x !== me) });
    else {
      tx.set(statsRef(a.id), { count: Math.max(0, count - 1), waitlist });
      next = waitlist[0];
    }
  });
  if (next) await notifySafe([next], { kind: 'volunteer', title: `A spot opened up: ${a.title}`, body: 'You were first on the waitlist. Tap to take the spot before someone else does.', link: `/activities/${a.id}` });
}

/** A waitlisted volunteer takes a freed spot. */
export async function claimSpot(p: Participation, a: Activity) {
  const me = uid();
  await runTransaction(db, async (tx) => {
    const st = await tx.get(statsRef(a.id));
    const count = st.exists() ? (st.data().count as number) : 0;
    const waitlist = st.exists() ? ((st.data().waitlist as string[]) ?? []) : [];
    if (a.capacity != null && count >= a.capacity) throw new Error('Sorry, the spot has already been taken. You are still on the waitlist.');
    tx.update(doc(db, 'participations', p.id), { status: 'approved', updatedAt: serverTimestamp() });
    tx.set(statsRef(a.id), { count: count + 1, waitlist: waitlist.filter((x) => x !== me) });
  });
}

/** Organisers: rewrite the counter from the real list (used after any organiser change). */
export async function syncStats(a: Activity, parts: Participation[]) {
  const approved = parts.filter((x) => x.status === 'approved').length;
  const waitlist = parts.filter((x) => x.status === 'waitlisted').sort((x, y) => (x.createdAt?.getTime() ?? 0) - (y.createdAt?.getTime() ?? 0)).map((x) => x.uid);
  await setDoc(statsRef(a.id), { count: approved, waitlist });
}

export async function addVolunteer(a: Activity, member: UserProfile, assignment: string, parts: Participation[]) {
  const rec = {
    activityId: a.id, uid: member.id, userName: member.name, status: 'approved', source: 'assigned',
    ...freshParticipation, assignment: assignment.trim() || null, reviewedBy: uid(), reviewedAt: serverTimestamp(),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'participations', pid(a.id, member.id)), rec);
  await syncStats(a, [...parts.filter((x) => x.uid !== member.id), { ...(rec as unknown as Participation), status: 'approved' }]);
  await notifySafe([member.id], { kind: 'volunteer', title: `You've been added to ${a.title}`, body: assignment ? `Your role: ${assignment}` : fmtDateTime(a.startAt), link: `/activities/${a.id}` });
}

export async function setAssignment(p: Participation, assignment: string) {
  await updateDoc(doc(db, 'participations', p.id), { assignment: assignment.trim() || null, updatedAt: serverTimestamp() });
}

export async function removeVolunteer(p: Participation, a: Activity, reason: string, parts: Participation[]) {
  await updateDoc(doc(db, 'participations', p.id), { status: 'rejected', reviewNote: reason.trim() || null, reviewedBy: uid(), reviewedAt: serverTimestamp(), attendance: null, credits: 0, updatedAt: serverTimestamp() });
  await syncStats(a, parts.map((x) => (x.id === p.id ? { ...x, status: 'rejected' as const } : x)));
  await notifySafe([p.uid], { kind: 'volunteer', title: `You were removed from ${a.title}`, body: reason || undefined, link: `/activities/${a.id}` });
  if (p.credits) await audit('credits.removed', { type: 'participation', id: p.id, name: p.userName ?? null }, `${a.title}: ${p.credits} credits removed`);
}

/** Organisers move someone up from the waitlist (or put a removed volunteer back). */
export async function approveVolunteer(p: Participation, a: Activity, parts: Participation[]) {
  await updateDoc(doc(db, 'participations', p.id), { status: 'approved', reviewNote: null, updatedAt: serverTimestamp() });
  await syncStats(a, parts.map((x) => (x.id === p.id ? { ...x, status: 'approved' as const } : x)));
  await notifySafe([p.uid], { kind: 'volunteer', title: `You're in: ${a.title}`, body: fmtDateTime(a.startAt), link: `/activities/${a.id}` });
}

/** Marking someone present gives them the activity's credits automatically; absent takes them away. */
export async function setAttendance(p: Participation, a: Activity, attendance: 'present' | 'absent' | null) {
  const credits = attendance === 'present' ? a.credits : 0;
  await updateDoc(doc(db, 'participations', p.id), { attendance, credits, attendanceBy: uid(), attendanceAt: serverTimestamp(), updatedAt: serverTimestamp() });
  if (credits !== p.credits) await audit(attendance === 'present' ? 'credits.given' : 'credits.removed', { type: 'participation', id: p.id, name: p.userName ?? null }, `${a.title}: ${p.credits} → ${credits} credits`);
}

/** Change one person's credits for an activity (must be marked present). */
export async function setCredits(p: Participation, a: Activity, credits: number) {
  await updateDoc(doc(db, 'participations', p.id), { credits, updatedAt: serverTimestamp() });
  await audit('credits.changed', { type: 'participation', id: p.id, name: p.userName ?? null }, `${a.title}: ${p.credits} → ${credits} credits`);
}

/** Meetings: mark an invitee present/absent; creates their record the first time. */
export async function markMeetingAttendance(a: Activity, member: UserProfile, existing: Participation | undefined, attendance: 'present' | 'absent') {
  if (existing) return setAttendance(existing, a, attendance);
  const credits = attendance === 'present' ? a.credits : 0;
  await setDoc(doc(db, 'participations', pid(a.id, member.id)), {
    activityId: a.id, uid: member.id, userName: member.name, status: 'approved', source: 'assigned',
    ...freshParticipation, attendance, credits, attendanceBy: uid(), reviewedBy: uid(), reviewedAt: serverTimestamp(),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  if (credits) await audit('credits.given', { type: 'participation', id: pid(a.id, member.id), name: member.name }, `${a.title}: ${credits} credits`);
}

// ---------------------------------------------------------------- drive photos
export async function addPhoto(activityId: string, img: { data: string; w: number; h: number }, myName: string) {
  await addDoc(collection(db, 'photos'), { activityId, uid: uid(), uploaderName: myName, data: img.data, w: img.w, h: img.h, caption: null, createdAt: serverTimestamp() });
}
export const deletePhoto = (p: Photo) => deleteDoc(doc(db, 'photos', p.id));

// ---------------------------------------------------------------- announcements
export function audienceUids(users: UserProfile[], audience: PostAudience, departmentId: string | null) {
  const active = users.filter((u) => u.status === 'active');
  if (audience === 'all') return active.map((u) => u.id);
  if (audience === 'core') return active.filter((u) => isCoreRole(u.role)).map((u) => u.id);
  return active.filter((u) => u.departmentId === departmentId).map((u) => u.id);
}

export async function postAnnouncement(x: { title: string; body: string; audience: PostAudience; departmentId: string | null; pinned: boolean }, users: UserProfile[]) {
  const ref = await addDoc(collection(db, 'announcements'), { ...x, title: x.title.trim(), body: x.body.trim(), createdBy: uid(), createdByName: actorName, createdAt: serverTimestamp() });
  const n = await notifySafe(audienceUids(users, x.audience, x.departmentId), { kind: 'announcement', title: x.title.trim(), body: x.body.trim().slice(0, 140), link: '/announcements' });
  return { id: ref.id, notified: n };
}
export const updateAnnouncement = (a: Announcement, patch: Partial<Pick<Announcement, 'pinned' | 'title' | 'body'>>) => updateDoc(doc(db, 'announcements', a.id), patch);
export const deleteAnnouncement = (a: Announcement) => deleteDoc(doc(db, 'announcements', a.id));
/** Read receipt (written once per person). */
export const markAnnouncementRead = (a: Announcement) => setDoc(doc(db, 'announcements', a.id, 'reads', uid()), { at: serverTimestamp(), name: actorName });
export async function announcementReaders(a: Announcement) {
  const snap = await getDocs(collection(db, 'announcements', a.id, 'reads'));
  return snap.docs.map((d) => ({ uid: d.id, name: (d.data().name as string) ?? null }));
}

// ---------------------------------------------------------------- polls
export async function createPoll(x: Omit<Poll, 'id' | 'createdBy' | 'createdByName' | 'createdAt' | 'closed'>, users: UserProfile[]) {
  await addDoc(collection(db, 'polls'), {
    ...x,
    question: x.question.trim(),
    options: x.options.map((o) => o.trim()).filter(Boolean),
    closesAt: x.closesAt ? Timestamp.fromDate(x.closesAt) : null,
    closed: false,
    createdBy: uid(),
    createdByName: actorName,
    createdAt: serverTimestamp(),
  });
  const targets = x.audience === 'all' ? audienceUids(users, 'all', null)
    : x.audience === 'people' ? x.uids
    : users.filter((u) => u.status === 'active' && u.departmentId && x.departmentIds.includes(u.departmentId)).map((u) => u.id);
  return notifySafe(targets, { kind: 'poll', title: `New poll: ${x.question.trim()}`, body: x.closesAt ? `Closes ${fmtDateTime(x.closesAt)}` : undefined, link: '/polls' });
}
export const closePoll = (p: Poll) => updateDoc(doc(db, 'polls', p.id), { closed: true });
export const deletePoll = (p: Poll) => deleteDoc(doc(db, 'polls', p.id));
export const vote = (p: Poll, choices: number[]) => setDoc(doc(db, 'polls', p.id, 'votes', uid()), { choices, name: actorName, at: serverTimestamp() });
export const unvote = (p: Poll) => deleteDoc(doc(db, 'polls', p.id, 'votes', uid()));

// ---------------------------------------------------------------- documents library
export async function addLibraryDoc(x: { title: string; url: string; description: string; audience: PostAudience; departmentId: string | null }) {
  await addDoc(collection(db, 'docs'), { ...x, title: x.title.trim(), url: x.url.trim(), description: x.description.trim() || null, createdBy: uid(), createdByName: actorName, createdAt: serverTimestamp() });
}
export const deleteLibraryDoc = (d: LibraryDoc) => deleteDoc(doc(db, 'docs', d.id));

// ---------------------------------------------------------------- applications from the website
export async function setApplicationStatus(a: Application, status: ApplicationStatus, hrNotes?: string) {
  await updateDoc(doc(db, 'applications', a.id), {
    status,
    ...(hrNotes !== undefined ? { hrNotes: hrNotes.trim() || null } : {}),
    reviewedBy: uid(),
    reviewedAt: serverTimestamp(),
  });
}
export async function markApplicationAdded(a: Application, accountUid: string) {
  await updateDoc(doc(db, 'applications', a.id), { status: 'added', accountUid, reviewedBy: uid(), reviewedAt: serverTimestamp() });
  await audit('application.added', { type: 'user', id: accountUid, name: a.name }, a.email);
}

// ---------------------------------------------------------------- onboarding & check-ins
export const setOnboarding = (onboarding: Record<string, boolean>) => updateDoc(doc(db, 'users', uid()), { onboarding, updatedAt: serverTimestamp() });
export const sendCheckIn = (uids: string[], message: string) =>
  notify(uids, { kind: 'feedback', title: 'HR is checking in', body: message || "We haven't seen you at a drive or meeting for a while. Is everything okay? Reply from HR → Give feedback.", link: '/hr?tab=feedback' });

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
  if (status !== 'pending') await audit(`department.${status}`, { type: 'user', id: r.uid, name: r.userName }, `${r.fromDept ?? 'none'} → ${r.toDept}`);
  if (status !== 'pending')
    await notifySafe([r.uid], { kind: 'feedback', title: status === 'approved' ? 'Your department change was approved' : 'Your department change request was declined', body: hrNote || undefined, link: '/hr' });
}

// ---------------------------------------------------------------- past records (Chairman, Vice Chairman, CEO, COO)
export interface PastAttendee { user: UserProfile; credits: number }

/** Marks each attendee present with their credits. Nobody is notified. */
async function writeCredits(a: { id: string; title: string }, attendees: PastAttendee[]) {
  const me = uid();
  for (let i = 0; i < attendees.length; i += 400) {
    const batch = writeBatch(db);
    for (const { user, credits } of attendees.slice(i, i + 400)) {
      batch.set(doc(db, 'participations', pid(a.id, user.id)), {
        activityId: a.id, uid: user.id, userName: user.name, status: 'approved', source: 'assigned',
        ...freshParticipation, attendance: 'present', credits, attendanceBy: me, reviewedBy: me, reviewedAt: serverTimestamp(),
        note: 'Recorded after the event', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  await audit('past.credits', { type: 'activity', id: a.id, name: a.title }, `${attendees.length} people, ${attendees.reduce((s, x) => s + x.credits, 0)} credits in total`);
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
  await audit('past.activity', { type: 'activity', id: ref.id, name: input.title }, `Recorded a past ${input.type} on ${input.startAt.toDateString()}`);
  await writeCredits({ id: ref.id, title: input.title }, attendees);
  return ref.id;
}

export const addPastCredits = (a: Activity, attendees: PastAttendee[]) => writeCredits(a, attendees);

// ---------------------------------------------------------------- certificate requests (to HR)
export async function requestCertificate(
  r: { userName: string; kind: CertKind; activityId: string | null; activityTitle: string | null; creditsAtRequest: number; positionTitle: string | null; nameOnCertificate: string; note: string },
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
  if (patch.status !== r.status) await audit(`certificate.${patch.status}`, { type: 'certificate', id: r.id, name: r.userName }, patch.certificateId || undefined);
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
  void audit('edpi.locked', { type: 'activity', id: activityId });
  await updateDoc(doc(db, 'edpi', activityId), { locked: true, lockedAt: serverTimestamp(), lockedBy: uid(), updatedAt: serverTimestamp() });
}

export async function saveEdpiResults(
  record: EdpiRecord,
  input: { spent: number; peopleHelped: number; impactDone: number; extraHours: number[] },
  memberHours: number[],
) {
  const hoursEach = [...memberHours, ...input.extraHours];
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
