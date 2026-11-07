# ElevateX Volunteer Hub

The internal dashboard for ElevateX volunteers. Every member signs in with their own account and sees upcoming drives, fundraisers, events and meetings. They can ask to join, see whether they were approved, log their hours and follow their verified record of contributions. Drives are scored with the **ElevateX Drive Performance Index (EDPI)**.

This is a separate project from the public website (`elevatex` repo / elevate-x.in). It does not touch that site.

Built with React + TypeScript (Vite), Firebase Authentication and Cloud Firestore. It runs on Firebase's free **Spark** plan, with no Cloud Functions and no billing.

---

## Who can do what

Access comes from a person's **position**. The Chairman and Vice Chairman assign positions under **People**.

| | Member | Head of Dept | Board of Advisors | CEO / COO | Chairman / Vice Chairman |
|---|:-:|:-:|:-:|:-:|:-:|
| Own dashboard, tasks, hours, history | ✓ | ✓ | ✓ | ✓ | ✓ |
| Volunteer with one click | ✓ | ✓ | ✓ | ✓ | ✓ |
| Propose a drive (needs core-team approval) | ✓ | ✓ | — | — | — |
| Publish drives directly | | Drive Execution head | ✓ | ✓ | ✓ |
| Approve or decline drive proposals | | ✓ | ✓ | ✓ | ✓ |
| Create fundraisers and events | | ✓ | ✓ | ✓ | ✓ |
| Department or volunteer meetings | | own department | ✓ | ✓ | ✓ |
| Board meetings | | | ✓ | ✓ | ✓ |
| All-member, core team and HOD meetings | | | | ✓ | ✓ |
| Assign tasks | | own department only | anyone | anyone | anyone |
| Read member feedback | HR dept only | HR head only | ✓ | ✓ | ✓ |
| Analytics and approvals | | ✓ | ✓ | ✓ | ✓ |
| Add or remove people, assign positions and heads | | | | | ✓ |

The organiser of an activity manages its volunteer list, attendance and hours. The organiser can be any member whose drive was approved. Heads of Department can manage every activity in their own department. Nobody can verify their own hours, except Leadership.

The **core team** is the Heads of Department, the Board of Advisors, the CEO, the COO, the Chairman and the Vice Chairman.

Rules that always apply:
- **Hours and credits count only after attendance is verified.**
- **Every activity needs a location.** In person means a venue plus a Google Maps link. Online means a meeting link. Members join online meetings straight from the Hub.
- **Notifications.** Everyone is notified about a new drive or fundraiser. Proposals go to the core team. Meeting invites go only to the people invited.
- **EDPI.** After a drive is completed, the volunteers who attended can enter its EDPI results. The plan is locked before the drive starts and can never be changed.
- **Protected roles.** Nobody can be made Chairman from the app, and the Chairman can never be removed. Only the Chairman can appoint a Vice Chairman. Each department has at most 2 heads.

- **Privacy.** Members never see other members. They only see the core team, who are their point of contact, with one-tap email. Each member's dashboard shows their own contact: their department head, or the Head of HR, or the Chairman. Names on volunteer lists and feedback are copied onto those records, so organisers can see who signed up without being able to browse members.
- **Department changes go through HR.** Anyone can ask to move department from **HR → Change department**. HR members can add notes. The Head of HR, or the Chairman, Vice Chairman, CEO or COO, approves the request, and the member is moved automatically.

These permissions are enforced in [`firestore.rules`](firestore.rules) and covered by `tests/rules.test.ts`.

**Departments:** Finance (CFO), Marketing (CMO), HR, Project Operations and Drive Execution.

---

## Setup (one time, about 15 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** → name it, for example `elevatex-hub`. Google Analytics is not needed.
2. **Build → Authentication → Get started.** Turn on **Email/Password**. Optionally, turn on **Google** too.
3. **Build → Firestore Database → Create database** → choose **Production mode** and a region close to you (for example `asia-south1`, Mumbai).
4. **Project settings (gear icon) → Your apps → Web (`</>`)** → register an app called `ElevateX Hub`. Copy the config values it shows.

### 2. Configure and run it locally
```bash
npm install
cp .env.example .env.local      # then paste your Firebase values into .env.local
npm run dev                     # opens http://localhost:5173
```

### 3. Deploy the security rules and the site
```bash
npm install -g firebase-tools   # once
firebase login
cp .firebaserc.example .firebaserc   # then put your project id in it
npm run deploy                  # builds, deploys firestore.rules and hosts the site
```
The site is then live at `https://<your-project-id>.web.app`. To use your own address, for example `hub.elevate-x.in`, go to **Hosting → Add custom domain**.

> Always deploy `firestore.rules`. Without it, the database is either locked or open to everyone.

### 4. Become the Chairman
Straight after deploying, open the site and **sign in with Google**, using the account that should own ElevateX Hub. You can also create an email/password user in **Authentication → Users → Add user**. You'll see **Set up ElevateX Hub**. Enter your name and you become the **Chairman**.
This works **only once**. After that, the setup screen never appears again.

The setup also creates the five departments and every position: Chairman, Vice Chairman, CEO, COO, Board of Advisors, CFO, CMO, Head of HR, Head of Project Operations, Head of Drive Execution and Member. If you are upgrading an older install, the original Admin account becomes Chairman automatically the first time it signs in.

### 5. Add your members
Go to **People → Add person**, then enter their name, email, position and department. Firebase emails them a link to set their own password. If the email doesn't arrive, ask them to check spam, or use **Resend invite**.
You can change the wording of that email in **Authentication → Templates → Password reset**. A good subject is "Set your ElevateX Hub password".

---

## Try it without a real project (local demo)
Everything runs on your computer with fake data. It needs Java 11+ for the emulators.
```bash
npm run emulators                         # terminal 1
npm run seed                              # terminal 2 — creates demo accounts and activities
VITE_USE_EMULATORS=true npm run dev       # terminal 2
```
Sign in as `chairman@elevatex.test`, `ceo@elevatex.test`, `board@elevatex.test`, `cmo@elevatex.test`, `hr@elevatex.test`, `drives@elevatex.test` or `member@elevatex.test`. The password for all of them is `elevatex123`.

## Tests
```bash
npm test            # EDPI formulas, including the worked example from the framework document (105.89)
npm run test:rules  # security rules, run against the Firestore emulator
npm run typecheck
```

## Project structure
```
firestore.rules            permissions, the source of truth
src/lib/edpi.ts            EDPI engine, a pure implementation of the framework document
src/lib/api.ts             every database write the app makes
src/lib/types.ts           data model
src/context/               signed-in user and live (realtime) data shared by all pages
src/components/            layout, sidebar, buttons, modals, charts
src/pages/                 one file per screen
scripts/seed-emulator.mjs  demo data for the local emulators
tests/                     EDPI and security-rule tests
```

### Data model (Firestore)
| Collection | What's in it | Who can read |
|---|---|---|
| `users/{uid}` | name, email, role, status, positionId, bio | all active members |
| `users/{uid}/private/contact` | phone, emergency contact | the member themselves, the organiser and the core team |
| `departments`, `positions` | organisation structure | all active members |
| `activities` | drives, fundraisers, events, meetings | all active members |
| `participations/{activityId_uid}` | request, assignment, attendance, hours, credits | the member themselves, the organiser and the core team |
| `edpi/{activityId}` | locked plan, results, score, flags | core team, organiser, volunteers who attended |
| `tasks` | task, assignee, due date, status | assignee, assigner, that department's head, leadership |
| `notifications` | in-app notifications | the recipient only |
| `feedback` | member feedback to HR | the author, the HR department, leadership |
| `meta/bootstrap` | records that the Chairman was set up | signed-in users |

### Extending it later
- New page: add a file in `src/pages/`, a `<Route>` in `src/App.tsx` and a link in `src/components/Layout.tsx`.
- New field on activities: add it to `types.ts`, the form, and, if it must be validated, `validActivity()` in `firestore.rules`.
- EDPI settings (weights, normal cost and so on) are kept in one place: `EDPI_SETTINGS` in `src/lib/edpi.ts`.

### On phones
The Hub works like an app. Open it in Chrome or Safari and choose **Add to Home Screen**. Phones get a bottom tab bar (Home, Drives, Meetings, Tasks, More) and large buttons. Data is cached on the device, so the Hub opens instantly and keeps working when the connection is poor.

### Linking from elevate-x.in
The Hub links back to elevate-x.in from the sidebar, the More menu and the sign-in page. To add a button on the public site, paste this into its navbar:
```html
<a href="https://hub.elevate-x.in" class="link-btn strong">Volunteer login</a>
```

### Notes
- **Deleting a sign-in account completely.** *Remove access* blocks the person immediately. To also delete their login, go to Firebase console → Authentication → Users.
- **Notifications are in-app.** They show on the bell and the Notifications page. Email or phone push notifications would need Firebase Cloud Functions (the paid Blaze plan).
- **Meeting visibility.** Meetings are hidden in the app from people who aren't invited. The meeting records themselves can be read by any signed-in member, so don't put anything confidential in a meeting description.
- **Google sign-in** works for Gmail addresses that were registered. For other email providers, members should use email + password.

---

The ElevateX Drive Performance Index (EDPI), including its idea, formulas, structure and written explanation, was designed and developed by Vivaan Agarwal for ElevateX and is the official property of ElevateX.

© ElevateX. Internal use only.
