import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuthState, useMe } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { firebaseConfigured } from './lib/firebase';
import { Layout } from './components/Layout';
import { Loading, ToastProvider } from './components/ui';
import { LoginPage } from './pages/Login';
import { SetupPage, RemovedPage, NotConfiguredPage } from './pages/Setup';
import { DashboardPage } from './pages/Dashboard';
import { ActivitiesPage } from './pages/Activities';
import { ActivityDetailPage } from './pages/ActivityDetail';
import { ActivityFormPage } from './pages/ActivityForm';
import { ContributionsPage } from './pages/Contributions';
import { ReviewPage } from './pages/Review';
import { MembersPage } from './pages/Members';
import { MemberProfilePage } from './pages/MemberProfile';
import { OrganisationPage } from './pages/Organisation';
import { ProfilePage } from './pages/Profile';
import { AnalyticsPage } from './pages/Analytics';
import { CalculatorPage } from './pages/Calculator';
import { TasksPage } from './pages/Tasks';
import { NotificationsPage } from './pages/Notifications';
import { FeedbackPage } from './pages/Feedback';
import { DepartmentPage } from './pages/Department';

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
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="activities" element={<ActivitiesPage kind="activities" />} />
          <Route path="meetings" element={<ActivitiesPage kind="meetings" />} />
          <Route path="activities/new" element={<ActivityFormPage />} />
          <Route path="activities/:id" element={<ActivityDetailPage />} />
          <Route path="activities/:id/edit" element={<ActivityFormPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="feedback" element={<FeedbackPage />} />
          <Route path="departments/:id" element={<DepartmentPage />} />
          <Route path="contributions" element={<ContributionsPage />} />
          <Route path="review" element={<CoreOnly><ReviewPage /></CoreOnly>} />
          <Route path="analytics" element={<CoreOnly><AnalyticsPage /></CoreOnly>} />
          <Route path="members" element={<MembersPage />} />
          <Route path="members/:id" element={<MemberProfilePage />} />
          <Route path="organisation" element={<OrganisationPage />} />
          <Route path="edpi" element={<CalculatorPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
