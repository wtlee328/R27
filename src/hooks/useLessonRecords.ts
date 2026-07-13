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
  runTransaction,
  increment
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import { useTrainerProfileStore } from '../stores/trainerProfileStore'
import type { LessonRecord } from '../types'
import type { LessonRecordFormValues } from '../lib/validators'
import { logActivity } from '../lib/activityLogger'

export function useLessonRecords() {
  const [records, setRecords] = useState<LessonRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const { selectedTrainerId } = useTrainerProfileStore()

  const fetchRecords = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const recordsRef = collection(db, 'lessonRecords')
      let data: LessonRecord[] = []

      if (user.role === 'admin') {
        const q = query(
          recordsRef,
          where('centerId', '==', centerId),
          orderBy('sessionDate', 'desc')
        )
        const querySnapshot = await getDocs(q)
        data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as LessonRecord[]
      } else {
        // Use selectedTrainerId (chosen trainer profile) instead of user.uid (shared account)
        const trainerFilterId = selectedTrainerId || user.uid
        // Run two queries and merge them to avoid composite index requirements
        const q1 = query(
          recordsRef,
          where('centerId', '==', centerId),
          where('trainerId', '==', trainerFilterId),
          orderBy('sessionDate', 'desc')
        )
        const q2 = query(
          recordsRef,
          where('centerId', '==', centerId),
          where('contractTrainerId', '==', trainerFilterId),
          orderBy('sessionDate', 'desc')
        )
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)])
        const map = new Map<string, any>()
        snap1.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }))
        snap2.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }))
        
        data = Array.from(map.values()).sort((a, b) => {
          const tA = a.sessionDate?.seconds || 0
          const tB = b.sessionDate?.seconds || 0
          return tB - tA
        }) as LessonRecord[]
      }

      setRecords(data)
    } catch (err: any) {
      console.error('Error fetching lesson records:', err)
      setError(err.message || '無法載入銷課資料')
    } finally {
      setLoading(false)
    }
  }, [user, centerId, selectedTrainerId])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const createRecord = async (data: LessonRecordFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const attendeeIds = data.attendingCustomerIds && data.attendingCustomerIds.length > 0
      ? data.attendingCustomerIds
      : [data.customerId]

    const newRecordData = {
      ...data,
      attendingCustomerIds: attendeeIds,
      sessionDate: Timestamp.fromDate(data.sessionDate),
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      const result = await runTransaction(db, async (transaction) => {
        const contractRef = doc(db, 'contracts', data.contractId)
        const attendeeRefs = attendeeIds.map(id => doc(db, 'customers', id))

        // READS FIRST
        const contractSnap = await transaction.get(contractRef)
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

        const attendeeNames = attendeeSnaps.map(snap => snap.exists() ? snap.data().name : '')
        
        // Fallback trainerId to contract's trainerId if not specified in form data
        const contractTrainerId = contractSnap.exists() ? contractSnap.data().trainerId : null
        const finalTrainerId = data.trainerId || contractTrainerId || user.uid

        // Read trainer info
        const trainerRef = doc(db, 'trainers', finalTrainerId)
        const trainerSnap = await transaction.get(trainerRef)
        const trainerName = trainerSnap.exists() ? trainerSnap.data().name : '未知教練'

        // WRITES LATER
        const recordRef = doc(collection(db, 'lessonRecords'))
        transaction.set(recordRef, {
          ...newRecordData,
          trainerId: finalTrainerId,
          contractTrainerId: contractTrainerId || finalTrainerId,
          attendingCustomerNames: attendeeNames
        })

        transaction.update(contractRef, {
          remainingSessions: increment(-data.sessionAmount),
          updatedAt: serverTimestamp()
        })

        attendeeRefs.forEach((ref, index) => {
          if (attendeeSnaps[index].exists()) {
            transaction.update(ref, {
              historicalSessions: increment(data.sessionAmount),
              updatedAt: serverTimestamp()
            })
          }
        })

        return {
          finalTrainerId,
          trainerName,
          attendeeNames,
          recordId: recordRef.id
        }
      })

      if (result) {
        await logActivity({
          centerId,
          trainerId: result.finalTrainerId,
          trainerName: result.trainerName,
          action: 'create',
          module: 'lessonRecords',
          recordId: result.recordId,
          recordSummary: `銷課: ${result.attendeeNames.join('、')} - ${data.sessionAmount}堂`,
          newValue: { ...newRecordData, trainerName: result.trainerName }
        })
      }

      await fetchRecords()
    } catch (err: any) {
      console.error('Error creating lesson record:', err)
      throw err
    }
  }

  const deleteRecord = async (id: string) => {
    try {
      const recordRef = doc(db, 'lessonRecords', id)
      
      const result = await runTransaction(db, async (transaction) => {
        // 1. Read Lesson Record
        const recordSnap = await transaction.get(recordRef)
        if (!recordSnap.exists()) return null
        
        const recordData = recordSnap.data() as LessonRecord
        
        // 2. Read related docs (ALL READS)
        const contractRef = recordData.contractId ? doc(db, 'contracts', recordData.contractId) : null
        
        const attendeeIds = recordData.attendingCustomerIds && recordData.attendingCustomerIds.length > 0
          ? recordData.attendingCustomerIds
          : [recordData.customerId]
        const attendeeRefs = attendeeIds.map(id => doc(db, 'customers', id))

        const contractSnap = contractRef ? await transaction.get(contractRef) : null
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

        // Read trainer info
        const trainerRef = doc(db, 'trainers', recordData.trainerId)
        const trainerSnap = await transaction.get(trainerRef)
        const trainerName = trainerSnap.exists() ? trainerSnap.data().name : '未知教練'

        // 3. Perform all WRITES
        if (contractRef && contractSnap?.exists()) {
          transaction.update(contractRef, {
            remainingSessions: increment(recordData.sessionAmount),
            updatedAt: serverTimestamp()
          })
        }

        attendeeRefs.forEach((ref, index) => {
          if (attendeeSnaps[index].exists()) {
            transaction.update(ref, {
              historicalSessions: increment(-recordData.sessionAmount),
              updatedAt: serverTimestamp()
            })
          }
        })

        transaction.delete(recordRef)

        return {
          recordData,
          trainerName
        }
      })

      if (result) {
        await logActivity({
          centerId,
          trainerId: result.recordData.trainerId,
          trainerName: result.trainerName,
          action: 'delete',
          module: 'lessonRecords',
          recordId: id,
          recordSummary: `刪除銷課: ${result.recordData.attendingCustomerNames?.join('、') || result.recordData.customerName} - ${result.recordData.sessionAmount}堂`,
          previousValue: result.recordData
        })
      }

      await fetchRecords()
    } catch (err: any) {
      console.error('Error deleting lesson record:', err)
      throw err
    }
  }

  const updateRecord = async (id: string, data: LessonRecordFormValues) => {
    try {
      const recordRef = doc(db, 'lessonRecords', id)
      
      await runTransaction(db, async (transaction) => {
        // READS FIRST
        const recordSnap = await transaction.get(recordRef)
        if (!recordSnap.exists()) throw new Error('找不到該筆紀錄')
        
        const oldData = recordSnap.data() as any
        
        const contractRef = data.contractId ? doc(db, 'contracts', data.contractId) : null
        const contractSnap = contractRef ? await transaction.get(contractRef) : null

        const oldAttendeeIds = oldData.attendingCustomerIds && oldData.attendingCustomerIds.length > 0
          ? oldData.attendingCustomerIds
          : [oldData.customerId]

        const newAttendeeIds = data.attendingCustomerIds && data.attendingCustomerIds.length > 0
          ? data.attendingCustomerIds
          : [data.customerId]

        const uniqueAttendeeIds = Array.from(new Set([...oldAttendeeIds, ...newAttendeeIds]))
        const attendeeRefs = uniqueAttendeeIds.map(aId => doc(db, 'customers', aId))
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

        // WRITES LATER
        const diff = data.sessionAmount - oldData.sessionAmount

        if (diff !== 0) {
          if (contractRef && contractSnap?.exists()) {
            transaction.update(contractRef, {
              remainingSessions: increment(-diff),
              updatedAt: serverTimestamp()
            })
          }
        }

        uniqueAttendeeIds.forEach((aId, index) => {
          const wasAttendee = oldAttendeeIds.includes(aId)
          const isAttendee = newAttendeeIds.includes(aId)
          const attendeeSnap = attendeeSnaps[index]
          const attendeeRef = attendeeRefs[index]

          if (attendeeSnap.exists()) {
            let change = 0
            if (wasAttendee && isAttendee) {
              change = diff
            } else if (wasAttendee && !isAttendee) {
              change = -oldData.sessionAmount
            } else if (!wasAttendee && isAttendee) {
              change = data.sessionAmount
            }

            if (change !== 0) {
              transaction.update(attendeeRef, {
                historicalSessions: increment(change),
                updatedAt: serverTimestamp()
              })
            }
          }
        })

        const attendeeNames = newAttendeeIds.map(id => {
          const idx = uniqueAttendeeIds.indexOf(id)
          const snap = attendeeSnaps[idx]
          return snap?.exists() ? snap.data().name : ''
        })

        const contractTrainerId = contractSnap?.exists() ? contractSnap.data().trainerId : null
        const finalTrainerId = data.trainerId || contractTrainerId || oldData.trainerId || user.uid

        const updateData = {
          ...data,
          trainerId: finalTrainerId,
          contractTrainerId: contractTrainerId || finalTrainerId,
          attendingCustomerIds: newAttendeeIds,
          attendingCustomerNames: attendeeNames,
          sessionDate: Timestamp.fromDate(data.sessionDate),
          updatedAt: serverTimestamp(),
        }
        transaction.update(recordRef, updateData)
      })

      await fetchRecords()
    } catch (err: any) {
      console.error('Error updating lesson record:', err)
      throw err
    }
  }

  return {
    records,
    loading,
    error,
    createRecord,
    updateRecord,
    deleteRecord,
    refresh: fetchRecords,
  }
}
