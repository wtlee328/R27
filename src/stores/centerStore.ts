import { create } from 'zustand'

export type CenterId = 'hongshulin_branch' | 'tianmu_branch'

interface CenterState {
  centerId: CenterId
  setCenterId: (centerId: CenterId) => void
}

const LOCAL_STORAGE_KEY = 'r27_selected_center_id'

const getInitialCenterId = (): CenterId => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved === 'hongshulin_branch' || saved === 'tianmu_branch') {
      return saved
    }
  } catch (e) {
    console.error('Failed to parse centerId from localStorage', e)
  }
  return 'hongshulin_branch'
}

export const useCenterStore = create<CenterState>((set) => ({
  centerId: getInitialCenterId(),
  setCenterId: (centerId) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, centerId)
    } catch (e) {
      console.error('Failed to save centerId to localStorage', e)
    }
    set({ centerId })
  },
}))
