import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import { useTrainerProfileStore } from '../stores/trainerProfileStore'
import { logActivity } from '../lib/activityLogger'
import type { VenueRental } from '../types'
import type { VenueRentalFormValues } from '../lib/validators'

export function useVenueRentals() {
  const [rentals, setRentals] = useState<VenueRental[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const { selectedTrainerId, selectedTrainerName } = useTrainerProfileStore()

  const fetchRentals = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const rentalsRef = collection(db, 'venueRentals')
      let q
      if (user.role === 'admin') {
        q = query(
          rentalsRef,
          where('centerId', '==', centerId),
          orderBy('date', 'desc')
        )
      } else {
        q = query(
          rentalsRef,
          where('centerId', '==', centerId),
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
  }, [user, centerId])

  useEffect(() => {
    fetchRentals()
  }, [fetchRentals])

  const logRentalActivity = async (action: 'create' | 'update' | 'delete', recordId: string, summary: string, newValue?: any, previousValue?: any) => {
    if (!user) return
    try {
      let operatorName = selectedTrainerName || user.displayName || '教練'
      let operatorId = selectedTrainerId || user.uid

      await logActivity({
        centerId: centerId as any,
        trainerId: operatorId,
        trainerName: operatorName,
        action,
        module: 'venueBookings', // Use same venueBookings module
        recordId,
        recordSummary: summary,
        newValue,
        previousValue
      })
    } catch (err) {
      console.error('Failed to log rental activity:', err)
    }
  }

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
      centerId,
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
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    batch.set(cashFlowRef, cashFlowData)
    batch.set(rentalRef, rentalData)

    try {
      await batch.commit()
      await logRentalActivity('create', rentalRef.id, `建立場租紀錄: ${data.renterName || ''} - NT$ ${data.amount}`, rentalData)
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
      const oldSnap = await getDoc(doc(db, 'venueRentals', id))
      const oldData = oldSnap.exists() ? oldSnap.data() as VenueRental : null
      const renterName = oldData?.renterName || ''
      const amount = oldData?.amount || 0

      await batch.commit()
      await logRentalActivity('delete', id, `刪除場租紀錄: ${renterName} - NT$ ${amount}`, undefined, oldData)
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
