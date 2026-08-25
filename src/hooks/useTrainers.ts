import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  getDocs,
  getDoc,
  updateDoc,
  writeBatch,
  doc,
  serverTimestamp,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCenterStore } from '../stores/centerStore'
import { useAuthStore } from '../stores/authStore'
import type { Trainer, Customer, Contract, LessonRecord } from '../types'
import { logActivity } from '../lib/activityLogger'

export interface TrainerWithMetrics {
  id: string
  name: string
  email: string
  phone: string
  systemLessons: number      // Sum of remaining sessions on all active contracts
  totalUsedLessons: number   // Sum of sessionAmount on all lesson usage records
}

export function useTrainers() {
  const [trainers, setTrainers] = useState<TrainerWithMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { centerId } = useCenterStore()
  const { user } = useAuthStore()
  const activeCenterId = user?.isSharedTrainerAccount ? (user.centerId || 'r27') : centerId

  const fetchTrainersData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const trainersRef = collection(db, 'trainers')

      if (user?.role === 'trainer') {
        const trainersSnap = await getDocs(query(trainersRef, where('centerId', '==', activeCenterId)))
        const trainersList = trainersSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          systemLessons: 0,
          totalUsedLessons: 0,
        })) as TrainerWithMetrics[]
        setTrainers(trainersList)
        setLoading(false)
        return
      }

      const customersRef = collection(db, 'customers')
      const contractsRef = collection(db, 'contracts')
      const lessonRecordsRef = collection(db, 'lessonRecords')

      const [trainersSnap, customersSnap, contractsSnap, lessonRecordsSnap] = await Promise.all([
        getDocs(query(trainersRef, where('centerId', '==', activeCenterId))),
        getDocs(query(customersRef, where('centerId', '==', activeCenterId))),
        getDocs(query(contractsRef, where('centerId', '==', activeCenterId))),
        getDocs(query(lessonRecordsRef, where('centerId', '==', activeCenterId))),
      ])

      const trainersList = trainersSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Trainer[]

      const customersList = customersSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Customer[]

      const contractsList = contractsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Contract[]

      const lessonRecordsList = lessonRecordsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as LessonRecord[]

      // Map trainer metrics
      const computedTrainers = trainersList.map((t) => {
        // Find contracts where this trainer is assigned
        const trainerContracts = contractsList.filter(
          (c) => c.trainerId === t.id ||
            c.secondaryTrainerId === t.id ||
            (c.studentTrainers && Object.values(c.studentTrainers).includes(t.id))
        )
        const systemLessons = trainerContracts.reduce((sum, c) => {
          if (c.status === 'cancelled' || c.status === 'completed' || c.status === 'expired') return sum
          return sum + Number(c.remainingSessions || 0)
        }, 0)

        // Find lesson records belonging to this trainer
        const trainerLessons = lessonRecordsList.filter(
          (lr) => lr.trainerId === t.id
        )
        const totalUsedLessons = trainerLessons.length

        return {
          ...t,
          systemLessons,
          totalUsedLessons,
        }
      })

      setTrainers(computedTrainers)
    } catch (err: any) {
      console.error('Error fetching trainers data:', err)
      setError(err.message || '無法載入教練資料')
    } finally {
      setLoading(false)
    }
  }, [activeCenterId, user])

  const addTrainer = async (trainerData: { name: string; email: string; phone: string }) => {
    try {
      const trainersRef = collection(db, 'trainers')
      const newTrainerRef = doc(trainersRef)
      await setDoc(newTrainerRef, {
        name: trainerData.name,
        email: trainerData.email,
        phone: trainerData.phone,
        centerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await fetchTrainersData()
    } catch (err: any) {
      console.error('Error adding trainer:', err)
      throw err
    }
  }

  const deleteTrainer = async (trainerId: string, reassignTrainerId?: string | null) => {
    try {
      const trainerSnap = await getDoc(doc(db, 'trainers', trainerId))
      const trainerName = trainerSnap.exists() ? trainerSnap.data()?.name || '未知教練' : '未知教練'

      const newTrainerId = reassignTrainerId || ''

      // 1. Reassign or clear trainerId on Customers
      const customersRef = collection(db, 'customers')
      const custSnap = await getDocs(query(customersRef, where('trainerId', '==', trainerId)))

      for (const custDoc of custSnap.docs) {
        await updateDoc(doc(db, 'customers', custDoc.id), {
          trainerId: newTrainerId,
          updatedAt: serverTimestamp(),
        })
      }

      // 2. Reassign or clear trainerId on Contracts
      const contractsRef = collection(db, 'contracts')
      const [primaryContSnap, secondaryContSnap] = await Promise.all([
        getDocs(query(contractsRef, where('trainerId', '==', trainerId))),
        getDocs(query(contractsRef, where('secondaryTrainerId', '==', trainerId))),
      ])

      // Primary contracts
      for (const contDoc of primaryContSnap.docs) {
        const cData = contDoc.data() as Contract
        let targetPrimaryId = newTrainerId
        let targetSecondaryId = cData.secondaryTrainerId || null

        if (!targetPrimaryId && cData.secondaryTrainerId && cData.secondaryTrainerId !== trainerId) {
          targetPrimaryId = cData.secondaryTrainerId
          targetSecondaryId = null
        }

        await updateDoc(doc(db, 'contracts', contDoc.id), {
          trainerId: targetPrimaryId,
          secondaryTrainerId: targetSecondaryId,
          updatedAt: serverTimestamp(),
        })
      }

      // Secondary contracts
      for (const contDoc of secondaryContSnap.docs) {
        await updateDoc(doc(db, 'contracts', contDoc.id), {
          secondaryTrainerId: null,
          updatedAt: serverTimestamp(),
        })
      }

      // 3. Delete the trainer document
      const trainerRef = doc(db, 'trainers', trainerId)
      await deleteDoc(trainerRef)

      // 4. Log activity
      await logActivity({
        centerId: activeCenterId as any,
        trainerId,
        trainerName,
        action: 'delete',
        module: 'customers',
        recordId: trainerId,
        recordSummary: `刪除教練: ${trainerName} (受影響學員: ${custSnap.size} 人, 合約: ${primaryContSnap.size + secondaryContSnap.size} 筆, 移交教練: ${newTrainerId || '未指定'})`,
      })

      // 5. Refresh data
      await fetchTrainersData()
    } catch (err: any) {
      console.error('Error deleting trainer:', err)
      throw err
    }
  }

  useEffect(() => {
    fetchTrainersData()
  }, [fetchTrainersData])

  return {
    trainers,
    loading,
    error,
    addTrainer,
    deleteTrainer,
    refresh: fetchTrainersData,
  }
}
