import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import type { VenueRental } from '../types'
import type { VenueRentalFormValues } from '../lib/validators'

export function useVenueRentals() {
  const [rentals, setRentals] = useState<VenueRental[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()

  const fetchRentals = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const rentalsRef = collection(db, 'venueRentals')
      let q
      if (user.role === 'admin') {
        q = query(rentalsRef, orderBy('date', 'desc'))
      } else {
        q = query(
          rentalsRef,
          where('trainerId', '==', user.uid),
          orderBy('date', 'desc')
        )
      }

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as VenueRental[]

      setRentals(data)
    } catch (err: any) {
      console.error('Error fetching venue rentals:', err)
      setError(err.message || '無法載入場租資料')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchRentals()
  }, [fetchRentals])

  const createRental = async (data: VenueRentalFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const batch = writeBatch(db)

    // 1. Create Cash Flow Record Reference
    const cashFlowRef = doc(collection(db, 'cashFlowRecords'))
    const rentalRef = doc(collection(db, 'venueRentals'))

    const cashFlowData = {
      date: Timestamp.fromDate(data.date),
      trainerId: user.uid,
      debitCategory: '現金', // Default asset
      debitAmount: data.amount,
      creditCategory: '場租收入', // Revenue
      creditAmount: data.amount,
      description: `場租收入 - ${data.renterName || ''}`,
      notes: data.notes,
      source: 'venue_rental',
      sourceId: rentalRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const rentalData = {
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      notes: data.notes,
      renterName: data.renterName || '',
      renterTrainerId: data.renterTrainerId,
      renterCustomerId: data.selectedRenterCustomerId || '',
      trainerId: user.uid,
      cashFlowRecordId: cashFlowRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    batch.set(cashFlowRef, cashFlowData)
    batch.set(rentalRef, rentalData)

    try {
      await batch.commit()
      await fetchRentals()
      return rentalRef.id
    } catch (err: any) {
      console.error('Error creating venue rental:', err)
      throw err
    }
  }

  const deleteRental = async (id: string, cashFlowRecordId: string) => {
    const batch = writeBatch(db)
    batch.delete(doc(db, 'venueRentals', id))
    if (cashFlowRecordId) {
      batch.delete(doc(db, 'cashFlowRecords', cashFlowRecordId))
    }

    try {
      await batch.commit()
      await fetchRentals()
    } catch (err: any) {
      console.error('Error deleting venue rental:', err)
      throw err
    }
  }

  return {
    rentals,
    loading,
    error,
    createRental,
    deleteRental,
    refresh: fetchRentals,
  }
}
