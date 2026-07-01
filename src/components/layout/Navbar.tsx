import { NavLink, useNavigate } from 'react-router-dom'
import {
  Users, BookOpen, TrendingUp, BarChart2,
  Database, UserCheck, Building2, Settings,
  LogOut, Menu, X,
} from 'lucide-react'
import { signOut } from '@/lib/auth'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationCenter } from '@/components/layout/NotificationCenter'

import { useMenuStore, ALL_NAV_ITEMS, type NavItem } from '@/stores/menuStore'
import { useCenterStore } from '@/stores/centerStore'

export function Navbar() {
  const { user } = useAuthStore()
  const { centerId, setCenterId } = useCenterStore()
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore()
  const order = useMenuStore((state) => state.order)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  // Map order to actual items
  const orderedItems = order
    .map((id) => ALL_NAV_ITEMS.find((item) => item.id === id))
    .filter((item): item is NavItem => !!item)

  const filteredNavItems = orderedItems.filter(item => {
    if (item.adminOnly) return user?.role === 'admin'
    return true
  })

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-stone-950 flex items-center px-2 gap-3 shadow-lg shadow-black/10">
        {/* Mobile hamburger */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden rounded-lg p-2 text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Logo — visible on all screen sizes, aligned left in top bar */}
        <div className="flex items-center h-full">
          {centerId === 'r27' ? (
            <img src="/assets/logos/on-dark/logo-small.png" alt="R27" className="h-[75px] w-auto object-contain translate-y-4" />
          ) : (
            <div className="flex items-center text-white font-semibold tracking-widest text-base pl-2 select-none">
              COFFIT
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Right side: notifications + profile */}
        <div className="flex items-center gap-2">
          <NotificationCenter />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 outline-none group">
                <Avatar className="h-8 w-8 ring-2 ring-brand-500/30 group-hover:ring-brand-400 transition-all">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-brand-500 text-white text-xs font-bold">
                    {user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-sm font-medium text-stone-200 group-hover:text-white transition-colors">
                    {user?.displayName || user?.email?.split('@')[0]}
                  </span>
                  {user?.role === 'admin' && (
                    <span className="text-[10px] text-brand-400 font-semibold">管理員</span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2">
              <DropdownMenuLabel>我的帳號</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <UserCheck className="mr-2 h-4 w-4" />
                <span>個人資訊</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>系統設定</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                <LogOut className="mr-2 h-4 w-4" />
                <span>登出</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Sidebar overlay (mobile) ────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed top-16 left-0 bottom-0 z-30 w-60 bg-stone-950 border-r border-stone-900/50 flex flex-col transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 animate-slide-in-left' : '-translate-x-full'
        )}
      >
        {/* Switcher — top of sidebar, all screen sizes */}
        <div className="px-3 py-2 border-b border-stone-900/40 shrink-0">
          <CenterSwitcher centerId={centerId} setCenterId={setCenterId} />
        </div>

        {/* Navigation list */}
        <nav className="flex-1 flex flex-col gap-1 p-3 pt-3 overflow-y-auto">
          {filteredNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-brand-500/15 text-brand-400'
                    : 'text-stone-400 hover:text-white hover:bg-white/5'
                )
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="p-4 border-t border-white/10 bg-stone-950 shrink-0">
          <p className="text-[11px] text-stone-600 text-center">
            © {new Date().getFullYear()} {centerId === 'r27' ? 'R27+ FITNESS' : 'COFFIT'}
          </p>
        </div>
      </aside>
    </>
  )
}

function CenterSwitcher({ centerId, setCenterId }: { centerId: string; setCenterId: (id: 'r27' | 'coffit') => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-md bg-stone-900/60 hover:bg-stone-900 text-stone-400 hover:text-stone-200 transition-all text-[11px] font-medium select-none outline-none border border-stone-800/60 hover:border-stone-700">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3 text-brand-500 shrink-0" />
            <span>{centerId === 'r27' ? 'R27 Fitness' : 'Coffit'}</span>
          </div>
          <span className="text-[7px] text-stone-600">▼</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-52 mt-1">
        <DropdownMenuLabel className="text-xs text-stone-400">選擇場館</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setCenterId('r27')}
          className={cn("flex items-center justify-between cursor-pointer text-xs py-2", centerId === 'r27' && "text-brand-500 font-bold bg-brand-500/5")}
        >
          <span>R27 Fitness</span>
          {centerId === 'r27' && <span className="text-[8px]">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setCenterId('coffit')}
          className={cn("flex items-center justify-between cursor-pointer text-xs py-2", centerId === 'coffit' && "text-brand-500 font-bold bg-brand-500/5")}
        >
          <span>Coffit</span>
          {centerId === 'coffit' && <span className="text-[8px]">●</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
