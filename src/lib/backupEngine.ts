import { collection, getDocs, doc, setDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import JSZip from 'jszip'
import { format } from 'date-fns'
import {
  getStoredGoogleDriveToken,
  findOrCreateFolder,
  uploadFileToGoogleDrive,
} from './googleDrive'

export type BackupScheduleFrequency = 'none' | 'daily' | 'weekly' | 'monthly'

export interface AutoBackupConfig {
  frequency: BackupScheduleFrequency
  lastRunTimestamp: number
  lastStatus?: 'success' | 'failed'
  lastMessage?: string
  gdriveFolderId: string
  syncToGDrive: boolean
}

const STORAGE_KEY_CONFIG = 'r27_auto_backup_config'

export const DEFAULT_BACKUP_CONFIG: AutoBackupConfig = {
  frequency: 'none',
  lastRunTimestamp: 0,
  gdriveFolderId: 'R27_Coffit_Backups',
  syncToGDrive: false,
}

export function getLocalBackupConfig(): AutoBackupConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
    if (raw) {
      return { ...DEFAULT_BACKUP_CONFIG, ...JSON.parse(raw) }
    }
  } catch (e) {
    console.warn('Failed to parse local backup config:', e)
  }
  return DEFAULT_BACKUP_CONFIG
}

export function setLocalBackupConfig(cfg: Partial<AutoBackupConfig>): AutoBackupConfig {
  const current = getLocalBackupConfig()
  const updated: AutoBackupConfig = { ...current, ...cfg }
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated))
  } catch (e) {
    console.warn('Failed to save local backup config:', e)
  }
  return updated
}

export async function fetchSystemBackupConfig(): Promise<AutoBackupConfig> {
  try {
    const snap = await getDocs(collection(db, 'systemConfig'))
    const docItem = snap.docs.find(d => d.id === 'backupSchedule')
    if (docItem && docItem.exists()) {
      const data = docItem.data() as Partial<AutoBackupConfig>
      const merged = setLocalBackupConfig(data)
      return merged
    }
  } catch (e) {
    console.warn('Could not fetch systemConfig from firestore, using local:', e)
  }
  return getLocalBackupConfig()
}

export async function saveSystemBackupConfig(cfg: Partial<AutoBackupConfig>, adminUid?: string): Promise<AutoBackupConfig> {
  const updated = setLocalBackupConfig(cfg)
  try {
    const docRef = doc(db, 'systemConfig', 'backupSchedule')
    await setDoc(docRef, {
      ...updated,
      updatedAt: serverTimestamp(),
      updatedBy: adminUid || 'admin',
    }, { merge: true })
  } catch (e) {
    console.warn('Could not save systemConfig to firestore:', e)
  }
  return updated
}

/**
 * Checks whether an automated backup is due
 */
export function isBackupDue(config: AutoBackupConfig): boolean {
  if (config.frequency === 'none') return false
  if (!config.lastRunTimestamp) return true

  const now = Date.now()
  const diffMs = now - config.lastRunTimestamp

  switch (config.frequency) {
    case 'daily':
      // At least 20 hours since last run or different calendar day
      return diffMs >= 20 * 60 * 60 * 1000
    case 'weekly':
      return diffMs >= 6 * 24 * 60 * 60 * 1000
    case 'monthly':
      return diffMs >= 27 * 24 * 60 * 60 * 1000
    default:
      return false
  }
}

/**
 * Pushes a notification to Firestore notifications collection for admin(s)
 */
export async function pushBackupNotification({
  userId,
  centerId = 'r27',
  isSuccess,
  message,
  detail,
}: {
  userId: string
  centerId?: string
  isSuccess: boolean
  message: string
  detail?: string
}): Promise<void> {
  try {
    const notifRef = collection(db, 'notifications')
    await addDoc(notifRef, {
      userId,
      centerId,
      type: isSuccess ? 'backup_success' : 'backup_failed',
      title: isSuccess ? '自動排程備份成功' : '自動排程備份失敗',
      message: detail ? `${message} (${detail})` : message,
      isRead: false,
      createdAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('Failed to push backup notification:', e)
  }
}

const BACKUP_COLLECTIONS = [
  'customers',
  'lessonRecords',
  'contracts',
  'cashFlowRecords',
  'trainers',
  'users',
  'trialRecords',
  'venueRentals',
  'renterCustomers',
  'activityLogs',
  'notifications',
]

/**
 * Performs full system backup and creates notification in Notification Center
 */
export async function executeScheduledBackup({
  userId,
  centerId = 'r27',
  isManualTrigger = false,
}: {
  userId: string
  centerId?: string
  isManualTrigger?: boolean
}): Promise<{ success: boolean; count: number; message: string; driveFileName?: string }> {
  const config = getLocalBackupConfig()
  const zip = new JSZip()
  const jsonFolder = zip.folder('json')
  let totalCount = 0

  try {
    // 1. Fetch all collections
    for (const colName of BACKUP_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(db, colName))
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        totalCount += docs.length
        if (docs.length > 0) {
          jsonFolder?.file(`${colName}.json`, JSON.stringify(docs, null, 2))
        }
      } catch (colErr) {
        console.warn(`Backup collection read warning [${colName}]:`, colErr)
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const dateStr = format(new Date(), 'yyyyMMdd_HHmmss')
    const filename = `系統排程備份_${dateStr}.zip`

    let driveFileName: string | undefined

    // 2. Upload to Google Drive if token is available
    const tokenObj = getStoredGoogleDriveToken()
    if (tokenObj && tokenObj.expiresAt > Date.now()) {
      try {
        const folderId = await findOrCreateFolder(tokenObj.accessToken, config.gdriveFolderId || 'R27_Coffit_Backups')
        const driveRes = await uploadFileToGoogleDrive({
          accessToken: tokenObj.accessToken,
          folderId,
          fileName: filename,
          mimeType: 'application/zip',
          blob: zipBlob,
        })
        driveFileName = driveRes.name
      } catch (driveErr: any) {
        console.warn('Google Drive sync error during scheduled backup:', driveErr)
      }
    }

    // 3. Update config state
    const successMsg = `已完成${isManualTrigger ? '手動觸發' : '排程'}備份（共 ${totalCount} 筆資料）${
      driveFileName ? `，並已同步至 Google Drive (${driveFileName})` : ''
    }`
    
    await saveSystemBackupConfig({
      lastRunTimestamp: Date.now(),
      lastStatus: 'success',
      lastMessage: successMsg,
    }, userId)

    // 4. Send notification to Notification Center
    await pushBackupNotification({
      userId,
      centerId,
      isSuccess: true,
      message: successMsg,
      detail: format(new Date(), 'yyyy/MM/dd HH:mm:ss'),
    })

    return {
      success: true,
      count: totalCount,
      message: successMsg,
      driveFileName,
    }
  } catch (err: any) {
    const errorMsg = `備份執行發生錯誤：${err?.message || '未知錯誤'}`
    console.error('Scheduled backup error:', err)

    await saveSystemBackupConfig({
      lastRunTimestamp: Date.now(),
      lastStatus: 'failed',
      lastMessage: errorMsg,
    }, userId)

    await pushBackupNotification({
      userId,
      centerId,
      isSuccess: false,
      message: errorMsg,
      detail: format(new Date(), 'yyyy/MM/dd HH:mm:ss'),
    })

    return {
      success: false,
      count: totalCount,
      message: errorMsg,
    }
  }
}
