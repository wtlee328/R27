import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { db, auth } from './firebase'
import { useCenterStore } from '../stores/centerStore'
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

    // Priority 1: Explicitly passed params.centerId
    // Priority 2: Active venue currently selected in user workspace (useCenterStore)
    const activeCenterId = useCenterStore.getState().centerId
    let resolvedCenterId = params.centerId || activeCenterId

    if (authUid) {
      const userSnap = await getDoc(doc(db, 'users', authUid))
      if (userSnap.exists()) {
        const userData = userSnap.data()

        // Only fallback to user profile centerId if resolvedCenterId is not set
        if (!resolvedCenterId && userData.centerId) {
          resolvedCenterId = userData.centerId
        }

        if (userData.role === 'admin') {
          const adminIdentifier = userData.displayName || userData.email || auth.currentUser?.email || '管理員'
          operatorName = `${adminIdentifier} (管理員)`
          operatorTrainerId = authUid
        }
      }
    }

    resolvedCenterId = resolvedCenterId || 'r27'

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
