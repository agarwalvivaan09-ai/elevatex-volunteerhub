import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuthState, useMe } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { firebaseConfigured } from './lib/firebase';
import { Layout } from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { LoginPage } from './pages/Login';
import { SetupPage, RemovedPage, NotConfiguredPage } from './pages/Setup';
import { DashboardPage } from './pages/Dashboard';

// Everything except sign-in and the dashboard loads on demand, so the Hub opens faster on phones.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType<never>>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] as React.ComponentType })));
const ActivitiesPage = lazy(() => import('./pages/Activities').then((m) => ({ default: m.ActivitiesPage })));
const ActivityDetailPage = named(() => import('./pages/ActivityDetail'), 'ActivityDetailPage');
const ActivityFormPage = named(() => import('./pages/ActivityForm'), 'ActivityFormPage');
const ContributionsPage = named(() => import('./pages/Contributions'), 'ContributionsPage');
const ReviewPage = named(() => import('./pages/Review'), 'ReviewPage');
const MembersPage = named(() => import('./pages/Members'), 'MembersPage');
const MemberProfilePage = named(() => import('./pages/MemberProfile'), 'MemberProfilePage');
const OrganisationPage = named(() => import('./pages/Organisation'), 'OrganisationPage');
const ProfilePage = named(() => import('./pages/Profile'), 'ProfilePage');
const AnalyticsPage = named(() => import('./pages/Analytics'), 'AnalyticsPage');
const CalculatorPage = named(() => import('./pages/Calculator'), 'CalculatorPage');
const TasksPage = named(() => import('./pages/Tasks'), 'TasksPage');
const NotificationsPage = named(() => import('./pages/Notifications'), 'NotificationsPage');
const HrPage = named(() => import('./pages/Feedback'), 'HrPage');
const DepartmentPage = named(() => import('./pages/Department'), 'DepartmentPage');
const MorePage = named(() => import('./pages/More'), 'MorePage');
const RecordPage = named(() => import('./pages/Record'), 'RecordPage');
const DriveReportPage = named(() => import('./pages/DriveReport'), 'DriveReportPage');
const AnnouncementsPage = named(() => import('./pages/Announcements'), 'AnnouncementsPage');
const PollsPage = named(() => import('./pages/Polls'), 'PollsPage');
const DocumentsPage = named(() => import('./pages/Documents'), 'DocumentsPage');
const HistoryPage = named(() => import('./pages/History'), 'HistoryPage');
const MonthlyReportPage = named(() => import('./pages/MonthlyReport'), 'MonthlyReportPage');
const ApplicationsPage = named(() => import('./pages/Applications'), 'ApplicationsPage');
const AlumniPage = named(() => import('./pages/Alumni'), 'AlumniPage');

function CoreOnly({ children }: { children: ReactNode }) {
  const { can } = useMe();
  return can.isCore ? <>{children}</> : <Navigate to="/" replace />;
}

function Gate() {
  const s = useAuthState();
  if (!firebaseConfigured) return <NotConfiguredPage />;
  if (s.status === 'loading') return <Loading />;
  if (s.status === 'signedOut') return <LoginPage />;
  if (s.status === 'noProfile') return <SetupPage />;
  if (s.status === 'removed') return <RemovedPage />;
  if (s.status === 'alumni') return <Suspense fallback={<Loading />}><AlumniPage /></Suspense>;
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="*" element={
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="activities" element={<ActivitiesPage kind="activities" />} />
                <Route path="meetings" element={<ActivitiesPage kind="meetings" />} />
                <Route path="activities/new" element={<ActivityFormPage />} />
                <Route path="activities/:id" element={<ActivityDetailPage />} />
                <Route path="activities/:id/edit" element={<ActivityFormPage />} />
                <Route path="activities/:id/report" element={<DriveReportPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="hr" element={<HrPage />} />
                <Route path="feedback" element={<Navigate to="/hr" replace />} />
                <Route path="departments/:id" element={<DepartmentPage />} />
                <Route path="contributions" element={<ContributionsPage />} />
                <Route path="review" element={<CoreOnly><ReviewPage /></CoreOnly>} />
                <Route path="analytics" element={<CoreOnly><AnalyticsPage /></CoreOnly>} />
                <Route path="members" element={<MembersPage />} />
                <Route path="members/:id" element={<MemberProfilePage />} />
                <Route path="organisation" element={<OrganisationPage />} />
                <Route path="edpi" element={<CalculatorPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="more" element={<MorePage />} />
                <Route path="record" element={<RecordPage />} />
                <Route path="announcements" element={<AnnouncementsPage />} />
                <Route path="polls" element={<PollsPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="report" element={<MonthlyReportPage />} />
                <Route path="applications" element={<ApplicationsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          } />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
