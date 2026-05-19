import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
}))

// ─── Filter store ─────────────────────────────────────────────
interface FilterState {
  year: number
  month: number | null  // null = all months
  setYear: (year: number) => void
  setMonth: (month: number | null) => void
  reset: () => void
}

const currentYear = new Date().getFullYear()

export const useFilterStore = create<FilterState>((set) => ({
  year: currentYear,
  month: null,
  setYear: (year) => set({ year }),
  setMonth: (month) => set({ month }),
  reset: () => set({ year: currentYear, month: null }),
}))
