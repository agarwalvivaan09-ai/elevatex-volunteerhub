# ElevateX Volunteer Hub

The internal dashboard for ElevateX volunteers. Every member signs in with their own account and sees upcoming drives, fundraisers, events and meetings. They can ask to join, see whether they were approved, log their hours and follow their verified record of contributions. Drives are scored with the **ElevateX Drive Performance Index (EDPI)**.

This is a separate project from the public website (`elevatex` repo / elevate-x.in). It does not touch that site.

Built with React + TypeScript (Vite), Firebase Authentication and Cloud Firestore. It runs on Firebase's free **Spark** plan, with no Cloud Functions and no billing.

---

## What each role can do

| | Member | Core Team | Admin |
|---|:-:|:-:|:-:|
| Own dashboard, position, hours, history | ✓ | ✓ | ✓ |
| View activities and request to join | ✓ | ✓ | ✓ |
| Log own hours (after being marked present) | ✓ | ✓ | ✓ |
| Edit own name, bio, phone, emergency contact | ✓ | ✓ | ✓ |
| Create and edit drives, events, fundraisers, meetings | | ✓ | ✓ |
| Approve, defer or decline requests and assign members | | ✓ | ✓ |
| Record attendance and verify hours and credits | | ✓ | ✓ |
| Fill, lock and score a drive's EDPI plan | | ✓ | ✓ |
| See member contact details, all records and analytics | | ✓ | ✓ |
| Delete activities | | | ✓ |
| Add, remove and restore members | | | ✓ |
| Change positions and access levels (Member ↔ Core) | | | ✓ |
| Create and edit departments and positions | | | ✓ |

The permissions live in [`firestore.rules`](firestore.rules) on Google's servers, not only in the interface. A member can't approve their own request, give themselves credits or change their role, even with technical tricks. The rules are covered by automated tests in `tests/rules.test.ts`.

Some rules are fixed and can't be bypassed:
- **Hours and credits count only after attendance is verified.** A member can log hours only once they are marked *present*. Only Core or Admin can verify them, and only for present members.
- **The admin account can't be demoted or removed from the app**, and nobody can be made Admin from the app.
- **A locked EDPI plan can never be changed or unlocked.** A plan can only be created before the drive starts. Results can only be entered against a locked plan.
- **Removed members lose access to everything immediately.** Their history is kept.

## How an activity works

1. **Core** creates the activity: description, date, venue, instructions, requirements, links, number of spots, lead and credits.
2. **Members** press *Request to participate*, with an optional message.
3. **Core** approves (with an optional role, for example "Registration desk"), defers or declines. They can also assign a member directly. Members see their status update straight away.
4. **On the day**, Core marks each person *present* or *absent* in **Attendance & hours**.
5. Present members **log their hours**, or Core types the hours in. Core presses **Verify**, and the hours and credits are added to the member's total.
6. For **drives and fundraisers**, the **EDPI score** tab follows the five steps in the EDPI guide: Plan → Lock (before the drive) → Record → Enter results → Score. Volunteer hours (`HoursEach`) are taken from the verified records. People who aren't on the Hub can be added from the sign-in sheet. The score, the three pillar scores, the data-rule flags and the debrief question all come from the official EDPI document.

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

### 4. Become the Admin
Straight after deploying, open the site and **sign in with Google**, using the account that should own ElevateX Hub. You can also create an email/password user in **Authentication → Users → Add user**. You'll see **Set up ElevateX Hub**. Enter your name and you become the Admin.
This works **only once**. After that, the setup screen never appears again.

The setup also creates starter departments (Leadership, Finance, Operations, Projects, Outreach & Media) and positions (President / CEO, Head of Finance, Head of Operations, Project Head, Head of Outreach, General Member). You can rename or delete all of them under **Structure & positions**.

### 5. Add your members
Go to **Members → Add member**, then enter their name, email, position and access level. Firebase emails them a link to set their own password. If the email doesn't arrive, ask them to check spam, or use **Resend invite**.
You can change the wording of that email in **Authentication → Templates → Password reset**. A good subject is "Set your ElevateX Hub password".

---

## Try it without a real project (local demo)
Everything runs on your computer with fake data. It needs Java 11+ for the emulators.
```bash
npm run emulators                         # terminal 1
npm run seed                              # terminal 2 — creates demo accounts and activities
VITE_USE_EMULATORS=true npm run dev       # terminal 2
```
Sign in as `admin@elevatex.test`, `core@elevatex.test` or `member@elevatex.test`. The password for all of them is `elevatex123`.

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
| `users/{uid}/private/contact` | phone, emergency contact | the member themselves and Core/Admin |
| `departments`, `positions` | organisation structure | all active members |
| `activities` | drives, fundraisers, events, meetings | all active members |
| `participations/{activityId_uid}` | request, assignment, attendance, hours, credits | the member themselves and Core/Admin |
| `edpi/{activityId}` | locked plan, results, score, flags | Core/Admin |
| `meta/bootstrap` | records that the Admin was set up | signed-in users |

### Extending it later
- New page: add a file in `src/pages/`, a `<Route>` in `src/App.tsx` and a link in `src/components/Layout.tsx`.
- New field on activities: add it to `types.ts`, the form, and, if it must be validated, `validActivity()` in `firestore.rules`.
- EDPI settings (weights, normal cost and so on) are kept in one place: `EDPI_SETTINGS` in `src/lib/edpi.ts`.

### Notes
- **Deleting a sign-in account completely.** *Remove access* blocks the person immediately. To also delete their login, go to Firebase console → Authentication → Users.
- **A second Admin** can only be made by editing their `role` to `admin` in the Firebase console (Firestore → `users`). This keeps admin access safe from mistakes in the app.
- **Google sign-in** works for Gmail addresses the Admin registered. For other email providers, members should use email + password.

---

The ElevateX Drive Performance Index (EDPI), including its idea, formulas, structure and written explanation, was designed and developed by Vivaan Agarwal for ElevateX and is the official property of ElevateX.

© ElevateX. Internal use only.
