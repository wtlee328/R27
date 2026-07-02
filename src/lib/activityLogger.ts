import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from './firebase'
import type { ActivityAction, ActivityModule } from '@/types'

export async function logActivity(params: {
  centerId: 'r27' | 'coffit'
  trainerId: string
  trainerName: string
  action: ActivityAction
  module: ActivityModule
  recordId: string
  recordSummary: string
  previousValue?: Record<string, any>
  newValue?: Record<string, any>
}) {
  try {
    const authUid = auth.currentUser?.uid || ''
    await addDoc(collection(db, 'activityLogs'), {
      ...params,
      trainerAuthUid: authUid,
      timestamp: serverTimestamp(),
    })
  } catch (err) {
    console.error('Failed to write activity log:', err)
  }
}
