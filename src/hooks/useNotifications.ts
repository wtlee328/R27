import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import type { AppNotification } from '../types'
import type { Contract } from '../types'

// How many days ahead to warn about upcoming installments
const WARN_DAYS_AHEAD = 3

function formatDate(date: Date): string {
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getNotificationKey(contractId: string, installmentId: string): string {
  return `${contractId}_${installmentId}`
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  // ── Generate installment notifications (idempotent) ──────────
  const generateInstallmentNotifications = useCallback(async (contracts: Contract[]) => {
    if (!user) return

    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const warnUntil = new Date(now)
    warnUntil.setDate(warnUntil.getDate() + WARN_DAYS_AHEAD)

    // Fetch existing notification keys so we don't duplicate
    const existingRef = collection(db, 'notifications')
    const existingQuery = query(existingRef, where('userId', '==', user.uid))
    const existingSnap = await getDocs(existingQuery)
    const existingKeys = new Set<string>(
      existingSnap.docs
        .map(d => d.data().notificationKey as string)
        .filter(Boolean)
    )

    const batch = writeBatch(db)
    let batchCount = 0

    for (const contract of contracts) {
      if (!contract.installments?.length) continue

      // Fetch customer name for richer notifications
      for (const installment of contract.installments) {
        if (installment.status === 'paid') continue

        const dueDate = installment.dueDate?.toDate?.()
        if (!dueDate) continue

        dueDate.setHours(0, 0, 0, 0)

        const isOverdue = dueDate < now
        const isDueSoon = dueDate >= now && dueDate <= warnUntil

        if (!isOverdue && !isDueSoon) continue

        const key = getNotificationKey(contract.id, installment.id)
        if (existingKeys.has(key)) continue

        const type = isOverdue ? 'installment_overdue' : 'installment_due'
        const title = isOverdue ? '分期款項逾期未付' : '分期款項即將到期'
        const displayNo = (contract as any).contractNo || contract.id.slice(-6).toUpperCase()
        const message = isOverdue
          ? `合約 ${displayNo} 有一筆 NT$${installment.amount.toLocaleString()} 的分期款項已於 ${formatDate(dueDate)} 逾期。`
          : `合約 ${displayNo} 有一筆 NT$${installment.amount.toLocaleString()} 的分期款項將於 ${formatDate(dueDate)} 到期。`

        const newNotif = {
          userId: user.uid,
          type,
          title,
          message,
          isRead: false,
          contractId: contract.id,
          customerId: contract.customerId,
          notificationKey: key,
          dueDate: installment.dueDate,
          createdAt: serverTimestamp(),
        }

        const newDocRef = doc(collection(db, 'notifications'))
        batch.set(newDocRef, newNotif)
        batchCount++

        // Firestore batch limit is 500
        if (batchCount >= 490) break
      }
      if (batchCount >= 490) break
    }

    if (batchCount > 0) {
      await batch.commit()
    }
  }, [user])

  // ── Subscribe to notifications in real-time ──────────────────
  useEffect(() => {
    if (!user) return

    const notifRef = collection(db, 'notifications')
    const q = query(notifRef, where('userId', '==', user.uid))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as AppNotification[]

      // Sort: unread first, then by createdAt desc
      data.sort((a, b) => {
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
        const timeA = (a.createdAt as any)?.toMillis?.() || 0
        const timeB = (b.createdAt as any)?.toMillis?.() || 0
        return timeB - timeA
      })

      setNotifications(data)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [user])

  // ── Generate notifications when hook mounts ──────────────────
  useEffect(() => {
    if (!user) return

    // Fetch contracts then generate
    const fetchAndGenerate = async () => {
      try {
        const contractsRef = collection(db, 'contracts')
        let q
        if (user.role === 'admin') {
          q = query(contractsRef)
        } else {
          q = query(contractsRef, where('trainerId', '==', user.uid))
        }
        const snap = await getDocs(q)
        const contracts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Contract[]
        await generateInstallmentNotifications(contracts)
      } catch (err) {
        console.error('Error generating notifications:', err)
      }
    }

    fetchAndGenerate()
  }, [user, generateInstallmentNotifications])

  // ── Actions ──────────────────────────────────────────────────
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const notifRef = doc(db, 'notifications', notificationId)
      await updateDoc(notifRef, { isRead: true })
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      const unread = notifications.filter(n => !n.isRead)
      if (!unread.length) return
      const batch = writeBatch(db)
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { isRead: true })
      })
      await batch.commit()
    } catch (err) {
      console.error('Error marking all notifications as read:', err)
    }
  }, [notifications])

  const unreadCount = notifications.filter(n => !n.isRead).length

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  }
}
