// Fills the LOCAL Firebase emulators with demo data so you can try the Hub safely.
// Never touches a real Firebase project.
//   1. npm run emulators          (in one terminal)
//   2. npm run seed               (in another; runs through vite-node so it can reuse src/lib)
//   3. VITE_USE_EMULATORS=true npm run dev
// Every demo account uses the password "elevatex123". All names are fictional.
import { computeEdpi } from '../src/lib/edpi.ts';
import { DEPARTMENTS, POSITIONS } from '../src/lib/structure.ts';

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
let n = 0;
const add = (col, data) => put(`${col}/seed${++n}`, data);
const createUser = async (email) => (await req(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, { method: 'POST', body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) })).localId;

const day = (offset, h = 10) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return d; };
const hrs = (d, x) => new Date(d.getTime() + x * 3600000);
const MAP = 'https://maps.app.goo.gl/demoLocation';
const MEET = 'https://meet.google.com/abc-defg-hij';

async function main() {
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`${FS}`.replace('/v1/', '/emulator/v1/'), { method: 'DELETE' });

  // [key, email, name, positionId, departmentId, title]
  const people = [
    ['chair', 'chairman@elevatex.test', 'Arjun Malhotra', 'chairman', null, 'Founder, Former CEO & Chairman'],
    ['vice', 'vice@elevatex.test', 'Rhea Kapoor', 'vice-chairman', null, 'Founder, Former COO & Vice Chairman'],
    ['ceo', 'ceo@elevatex.test', 'Kabir Rao', 'ceo', null, null],
    ['coo', 'coo@elevatex.test', 'Sana Qureshi', 'coo', null, null],
    ['board', 'board@elevatex.test', 'Neel Bansal', 'board-advisor', null, 'Former CFO'],
    ['board2', 'board2@elevatex.test', 'Tara Menon', 'board-advisor', null, 'Former Head of Drives'],
    ['cfo', 'cfo@elevatex.test', 'Dev Chatterjee', 'cfo', 'finance', null],
    ['cmo', 'cmo@elevatex.test', 'Isha Sen', 'cmo', 'marketing', null],
    ['hr', 'hr@elevatex.test', 'Maya Pillai', 'head-hr', 'hr', null],
    ['ops', 'projectops@elevatex.test', 'Vikram Shah', 'head-project-operations', 'project-operations', null],
    ['drives', 'drives@elevatex.test', 'Aanya Das', 'head-drive-execution', 'drive-execution', null],
    ['member', 'member@elevatex.test', 'Ananya Iyer', 'member', 'marketing', null],
    ['rohan', 'rohan@elevatex.test', 'Rohan Gupta', 'member', 'drive-execution', null],
    ['meera', 'meera@elevatex.test', 'Meera Nair', 'member', 'hr', null],
    ['ishaan', 'ishaan@elevatex.test', 'Ishaan Verma', 'member', 'finance', null],
    ['zoya', 'zoya@elevatex.test', 'Zoya Khan', 'member', 'marketing', null],
  ];
  const pos = Object.fromEntries(POSITIONS.map((p) => [p.id, p]));
  const uid = {};
  const nameByUid = {};
  for (const [key, email, name, positionId, departmentId, title] of people) {
    uid[key] = await createUser(email);
    nameByUid[uid[key]] = name;
    await put(`users/${uid[key]}`, { name, email, role: pos[positionId].role, status: 'active', positionId, departmentId, title, bio: null, responsibilities: null, joinedAt: day(-200) });
  }
  await put('meta/bootstrap', { adminUid: uid.chair, at: new Date() });
  for (const { id, ...d } of DEPARTMENTS) await put(`departments/${id}`, d);
  for (const { id, ...p } of POSITIONS) await put(`positions/${id}`, { ...p, description: '' });

  const base = { capacity: null, credits: 1, openForRequests: true, createdAt: day(-30), links: [], instructions: '', requirements: '', mode: 'in_person', mapUrl: MAP, meetingUrl: null, audience: 'all', relatedActivityId: null, reviewedBy: null, reviewNote: null };
  const drive = (x) => ({ ...base, type: 'drive', departmentId: 'drive-execution', ...x });
  const meeting = (x) => ({ ...base, type: 'meeting', mode: 'online', mapUrl: null, meetingUrl: MEET, credits: 0, openForRequests: false, venue: 'Online', ...x });
  const acts = {
    blanket: drive({ title: 'Winter Blanket Drive', status: 'upcoming', startAt: day(6, 9), endAt: hrs(day(6, 9), 4), venue: 'Shelter Home, Sector 12', createdBy: uid.drives, leadUid: uid.drives, capacity: 25,
      description: 'Distributing 400 blankets to families at the shelter home ahead of the cold wave.', instructions: 'Meet at the gate at 8:45. Wear your ElevateX T-shirt.', requirements: 'Available 9am–1pm.',
      links: [{ label: 'Volunteer WhatsApp group', url: 'https://example.org/whatsapp' }] }),
    bake: { ...base, type: 'fundraiser', title: 'Bake Sale Fundraiser', status: 'upcoming', startAt: day(13, 11), endAt: hrs(day(13, 11), 5), venue: 'School Auditorium Foyer', createdBy: uid.ops, leadUid: uid.ops, departmentId: 'project-operations', description: 'Raising funds for the next books drive.' },
    proposal: drive({ title: 'Stray Dog Feeding Drive', status: 'proposed', startAt: day(20, 8), endAt: hrs(day(20, 8), 2), venue: 'Lake Road', createdBy: uid.rohan, leadUid: uid.rohan, description: 'Feeding strays around the lake with two local shelters.' }),
    allhands: meeting({ title: 'All-member meeting', audience: 'all', status: 'upcoming', startAt: day(2, 18), endAt: hrs(day(2, 18), 1), createdBy: uid.chair, leadUid: uid.chair, departmentId: null, description: 'Quarterly update and plans for December.' }),
    core: meeting({ title: 'Core team meeting', audience: 'core', status: 'upcoming', startAt: day(4, 17), endAt: hrs(day(4, 17), 1), createdBy: uid.vice, leadUid: uid.vice, departmentId: null, description: 'Department updates from every head.' }),
    board: meeting({ title: 'Board meeting', audience: 'board', status: 'upcoming', startAt: day(9, 19), endAt: hrs(day(9, 19), 1), createdBy: uid.board, leadUid: uid.board, departmentId: null, description: 'Strategy for 2027.' }),
    mkt: meeting({ title: 'Marketing weekly sync', audience: 'department', departmentId: 'marketing', status: 'upcoming', startAt: day(1, 16), endAt: hrs(day(1, 16), 1), createdBy: uid.cmo, leadUid: uid.cmo, description: 'Reel plan for the blanket drive.' }),
    food: drive({ title: 'Community Food Drive', status: 'completed', startAt: day(-20, 10), endAt: hrs(day(-20, 10), 4), venue: 'Community Hall, Block C', createdBy: uid.drives, leadUid: uid.drives, description: 'Meals for 800 people.' }),
    trees: drive({ title: 'Plantation Drive', status: 'completed', startAt: day(-55, 8), endAt: hrs(day(-55, 8), 3), venue: 'City Park', createdBy: uid.rohan, leadUid: uid.rohan, description: 'Planting 150 saplings.' }),
  };
  for (const [id, a] of Object.entries(acts)) await put(`activities/${id}`, { ...a, leadName: nameByUid[a.leadUid] ?? null, createdByName: nameByUid[a.createdBy] ?? null });

  const P = (aid, who, extra) => put(`participations/${aid}_${uid[who]}`, {
    activityId: aid, uid: uid[who], userName: nameByUid[uid[who]], status: 'approved', source: 'volunteer', note: null, assignment: null, reviewNote: null, reviewedBy: null, reviewedAt: null,
    attendance: null, attendanceBy: null, hoursLogged: null, hoursNote: null, hoursStatus: 'none', verifiedHours: null, credits: 0, verifiedBy: null, verifiedAt: null, createdAt: day(-2), ...extra,
  });
  const V = (h) => ({ attendance: 'present', hoursLogged: h, hoursStatus: 'verified', verifiedHours: h, credits: 1, verifiedBy: uid.drives, verifiedAt: day(-1) });
  await P('blanket', 'member', { assignment: 'Distribution team' });
  await P('blanket', 'zoya', { note: 'I can film for the reel' });
  for (const [who, h] of [['member', 3], ['rohan', 4], ['meera', 3.5], ['zoya', 4]]) await P('food', who, V(h));
  await P('food', 'ishaan', { attendance: 'present', hoursLogged: 3, hoursStatus: 'pending', hoursNote: '10:00 to 13:00' });
  for (const [who, h] of [['member', 2.5], ['rohan', 3]]) await P('trees', who, { ...V(h), verifiedBy: uid.board2 });

  const edpi = async (id, plan, results) => {
    const out = computeEdpi(plan, results);
    await put(`edpi/${id}`, { plan, locked: true, lockedAt: day(-60), lockedBy: uid.drives, results, score: out.score, flags: out.flags, scoredAt: day(-1) });
  };
  await edpi('food', { plannedVolunteers: 40, plannedHours: 4, impactTarget: 1000, impactUnit: 'meals', budget: 60000, normalCost: 53.42, hasPartner: 1 },
    { spent: 50000, peopleHelped: 800, impactDone: 900, extraHours: Array(46).fill(3), hoursEach: [3, 4, 3.5, 4, ...Array(46).fill(3)] });
  await put('edpi/trees', { plan: { plannedVolunteers: 20, plannedHours: 3, impactTarget: 150, impactUnit: 'saplings', budget: 15000, normalCost: 53.42, hasPartner: 1 }, locked: true, lockedAt: day(-60), lockedBy: uid.rohan, results: null, score: null, flags: [] });

  const T = (title, who, by, dept, dueIn, status = 'todo', progressNote = null) => add('tasks', { title, description: null, assigneeUid: uid[who], departmentId: dept, dueAt: dueIn === null ? null : day(dueIn, 18), status, progressNote, createdBy: uid[by], createdAt: day(-3), updatedAt: day(-1), completedAt: status === 'done' ? day(-1) : null });
  await T('Film the Winter Blanket Drive for Instagram', 'member', 'cmo', 'marketing', 6);
  await T('Design the bake sale poster', 'zoya', 'cmo', 'marketing', 3, 'in_progress', 'First draft shared');
  await T('Post the food drive recap reel', 'member', 'cmo', 'marketing', -2);
  await T('Reconcile food drive receipts', 'ishaan', 'cfo', 'finance', 2, 'done', 'Matches Rs. 50,000');
  await T('Call 3 new recruits for onboarding', 'meera', 'hr', 'hr', 5);

  await add('feedback', { authorName: 'Ananya Iyer', authorUid: uid.member, rating: 4, category: 'Drives & events', message: 'Loved the food drive. Would like clearer instructions the day before.', status: 'new', hrNote: null, createdAt: day(-4) });
  await add('feedback', { authorName: 'Rohan Gupta', authorUid: uid.rohan, rating: 2, category: 'Workload', message: 'Too many tasks landed in the same week as exams.', status: 'new', hrNote: null, createdAt: day(-2) });

  const N = (who, title, body, link, kind) => add('notifications', { uid: uid[who], title, body, link, kind, read: false, createdBy: uid.chair, createdAt: day(-1) });
  await N('member', 'New drive: Winter Blanket Drive', 'Shelter Home, Sector 12', '/activities/blanket', 'drive');
  await N('member', 'New task: Film the Winter Blanket Drive for Instagram', null, '/tasks', 'task');

  console.log('Seeded. Sign in with any of these (password: elevatex123):');
  for (const [, email, name, positionId] of people) console.log(`  ${pos[positionId].title.padEnd(32)} ${email.padEnd(28)} ${name}`);
}

main().catch((e) => { console.error(e.message); console.error('Is the emulator running? (npm run emulators)'); process.exit(1); });
