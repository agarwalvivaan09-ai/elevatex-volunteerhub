/**
 * Security-rule tests for the ElevateX hierarchy. Run with: npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
const future = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
const past = Timestamp.fromDate(new Date(Date.now() - 86400000));

const user = (role: string, extra: Record<string, unknown> = {}) => ({ name: role, email: `${role}@x.org`, role, status: 'active', positionId: null, departmentId: null, title: null, bio: null, responsibilities: null, ...extra });
const act = (extra: Record<string, unknown> = {}) => ({
  title: 'Drive', type: 'drive', status: 'upcoming', startAt: future, endAt: null, credits: 1, openForRequests: true,
  audience: 'all', mode: 'in_person', mapUrl: 'https://maps.app.goo.gl/x', meetingUrl: null, departmentId: 'drive-execution', leadUid: null, createdBy: 'chair', ...extra,
});
const part = (uid: string, aid: string, extra: Record<string, unknown> = {}) => ({
  activityId: aid, uid, status: 'approved', source: 'volunteer', note: null, assignment: null, reviewNote: null, reviewedBy: null, reviewedAt: null,
  attendance: null, hoursLogged: null, hoursNote: null, hoursStatus: 'none', verifiedHours: null, credits: 0, ...extra,
});
const task = (assigneeUid: string, departmentId: string | null, createdBy: string) => ({ title: 'Edit reel', description: null, assigneeUid, departmentId, dueAt: null, status: 'todo', progressNote: null, createdBy });
const plan = { plannedVolunteers: 10, plannedHours: 3, impactTarget: 100, impactUnit: 'meals', budget: 5000, normalCost: 53.42, hasPartner: 0 };

const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.org` }).firestore();
const seed = (fn: (db: ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore'] extends () => infer D ? D : never) => Promise<unknown>) =>
  env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore() as never) as Promise<void>);

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-elevatex', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await setDoc(doc(db, 'meta/bootstrap'), { adminUid: 'chair' });
    await setDoc(doc(db, 'users/chair'), user('chairman'));
    await setDoc(doc(db, 'users/vice'), user('vice_chairman'));
    await setDoc(doc(db, 'users/ceo'), user('executive'));
    await setDoc(doc(db, 'users/board'), user('board'));
    await setDoc(doc(db, 'users/cmo'), user('hod', { departmentId: 'marketing' }));
    await setDoc(doc(db, 'users/drivehead'), user('hod', { departmentId: 'drive-execution' }));
    await setDoc(doc(db, 'users/hrhead'), user('hod', { departmentId: 'hr' }));
    await setDoc(doc(db, 'users/mkt'), user('member', { departmentId: 'marketing' }));
    await setDoc(doc(db, 'users/fin'), user('member', { departmentId: 'finance' }));
    await setDoc(doc(db, 'users/hrmember'), user('member', { departmentId: 'hr' }));
    await setDoc(doc(db, 'activities/a1'), act());
    await setDoc(doc(db, 'activities/mine'), act({ createdBy: 'fin', leadUid: 'fin', departmentId: 'drive-execution' }));
    await setDoc(doc(db, 'activities/done'), act({ status: 'completed', startAt: past }));
    await setDoc(doc(db, 'participations/done_mkt'), part('mkt', 'done', { attendance: 'present' }));
    await setDoc(doc(db, 'participations/mine_mkt'), part('mkt', 'mine'));
    await setDoc(doc(db, 'edpi/done'), { plan, locked: true, results: null });
  });
});

describe('people management', () => {
  it('Chairman, Vice Chairman, CEO, COO and Head of HR manage people', async () => {
    await assertSucceeds(setDoc(doc(as('chair'), 'users/n1'), user('member', { email: 'n1@x.org' })));
    await assertSucceeds(setDoc(doc(as('vice'), 'users/n2'), user('hod', { email: 'n2@x.org', departmentId: 'finance' })));
    // CEO/COO and the Head of HR add, promote and remove people too (never Chairman or Vice Chairman).
    await assertSucceeds(setDoc(doc(as('ceo'), 'users/n3'), user('member', { email: 'n3@x.org', positionId: 'member' })));
    await assertSucceeds(setDoc(doc(as('ceo'), 'users/n3b'), user('hod', { email: 'n3b@x.org', departmentId: 'finance' })));
    await assertFails(setDoc(doc(as('ceo'), 'users/n3e'), user('vice_chairman', { email: 'n3e@x.org' })));
    await assertFails(setDoc(doc(as('hrhead'), 'users/n3f'), user('chairman', { email: 'n3f@x.org' })));
    await assertSucceeds(setDoc(doc(as('hrhead'), 'users/n3c'), user('member', { email: 'n3c@x.org', departmentId: 'marketing', positionId: 'member' })));
    await assertFails(setDoc(doc(as('hrmember'), 'users/n3d'), user('member', { email: 'n3d@x.org', positionId: 'member' })));
    await assertFails(setDoc(doc(as('board'), 'users/n4'), user('member', { email: 'n4@x.org' })));
    await assertFails(setDoc(doc(as('cmo'), 'users/n5'), user('member', { email: 'n5@x.org' })));
  });
  it('nobody can create another Chairman; only the Chairman appoints a Vice Chairman', async () => {
    await assertFails(setDoc(doc(as('vice'), 'users/x'), user('chairman', { email: 'x@x.org' })));
    await assertFails(setDoc(doc(as('vice'), 'users/y'), user('vice_chairman', { email: 'y@x.org' })));
    await assertSucceeds(setDoc(doc(as('chair'), 'users/z'), user('vice_chairman', { email: 'z@x.org' })));
  });
  it('Vice Chairman cannot touch the Chairman; Chairman cannot lose access', async () => {
    await assertFails(updateDoc(doc(as('vice'), 'users/chair'), { status: 'removed' }));
    await assertFails(updateDoc(doc(as('chair'), 'users/chair'), { role: 'member' }));
    await assertSucceeds(updateDoc(doc(as('chair'), 'users/chair'), { title: 'Founder, Former CEO & Chairman' }));
  });
  it('people admins promote members; members only edit name/bio', async () => {
    await assertSucceeds(updateDoc(doc(as('vice'), 'users/mkt'), { role: 'hod', positionId: 'cmo' }));
    await assertSucceeds(updateDoc(doc(as('hrhead'), 'users/fin'), { role: 'hod', positionId: 'cfo', departmentId: 'finance' }));
    await assertSucceeds(updateDoc(doc(as('ceo'), 'users/fin'), { status: 'removed' }));
    await assertFails(updateDoc(doc(as('ceo'), 'users/vice'), { status: 'removed' }));
    await assertFails(updateDoc(doc(as('hrhead'), 'users/chair'), { status: 'removed' }));
    await assertFails(updateDoc(doc(as('hrhead'), 'users/hrhead'), { role: 'executive' }));
    await assertFails(updateDoc(doc(as('hrmember'), 'users/mkt'), { role: 'hod' }));
    await assertSucceeds(updateDoc(doc(as('ceo'), 'users/fin'), { status: 'active', role: 'member', positionId: null, departmentId: 'finance' }));
    await assertFails(updateDoc(doc(as('fin'), 'users/fin'), { role: 'hod' }));
    await assertSucceeds(updateDoc(doc(as('fin'), 'users/fin'), { bio: 'hello' }));
  });
  it('legacy admin migrates itself to chairman', async () => {
    await seed((db) => setDoc(doc(db, 'users/legacy'), user('admin', { email: 'legacy@x.org' })));
    await assertSucceeds(updateDoc(doc(as('legacy'), 'users/legacy'), { role: 'chairman' }));
  });
});

describe('activities', () => {
  it('members can only PROPOSE drives', async () => {
    await assertFails(setDoc(doc(as('fin'), 'activities/x'), act({ createdBy: 'fin' })));
    await assertSucceeds(setDoc(doc(as('fin'), 'activities/x'), act({ createdBy: 'fin', status: 'proposed' })));
  });
  it('drive head and leadership publish drives directly; other heads propose', async () => {
    await assertSucceeds(setDoc(doc(as('drivehead'), 'activities/d1'), act({ createdBy: 'drivehead' })));
    await assertSucceeds(setDoc(doc(as('board'), 'activities/d2'), act({ createdBy: 'board' })));
    await assertFails(setDoc(doc(as('cmo'), 'activities/d3'), act({ createdBy: 'cmo' })));
  });
  it('core team approves a proposal, but not their own', async () => {
    await seed((db) => setDoc(doc(db, 'activities/p'), act({ createdBy: 'fin', status: 'proposed' })));
    await assertFails(updateDoc(doc(as('fin'), 'activities/p'), { status: 'upcoming' }));
    await assertSucceeds(updateDoc(doc(as('cmo'), 'activities/p'), { status: 'upcoming' }));
    await seed((db) => setDoc(doc(db, 'activities/p2'), act({ createdBy: 'cmo', status: 'proposed', departmentId: 'marketing' })));
    await assertFails(updateDoc(doc(as('cmo'), 'activities/p2'), { status: 'upcoming' }));
  });
  it('fundraisers: core team only', async () => {
    await assertFails(setDoc(doc(as('fin'), 'activities/f'), act({ type: 'fundraiser', createdBy: 'fin' })));
    await assertSucceeds(setDoc(doc(as('cmo'), 'activities/f'), act({ type: 'fundraiser', createdBy: 'cmo' })));
  });
  it('meetings: who can call which', async () => {
    const m = (by: string, audience: string, departmentId: string | null = null) => act({ type: 'meeting', audience, departmentId, createdBy: by, mode: 'online', mapUrl: null, meetingUrl: 'https://meet.google.com/abc' });
    await assertSucceeds(setDoc(doc(as('ceo'), 'activities/m1'), m('ceo', 'all')));
    await assertFails(setDoc(doc(as('board'), 'activities/m2'), m('board', 'all')));
    await assertSucceeds(setDoc(doc(as('board'), 'activities/m3'), m('board', 'board')));
    await assertSucceeds(setDoc(doc(as('cmo'), 'activities/m4'), m('cmo', 'department', 'marketing')));
    await assertFails(setDoc(doc(as('cmo'), 'activities/m5'), m('cmo', 'department', 'finance')));
    await assertFails(setDoc(doc(as('fin'), 'activities/m6'), m('fin', 'department', 'finance')));
  });
  it('online needs a meeting link, in person needs a maps link', async () => {
    await assertFails(setDoc(doc(as('ceo'), 'activities/n'), act({ createdBy: 'ceo', mapUrl: null })));
    await assertFails(setDoc(doc(as('ceo'), 'activities/n'), act({ createdBy: 'ceo', mode: 'online', meetingUrl: 'meet.google.com/x' })));
  });
  it('heads cannot edit other departments\' activities', async () => {
    await assertFails(updateDoc(doc(as('cmo'), 'activities/a1'), { title: 'x' }));
    await assertSucceeds(updateDoc(doc(as('drivehead'), 'activities/a1'), { title: 'x' }));
  });
});

describe('volunteering', () => {
  it('one click volunteer; organiser (a plain member) sees and manages the list', async () => {
    await assertSucceeds(setDoc(doc(as('hrmember'), 'participations/a1_hrmember'), part('hrmember', 'a1')));
    await assertSucceeds(getDocs(query(collection(as('fin'), 'participations'), where('activityId', '==', 'mine'))));
    await assertSucceeds(updateDoc(doc(as('fin'), 'participations/mine_mkt'), { attendance: 'present' }));
    await assertFails(getDocs(query(collection(as('hrmember'), 'participations'), where('activityId', '==', 'mine'))));
  });
  it('credits only for people marked present; organisers cannot credit themselves', async () => {
    await assertFails(updateDoc(doc(as('fin'), 'participations/mine_mkt'), { credits: 1 }));
    await assertSucceeds(updateDoc(doc(as('fin'), 'participations/mine_mkt'), { attendance: 'present', credits: 1 }));
    await seed((db) => setDoc(doc(db, 'participations/mine_fin'), part('fin', 'mine')));
    await assertFails(updateDoc(doc(as('fin'), 'participations/mine_fin'), { attendance: 'present', credits: 1 }));
    await assertSucceeds(updateDoc(doc(as('board'), 'participations/mine_fin'), { attendance: 'present', credits: 1 }));
  });
  it('meeting hosts mark attendance and give credits', async () => {
    await seed((db) => setDoc(doc(db, 'activities/m'), act({ type: 'meeting', audience: 'department', departmentId: 'marketing', createdBy: 'cmo', mode: 'online', mapUrl: null, meetingUrl: 'https://meet.google.com/a' })));
    await assertSucceeds(setDoc(doc(as('cmo'), 'participations/m_mkt'), part('mkt', 'm', { source: 'assigned', attendance: 'present', credits: 1 })));
    await assertFails(setDoc(doc(as('mkt'), 'participations/m_mkt2'), part('mkt', 'm', { attendance: 'present', credits: 1 })));
  });
  it('waitlist: full drives only accept waitlisted sign-ups; the counter cannot be faked', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'activities/full'), act({ capacity: 1 }));
      await setDoc(doc(db, 'activityStats/full'), { count: 1, waitlist: [] });
      await setDoc(doc(db, 'participations/full_fin'), part('fin', 'full'));
    });
    const db = as('mkt');
    let b = writeBatch(db);
    b.set(doc(db, 'participations/full_mkt'), part('mkt', 'full'));
    b.set(doc(db, 'activityStats/full'), { count: 2, waitlist: [] });
    await assertFails(b.commit());
    b = writeBatch(db);
    b.set(doc(db, 'participations/full_mkt'), part('mkt', 'full', { status: 'waitlisted' }));
    b.set(doc(db, 'activityStats/full'), { count: 1, waitlist: ['mkt'] });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(db, 'activityStats/full'), { count: 0, waitlist: ['mkt'] }));
    // fin withdraws, freeing the spot; mkt claims it
    const fdb = as('fin');
    b = writeBatch(fdb);
    b.delete(doc(fdb, 'participations/full_fin'));
    b.set(doc(fdb, 'activityStats/full'), { count: 0, waitlist: ['mkt'] });
    await assertSucceeds(b.commit());
    b = writeBatch(db);
    b.update(doc(db, 'participations/full_mkt'), { status: 'approved' });
    b.set(doc(db, 'activityStats/full'), { count: 1, waitlist: [] });
    await assertSucceeds(b.commit());
  });
});

describe('EDPI', () => {
  it('volunteers who attended a completed drive can enter results; others cannot', async () => {
    await assertSucceeds(updateDoc(doc(as('mkt'), 'edpi/done'), { results: { spent: 1 } }));
    await assertFails(updateDoc(doc(as('fin'), 'edpi/done'), { results: { spent: 1 } }));
    await assertFails(updateDoc(doc(as('mkt'), 'edpi/done'), { plan: { ...plan, budget: 1 } }));
  });
  it('plan cannot be unlocked', async () => {
    await assertFails(updateDoc(doc(as('chair'), 'edpi/done'), { locked: false }));
  });
});

describe('tasks', () => {
  it('heads assign only within their department', async () => {
    await assertSucceeds(setDoc(doc(as('cmo'), 'tasks/t1'), task('mkt', 'marketing', 'cmo')));
    await assertFails(setDoc(doc(as('cmo'), 'tasks/t2'), task('fin', 'marketing', 'cmo')));
    await assertFails(setDoc(doc(as('cmo'), 'tasks/t3'), task('fin', 'finance', 'cmo')));
    await assertFails(setDoc(doc(as('mkt'), 'tasks/t4'), task('fin', null, 'mkt')));
    await assertSucceeds(setDoc(doc(as('board'), 'tasks/t5'), task('fin', 'finance', 'board')));
  });
  it('assignee updates status only; others cannot read', async () => {
    await seed((db) => setDoc(doc(db, 'tasks/t'), task('mkt', 'marketing', 'cmo')));
    await assertSucceeds(updateDoc(doc(as('mkt'), 'tasks/t'), { status: 'done', progressNote: 'Posted' }));
    await assertFails(updateDoc(doc(as('mkt'), 'tasks/t'), { title: 'x' }));
    await assertFails(getDoc(doc(as('fin'), 'tasks/t')));
    await assertFails(getDoc(doc(as('hrhead'), 'tasks/t')));
    await assertSucceeds(getDoc(doc(as('cmo'), 'tasks/t')));
  });
});

describe('HR feedback', () => {
  it('HR department and leadership read feedback; other members do not', async () => {
    await assertSucceeds(setDoc(doc(as('fin'), 'feedback/f1'), { authorUid: 'fin', rating: 4, category: 'general', message: 'Good', status: 'new', hrNote: null }));
    await assertSucceeds(getDoc(doc(as('hrmember'), 'feedback/f1')));
    await assertSucceeds(getDoc(doc(as('board'), 'feedback/f1')));
    await assertFails(getDoc(doc(as('mkt'), 'feedback/f1')));
    await assertSucceeds(updateDoc(doc(as('hrhead'), 'feedback/f1'), { status: 'reviewed' }));
  });
});

describe('notifications', () => {
  it('only the recipient reads them', async () => {
    const cdb = as('cmo');
    const b = writeBatch(cdb);
    b.set(doc(cdb, 'notifications/n1'), { uid: 'mkt', title: 'New task', body: null, link: '/tasks', kind: 'task', read: false, createdBy: 'cmo' });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(as('mkt'), 'notifications/n1')));
    await assertFails(getDoc(doc(as('fin'), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(as('mkt'), 'notifications/n1'), { read: true }));
    await assertFails(deleteDoc(doc(as('fin'), 'notifications/n1')));
  });
});

describe('privacy & department changes', () => {
  it('members only see core-team profiles and themselves', async () => {
    await assertFails(getDoc(doc(as('fin'), 'users/mkt')));
    await assertSucceeds(getDoc(doc(as('fin'), 'users/fin')));
    await assertSucceeds(getDoc(doc(as('fin'), 'users/cmo')));
    await assertSucceeds(getDocs(query(collection(as('fin'), 'users'), where('role', 'in', ['chairman', 'admin', 'vice_chairman', 'executive', 'board', 'hod']))));
    await assertFails(getDocs(collection(as('fin'), 'users')));
    await assertSucceeds(getDocs(collection(as('cmo'), 'users')));
  });
  it('anyone requests a department change; HR head approves and moves them', async () => {
    await assertSucceeds(setDoc(doc(as('fin'), 'deptRequests/r1'), { uid: 'fin', userName: 'fin', fromDept: 'finance', toDept: 'marketing', reason: 'I love filming', status: 'pending', hrNote: null }));
    await assertSucceeds(getDoc(doc(as('hrmember'), 'deptRequests/r1')));
    await assertFails(getDoc(doc(as('mkt'), 'deptRequests/r1')));
    await assertFails(updateDoc(doc(as('hrmember'), 'deptRequests/r1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as('hrmember'), 'deptRequests/r1'), { hrNote: 'Recommend yes' }));
    await assertSucceeds(updateDoc(doc(as('hrhead'), 'deptRequests/r1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as('hrhead'), 'users/fin'), { departmentId: 'marketing' }));
    await assertSucceeds(updateDoc(doc(as('hrhead'), 'users/fin'), { role: 'hod' })); // Head of HR now manages people
    await assertFails(updateDoc(doc(as('cmo'), 'users/fin'), { departmentId: 'marketing' }));
  });
});

describe('recording past activities & certificates', () => {
  const past2 = Timestamp.fromDate(new Date(Date.now() - 30 * 86400000));
  it('only Chairman, Vice Chairman, CEO, COO record completed activities (maps link optional)', async () => {
    const old = act({ status: 'completed', startAt: past2, mapUrl: null, backfilled: true });
    await assertSucceeds(setDoc(doc(as('ceo'), 'activities/old1'), { ...old, createdBy: 'ceo' }));
    await assertFails(setDoc(doc(as('board'), 'activities/old2'), { ...old, createdBy: 'board' }));
    await assertFails(setDoc(doc(as('drivehead'), 'activities/old3'), { ...old, createdBy: 'drivehead' }));
    await assertFails(setDoc(doc(as('cmo'), 'activities/old4'), act({ createdBy: 'cmo', type: 'event', mapUrl: null, backfilled: true })));
  });
  it('they can add verified hours and a locked EDPI plan to a past drive', async () => {
    await seed((db) => setDoc(doc(db, 'activities/old'), act({ status: 'completed', startAt: past2, createdBy: 'chair', backfilled: true, mapUrl: null })));
    const vdb = as('vice');
    const bb = writeBatch(vdb);
    bb.set(doc(vdb, 'participations/old_mkt'), part('mkt', 'old', { source: 'assigned', attendance: 'present', hoursStatus: 'verified', verifiedHours: 3, credits: 1 }));
    bb.set(doc(vdb, 'participations/old_fin'), part('fin', 'old', { source: 'assigned', attendance: 'present', hoursStatus: 'verified', verifiedHours: 2.5, credits: 1 }));
    await assertSucceeds(bb.commit());
    await assertSucceeds(setDoc(doc(as('ceo'), 'edpi/old'), { plan, locked: true, results: null }));
    await assertFails(setDoc(doc(as('drivehead'), 'edpi/old'), { plan, locked: false, results: null }));
  });
  it('anyone requests a certificate; HR issues it', async () => {
    const r = { uid: 'board', userName: 'board', kind: 'credits', creditsAtRequest: 7, nameOnCertificate: 'Board Person', note: null, status: 'pending', activityId: null, certificateUrl: null, hrNote: null };
    await assertSucceeds(setDoc(doc(as('board'), 'certRequests/c1'), r));
    await assertSucceeds(setDoc(doc(as('fin'), 'certRequests/c2'), { ...r, uid: 'fin' }));
    await assertFails(setDoc(doc(as('fin'), 'certRequests/c3'), { ...r, uid: 'mkt' }));
    await assertFails(getDoc(doc(as('mkt'), 'certRequests/c2')));
    await assertSucceeds(updateDoc(doc(as('hrmember'), 'certRequests/c2'), { status: 'issued', certificateUrl: 'https://drive.google.com/x', certificateId: 'EX-2026-001' }));
    await assertFails(updateDoc(doc(as('fin'), 'certRequests/c2'), { status: 'issued' }));
  });
});

describe('photos, announcements, polls, documents, history, applications, alumni', () => {
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  it('attended volunteers and organisers upload drive photos; others cannot', async () => {
    await assertSucceeds(setDoc(doc(as('mkt'), 'photos/p1'), { activityId: 'done', uid: 'mkt', data: img, caption: null }));
    await assertFails(setDoc(doc(as('fin'), 'photos/p2'), { activityId: 'done', uid: 'fin', data: img, caption: null }));
    await assertSucceeds(getDoc(doc(as('fin'), 'photos/p1')));
  });
  it('heads announce to their department; leadership to everyone; members read what is meant for them', async () => {
    const a = (by: string, audience: string, departmentId: string | null) => ({ title: 'Hi', body: 'Text', audience, departmentId, pinned: false, createdBy: by });
    await assertSucceeds(setDoc(doc(as('cmo'), 'announcements/a1'), a('cmo', 'department', 'marketing')));
    await assertFails(setDoc(doc(as('cmo'), 'announcements/a2'), a('cmo', 'all', null)));
    await assertSucceeds(setDoc(doc(as('board'), 'announcements/a3'), a('board', 'all', null)));
    await assertFails(setDoc(doc(as('mkt'), 'announcements/a4'), a('mkt', 'all', null)));
    await assertSucceeds(getDoc(doc(as('mkt'), 'announcements/a1')));
    await assertFails(getDoc(doc(as('fin'), 'announcements/a1')));
    await assertSucceeds(getDocs(query(collection(as('fin'), 'announcements'), where('audience', '==', 'all'))));
    await assertSucceeds(getDocs(query(collection(as('mkt'), 'announcements'), where('departmentId', '==', 'marketing'))));
    await assertSucceeds(setDoc(doc(as('fin'), 'announcements/a3/reads/fin'), { at: 1 }));
  });
  it('polls: heads poll their department, leadership polls anyone; votes only from people asked', async () => {
    const p = (by: string, audience: string, departmentIds: string[], uids: string[] = []) => ({ question: 'Venue?', options: ['A', 'B'], audience, departmentIds, uids, multi: false, closed: false, closesAt: null, createdBy: by });
    await assertSucceeds(setDoc(doc(as('cmo'), 'polls/p1'), p('cmo', 'departments', ['marketing'])));
    await assertFails(setDoc(doc(as('cmo'), 'polls/p2'), p('cmo', 'departments', ['finance'])));
    await assertFails(setDoc(doc(as('cmo'), 'polls/p3'), p('cmo', 'all', [])));
    await assertSucceeds(setDoc(doc(as('board'), 'polls/p4'), p('board', 'people', [], ['fin'])));
    await assertSucceeds(setDoc(doc(as('mkt'), 'polls/p1/votes/mkt'), { choices: [1] }));
    await assertFails(setDoc(doc(as('fin'), 'polls/p1/votes/fin'), { choices: [0] }));
    await assertFails(setDoc(doc(as('mkt'), 'polls/p1/votes/mkt'), { choices: [0, 1] }));
    await assertSucceeds(setDoc(doc(as('fin'), 'polls/p4/votes/fin'), { choices: [0] }));
    await assertSucceeds(getDocs(query(collection(as('mkt'), 'polls'), where('departmentIds', 'array-contains', 'marketing'))));
    await assertSucceeds(getDocs(query(collection(as('fin'), 'polls'), where('uids', 'array-contains', 'fin'))));
    await assertFails(getDoc(doc(as('fin'), 'polls/p1')));
  });
  it('documents: heads add to their department, leadership anywhere', async () => {
    const d = (by: string, audience: string, departmentId: string | null) => ({ title: 'Guide', url: 'https://drive.google.com/x', description: null, audience, departmentId, createdBy: by });
    await assertSucceeds(setDoc(doc(as('cmo'), 'docs/d1'), d('cmo', 'department', 'marketing')));
    await assertFails(setDoc(doc(as('mkt'), 'docs/d2'), d('mkt', 'all', null)));
    await assertSucceeds(setDoc(doc(as('ceo'), 'docs/d3'), d('ceo', 'all', null)));
    await assertFails(getDoc(doc(as('fin'), 'docs/d1')));
  });
  it('change history is append-only and leadership-only', async () => {
    await assertSucceeds(setDoc(doc(as('fin'), 'audit/x'), { action: 'credits.changed', actorUid: 'fin', detail: null, at: serverTimestamp() }));
    await assertFails(setDoc(doc(as('fin'), 'audit/y'), { action: 'x', actorUid: 'mkt', detail: null, at: serverTimestamp() }));
    await assertFails(getDoc(doc(as('cmo'), 'audit/x')));
    await assertSucceeds(getDoc(doc(as('board'), 'audit/x')));
    await assertFails(updateDoc(doc(as('chair'), 'audit/x'), { action: 'y' }));
  });
  it('website applications: anyone can apply, only HR and the top four review', async () => {
    const appl = { name: 'New Person', email: 'new@x.org', phone: '9830012345', school: 'DPS', grade: '10', city: 'Kolkata', departments: ['marketing'], why: 'I want to help with drives', heard: null, availability: null, consent: true, status: 'new', createdAt: serverTimestamp() };
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(anon, 'applications/ap1'), appl));
    await assertFails(setDoc(doc(anon, 'applications/ap2'), { ...appl, status: 'accepted' }));
    await assertFails(setDoc(doc(anon, 'applications/ap3'), { ...appl, extra: 'spam' }));
    await assertFails(getDoc(doc(anon, 'applications/ap1')));
    await assertSucceeds(getDoc(doc(as('hrmember'), 'applications/ap1')));
    await assertFails(getDoc(doc(as('mkt'), 'applications/ap1')));
    await assertSucceeds(updateDoc(doc(as('hrmember'), 'applications/ap1'), { status: 'interview' }));
    // Phone, class and city are required.
    await assertFails(setDoc(doc(anon, 'applications/ap4'), { ...appl, phone: null }));
    await assertFails(setDoc(doc(anon, 'applications/ap5'), { ...appl, grade: '' }));
    await assertFails(setDoc(doc(anon, 'applications/ap6'), { ...appl, city: null }));
    // Board and other heads don't see applications; the CEO does.
    await assertFails(getDoc(doc(as('board'), 'applications/ap1')));
    await assertFails(getDoc(doc(as('cmo'), 'applications/ap1')));
    await assertSucceeds(getDoc(doc(as('ceo'), 'applications/ap1')));
    // HR members accept; only the Head of HR or the top four mark someone as added to the Hub.
    await assertSucceeds(updateDoc(doc(as('hrmember'), 'applications/ap1'), { status: 'accepted' }));
    await assertFails(updateDoc(doc(as('hrmember'), 'applications/ap1'), { status: 'added', accountUid: 'n9' }));
    await assertSucceeds(updateDoc(doc(as('hrhead'), 'applications/ap1'), { status: 'added', accountUid: 'n9' }));
    await assertSucceeds(updateDoc(doc(as('hrmember'), 'applications/ap1'), { hrNotes: 'Joined Marketing' }));
  });
  it('alumni keep their own history and can request certificates, nothing else', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alum'), user('member', { email: 'alum@x.org', status: 'alumni' }));
      await setDoc(doc(db, 'participations/done_alum'), part('alum', 'done', { attendance: 'present', credits: 1 }));
    });
    await assertSucceeds(getDoc(doc(as('alum'), 'participations/done_alum')));
    await assertSucceeds(getDoc(doc(as('alum'), 'activities/done')));
    await assertSucceeds(setDoc(doc(as('alum'), 'certRequests/ca'), { uid: 'alum', userName: 'alum', kind: 'credits', creditsAtRequest: 1, nameOnCertificate: 'Alum', note: null, status: 'pending', certificateUrl: null }));
    await assertFails(getDoc(doc(as('alum'), 'users/fin')));
    await assertFails(setDoc(doc(as('alum'), 'participations/a1_alum'), part('alum', 'a1')));
  });
});
