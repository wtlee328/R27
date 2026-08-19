import { useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { toast } from 'sonner'

const STORAGE_KEY = 'r27_last_forced_reload'
const APP_INITIALIZED_AT = Date.now()

export function useVersionGuard() {
  const isReloadingRef = useRef(false)

  useEffect(() => {
    // Listen for realtime version/reload signals from systemConfig/appVersion
    const docRef = doc(db, 'systemConfig', 'appVersion')
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists()) return

      const data = docSnap.data()
      const serverReloadTimestamp = data.forcedReloadTimestamp

      if (!serverReloadTimestamp || typeof serverReloadTimestamp !== 'number') return

      const lastStored = Number(localStorage.getItem(STORAGE_KEY) || 0)

      // If server has a newer reload timestamp than this client session AND newer than stored timestamp
      if (serverReloadTimestamp > APP_INITIALIZED_AT && serverReloadTimestamp > lastStored) {
        if (isReloadingRef.current) return
        isReloadingRef.current = true

        localStorage.setItem(STORAGE_KEY, String(serverReloadTimestamp))

        toast.info('系統管理員發布了最新版本更新，正在為您同步載入...', {
          duration: 3000,
        })

        setTimeout(() => {
          // Hard reload from server
          window.location.reload()
        }, 1500)
      }
    }, (error) => {
      console.warn('Version guard snapshot warning:', error)
    })

    // Also check on tab visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isReloadingRef.current) {
        // Can re-trigger check if needed
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
}

/**
 * Triggers a global force reload for all connected clients/trainers
 */
export async function triggerGlobalForceReload(adminName?: string) {
  const docRef = doc(db, 'systemConfig', 'appVersion')
  const now = Date.now()
  
  await setDoc(docRef, {
    forcedReloadTimestamp: now,
    updatedAt: serverTimestamp(),
    updatedBy: adminName || 'Admin',
  }, { merge: true })

  return now
}
