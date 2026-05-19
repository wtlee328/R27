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
import type { CashFlowRecord } from '../types'
import type { CashFlowFormValues } from '../lib/validators'

export function useCashFlow() {
  const [records, setRecords] = useState<CashFlowRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()

  const fetchRecords = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const recordsRef = collection(db, 'cashFlowRecords')
      let q
      if (user.role === 'admin') {
        q = query(recordsRef, orderBy('date', 'desc'))
      } else {
        q = query(
          recordsRef,
          where('trainerId', '==', user.uid),
          orderBy('date', 'desc')
        )
      }

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as CashFlowRecord[]

      setRecords(data)
    } catch (err: any) {
      console.error('Error fetching cash flow records:', err)
      setError(err.message || '無法載入現金流量資料')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const createRecord = async (data: CashFlowFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const newRecord = {
      ...data,
      date: Timestamp.fromDate(data.date),
      trainerId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      const docRef = await addDoc(collection(db, 'cashFlowRecords'), newRecord)
      await fetchRecords()
      return docRef.id
    } catch (err: any) {
      console.error('Error creating cash flow record:', err)
      throw err
    }
  }

  const updateRecord = async (id: string, data: Partial<CashFlowFormValues>) => {
    try {
      const recordRef = doc(db, 'cashFlowRecords', id)
      
      const updateData: any = {
        ...data,
        updatedAt: serverTimestamp(),
      }

      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date)
      }

      await updateDoc(recordRef, updateData)
      await fetchRecords()
    } catch (err: any) {
      console.error('Error updating cash flow record:', err)
      throw err
    }
  }

  const deleteRecord = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'cashFlowRecords', id))
      await fetchRecords()
    } catch (err: any) {
      console.error('Error deleting cash flow record:', err)
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
