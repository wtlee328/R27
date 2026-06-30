import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface RenterCustomer {
  id: string
  trainerId: string
  name: string
  createdAt: any
}

export function useRenterCustomers(trainerId?: string) {
  const [customers, setCustomers] = useState<RenterCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRenterCustomers = useCallback(async () => {
    if (!trainerId) return
    setLoading(true)
    setError(null)
    try {
      const ref = collection(db, 'renterCustomers')
      const q = query(
        ref,
        where('trainerId', '==', trainerId)
      )
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RenterCustomer[]
      setCustomers(data)
    } catch (err: any) {
      console.error('Error fetching renter customers:', err)
      setError(err.message || '無法載入場租學員')
    } finally {
      setLoading(false)
    }
  }, [trainerId])

  useEffect(() => {
    fetchRenterCustomers()
  }, [fetchRenterCustomers])

  const createRenterCustomer = async (name: string) => {
    if (!trainerId) throw new Error('Trainer ID is required')
    const ref = collection(db, 'renterCustomers')
    const newDoc = {
      trainerId,
      name,
      createdAt: serverTimestamp()
    }
    const docRef = await addDoc(ref, newDoc)
    await fetchRenterCustomers()
    return docRef.id
  }

  return {
    customers,
    loading,
    error,
    createRenterCustomer,
    refresh: fetchRenterCustomers
  }
}
