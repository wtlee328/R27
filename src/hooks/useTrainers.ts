import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Trainer, Customer, Contract, LessonRecord } from '../types'

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
  const [migrationRunning, setMigrationRunning] = useState(false)

  const fetchTrainersData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const trainersRef = collection(db, 'trainers')
      const customersRef = collection(db, 'customers')
      const contractsRef = collection(db, 'contracts')
      const lessonRecordsRef = collection(db, 'lessonRecords')

      const [trainersSnap, customersSnap, contractsSnap, lessonRecordsSnap] = await Promise.all([
        getDocs(trainersRef),
        getDocs(customersRef),
        getDocs(contractsRef),
        getDocs(lessonRecordsRef),
      ])

      // If trainers collection is empty, trigger an auto-migration/seeding
      if (trainersSnap.empty) {
        setLoading(false)
        await runMigration()
        return
      }

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
        // Find customers assigned to this trainer
        const assignedCustomerIds = customersList
          .filter((c) => c.trainerId === t.id)
          .map((c) => c.id)

        // Find active/ongoing contracts for these customers
        // A contract is relevant if the primary customer is assigned to this trainer
        const trainerContracts = contractsList.filter(
          (c) => assignedCustomerIds.includes(c.customerId) || assignedCustomerIds.includes(c.primaryCustomerId)
        )
        const systemLessons = trainerContracts.reduce((sum, c) => sum + (c.remainingSessions || 0), 0)

        // Find lesson records belonging to this trainer (or assigned customers)
        const trainerLessons = lessonRecordsList.filter(
          (lr) => lr.trainerId === t.id || assignedCustomerIds.includes(lr.customerId)
        )
        const totalUsedLessons = trainerLessons.reduce((sum, lr) => sum + (lr.sessionAmount || 0), 0)

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
  }, [])

  const runMigration = async () => {
    setMigrationRunning(true)
    try {
      const mockTrainers = [
        { id: 'trainer-a', name: '教練 A', email: 'trainera@r27.com', phone: '0911-111-111' },
        { id: 'trainer-b', name: '教練 B', email: 'trainerb@r27.com', phone: '0922-222-222' },
        { id: 'trainer-c', name: '教練 C', email: 'trainerc@r27.com', phone: '0933-333-333' },
      ]

      // 1. Create trainers if they don't exist
      const trainersRef = collection(db, 'trainers')
      const trainersSnap = await getDocs(trainersRef)
      if (trainersSnap.empty) {
        const batch = writeBatch(db)
        for (const trainer of mockTrainers) {
          const docRef = doc(db, 'trainers', trainer.id)
          batch.set(docRef, {
            name: trainer.name,
            email: trainer.email,
            phone: trainer.phone,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
        await batch.commit()
      }

      // 2. Fetch all collections to assign randomly
      const customersRef = collection(db, 'customers')
      const contractsRef = collection(db, 'contracts')
      const lessonRecordsRef = collection(db, 'lessonRecords')

      const [customersSnap, contractsSnap, lessonRecordsSnap] = await Promise.all([
        getDocs(customersRef),
        getDocs(contractsRef),
        getDocs(lessonRecordsRef),
      ])

      const trainerIds = mockTrainers.map((t) => t.id)
      const batch = writeBatch(db)
      let ops = 0
      const customerTrainerMap: Record<string, string> = {}

      // Assign students
      customersSnap.docs.forEach((cDoc) => {
        const data = cDoc.data()
        let assignedTrainerId = data.trainerId
        if (!assignedTrainerId || !trainerIds.includes(assignedTrainerId)) {
          assignedTrainerId = trainerIds[Math.floor(Math.random() * trainerIds.length)]
          const cRef = doc(db, 'customers', cDoc.id)
          batch.update(cRef, {
            trainerId: assignedTrainerId,
            updatedAt: serverTimestamp(),
          })
          ops++
        }
        customerTrainerMap[cDoc.id] = assignedTrainerId
      })

      // Sync contracts
      contractsSnap.docs.forEach((conDoc) => {
        const data = conDoc.data()
        const primaryId = data.primaryCustomerId || data.customerId
        const targetTrainerId = customerTrainerMap[primaryId]
        if (targetTrainerId && data.trainerId !== targetTrainerId) {
          const conRef = doc(db, 'contracts', conDoc.id)
          batch.update(conRef, {
            trainerId: targetTrainerId,
            updatedAt: serverTimestamp(),
          })
          ops++
        }
      })

      // Sync lesson records
      lessonRecordsSnap.docs.forEach((lrDoc) => {
        const data = lrDoc.data()
        const targetTrainerId = customerTrainerMap[data.customerId]
        if (targetTrainerId && data.trainerId !== targetTrainerId) {
          const lrRef = doc(db, 'lessonRecords', lrDoc.id)
          batch.update(lrRef, {
            trainerId: targetTrainerId,
            updatedAt: serverTimestamp(),
          })
          ops++
        }
      })

      if (ops > 0) {
        await batch.commit()
      }

      await fetchTrainersData()
    } catch (err: any) {
      console.error('Error during trainer database migration:', err)
      setError(err.message || '資料庫遷移失敗')
    } finally {
      setMigrationRunning(false)
    }
  }

  const addTrainer = async (trainerData: { name: string; email: string; phone: string }) => {
    try {
      const trainersRef = collection(db, 'trainers')
      const newTrainerRef = doc(trainersRef)
      await setDoc(newTrainerRef, {
        name: trainerData.name,
        email: trainerData.email,
        phone: trainerData.phone,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await fetchTrainersData()
    } catch (err: any) {
      console.error('Error adding trainer:', err)
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
    migrationRunning,
    runMigration,
    addTrainer,
    refresh: fetchTrainersData,
  }
}
