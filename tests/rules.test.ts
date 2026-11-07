/**
 * Security-rule tests. Run with: npm run test:rules (starts the Firestore emulator).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

let env: RulesTestEnvironment;
const future = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
const past = Timestamp.fromDate(new Date(Date.now() - 86400000));

const profile = (role: string, extra = {}) => ({ name: role, email: `${role}@x.org`, role, status: 'active', positionId: null, bio: null, responsibilities: null, ...extra });
const activity = (extra = {}) => ({ title: 'Drive', type: 'drive', status: 'upcoming', startAt: future, endAt: null, credits: 1, openForRequests: true, createdBy: 'core', ...extra });
const part = (uid: string, aid = 'a1', extra = {}) => ({
  activityId: aid, uid, status: 'requested', source: 'request', note: null, assignment: null, reviewNote: null, reviewedBy: null, reviewedAt: null,
  attendance: null, attendanceBy: null, hoursLogged: null, hoursNote: null, hoursStatus: 'none', verifiedHours: null, credits: 0, verifiedBy: null, verifiedAt: null, ...extra,
});
const plan = { plannedVolunteers: 40, plannedHours: 4, impactTarget: 1000, impactUnit: 'meals', budget: 60000, normalCost: 53.42, hasPartner: 1 };

const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@x.org` }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-elevatex', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'meta/bootstrap'), { adminUid: 'admin' });
    await setDoc(doc(db, 'users/admin'), profile('admin'));
    await setDoc(doc(db, 'users/core'), profile('core'));
    await setDoc(doc(db, 'users/member'), profile('member'));
    await setDoc(doc(db, 'users/other'), profile('member', { name: 'other', email: 'other@x.org' }));
    await setDoc(doc(db, 'users/gone'), profile('member', { status: 'removed', email: 'gone@x.org' }));
    await setDoc(doc(db, 'activities/a1'), activity());
    await setDoc(doc(db, 'activities/past'), activity({ startAt: past }));
    await setDoc(doc(db, 'participations/a1_other'), part('other', 'a1', { status: 'approved', attendance: 'present' }));
  });
});

describe('bootstrap', () => {
  it('cannot claim admin once an admin exists', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'users/member')));
    const db = as('member');
    const b = writeBatch(db);
    b.set(doc(db, 'users/member'), profile('admin', { email: 'member@x.org' }));
    b.set(doc(db, 'meta/bootstrap'), { adminUid: 'member' });
    await assertFails(b.commit());
  });
  it('first user can claim admin when none exists', async () => {
    await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'meta/bootstrap')));
    const db = as('newbie');
    const b = writeBatch(db);
    b.set(doc(db, 'users/newbie'), profile('admin', { email: 'newbie@x.org' }));
    b.set(doc(db, 'meta/bootstrap'), { adminUid: 'newbie' });
    await assertSucceeds(b.commit());
  });
});

describe('users & permissions', () => {
  it('member can edit own name/bio but not role, position or status', async () => {
    const db = as('member');
    await assertSucceeds(updateDoc(doc(db, 'users/member'), { name: 'New Name', bio: 'hi' }));
    await assertFails(updateDoc(doc(db, 'users/member'), { role: 'core' }));
    await assertFails(updateDoc(doc(db, 'users/member'), { positionId: 'president' }));
    await assertFails(updateDoc(doc(db, 'users/other'), { name: 'x' }));
  });
  it('core cannot change access levels or remove anyone', async () => {
    const db = as('core');
    await assertFails(updateDoc(doc(db, 'users/member'), { role: 'core' }));
    await assertFails(updateDoc(doc(db, 'users/admin'), { status: 'removed' }));
    await assertFails(setDoc(doc(db, 'users/x'), profile('member', { email: 'x@x.org' })));
  });
  it('admin manages members but cannot create admins or demote the admin', async () => {
    const db = as('admin');
    await assertSucceeds(updateDoc(doc(db, 'users/member'), { role: 'core', positionId: 'finance' }));
    await assertSucceeds(updateDoc(doc(db, 'users/other'), { status: 'removed' }));
    await assertSucceeds(setDoc(doc(db, 'users/new'), profile('member', { email: 'new@x.org' })));
    await assertFails(updateDoc(doc(db, 'users/core'), { role: 'admin' }));
    await assertFails(updateDoc(doc(db, 'users/admin'), { role: 'member' }));
  });
  it('removed users are locked out', async () => {
    const db = as('gone');
    await assertSucceeds(getDoc(doc(db, 'users/gone')));
    await assertFails(getDoc(doc(db, 'activities/a1')));
  });
  it('only admin edits positions', async () => {
    await assertFails(setDoc(doc(as('core'), 'positions/p'), { title: 'x' }));
    await assertSucceeds(setDoc(doc(as('admin'), 'positions/p'), { title: 'x' }));
  });
  it('private contact readable by owner and core, not other members', async () => {
    await assertSucceeds(setDoc(doc(as('member'), 'users/member/private/contact'), { phone: '1' }));
    await assertSucceeds(getDoc(doc(as('core'), 'users/member/private/contact')));
    await assertFails(getDoc(doc(as('other'), 'users/member/private/contact')));
  });
});

describe('activities', () => {
  it('members cannot create activities; core can; only admin deletes', async () => {
    await assertFails(setDoc(doc(as('member'), 'activities/x'), activity({ createdBy: 'member' })));
    await assertSucceeds(setDoc(doc(as('core'), 'activities/x'), activity()));
    await assertFails(deleteDoc(doc(as('core'), 'activities/x')));
    await assertSucceeds(deleteDoc(doc(as('admin'), 'activities/x')));
  });
});

describe('participation flow', () => {
  it('member can request, but not self-approve', async () => {
    const db = as('member');
    await assertFails(setDoc(doc(db, 'participations/a1_member'), part('member', 'a1', { status: 'approved' })));
    await assertSucceeds(setDoc(doc(db, 'participations/a1_member'), part('member')));
    await assertFails(updateDoc(doc(db, 'participations/a1_member'), { status: 'approved' }));
  });
  it('cannot request for someone else or for a past activity', async () => {
    await assertFails(setDoc(doc(as('member'), 'participations/a1_core'), part('core')));
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'activities/past'), { status: 'completed' }));
    await assertFails(setDoc(doc(as('member'), 'participations/past_member'), part('member', 'past')));
  });
  it("members only see their own records", async () => {
    await assertFails(getDoc(doc(as('member'), 'participations/a1_other')));
    await assertSucceeds(getDoc(doc(as('other'), 'participations/a1_other')));
    await assertSucceeds(getDoc(doc(as('core'), 'participations/a1_other')));
  });
  it('member can log hours only after being marked present, and cannot verify them', async () => {
    const db = as('other');
    await assertFails(updateDoc(doc(db, 'participations/a1_other'), { hoursLogged: 30, hoursStatus: 'pending' }));
    await assertSucceeds(updateDoc(doc(db, 'participations/a1_other'), { hoursLogged: 3, hoursStatus: 'pending' }));
    await assertFails(updateDoc(doc(db, 'participations/a1_other'), { hoursStatus: 'verified', verifiedHours: 3, credits: 1 }));
    await assertFails(updateDoc(doc(db, 'participations/a1_other'), { attendance: 'present', credits: 5 }));
  });
  it('core cannot verify hours unless attendance is present', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'participations/a1_member'), part('member', 'a1', { status: 'approved' })));
    await assertFails(updateDoc(doc(as('core'), 'participations/a1_member'), { hoursStatus: 'verified', verifiedHours: 3, credits: 1 }));
    await assertSucceeds(updateDoc(doc(as('core'), 'participations/a1_member'), { attendance: 'present', hoursStatus: 'verified', verifiedHours: 3, credits: 1 }));
  });
});

describe('EDPI', () => {
  it('members cannot read or write EDPI', async () => {
    await assertFails(setDoc(doc(as('member'), 'edpi/a1'), { plan, locked: false, results: null }));
    await assertFails(getDoc(doc(as('member'), 'edpi/a1')));
  });
  it('plan is editable before lock, frozen after lock, never unlocked', async () => {
    const db = as('core');
    await assertSucceeds(setDoc(doc(db, 'edpi/a1'), { plan, locked: false, results: null }));
    await assertSucceeds(updateDoc(doc(db, 'edpi/a1'), { plan: { ...plan, budget: 50000 } }));
    await assertFails(updateDoc(doc(db, 'edpi/a1'), { results: { spent: 1 } }));
    await assertSucceeds(updateDoc(doc(db, 'edpi/a1'), { locked: true }));
    await assertFails(updateDoc(doc(db, 'edpi/a1'), { plan: { ...plan, budget: 1 } }));
    await assertFails(updateDoc(doc(db, 'edpi/a1'), { locked: false }));
    await assertSucceeds(updateDoc(doc(db, 'edpi/a1'), { results: { spent: 1 } }));
  });
  it('no plan can be created after the drive has started', async () => {
    await assertFails(setDoc(doc(as('core'), 'edpi/past'), { plan, locked: false, results: null }));
  });
});
