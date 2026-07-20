import { NavLink, useNavigate } from 'react-router-dom'
import {
  LogOut, Menu, X, Building2, UserCheck, Settings, ChevronDown,
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
import { useThemeStore } from '@/stores/themeStore'
import { RiSunLine, RiMoonLine } from '@remixicon/react'

export function Navbar() {
  const { user } = useAuthStore()
  const { centerId, setCenterId } = useCenterStore()
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore()
  const { theme, toggleTheme } = useThemeStore()
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

  const filteredNavItems = orderedItems.filter((item) => {
    if (item.adminOnly) return user?.role === 'admin'
    return true
  })

  return (
    <>
      {/* ── Top Bar Header (Light background with crisp border line) ────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-white border-b border-stone-200/80 flex items-center px-4 sm:px-6 gap-3 shadow-2xs">
        {/* Mobile hamburger */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden rounded-xl p-2 text-stone-600 hover:text-stone-950 hover:bg-stone-100 transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Brand Logo area in topbar */}
        <div className="flex items-center justify-center h-full">
          {centerId === 'r27' ? (
            <img src="/assets/logos/on-dark/logo-small.png" alt="R27" className="h-11 sm:h-12 w-auto max-h-[50px] object-contain brightness-0 shrink-0 select-none translate-y-[5px]" />
          ) : (
            <div className="flex items-center text-stone-950 font-black tracking-widest text-lg pl-2 select-none translate-y-[1px]">
              COFFIT
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Right side: Center Switcher + Theme Toggle + Notification + User Profile */}
        <div className="flex items-center gap-3">
          <CenterSwitcher centerId={centerId} setCenterId={setCenterId} />

          <div className="h-4 w-px bg-stone-200 hidden sm:block" />

          {/* Dark / Light Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-white dark:hover:bg-stone-800 transition-all cursor-pointer flex items-center justify-center"
            title={theme === 'dark' ? '切換為淺色主題' : '切換為深色主題'}
          >
            {theme === 'dark' ? (
              <RiSunLine className="w-4.5 h-4.5 text-amber-400" />
            ) : (
              <RiMoonLine className="w-4.5 h-4.5 text-stone-600" />
            )}
          </button>

          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 outline-none group cursor-pointer p-1 rounded-xl hover:bg-stone-100/80 transition-all">
                <Avatar className="h-8 w-8 ring-2 ring-stone-200 group-hover:ring-orange-500/50 transition-all">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-stone-900 text-white text-xs font-black">
                    {user?.displayName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start text-left">
                  <span className="text-xs font-bold text-stone-900 group-hover:text-stone-950 transition-colors flex items-center gap-1">
                    {user?.displayName || user?.email?.split('@')[0]}
                    <ChevronDown className="w-3 h-3 text-stone-400" />
                  </span>
                  {user?.role === 'admin' && (
                    <span className="text-[10px] text-orange-600 font-bold">系統管理員</span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2">
              <DropdownMenuLabel className="text-xs text-stone-500 font-bold">我的帳號</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
                <UserCheck className="mr-2 h-4 w-4 text-stone-500" />
                <span>個人資訊</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4 text-stone-500" />
                <span>系統設定</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>登出</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Sidebar Overlay (Mobile) ────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-stone-950/40 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Left Sidebar Navigation (Solid to Boundary + 5px Gradient Blend to Main Page) ────────────────────── */}
      <aside
        className={cn(
          'fixed top-16 left-0 bottom-0 z-30 w-60 bg-stone-100/70 flex flex-col transition-transform duration-300 ease-out border-r-0',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 animate-slide-in-left' : '-translate-x-full'
        )}
      >
        {/* 5px Gradient blend strip at original 240px boundary line */}
        <div className="absolute top-0 -right-[6px] bottom-0 w-[6px] bg-gradient-to-r from-stone-200/50 via-stone-100/30 to-transparent pointer-events-none z-20" />

        {/* Navigation List */}
        <nav className="flex-1 flex flex-col gap-1.5 p-3 pt-4 overflow-y-auto">
          {filteredNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3.5 px-4 py-2.5 text-xs font-bold transition-all duration-150',
                  isActive
                    ? 'bg-orange-50 text-[#293847] font-bold border-l-4 border-orange-500 rounded-r-xl shadow-2xs'
                    : 'text-stone-600 hover:text-[#293847] hover:bg-stone-100/80 rounded-xl'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 bg-transparent shrink-0">
          <p className="text-[11px] font-bold text-stone-400 text-center">
            © {new Date().getFullYear()} {centerId === 'r27' ? 'R27 FITNESS' : 'COFFIT'}
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
        <button className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 text-stone-800 transition-all text-xs font-bold select-none outline-none border border-stone-200 cursor-pointer">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span>{centerId === 'r27' ? 'R27 Fitness' : 'Coffit'}</span>
          </div>
          <ChevronDown className="h-3 w-3 text-stone-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 mt-1">
        <DropdownMenuLabel className="text-[11px] font-bold text-stone-400">選擇切換場館</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setCenterId('r27')}
          className={cn("flex items-center justify-between cursor-pointer text-xs py-2 font-bold", centerId === 'r27' && "text-orange-600 bg-orange-50")}
        >
          <span>R27 Fitness</span>
          {centerId === 'r27' && <span className="text-[10px] text-orange-600">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setCenterId('coffit')}
          className={cn("flex items-center justify-between cursor-pointer text-xs py-2 font-bold", centerId === 'coffit' && "text-orange-600 bg-orange-50")}
        >
          <span>Coffit</span>
          {centerId === 'coffit' && <span className="text-[10px] text-orange-600">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
