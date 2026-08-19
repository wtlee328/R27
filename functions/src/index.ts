import * as fs from 'fs'
import * as path from 'path'
import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onRequest } from 'firebase-functions/v2/https'
import { google } from 'googleapis'
import JSZip from 'jszip'
import { format } from 'date-fns'
import { Readable } from 'stream'

// Initialize Firebase Admin
admin.initializeApp()
const db = admin.firestore()

// Target Google Drive Folder ID
const GOOGLE_DRIVE_FOLDER_ID = '1-oBiAmVK9J-nK7gS2rn9GlQmq_fMxhFo'

const COLLECTIONS_TO_BACKUP = [
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
 * Load Service Account Credentials safely
 */
function getServiceAccountCredentials() {
  if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY)
    } catch (e) {
      console.warn('Failed to parse GCP_SERVICE_ACCOUNT_KEY env var:', e)
    }
  }

  const localKeyPath = path.join(__dirname, 'serviceAccount.json')
  if (fs.existsSync(localKeyPath)) {
    try {
      const raw = fs.readFileSync(localKeyPath, 'utf8')
      return JSON.parse(raw)
    } catch (e) {
      console.warn('Failed to read serviceAccount.json:', e)
    }
  }

  return null
}

/**
 * Helper to get Google Drive API Client with Service Account
 */
function getDriveClient() {
  const creds = getServiceAccountCredentials()
  if (!creds || !creds.client_email || !creds.private_key) {
    throw new Error('GCP Service Account Credentials not found. Please provide serviceAccount.json or GCP_SERVICE_ACCOUNT_KEY.')
  }

  const jwtClient = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
  )
  return google.drive({ version: 'v3', auth: jwtClient })
}

/**
 * Buffer to Readable Stream
 */
function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)
  return stream
}

/**
 * Automatically clean up backups older than retentionDays (Default: 30 days)
 */
export async function cleanupOldBackups(retentionDays = 30) {
  const cutoffTimestamp = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  console.log(`[Backup Retention] Checking for backups created before ${new Date(cutoffTimestamp).toISOString()} (${retentionDays} days retention)...`)

  try {
    const snap = await db.collection('systemBackups').get()
    if (snap.empty) return

    let deletedCount = 0

    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      let createdAtMs: number | null = null

      if (data.createdAt?.toMillis) {
        createdAtMs = data.createdAt.toMillis()
      } else if (data.createdAt && typeof data.createdAt === 'number') {
        createdAtMs = data.createdAt
      } else if (docSnap.id && /^\d{8}_\d{6}/.test(docSnap.id)) {
        // Parse yyyyMMdd_HHmmss
        const idStr = docSnap.id
        const y = parseInt(idStr.substring(0, 4), 10)
        const m = parseInt(idStr.substring(4, 6), 10) - 1
        const d = parseInt(idStr.substring(6, 8), 10)
        const h = parseInt(idStr.substring(9, 11), 10)
        const min = parseInt(idStr.substring(11, 13), 10)
        const s = parseInt(idStr.substring(13, 15), 10)
        createdAtMs = new Date(y, m, d, h, min, s).getTime()
      }

      if (createdAtMs && createdAtMs < cutoffTimestamp) {
        console.log(`[Backup Retention] Purging expired backup: ${docSnap.id} (${data.fileName || 'unnamed'})`)

        // 1. Delete all subcollection chunks
        const chunksSnap = await docSnap.ref.collection('chunks').get()
        if (!chunksSnap.empty) {
          const chunkBatch = db.batch()
          chunksSnap.docs.forEach((c) => chunkBatch.delete(c.ref))
          await chunkBatch.commit()
        }

        // 2. Delete main document
        await docSnap.ref.delete()

        // 3. Delete from Firebase Cloud Storage if exists
        if (data.fileName) {
          try {
            const bucket = admin.storage().bucket()
            await bucket.file(`backups/${data.fileName}`).delete()
          } catch (storageErr) {
            // Ignore if file doesn't exist in bucket
          }
        }

        deletedCount++
      }
    }

    if (deletedCount > 0) {
      console.log(`[Backup Retention] Successfully purged ${deletedCount} expired backup(s) older than ${retentionDays} days.`)
    } else {
      console.log('[Backup Retention] All backups are within the 30-day retention window. No deletion required.')
    }
  } catch (err: any) {
    console.error('[Backup Retention] Error during backup cleanup:', err)
  }
}

/**
 * Core Backup Worker
 */
export async function executeAutomatedBackup(isManual = false) {
  const startTime = Date.now()
  const zip = new JSZip()
  const jsonFolder = zip.folder('json')
  let totalRecordCount = 0

  console.log(`[Backup] Starting ${isManual ? 'manual' : 'scheduled'} backup worker...`)

  try {
    // 1. Export collections from Firestore
    for (const colName of COLLECTIONS_TO_BACKUP) {
      const snap = await db.collection(colName).get()
      const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      totalRecordCount += docs.length
      if (docs.length > 0) {
        jsonFolder?.file(`${colName}.json`, JSON.stringify(docs, null, 2))
      }
    }

    // 2. Generate ZIP Buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const timestampStr = format(new Date(), 'yyyyMMdd_HHmmss')
    const fileName = `R27_系統排程自動備份_${timestampStr}.zip`

    console.log(`[Backup] Generated ZIP: ${fileName} (${(zipBuffer.length / 1024).toFixed(1)} KB, ${totalRecordCount} records)`)

    // 3. Save to Firestore systemBackups collection with subcollection chunking (No size limit)
    const zipBase64 = zipBuffer.toString('base64')
    const CHUNK_SIZE = 450000 // Safe 450KB per chunk
    const totalChunks = Math.ceil(zipBase64.length / CHUNK_SIZE)

    const backupDocRef = db.collection('systemBackups').doc(timestampStr)
    await backupDocRef.set({
      id: timestampStr,
      fileName,
      totalRecordCount,
      totalChunks,
      sizeBytes: zipBuffer.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isManual,
    })

    const chunkBatch = db.batch()
    for (let i = 0; i < totalChunks; i++) {
      const chunkData = zipBase64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      const chunkRef = backupDocRef.collection('chunks').doc(String(i).padStart(4, '0'))
      chunkBatch.set(chunkRef, {
        index: i,
        data: chunkData,
      })
    }
    await chunkBatch.commit()

    console.log(`[Backup] Saved backup to Firestore systemBackups/${timestampStr} across ${totalChunks} chunks`)

    // 4. Try Firebase Cloud Storage if bucket exists
    let storageFilePath = ''
    let downloadUrl = ''
    try {
      const bucket = admin.storage().bucket()
      storageFilePath = `backups/${fileName}`
      const file = bucket.file(storageFilePath)
      await file.save(zipBuffer, {
        metadata: {
          contentType: 'application/zip',
          metadata: {
            totalRecordCount: String(totalRecordCount),
            createdAt: new Date().toISOString(),
          },
        },
      })
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      })
      downloadUrl = signedUrl
      console.log(`[Backup] Uploaded to Firebase Cloud Storage: ${storageFilePath}`)
    } catch (storageErr: any) {
      console.log(`[Backup] Cloud Storage bucket note: ${storageErr.message}. (Backup safely stored in systemBackups collection).`)
    }

    // 4. Attempt Google Drive Upload (If Shared Drive supported)
    let driveFileName: string | undefined
    let driveFileLink: string | undefined
    let driveFileId: string | undefined

    try {
      const drive = getDriveClient()
      const fileMetadata = {
        name: fileName,
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      }
      const media = {
        mimeType: 'application/zip',
        body: bufferToStream(zipBuffer),
      }

      const driveRes = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        supportsAllDrives: true,
        fields: 'id, name, webViewLink',
      })

      driveFileId = driveRes.data.id || undefined
      driveFileName = driveRes.data.name || fileName
      driveFileLink = driveRes.data.webViewLink || undefined
      console.log(`[Backup] Also synced directly to Google Drive! File ID: ${driveFileId}`)
    } catch (driveErr: any) {
      console.log(`[Backup] Direct service-account Drive sync noted: ${driveErr.message}. (Saved safely in Cloud Storage; web app will sync when admin logs in).`)
    }

    // 5. Automatically clean up backups older than 30 days (Retention policy)
    try {
      await cleanupOldBackups(30)
    } catch (cleanErr: any) {
      console.warn('[Backup] Cleanup of old backups encountered a warning:', cleanErr.message)
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
    const successMsg = `已完成系統無人值守自動備份（共 ${totalRecordCount} 筆資料），已安全封存至 Firebase 雲端空間${
      driveFileName ? `並已同步至 Google Drive (${driveFileName})` : ''
    }（保留近 30 天備份，逾期自動清理），耗時 ${durationSec} 秒。`

    // 6. Update systemConfig/backupSchedule in Firestore
    await db.doc('systemConfig/backupSchedule').set(
      {
        lastRunTimestamp: Date.now(),
        lastStatus: 'success',
        lastMessage: successMsg,
        fileName,
        storageFilePath,
        downloadUrl: downloadUrl || null,
        totalRecordCount,
        lastDriveFileId: driveFileId || null,
        lastDriveFileName: driveFileName || null,
        lastDriveFileLink: driveFileLink || null,
        syncedToDrive: Boolean(driveFileName),
        targetFolderId: GOOGLE_DRIVE_FOLDER_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // 7. Send notification to all admins
    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get()
    const batch = db.batch()
    const nowTimestamp = admin.firestore.FieldValue.serverTimestamp()

    adminsSnap.docs.forEach((adminDoc) => {
      const notifRef = db.collection('notifications').doc()
      batch.set(notifRef, {
        userId: adminDoc.id,
        centerId: 'r27',
        type: 'backup_success',
        title: '自動排程備份成功',
        message: successMsg,
        downloadUrl: downloadUrl || null,
        isRead: false,
        createdAt: nowTimestamp,
      })
    })

    if (!adminsSnap.empty) {
      await batch.commit()
    }

    return {
      success: true,
      message: successMsg,
      recordCount: totalRecordCount,
      fileName,
      storageFilePath,
      downloadUrl,
      driveFile: driveFileName ? { id: driveFileId, name: driveFileName, webViewLink: driveFileLink } : null,
    }
  } catch (error: any) {
    const errorMsg = `自動排程備份執行失敗：${error?.message || '未知錯誤'}`
    console.error('[Backup] Backup execution failed:', error)

    // Log failure in systemConfig
    await db.doc('systemConfig/backupSchedule').set(
      {
        lastRunTimestamp: Date.now(),
        lastStatus: 'failed',
        lastMessage: errorMsg,
        targetFolderId: GOOGLE_DRIVE_FOLDER_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // Push failure notifications
    try {
      const adminsSnap = await db.collection('users').where('role', '==', 'admin').get()
      const batch = db.batch()
      const nowTimestamp = admin.firestore.FieldValue.serverTimestamp()

      adminsSnap.docs.forEach((adminDoc) => {
        const notifRef = db.collection('notifications').doc()
        batch.set(notifRef, {
          userId: adminDoc.id,
          centerId: 'r27',
          type: 'backup_failed',
          title: '自動排程備份失敗',
          message: errorMsg,
          isRead: false,
          createdAt: nowTimestamp,
        })
      })

      if (!adminsSnap.empty) {
        await batch.commit()
      }
    } catch (notifErr) {
      console.error('[Backup] Failed to send failure notification:', notifErr)
    }

    throw error
  }
}

/**
 * ⏰ Cloud Scheduler Trigger: Runs every day at 02:00 AM (Taipei Time)
 */
export const scheduledBackupToGoogleDrive = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async () => {
    await executeAutomatedBackup(false)
  }
)

/**
 * 🌐 HTTP Trigger for Manual Trigger / Testing
 */
export const triggerBackupHttp = onRequest(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      const result = await executeAutomatedBackup(true)
      res.status(200).json({ ok: true, data: result })
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || 'Backup failed' })
    }
  }
)
