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
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import type { TrialRecord } from '../types'
import type { TrialRecordFormValues } from '../lib/validators'

export function useTrials() {
  const [trials, setTrials] = useState<TrialRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()

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
        q = query(
          trialsRef,
          where('centerId', '==', centerId),
          where('trainerId', '==', user.uid),
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
  }, [user, centerId])

  useEffect(() => {
    fetchTrials()
  }, [fetchTrials])

  const createTrial = async (data: TrialRecordFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const newRecord = {
      ...data,
      date: Timestamp.fromDate(data.date),
      trainerId: user.uid,
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      const docRef = await addDoc(collection(db, 'trialRecords'), newRecord)
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
      
      const updateData: any = {
        ...data,
        updatedAt: serverTimestamp(),
      }

      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date)
      }

      await updateDoc(recordRef, updateData)
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
