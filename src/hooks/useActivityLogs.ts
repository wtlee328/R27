import { useState, useEffect, useCallback } from 'react'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import type { ActivityLog } from '../types'

export function useActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()

  const fetchLogs = useCallback(async () => {
    if (!user || user.role !== 'admin') return

    setLoading(true)
    setError(null)
    try {
      const logsRef = collection(db, 'activityLogs')
      const q = query(
        logsRef,
        where('centerId', '==', centerId),
        orderBy('timestamp', 'desc'),
        limit(100) // Show last 100 entries
      )

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ActivityLog[]

      setLogs(data)
    } catch (err: any) {
      console.error('Error fetching activity logs:', err)
      setError(err.message || '無法載入操作記錄')
    } finally {
      setLoading(false)
    }
  }, [user, centerId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return {
    logs,
    loading,
    error,
    refresh: fetchLogs,
  }
}
