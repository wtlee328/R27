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

export function Navbar() {
  const { user } = useAuthStore()
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
      {/* ... top bar ... */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-stone-950 flex items-center px-2 gap-3 shadow-lg shadow-black/10">
        {/* ... mobile toggle ... */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden rounded-lg p-2 text-stone-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <div className="flex items-center h-full">
          <img src="/assets/logos/on-dark/logo-small.png" alt="R27" className="h-[75px] w-auto object-contain transform translate-y-2" />
        </div>

        <div className="flex-1" />

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
          'fixed top-16 left-0 bottom-0 z-30 w-60 bg-stone-950 transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 animate-slide-in-left' : '-translate-x-full'
        )}
      >
        <nav className="flex flex-col gap-1 p-3 pt-4">
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <p className="text-[11px] text-stone-600 text-center">
            © {new Date().getFullYear()} R27+ FITNESS
          </p>
        </div>
      </aside>
    </>
  )
}
