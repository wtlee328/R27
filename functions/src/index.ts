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

    // 3. Upload to Google Drive
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
      fields: 'id, name, webViewLink',
    })

    const driveFile = driveRes.data
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
    const successMsg = `已完成系統無人值守自動備份（共 ${totalRecordCount} 筆資料），已成功推送到公司 Google Drive (${fileName})，耗時 ${durationSec} 秒。`

    console.log(`[Backup] Uploaded to Google Drive successfully! File ID: ${driveFile.id}`)

    // 4. Update systemConfig/backupSchedule in Firestore
    await db.doc('systemConfig/backupSchedule').set(
      {
        lastRunTimestamp: Date.now(),
        lastStatus: 'success',
        lastMessage: successMsg,
        lastDriveFileId: driveFile.id,
        lastDriveFileName: driveFile.name,
        lastDriveFileLink: driveFile.webViewLink || null,
        targetFolderId: GOOGLE_DRIVE_FOLDER_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    // 5. Send notification to all admins
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
      driveFile,
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
