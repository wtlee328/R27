import { create } from 'zustand'

interface TrainerProfileState {
  selectedTrainerId: string | null
  selectedTrainerName: string | null
  setSelectedTrainer: (id: string, name: string) => void
  clearSelectedTrainer: () => void
}

export const useTrainerProfileStore = create<TrainerProfileState>((set) => ({
  selectedTrainerId: null,
  selectedTrainerName: null,
  setSelectedTrainer: (id, name) => set({ selectedTrainerId: id, selectedTrainerName: name }),
  clearSelectedTrainer: () => set({ selectedTrainerId: null, selectedTrainerName: null }),
}))
