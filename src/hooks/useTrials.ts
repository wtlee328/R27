import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import { useTrainerProfileStore } from '../stores/trainerProfileStore'
import type { TrialRecord } from '../types'
import type { TrialRecordFormValues } from '../lib/validators'
import { logActivity } from '../lib/activityLogger'
import { TRIAL_OUTCOME_LABELS } from '../lib/constants'

export function useTrials() {
  const [trials, setTrials] = useState<TrialRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const { selectedTrainerId } = useTrainerProfileStore()

  const fetchTrials = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const trialsRef = collection(db, 'trialRecords')
      let q
      if (user.role === 'admin') {
        q = query(
          trialsRef,
          where('centerId', '==', centerId),
          orderBy('date', 'desc')
        )
      } else {
        // Use selectedTrainerId (the chosen trainer profile) rather than user.uid (shared account)
        const trainerFilterId = selectedTrainerId || user.uid
        q = query(
          trialsRef,
          where('centerId', '==', centerId),
          where('trainerId', '==', trainerFilterId),
          orderBy('date', 'desc')
        )
      }

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as TrialRecord[]

      setTrials(data)
    } catch (err: any) {
      console.error('Error fetching trial records:', err)
      setError(err.message || '無法載入體驗客資料')
    } finally {
      setLoading(false)
    }
  }, [user, centerId, selectedTrainerId])

  useEffect(() => {
    fetchTrials()
  }, [fetchTrials])

  const createTrial = async (data: TrialRecordFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const newRecord = {
      ...data,
      date: Timestamp.fromDate(data.date),
      trainerId: selectedTrainerId || user.uid,
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      const docRef = await addDoc(collection(db, 'trialRecords'), newRecord)
      
      // Look up trainer name
      const trainerSnap = await getDoc(doc(db, 'trainers', data.trialTrainerId))
      const trainerName = trainerSnap.exists() ? trainerSnap.data().name : '未知教練'

      await logActivity({
        centerId,
        trainerId: data.trialTrainerId,
        trainerName,
        action: 'create',
        module: 'trialRecords',
        recordId: docRef.id,
        recordSummary: `新增體驗客: ${data.clientName}`,
        newValue: newRecord
      })

      await fetchTrials()
      return docRef.id
    } catch (err: any) {
      console.error('Error creating trial record:', err)
      throw err
    }
  }

  const updateTrial = async (id: string, data: Partial<TrialRecordFormValues>) => {
    try {
      const recordRef = doc(db, 'trialRecords', id)
      const oldSnap = await getDoc(recordRef)
      const oldData = oldSnap.exists() ? oldSnap.data() as TrialRecord : null

      const updateData: any = {
        ...data,
        updatedAt: serverTimestamp(),
      }

      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date)
      }

      await updateDoc(recordRef, updateData)

      if (oldData) {
        const trainerId = data.trialTrainerId || oldData.trialTrainerId || oldData.trainerId
        const trainerSnap = await getDoc(doc(db, 'trainers', trainerId))
        const trainerName = trainerSnap.exists() ? trainerSnap.data().name : '未知教練'

        const statusLabel = data.outcome ? TRIAL_OUTCOME_LABELS[data.outcome] : TRIAL_OUTCOME_LABELS[oldData.outcome]
        await logActivity({
          centerId,
          trainerId,
          trainerName,
          action: 'update',
          module: 'trialRecords',
          recordId: id,
          recordSummary: `更新體驗客: ${oldData.clientName} -> ${statusLabel}`,
          previousValue: oldData,
          newValue: updateData
        })
      }

      await fetchTrials()
    } catch (err: any) {
      console.error('Error updating trial record:', err)
      throw err
    }
  }

  const deleteTrial = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'trialRecords', id))
      await fetchTrials()
    } catch (err: any) {
      console.error('Error deleting trial record:', err)
      throw err
    }
  }

  return {
    trials,
    loading,
    error,
    createTrial,
    updateTrial,
    deleteTrial,
    refresh: fetchTrials,
  }
}
