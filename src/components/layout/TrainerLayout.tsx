import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { BookOpen, UserCheck, Building2, LogOut } from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const TRAINER_TABS = [
  { to: '/trainer/lessons', label: '銷課', icon: BookOpen },
  { to: '/trainer/trials', label: '體驗客', icon: UserCheck },
  { to: '/trainer/venue', label: '場租', icon: Building2 },
]

export function TrainerLayout() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const centerLabel = user?.centerId === 'coffit' ? 'Coffit' : 'R27'

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      {/* ---- Top Bar ---- */}
      <header className="sticky top-0 z-40 h-14 bg-stone-900 flex items-center justify-between px-4 shadow-lg shrink-0">
        <div className="flex items-center gap-2 select-none">
          <span className="text-white font-bold text-base tracking-wide">{centerLabel}</span>
          <span className="text-stone-500 text-xs font-medium">教練介面</span>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-stone-400 hover:text-white transition-colors text-sm cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">登出</span>
        </button>
      </header>

      {/* ---- Content Area ---- */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-6 animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* ---- Bottom Tab Bar ---- */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-white border-t border-stone-200 flex items-center justify-around px-2 pb-safe">
        {TRAINER_TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-all duration-200 min-w-[64px] relative',
                isActive
                  ? 'text-brand-500'
                  : 'text-stone-400 hover:text-stone-600'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')} />
                <span className={cn('text-[11px] font-medium', isActive && 'font-bold')}>{label}</span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-500 rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
