import React, { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { TrainerLayout } from '@/components/layout/TrainerLayout'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'
import { ProtectedTrainerRoute } from '@/components/shared/ProtectedTrainerRoute'
import { PageLoading } from '@/components/shared/PageLoading'

// Safe lazy import with auto-reload for cache busting / post-deployment chunk mismatch
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const pageHasBeenForceRefreshed = window.sessionStorage.getItem('r27-chunk-force-refreshed') === 'true'

    try {
      const component = await componentImport()
      window.sessionStorage.setItem('r27-chunk-force-refreshed', 'false')
      return component
    } catch (error: any) {
      if (!pageHasBeenForceRefreshed) {
        console.warn('Chunk import failed, refreshing page for latest bundle version...', error)
        window.sessionStorage.setItem('r27-chunk-force-refreshed', 'true')
        window.location.reload()
        return { default: (() => null) as unknown as T }
      }
      throw error
    }
  })
}

// Lazy loaded page components
const LoginPage = lazyWithRetry(() => import('@/pages/LoginPage'))
const CustomersPage = lazyWithRetry(() => import('@/pages/CustomersPage'))
const LessonsPage = lazyWithRetry(() => import('@/pages/LessonsPage'))
const AnalyticsPage = lazyWithRetry(() => import('@/pages/AnalyticsPage'))
const FinancePage = lazyWithRetry(() => import('@/pages/FinancePage'))
const TrialsPage = lazyWithRetry(() => import('@/pages/TrialsPage'))
const VenuePage = lazyWithRetry(() => import('@/pages/VenuePage'))
const BackupPage = lazyWithRetry(() => import('@/pages/BackupPage'))
const ActivityLogPage = lazyWithRetry(() => import('@/pages/ActivityLogPage'))
const SettingsPage = lazyWithRetry(() => import('@/pages/SettingsPage'))
const ProfilePage = lazyWithRetry(() => import('@/pages/ProfilePage'))
const TrainerSelectPage = lazyWithRetry(() => import('@/pages/trainer/TrainerSelectPage'))
const TrainerCustomersPage = lazyWithRetry(() => import('@/pages/trainer/TrainerCustomersPage'))
const TrainerLessonsPage = lazyWithRetry(() => import('@/pages/trainer/TrainerLessonsPage'))
const TrainerTrialsPage = lazyWithRetry(() => import('@/pages/trainer/TrainerTrialsPage'))
const TrainerVenuePage = lazyWithRetry(() => import('@/pages/trainer/TrainerVenuePage'))

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
