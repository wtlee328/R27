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

    const newRecordData = {
      ...data,
      sessionDate: Timestamp.fromDate(data.sessionDate),
      trainerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      await runTransaction(db, async (transaction) => {
        const contractRef = doc(db, 'contracts', data.contractId)
        const customerRef = doc(db, 'customers', data.customerId)

        // READS FIRST
        const contractSnap = await transaction.get(contractRef)
        const customerSnap = await transaction.get(customerRef)

        if (!contractSnap.exists()) throw new Error('找不到對應的合約，無法銷課')
        if (!customerSnap.exists()) throw new Error('找不到客戶資料')

        // WRITES LATER
        const recordRef = doc(collection(db, 'lessonRecords'))
        transaction.set(recordRef, newRecordData)

        transaction.update(contractRef, {
          remainingSessions: increment(-data.sessionAmount),
          updatedAt: serverTimestamp()
        })

        transaction.update(customerRef, {
          historicalSessions: increment(data.sessionAmount),
          updatedAt: serverTimestamp()
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
        const customerRef = recordData.customerId ? doc(db, 'customers', recordData.customerId) : null
        
        const contractSnap = contractRef ? await transaction.get(contractRef) : null
        const customerSnap = customerRef ? await transaction.get(customerRef) : null

        // 3. Perform all WRITES
        if (contractRef && contractSnap?.exists()) {
          transaction.update(contractRef, {
            remainingSessions: increment(recordData.sessionAmount),
            updatedAt: serverTimestamp()
          })
        }

        if (customerRef && customerSnap?.exists()) {
          transaction.update(customerRef, {
            historicalSessions: increment(-recordData.sessionAmount),
            updatedAt: serverTimestamp()
          })
        }

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
        
        const oldData = recordSnap.data() as LessonRecord
        
        const contractRef = data.contractId ? doc(db, 'contracts', data.contractId) : null
        const customerRef = data.customerId ? doc(db, 'customers', data.customerId) : null
        
        const contractSnap = contractRef ? await transaction.get(contractRef) : null
        const customerSnap = customerRef ? await transaction.get(customerRef) : null

        // WRITES LATER
        const diff = data.sessionAmount - oldData.sessionAmount

        if (diff !== 0) {
          if (contractRef && contractSnap?.exists()) {
            transaction.update(contractRef, {
              remainingSessions: increment(-diff),
              updatedAt: serverTimestamp()
            })
          }

          if (customerRef && customerSnap?.exists()) {
            transaction.update(customerRef, {
              historicalSessions: increment(diff),
              updatedAt: serverTimestamp()
            })
          }
        }

        const updateData = {
          ...data,
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
