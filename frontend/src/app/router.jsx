import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { ActivitiesPage } from '@/features/activities/pages/ActivitiesPage';
import { CoursesPage } from '@/features/activities/pages/CoursesPage';
import { DashboardPage } from '@/features/activities/pages/DashboardPage';
import { AcademicStructurePage } from '@/features/admin/pages/AcademicStructurePage';
import { PeoplePage } from '@/features/admin/pages/PeoplePage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useAuthStore } from '@/features/auth/store';
import { AdminFinancePage } from '@/features/finance/pages/AdminFinancePage';
import { AdminStudentFinancePage } from '@/features/finance/pages/AdminStudentFinancePage';
import { FamilyFinancePage } from '@/features/finance/pages/FamilyFinancePage';
import { GradebookIndexPage } from '@/features/gradebook/pages/GradebookIndexPage';
import { GradebookPage } from '@/features/gradebook/pages/GradebookPage';
import { MyActivitiesPage } from '@/features/homework/pages/MyActivitiesPage';
import { MyActivityPage } from '@/features/homework/pages/MyActivityPage';
import { MessagesPage } from '@/features/messages/MessagesPage';
import { NotificationsPage } from '@/features/notifications/NotificationsPage';
import { ReportCardPage } from '@/features/reportcard/ReportCardPage';
import { ReviewSubmissionsPage } from '@/features/submissions/pages/ReviewSubmissionsPage';

const HOME_BY_ROLE = {
  ADMIN: '/dashboard',
  TEACHER: '/dashboard',
  STUDENT: '/my/activities',
  PARENT: '/my/activities',
};

function HomeRedirect() {
  const role = useAuthStore((state) => state.user?.role);
  return <Navigate to={HOME_BY_ROLE[role] ?? '/login'} replace />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'messages', element: <MessagesPage /> },
          { path: 'messages/:threadId', element: <MessagesPage /> },
          {
            element: <RequireAuth roles={['TEACHER', 'ADMIN']} />,
            children: [
              { path: 'dashboard', element: <DashboardPage /> },
              { path: 'courses', element: <CoursesPage /> },
              { path: 'activities', element: <ActivitiesPage /> },
              { path: 'activities/:activityId/review', element: <ReviewSubmissionsPage /> },
              { path: 'gradebook', element: <GradebookIndexPage /> },
              { path: 'courses/:courseId/gradebook', element: <GradebookPage /> },
            ],
          },
          {
            element: <RequireAuth roles={['STUDENT', 'PARENT']} />,
            children: [
              { path: 'my/activities', element: <MyActivitiesPage /> },
              { path: 'my/activities/:activityId', element: <MyActivityPage /> },
              { path: 'my/grades', element: <ReportCardPage /> },
            ],
          },
          {
            element: <RequireAuth roles={['PARENT']} />,
            children: [{ path: 'finance', element: <FamilyFinancePage /> }],
          },
          {
            element: <RequireAuth roles={['ADMIN']} />,
            children: [
              { path: 'admin/people', element: <PeoplePage /> },
              { path: 'admin/academic', element: <AcademicStructurePage /> },
              { path: 'admin/finance', element: <AdminFinancePage /> },
              { path: 'admin/finance/:studentId', element: <AdminStudentFinancePage /> },
            ],
          },
          { path: '*', element: <p className="p-8 text-sm text-zinc-500">Página no encontrada.</p> },
        ],
      },
    ],
  },
]);
