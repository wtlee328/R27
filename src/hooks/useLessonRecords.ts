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
import type { LessonRecord } from '../types'
import type { LessonRecordFormValues } from '../lib/validators'

export function useLessonRecords() {
  const [records, setRecords] = useState<LessonRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()

  const fetchRecords = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const recordsRef = collection(db, 'lessonRecords')
      let q
      if (user.role === 'admin') {
        q = query(recordsRef, orderBy('sessionDate', 'desc'))
      } else {
        q = query(
          recordsRef,
          where('trainerId', '==', user.uid),
          orderBy('sessionDate', 'desc')
        )
      }

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as LessonRecord[]

      setRecords(data)
    } catch (err: any) {
      console.error('Error fetching lesson records:', err)
      setError(err.message || '無法載入銷課資料')
    } finally {
      setLoading(false)
    }
  }, [user])

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
      trainerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      await runTransaction(db, async (transaction) => {
        const contractRef = doc(db, 'contracts', data.contractId)
        const attendeeRefs = attendeeIds.map(id => doc(db, 'customers', id))

        // READS FIRST
        const contractSnap = await transaction.get(contractRef)
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

        const attendeeNames = attendeeSnaps.map(snap => snap.exists() ? snap.data().name : '')

        // WRITES LATER
        const recordRef = doc(collection(db, 'lessonRecords'))
        transaction.set(recordRef, {
          ...newRecordData,
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
      })

      await fetchRecords()
    } catch (err: any) {
      console.error('Error creating lesson record:', err)
      throw err
    }
  }

  const deleteRecord = async (id: string) => {
    try {
      const recordRef = doc(db, 'lessonRecords', id)
      
      await runTransaction(db, async (transaction) => {
        // 1. Read Lesson Record
        const recordSnap = await transaction.get(recordRef)
        if (!recordSnap.exists()) return
        
        const recordData = recordSnap.data() as LessonRecord
        
        // 2. Read related docs (ALL READS)
        const contractRef = recordData.contractId ? doc(db, 'contracts', recordData.contractId) : null
        
        const attendeeIds = recordData.attendingCustomerIds && recordData.attendingCustomerIds.length > 0
          ? recordData.attendingCustomerIds
          : [recordData.customerId]
        const attendeeRefs = attendeeIds.map(id => doc(db, 'customers', id))

        const contractSnap = contractRef ? await transaction.get(contractRef) : null
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

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
      })

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

        const updateData = {
          ...data,
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
