import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { TrainerLayout } from '@/components/layout/TrainerLayout'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { ProtectedTrainerRoute } from '@/components/shared/ProtectedTrainerRoute'
import LoginPage from '@/pages/LoginPage'
import CustomersPage from '@/pages/CustomersPage'
import LessonsPage from '@/pages/LessonsPage'
import FinancePage from '@/pages/FinancePage'
import TrialsPage from '@/pages/TrialsPage'
import VenuePage from '@/pages/VenuePage'
import BackupPage from '@/pages/BackupPage'
import SettingsPage from '@/pages/SettingsPage'
import ProfilePage from '@/pages/ProfilePage'
import ActivityLogPage from '@/pages/ActivityLogPage'
import TrainerLessonsPage from '@/pages/trainer/TrainerLessonsPage'
import TrainerTrialsPage from '@/pages/trainer/TrainerTrialsPage'
import TrainerVenuePage from '@/pages/trainer/TrainerVenuePage'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true,          element: <CustomersPage /> },
      { path: 'lessons',      element: <LessonsPage /> },
      { path: 'finance',      element: <ProtectedRoute requiredRole="admin"><FinancePage /></ProtectedRoute> },
      { path: 'cash-flow',    element: <Navigate to="/finance" replace /> },
      { path: 'profit-loss',  element: <Navigate to="/finance" replace /> },
      { path: 'trials',       element: <TrialsPage /> },
      { path: 'venue',        element: <ProtectedRoute requiredRole="admin"><VenuePage /></ProtectedRoute> },
      { path: 'backup',       element: <ProtectedRoute requiredRole="admin"><BackupPage /></ProtectedRoute> },
      { path: 'activity-log', element: <ProtectedRoute requiredRole="admin"><ActivityLogPage /></ProtectedRoute> },
      { path: 'settings',     element: <SettingsPage /> },
      { path: 'profile',      element: <ProfilePage /> },
    ],
  },
  {
    path: '/trainer',
    element: (
      <ProtectedTrainerRoute>
        <TrainerLayout />
      </ProtectedTrainerRoute>
    ),
    children: [
      { index: true,        element: <Navigate to="/trainer/lessons" replace /> },
      { path: 'lessons',    element: <TrainerLessonsPage /> },
      { path: 'trials',     element: <TrainerTrialsPage /> },
      { path: 'venue',      element: <TrainerVenuePage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
