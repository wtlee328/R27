import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import {
  fetchSystemBackupConfig,
  saveSystemBackupConfig,
  isBackupDue,
  executeScheduledBackup,
  DEFAULT_BACKUP_CONFIG,
} from '../lib/backupEngine'
import type {
  AutoBackupConfig,
  BackupScheduleFrequency,
} from '../lib/backupEngine'
import { toast } from 'sonner'

export function useAutoBackupScheduler() {
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const [config, setConfig] = useState<AutoBackupConfig>(DEFAULT_BACKUP_CONFIG)
  const [isRunning, setIsRunning] = useState(false)
  const isEvaluatingRef = useRef(false)

  // 1. Load config on mount
  useEffect(() => {
    if (!user || user.role !== 'admin') return
    let isMounted = true

    fetchSystemBackupConfig().then(cfg => {
      if (isMounted) setConfig(cfg)
    })

    return () => {
      isMounted = false
    }
  }, [user])

  // 2. Schedule evaluation runner
  const evaluateAndRun = useCallback(async () => {
    if (!user || user.role !== 'admin') return
    if (isEvaluatingRef.current || isRunning) return

    isEvaluatingRef.current = true
    try {
      const currentConfig = await fetchSystemBackupConfig()
      setConfig(currentConfig)

      if (isBackupDue(currentConfig)) {
        setIsRunning(true)
        console.log(`[AutoBackup] Schedule is due (${currentConfig.frequency}), executing automatic backup...`)
        const result = await executeScheduledBackup({
          userId: user.uid,
          centerId: centerId || 'r27',
          isManualTrigger: false,
        })
        console.log('[AutoBackup] Result:', result)
        if (result.success) {
          toast.info('【自動排程備份】已於背景成功執行，通知已送達通知中心。')
        } else {
          toast.error('【自動排程備份失敗】已記錄至通知中心，請至資料備份頁面檢視。')
        }
        const updated = await fetchSystemBackupConfig()
        setConfig(updated)
      }
    } catch (err) {
      console.error('[AutoBackup] Evaluation error:', err)
    } finally {
      setIsRunning(false)
      isEvaluatingRef.current = false
    }
  }, [user, centerId, isRunning])

  // 3. Mount scheduler interval (check every 15 minutes)
  useEffect(() => {
    if (!user || user.role !== 'admin') return

    // Run initial check 3 seconds after page load
    const initialTimer = setTimeout(() => {
      evaluateAndRun()
    }, 3000)

    const intervalId = setInterval(() => {
      evaluateAndRun()
    }, 15 * 60 * 1000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(intervalId)
    }
  }, [user, evaluateAndRun])

  // 4. Update schedule frequency / config
  const updateFrequency = useCallback(async (newFreq: BackupScheduleFrequency) => {
    if (!user) return
    const updated = await saveSystemBackupConfig({ frequency: newFreq }, user.uid)
    setConfig(updated)
    toast.success(`自動排程備份頻率已更新為：${
      newFreq === 'none' ? '無 (僅手動)' : newFreq === 'daily' ? '每日自動備份' : newFreq === 'weekly' ? '每週自動備份' : '每月自動備份'
    }`)
  }, [user])

  // 5. Test manual scheduled backup and push notification
  const triggerTestScheduledBackup = useCallback(async () => {
    if (!user || isRunning) return
    setIsRunning(true)
    try {
      toast.info('正在測試執行排程備份並發送通知...')
      const result = await executeScheduledBackup({
        userId: user.uid,
        centerId: centerId || 'r27',
        isManualTrigger: true,
      })
      const updated = await fetchSystemBackupConfig()
      setConfig(updated)
      if (result.success) {
        toast.success('排程備份測試成功！已發送成功通知至右上角通知中心。')
      } else {
        toast.error(`排程備份測試失敗：${result.message}，已發送失敗通知至通知中心。`)
      }
      return result
    } finally {
      setIsRunning(false)
    }
  }, [user, centerId, isRunning])

  return {
    config,
    isRunning,
    updateFrequency,
    triggerTestScheduledBackup,
    evaluateAndRun,
  }
}
