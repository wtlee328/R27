import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import { useTrainerProfileStore } from '../stores/trainerProfileStore'
import { logActivity } from '../lib/activityLogger'
import type { VenueBooking, BookingStatus } from '../types'

export function useVenueBookings() {
  const [bookings, setBookings] = useState<VenueBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const { selectedTrainerId, selectedTrainerName } = useTrainerProfileStore()

  const fetchBookings = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const bookingsRef = collection(db, 'venueBookings')
      let q
      
      // Determine scoped centerId
      const activeCenterId = user.isSharedTrainerAccount ? (user.centerId || 'r27') : centerId

      if (user.role === 'admin') {
        q = query(
          bookingsRef,
          where('centerId', '==', activeCenterId),
          orderBy('date', 'asc')
        )
      } else {
        q = query(
          bookingsRef,
          where('centerId', '==', activeCenterId),
          orderBy('date', 'asc')
        )
      }

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as VenueBooking[]

      setBookings(data)
    } catch (err: any) {
      console.error('Error fetching venue bookings:', err)
      setError(err.message || '無法載入場租預約資料')
    } finally {
      setLoading(false)
    }
  }, [user, centerId])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const logBookingActivity = async (action: 'create' | 'update' | 'delete', recordId: string, summary: string, newValue?: any, previousValue?: any) => {
    if (!user) return
    try {
      const activeCenterId = user.isSharedTrainerAccount ? (user.centerId || 'r27') : centerId
      
      let operatorName = selectedTrainerName || user.displayName || '教練'
      let operatorId = selectedTrainerId || user.uid

      await logActivity({
        centerId: activeCenterId as any,
        trainerId: operatorId,
        trainerName: operatorName,
        action,
        module: 'venueBookings',
        recordId,
        recordSummary: summary,
        newValue,
        previousValue
      })
    } catch (err) {
      console.error('Failed to log booking activity:', err)
    }
  }

  const createBooking = async (data: Omit<VenueBooking, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => {
    if (!user) throw new Error('Not authenticated')

    const activeCenterId = user.isSharedTrainerAccount ? (user.centerId || 'r27') : centerId

    const newBooking = {
      ...data,
      centerId: activeCenterId,
      status: 'pending' as BookingStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      const docRef = await addDoc(collection(db, 'venueBookings'), newBooking)
      await logBookingActivity('create', docRef.id, `申請預約場地: ${data.trainerName} - ${data.startTime}~${data.endTime}`, newBooking)
      await fetchBookings()
      return docRef.id
    } catch (err: any) {
      console.error('Error creating venue booking:', err)
      throw err
    }
  }

  const updateBookingStatus = async (id: string, status: BookingStatus, adminNotes?: string, venueRentalId?: string) => {
    try {
      const docRef = doc(db, 'venueBookings', id)
      const oldSnap = await getDoc(docRef)
      const oldData = oldSnap.exists() ? oldSnap.data() as VenueBooking : null

      const updateData: any = {
        status,
        updatedAt: serverTimestamp(),
      }
      if (adminNotes !== undefined) {
        updateData.adminNotes = adminNotes
      }
      if (venueRentalId !== undefined) {
        updateData.venueRentalId = venueRentalId
      }
      await updateDoc(docRef, updateData)

      const trainerName = oldData?.trainerName || ''
      const timeStr = oldData ? `${oldData.startTime}~${oldData.endTime}` : ''
      const actionLabel = status === 'approved' ? '核准' : '駁回'
      
      await logBookingActivity(
        'update',
        id,
        `${actionLabel}場地預約: ${trainerName} - ${timeStr}`,
        updateData,
        oldData
      )

      await fetchBookings()
    } catch (err: any) {
      console.error('Error updating venue booking status:', err)
      throw err
    }
  }

  const deleteBooking = async (id: string) => {
    try {
      const oldSnap = await getDoc(doc(db, 'venueBookings', id))
      const oldData = oldSnap.exists() ? oldSnap.data() as VenueBooking : null
      const trainerName = oldData?.trainerName || ''
      const timeStr = oldData ? `${oldData.startTime}~${oldData.endTime}` : ''

      await deleteDoc(doc(db, 'venueBookings', id))
      await logBookingActivity(
        'delete',
        id,
        `取消場地預約: ${trainerName} - ${timeStr}`,
        undefined,
        oldData
      )
      await fetchBookings()
    } catch (err: any) {
      console.error('Error deleting venue booking:', err)
      throw err
    }
  }

  return {
    bookings,
    loading,
    error,
    createBooking,
    updateBookingStatus,
    deleteBooking,
    refresh: fetchBookings,
  }
}
