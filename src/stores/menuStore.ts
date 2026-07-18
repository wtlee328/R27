import { create } from 'zustand'
import {
  Users, BookOpen, TrendingUp, BarChart2,
  Database, UserCheck, Building2, Settings, History
} from 'lucide-react'

export interface NavItem {
  id: string
  to: string
  label: string
  icon: any
  adminOnly?: boolean
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'customers',    to: '/',            label: '客戶檔案',   icon: Users },
  { id: 'lessons',      to: '/lessons',     label: '教練銷課',   icon: BookOpen },
  { id: 'finance',      to: '/finance',     label: '會計管理',   icon: TrendingUp, adminOnly: true },
  { id: 'trials',       to: '/trials',      label: '體驗客',     icon: UserCheck },
  { id: 'venue',        to: '/venue',       label: '場租管理',   icon: Building2,  adminOnly: true },
  { id: 'activityLog',  to: '/activity-log',label: '操作記錄',   icon: History,    adminOnly: true },
  { id: 'backup',       to: '/backup',      label: '資料備份',   icon: Database,   adminOnly: true },
  { id: 'settings',     to: '/settings',    label: '系統設定',   icon: Settings },
]

const DEFAULT_ORDER = ALL_NAV_ITEMS.map(item => item.id)
const LOCAL_STORAGE_KEY = 'r27_menu_order'

interface MenuState {
  order: string[]
  setOrder: (newOrder: string[]) => void
  resetOrder: () => void
}

const getInitialOrder = (): string[] => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved) {
      let parsed = JSON.parse(saved) as string[]
      
      // Auto-migration: map old keys 'cash-flow'/'profit-loss' to consolidated 'finance' key
      if (parsed.includes('cash-flow') || parsed.includes('profit-loss')) {
        parsed = parsed.map(id => (id === 'cash-flow' || id === 'profit-loss' ? 'finance' : id))
        parsed = Array.from(new Set(parsed)) // remove duplicates
      }

      // Ensure saved order only contains valid IDs and includes all default ones
      const filtered = parsed.filter(id => DEFAULT_ORDER.includes(id))
      const missing = DEFAULT_ORDER.filter(id => !filtered.includes(id))
      return [...filtered, ...missing]
    }
  } catch (e) {
    console.error('Failed to parse menu order from localStorage', e)
  }
  return DEFAULT_ORDER
}

export const useMenuStore = create<MenuState>((set) => ({
  order: getInitialOrder(),
  setOrder: (newOrder) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newOrder))
    set({ order: newOrder })
  },
  resetOrder: () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    set({ order: DEFAULT_ORDER })
  },
}))
