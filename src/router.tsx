import React, { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { TrainerLayout } from '@/components/layout/TrainerLayout'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { ProtectedTrainerRoute } from '@/components/shared/ProtectedTrainerRoute'
import { PageLoading } from '@/components/shared/PageLoading'

// Lazy loaded page components
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const CustomersPage = lazy(() => import('@/pages/CustomersPage'))
const LessonsPage = lazy(() => import('@/pages/LessonsPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const FinancePage = lazy(() => import('@/pages/FinancePage'))
const TrialsPage = lazy(() => import('@/pages/TrialsPage'))
const VenuePage = lazy(() => import('@/pages/VenuePage'))
const BackupPage = lazy(() => import('@/pages/BackupPage'))
const ActivityLogPage = lazy(() => import('@/pages/ActivityLogPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const TrainerSelectPage = lazy(() => import('@/pages/trainer/TrainerSelectPage'))
const TrainerCustomersPage = lazy(() => import('@/pages/trainer/TrainerCustomersPage'))
const TrainerLessonsPage = lazy(() => import('@/pages/trainer/TrainerLessonsPage'))
const TrainerTrialsPage = lazy(() => import('@/pages/trainer/TrainerTrialsPage'))
const TrainerVenuePage = lazy(() => import('@/pages/trainer/TrainerVenuePage'))

function LazyWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LazyWrap><LoginPage /></LazyWrap>,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true,          element: <LazyWrap><CustomersPage /></LazyWrap> },
      { path: 'lessons',      element: <LazyWrap><LessonsPage /></LazyWrap> },
      { path: 'analytics',       element: <ProtectedRoute requiredRole="admin"><LazyWrap><AnalyticsPage /></LazyWrap></ProtectedRoute> },
      { path: 'finance',         element: <ProtectedRoute requiredRole="admin"><LazyWrap><FinancePage /></LazyWrap></ProtectedRoute> },
      { path: 'prepaid-lessons', element: <Navigate to="/finance" replace /> },
      { path: 'cash-flow',       element: <Navigate to="/finance" replace /> },
      { path: 'profit-loss',  element: <Navigate to="/finance" replace /> },
      { path: 'trials',       element: <LazyWrap><TrialsPage /></LazyWrap> },
      { path: 'venue',        element: <ProtectedRoute requiredRole="admin"><LazyWrap><VenuePage /></LazyWrap></ProtectedRoute> },
      { path: 'backup',       element: <ProtectedRoute requiredRole="admin"><LazyWrap><BackupPage /></LazyWrap></ProtectedRoute> },
      { path: 'activity-log', element: <ProtectedRoute requiredRole="admin"><LazyWrap><ActivityLogPage /></LazyWrap></ProtectedRoute> },
      { path: 'settings',     element: <LazyWrap><SettingsPage /></LazyWrap> },
      { path: 'profile',      element: <LazyWrap><ProfilePage /></LazyWrap> },
    ],
  },
  {
    path: '/trainer/select',
    element: (
      <ProtectedTrainerRoute>
        <LazyWrap><TrainerSelectPage /></LazyWrap>
      </ProtectedTrainerRoute>
    ),
  },
  {
    path: '/trainer',
    element: (
      <ProtectedTrainerRoute>
        <TrainerLayout />
      </ProtectedTrainerRoute>
    ),
    children: [
      { index: true,        element: <Navigate to="/trainer/customers" replace /> },
      { path: 'customers',  element: <LazyWrap><TrainerCustomersPage /></LazyWrap> },
      { path: 'lessons',    element: <LazyWrap><TrainerLessonsPage /></LazyWrap> },
      { path: 'trials',     element: <LazyWrap><TrainerTrialsPage /></LazyWrap> },
      { path: 'venue',      element: <LazyWrap><TrainerVenuePage /></LazyWrap> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
