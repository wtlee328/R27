import { create } from 'zustand'
import type { AppUser } from '@/types'

interface AuthState {
  user: AppUser | null
  loading: boolean
  setUser: (user: AppUser | null) => void
  setLoading: (loading: boolean) => void
  isAdmin: () => boolean
  isTrainer: () => boolean
  isSharedTrainer: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  isAdmin: () => get().user?.role === 'admin',
  isTrainer: () => get().user?.role === 'trainer',
  isSharedTrainer: () => get().user?.isSharedTrainerAccount === true,
}))
