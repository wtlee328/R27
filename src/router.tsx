import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import CustomersPage from '@/pages/CustomersPage'
import LessonsPage from '@/pages/LessonsPage'
import FinancePage from '@/pages/FinancePage'
import TrialsPage from '@/pages/TrialsPage'
import VenuePage from '@/pages/VenuePage'
import BackupPage from '@/pages/BackupPage'
import SettingsPage from '@/pages/SettingsPage'
import ProfilePage from '@/pages/ProfilePage'

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
      { path: 'settings',     element: <SettingsPage /> },
      { path: 'profile',      element: <ProfilePage /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
