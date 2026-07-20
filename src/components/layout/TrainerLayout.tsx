import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, UserCheck, Building2, LogOut, RefreshCw, ChevronDown, Users } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { useCenterStore } from '@/stores/centerStore'
import { useTrainerProfileStore } from '@/stores/trainerProfileStore'
import { cn } from '@/lib/utils'

const TRAINER_TABS = [
  { to: '/trainer/customers', label: '學員管理', icon: Users },
  { to: '/trainer/lessons', label: '銷課紀錄', icon: BookOpen },
  { to: '/trainer/trials', label: '體驗客管理', icon: UserCheck },
  { to: '/trainer/venue', label: '場租申請', icon: Building2 },
]

export function TrainerLayout() {
  const { user } = useAuthStore()
  const { setCenterId } = useCenterStore()
  const { selectedTrainerId, selectedTrainerName, clearSelectedTrainer } = useTrainerProfileStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (user?.centerId) {
      setCenterId(user.centerId as any)
    }
  }, [user, setCenterId])

  // Guard: if no trainer selected, redirect to selection page
  if (!selectedTrainerId) {
    return <Navigate to="/trainer/select" replace />
  }

  const centerLabel = user?.centerId === 'coffit' ? 'Coffit' : 'R27 Fitness'
  const centerSubLabel = '教練管理系統'

  const activeTab = TRAINER_TABS.find(t => location.pathname.startsWith(t.to))

  async function handleSignOut() {
    clearSelectedTrainer()
    await signOut()
    navigate('/login')
  }

  function handleSwitchTrainer() {
    clearSelectedTrainer()
    navigate('/trainer/select')
  }

  return (
    <div className="min-h-screen bg-stone-100 flex">
      {/* ---- Left Sidebar ---- */}
      <aside className="w-56 shrink-0 bg-stone-900 flex flex-col fixed top-0 left-0 h-screen z-40 shadow-xl">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5 border-b border-stone-800">
          <div className="text-white font-black text-lg tracking-tight leading-tight">{centerLabel}</div>
          <div className="text-stone-500 text-xs font-medium mt-1">{centerSubLabel}</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {TRAINER_TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-150 text-sm font-medium w-full',
                  isActive
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-stone-500')} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ---- Active Trainer Card + Switcher ---- */}
        <div className="px-3 py-3 border-t border-stone-800">
          <div className="bg-stone-800/60 rounded-xl p-3 mb-2">
            <p className="text-stone-500 text-[10px] font-semibold uppercase tracking-wider mb-1">目前教練</p>
            <p className="text-white font-bold text-sm truncate">{selectedTrainerName}</p>
            <button
              onClick={handleSwitchTrainer}
              className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-stone-400 hover:text-white bg-stone-700/50 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              切換教練
            </button>
          </div>
        </div>

        {/* User info + Logout */}
        <div className="px-3 pb-4 space-y-2">
          {user?.email && (
            <p className="text-stone-600 text-[11px] font-medium px-3 truncate">{user.email}</p>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-all duration-150 text-sm font-medium cursor-pointer"
          >
            <LogOut className="h-4 w-4 shrink-0 text-stone-500" />
            <span>登出</span>
          </button>
        </div>
      </aside>

      {/* ---- Main Content ---- */}
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        {/* Page Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}


