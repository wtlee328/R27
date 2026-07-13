import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { db, auth } from './firebase'
import type { ActivityAction, ActivityModule } from '@/types'

export async function logActivity(params: {
  centerId?: 'r27' | 'coffit'
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
    let operatorName = params.trainerName
    let operatorTrainerId = params.trainerId
    let resolvedCenterId = params.centerId

    if (authUid) {
      const userSnap = await getDoc(doc(db, 'users', authUid))
      if (userSnap.exists()) {
        const userData = userSnap.data()
        if (userData.centerId) {
          resolvedCenterId = userData.centerId
        }
        if (userData.role === 'admin') {
          const adminIdentifier = userData.displayName || userData.email || auth.currentUser?.email || '管理員'
          operatorName = `${adminIdentifier} (管理員)`
          operatorTrainerId = authUid
        }
      }
    }

    const docData = {
      ...params,
      centerId: resolvedCenterId,
      trainerName: operatorName,
      trainerId: operatorTrainerId,
      trainerAuthUid: authUid,
      timestamp: serverTimestamp(),
    }

    // Clean undefined fields to prevent Firestore serialization errors
    const cleanedData: Record<string, any> = {}
    Object.keys(docData).forEach(key => {
      if ((docData as any)[key] !== undefined) {
        cleanedData[key] = (docData as any)[key]
      }
    })

    await addDoc(collection(db, 'activityLogs'), cleanedData)
  } catch (err) {
    console.error('Failed to write activity log:', err)
  }
}
