// Fills the LOCAL Firebase emulators with demo data so you can try the Hub safely.
// Never touches a real Firebase project.
//   1. npm run emulators          (in one terminal)
//   2. npm run seed               (in another; runs through vite-node so it can reuse src/lib/edpi.ts)
//   3. VITE_USE_EMULATORS=true npm run dev
// Every demo account uses the password "elevatex123".
import { computeEdpi } from '../src/lib/edpi.ts';

const PROJECT = 'demo-elevatex';
const AUTH = 'http://127.0.0.1:9099';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const PASSWORD = 'elevatex123';

async function req(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner', ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
};
const put = (path, data) => req(`${FS}/${path}`, { method: 'PATCH', body: JSON.stringify({ fields: toValue(data).mapValue.fields }) });

async function createUser(email) {
  const r = await req(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) });
  return r.localId;
}

const day = (offset, h = 10) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return d; };
const hrs = (d, n) => new Date(d.getTime() + n * 3600000);

async function main() {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`${FS}`.replace('/v1/', '/emulator/v1/'), { method: 'DELETE' });

  const people = [
    ['admin@elevatex.test', 'Aarav Mehta', 'admin', 'president'],
    ['core@elevatex.test', 'Diya Sharma', 'core', 'head-operations'],
    ['finance@elevatex.test', 'Kabir Rao', 'core', 'head-finance'],
    ['member@elevatex.test', 'Ananya Iyer', 'member', 'general-member'],
    ['rohan@elevatex.test', 'Rohan Gupta', 'member', 'project-head'],
    ['meera@elevatex.test', 'Meera Nair', 'member', 'general-member'],
    ['ishaan@elevatex.test', 'Ishaan Verma', 'member', 'head-outreach'],
  ];
  const uid = {};
  for (const [email, name, role, positionId] of people) {
    const id = await createUser(email);
    uid[email.split('@')[0]] = id;
    await put(`users/${id}`, { name, email, role, status: 'active', positionId, bio: null, responsibilities: null, joinedAt: day(-200) });
  }
  await put('meta/bootstrap', { adminUid: uid.admin, at: new Date() });

  const depts = [['leadership', 'Leadership', 'Overall direction of ElevateX.'], ['finance', 'Finance', 'Budgets, fundraising accounts and drive spending.'], ['operations', 'Operations', 'Logistics, venues, volunteers on the ground.'], ['projects', 'Projects', 'Planning and running drives and campaigns.'], ['outreach', 'Outreach & Media', 'Partnerships, social media and communications.']];
  for (const [i, [id, name, description]] of depts.entries()) await put(`departments/${id}`, { name, description, order: i });
  const positions = [
    ['president', 'President / CEO', 'leadership', ['Sets direction and priorities', 'Represents ElevateX externally', 'Signs off major decisions']],
    ['head-finance', 'Head of Finance', 'finance', ['Owns drive budgets', 'Approves spending', 'Keeps receipts and accounts']],
    ['head-operations', 'Head of Operations', 'operations', ['Runs logistics on drive days', 'Coordinates volunteers', 'Venue and supplies']],
    ['project-head', 'Project Head', 'projects', ['Plans a drive end-to-end', 'Fills and locks the EDPI plan', 'Leads the debrief']],
    ['head-outreach', 'Head of Outreach', 'outreach', ['Partner organisations', 'Social media', 'Announcements']],
    ['general-member', 'General Member', null, ['Take part in drives and events', 'Log hours honestly', 'Help where needed']],
  ];
  for (const [i, [id, title, departmentId, responsibilities]] of positions.entries()) await put(`positions/${id}`, { title, departmentId, responsibilities, description: '', order: i });

  const base = { capacity: null, departmentId: 'projects', credits: 1, openForRequests: true, createdBy: uid.core, createdAt: day(-30), links: [], instructions: '', requirements: '' };
  const acts = {
    blanket: { ...base, title: 'Winter Blanket Drive', type: 'drive', status: 'upcoming', startAt: day(6, 9), endAt: hrs(day(6, 9), 4), venue: 'Shelter Home, Sector 12', leadUid: uid.core, capacity: 25,
      description: 'Distributing 400 blankets to families at the shelter home ahead of the cold wave.', instructions: 'Meet at the gate at 8:45. Wear your ElevateX T-shirt. Bring a water bottle.', requirements: 'Available 9am–1pm. Parental consent form signed (under 18).',
      links: [{ label: 'Consent form', url: 'https://example.org/consent' }, { label: 'Volunteer WhatsApp group', url: 'https://example.org/whatsapp' }] },
    bake: { ...base, title: 'Bake Sale Fundraiser', type: 'fundraiser', status: 'upcoming', startAt: day(13, 11), endAt: hrs(day(13, 11), 5), venue: 'School Auditorium Foyer', leadUid: uid.finance, departmentId: 'finance', description: 'Raising funds for the next books drive.' },
    meeting: { ...base, title: 'Monthly Core Meeting', type: 'meeting', status: 'upcoming', startAt: day(3, 17), endAt: hrs(day(3, 17), 1), venue: 'Online (Google Meet)', leadUid: uid.admin, departmentId: 'leadership', openForRequests: false, credits: 0, description: 'Review last month, plan the next drives.', links: [{ label: 'Meet link', url: 'https://meet.google.com/' }] },
    food: { ...base, title: 'Community Food Drive', type: 'drive', status: 'completed', startAt: day(-20, 10), endAt: hrs(day(-20, 10), 4), venue: 'Community Hall, Block C', leadUid: uid.core, description: 'Meals for 800 people.' },
    trees: { ...base, title: 'Plantation Drive', type: 'drive', status: 'completed', startAt: day(-55, 8), endAt: hrs(day(-55, 8), 3), venue: 'City Park', leadUid: uid.rohan, description: 'Planting 150 saplings with the municipal partner.' },
    books: { ...base, title: 'Books for All Drive', type: 'drive', status: 'completed', startAt: day(-90, 10), endAt: hrs(day(-90, 10), 3), venue: 'Government School No. 4', leadUid: uid.core, description: 'Collecting and donating books.' },
  };
  for (const [id, a] of Object.entries(acts)) await put(`activities/${id}`, a);

  const P = (aid, who, extra) => put(`participations/${aid}_${uid[who]}`, {
    activityId: aid, uid: uid[who], status: 'approved', source: 'request', note: null, assignment: null, reviewNote: null, reviewedBy: uid.core, reviewedAt: day(-1),
    attendance: null, attendanceBy: null, hoursLogged: null, hoursNote: null, hoursStatus: 'none', verifiedHours: null, credits: 0, verifiedBy: null, verifiedAt: null, createdAt: day(-2), ...extra,
  });
  const V = (h) => ({ attendance: 'present', hoursLogged: h, hoursStatus: 'verified', verifiedHours: h, credits: 1, verifiedBy: uid.core, verifiedAt: day(-1) });

  await P('blanket', 'member', { assignment: 'Distribution team' });
  await P('blanket', 'meera', { status: 'requested', reviewedBy: null, reviewedAt: null, note: 'I can bring two friends to help!' });
  await P('blanket', 'ishaan', { status: 'requested', reviewedBy: null, reviewedAt: null });
  await P('bake', 'member', { status: 'deferred', reviewNote: 'We have enough bakers — you are first in line for the next one.' });
  await P('meeting', 'finance', { source: 'assigned' });
  for (const [who, h] of [['member', 3], ['rohan', 4], ['meera', 3.5], ['core', 4]]) await P('food', who, V(h));
  await P('food', 'ishaan', { attendance: 'present', hoursLogged: 3, hoursStatus: 'pending', hoursNote: 'Arrived 10:00, left 13:00' });
  for (const [who, h] of [['member', 2.5], ['rohan', 3], ['ishaan', 3]]) await P('trees', who, V(h));
  for (const [who, h] of [['member', 3], ['meera', 2], ['finance', 3]]) await P('books', who, V(h));

  const edpi = async (id, plan, results) => {
    const out = computeEdpi(plan, results);
    await put(`edpi/${id}`, { plan, locked: true, lockedAt: day(-60), lockedBy: uid.core, results, score: out.score, flags: out.flags, scoredAt: day(-1) });
  };
  await edpi('food', { plannedVolunteers: 40, plannedHours: 4, impactTarget: 1000, impactUnit: 'meals', budget: 60000, normalCost: 53.42, hasPartner: 1 },
    { spent: 50000, peopleHelped: 800, impactDone: 900, extraHours: Array(46).fill(3), hoursEach: [3, 4, 3.5, 4, ...Array(46).fill(3)] });
  await edpi('trees', { plannedVolunteers: 20, plannedHours: 3, impactTarget: 150, impactUnit: 'saplings', budget: 15000, normalCost: 53.42, hasPartner: 1 },
    { spent: 16500, peopleHelped: 300, impactDone: 150, extraHours: Array(15).fill(3), hoursEach: [2.5, 3, 3, ...Array(15).fill(3)] });
  await edpi('books', { plannedVolunteers: 15, plannedHours: 3, impactTarget: 600, impactUnit: 'books', budget: 8000, normalCost: 53.42, hasPartner: 0 },
    { spent: 9000, peopleHelped: 150, impactDone: 450, extraHours: Array(9).fill(3.5), hoursEach: [3, 2, 3, ...Array(9).fill(3.5)] });

  console.log('Seeded. Sign in with any of these (password: elevatex123):');
  for (const [email, name, role] of people) console.log(`  ${role.padEnd(7)} ${email.padEnd(24)} ${name}`);
}

main().catch((e) => { console.error(e.message); console.error('Is the emulator running? (npm run emulators)'); process.exit(1); });
