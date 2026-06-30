import { create } from 'zustand'

export type CenterId = 'r27' | 'coffit'

interface CenterState {
  centerId: CenterId
  setCenterId: (centerId: CenterId) => void
}

const LOCAL_STORAGE_KEY = 'r27_selected_center_id'

const getInitialCenterId = (): CenterId => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved === 'r27' || saved === 'coffit') {
      return saved
    }
  } catch (e) {
    console.error('Failed to parse centerId from localStorage', e)
  }
  return 'r27'
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
