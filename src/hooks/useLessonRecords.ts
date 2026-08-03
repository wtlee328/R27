import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  orderBy,
  runTransaction,
  increment
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import { useTrainerProfileStore } from '../stores/trainerProfileStore'
import type { LessonRecord } from '../types'
import type { LessonRecordFormValues } from '../lib/validators'
import { logActivity } from '../lib/activityLogger'

export function useLessonRecords() {
  const [records, setRecords] = useState<LessonRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const { selectedTrainerId } = useTrainerProfileStore()

  const fetchRecords = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      const recordsRef = collection(db, 'lessonRecords')
      let data: LessonRecord[] = []

      if (user.role === 'admin') {
        const q = query(
          recordsRef,
          where('centerId', '==', centerId),
          orderBy('sessionDate', 'desc')
        )
        const querySnapshot = await getDocs(q)
        data = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as LessonRecord[]
      } else {
        // Use selectedTrainerId (chosen trainer profile) instead of user.uid (shared account)
        const trainerFilterId = selectedTrainerId || user.uid
        // Run two queries and merge them to avoid composite index requirements
        const q1 = query(
          recordsRef,
          where('centerId', '==', centerId),
          where('trainerId', '==', trainerFilterId),
          orderBy('sessionDate', 'desc')
        )
        const q2 = query(
          recordsRef,
          where('centerId', '==', centerId),
          where('contractTrainerId', '==', trainerFilterId),
          orderBy('sessionDate', 'desc')
        )
        
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)])
        const map = new Map<string, any>()
        snap1.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }))
        snap2.docs.forEach(doc => map.set(doc.id, { id: doc.id, ...doc.data() }))
        
        data = Array.from(map.values()).sort((a, b) => {
          const tA = a.sessionDate?.seconds || 0
          const tB = b.sessionDate?.seconds || 0
          return tB - tA
        }) as LessonRecord[]
      }

      setRecords(data)
    } catch (err: any) {
      console.error('Error fetching lesson records:', err)
      setError(err.message || '無法載入銷課資料')
    } finally {
      setLoading(false)
    }
  }, [user, centerId, selectedTrainerId])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const createRecord = async (data: LessonRecordFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const attendeeIds = data.attendingCustomerIds && data.attendingCustomerIds.length > 0
      ? data.attendingCustomerIds
      : [data.customerId]

    const rawDeductions: StudentDeduction[] = (data.deductions && data.deductions.length > 0)
      ? data.deductions
      : attendeeIds.map(id => ({
          customerId: id,
          customerName: '',
          contractId: data.contractId,
          sessionAmount: data.sessionAmount || 1,
        }))

    const newRecordData = {
      ...data,
      attendingCustomerIds: attendeeIds,
      deductions: rawDeductions,
      sessionDate: Timestamp.fromDate(data.sessionDate),
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    try {
      const result = await runTransaction(db, async (transaction) => {
        const uniqueContractIds = Array.from(new Set(rawDeductions.map(d => d.contractId).concat(data.contractId ? [data.contractId] : [])))
        const uniqueCustomerIds = Array.from(new Set(attendeeIds.concat(rawDeductions.map(d => d.customerId))))

        const contractRefsMap = new Map<string, any>()
        uniqueContractIds.forEach(cid => contractRefsMap.set(cid, doc(db, 'contracts', cid)))

        const customerRefsMap = new Map<string, any>()
        uniqueCustomerIds.forEach(uid => customerRefsMap.set(uid, doc(db, 'customers', uid)))

        // 1. ALL READS FIRST
        const contractSnapsMap = new Map<string, any>()
        for (const [cid, pref] of contractRefsMap.entries()) {
          const snap = await transaction.get(pref)
          contractSnapsMap.set(cid, snap)
        }

        const customerSnapsMap = new Map<string, any>()
        for (const [uid, uref] of customerRefsMap.entries()) {
          const snap = await transaction.get(uref)
          customerSnapsMap.set(uid, snap)
        }

        const attendeeNames = attendeeIds.map(uid => customerSnapsMap.get(uid)?.exists() ? customerSnapsMap.get(uid).data().name : '')
        const finalDeductions: StudentDeduction[] = rawDeductions.map(d => ({
          ...d,
          customerName: d.customerName || (customerSnapsMap.get(d.customerId)?.exists() ? customerSnapsMap.get(d.customerId).data().name : '')
        }))

        const primaryContractSnap = contractSnapsMap.get(data.contractId)
        const contractData = primaryContractSnap?.exists() ? primaryContractSnap.data() : null
        const contractTrainerId = contractData ? contractData.trainerId : null
        const finalTrainerId = data.trainerId || contractTrainerId || user.uid

        const isDualContract = contractData?.contractType === 'dual'
        const effectiveSessionAmount = isDualContract ? 1 : (data.sessionAmount || 1)

        const unitPriceAtDeduction = contractData
          ? (contractData.totalSessions > 0 ? Math.round((contractData.totalAmount || 0) / contractData.totalSessions) : (contractData.pricePerSession || 0))
          : 0
        const recognizedAmount = Math.round(effectiveSessionAmount * unitPriceAtDeduction)

        const trainerRef = doc(db, 'trainers', finalTrainerId)
        const trainerSnap = await transaction.get(trainerRef)
        const trainerName = trainerSnap.exists() ? trainerSnap.data().name : '未知教練'

        // 2. ALL WRITES LATER
        const recordRef = doc(collection(db, 'lessonRecords'))
        transaction.set(recordRef, {
          ...newRecordData,
          sessionAmount: effectiveSessionAmount,
          deductions: finalDeductions,
          trainerId: finalTrainerId,
          contractTrainerId: contractTrainerId || finalTrainerId,
          attendingCustomerNames: attendeeNames,
          unitPriceAtDeduction,
          recognizedAmount,
        })

        const deductionsByContract = new Map<string, StudentDeduction[]>()
        finalDeductions.forEach(d => {
          const list = deductionsByContract.get(d.contractId) || []
          list.push(d)
          deductionsByContract.set(d.contractId, list)
        })

        for (const [cid, deds] of deductionsByContract.entries()) {
          const cSnap = contractSnapsMap.get(cid)
          if (!cSnap || !cSnap.exists()) continue
          const cData = cSnap.data() as Contract

          let totalDeductedAmount = deds.reduce((sum, item) => sum + item.sessionAmount, 0)
          if (cData.contractType === 'dual') {
            totalDeductedAmount = 1
          } else if (cData.contractType === 'shared') {
            totalDeductedAmount = effectiveSessionAmount
          }

          if (cData.contractType === 'group' && cData.groupMemberQuotas) {
            const updatedQuotas = { ...cData.groupMemberQuotas }
            deds.forEach(d => {
              const currentQuota = updatedQuotas[d.customerId]
              if (currentQuota) {
                updatedQuotas[d.customerId] = {
                  ...currentQuota,
                  remainingSessions: Math.max(0, currentQuota.remainingSessions - d.sessionAmount)
                }
              }
            })

            const newTotalRemaining = Math.max(0, cData.remainingSessions - totalDeductedAmount)
            const isCompleted = newTotalRemaining === 0
            transaction.update(contractRefsMap.get(cid), {
              remainingSessions: newTotalRemaining,
              groupMemberQuotas: updatedQuotas,
              status: isCompleted ? 'completed' : cData.status,
              updatedAt: serverTimestamp()
            })
          } else {
            const newTotalRemaining = Math.max(0, cData.remainingSessions - totalDeductedAmount)
            const isCompleted = newTotalRemaining === 0
            transaction.update(contractRefsMap.get(cid), {
              remainingSessions: newTotalRemaining,
              status: isCompleted ? 'completed' : cData.status,
              updatedAt: serverTimestamp()
            })
          }
        }

        finalDeductions.forEach(d => {
          const uref = customerRefsMap.get(d.customerId)
          if (uref && customerSnapsMap.get(d.customerId)?.exists()) {
            transaction.update(uref, {
              historicalSessions: increment(isDualContract ? 1 : d.sessionAmount),
              updatedAt: serverTimestamp()
            })
          }
        })

        return {
          finalTrainerId,
          trainerName,
          attendeeNames,
          recordId: recordRef.id
        }
      })

      if (result) {
        await logActivity({
          centerId,
          trainerId: result.finalTrainerId,
          trainerName: result.trainerName,
          action: 'create',
          module: 'lessonRecords',
          recordId: result.recordId,
          recordSummary: `銷課: ${result.attendeeNames.join('、')} - ${data.sessionAmount}堂`,
          newValue: { ...newRecordData, trainerName: result.trainerName }
        })
      }

      await fetchRecords()
    } catch (err: any) {
      console.error('Error creating lesson record:', err)
      throw err
    }
  }

  const deleteRecord = async (id: string) => {
    try {
      const recordRef = doc(db, 'lessonRecords', id)
      
      const result = await runTransaction(db, async (transaction) => {
        const recordSnap = await transaction.get(recordRef)
        if (!recordSnap.exists()) return null
        
        const recordData = recordSnap.data() as LessonRecord
        const deductions: StudentDeduction[] = (recordData.deductions && recordData.deductions.length > 0)
          ? recordData.deductions
          : [{
              customerId: recordData.customerId,
              customerName: recordData.customerName,
              contractId: recordData.contractId,
              sessionAmount: recordData.sessionAmount
            }]

        const uniqueContractIds = Array.from(new Set(deductions.map(d => d.contractId).concat(recordData.contractId ? [recordData.contractId] : [])))
        const uniqueCustomerIds = Array.from(new Set(deductions.map(d => d.customerId)))

        const contractRefsMap = new Map<string, any>()
        uniqueContractIds.forEach(cid => contractRefsMap.set(cid, doc(db, 'contracts', cid)))

        const customerRefsMap = new Map<string, any>()
        uniqueCustomerIds.forEach(uid => customerRefsMap.set(uid, doc(db, 'customers', uid)))

        // 1. ALL READS FIRST
        const contractSnapsMap = new Map<string, any>()
        for (const [cid, pref] of contractRefsMap.entries()) {
          const snap = await transaction.get(pref)
          contractSnapsMap.set(cid, snap)
        }

        const customerSnapsMap = new Map<string, any>()
        for (const [uid, uref] of customerRefsMap.entries()) {
          const snap = await transaction.get(uref)
          customerSnapsMap.set(uid, snap)
        }

        const trainerRef = doc(db, 'trainers', recordData.trainerId)
        const trainerSnap = await transaction.get(trainerRef)
        const trainerName = trainerSnap.exists() ? trainerSnap.data().name : '未知教練'

        // 2. ALL WRITES LATER
        const deductionsByContract = new Map<string, StudentDeduction[]>()
        deductions.forEach(d => {
          const list = deductionsByContract.get(d.contractId) || []
          list.push(d)
          deductionsByContract.set(d.contractId, list)
        })

        for (const [cid, deds] of deductionsByContract.entries()) {
          const cSnap = contractSnapsMap.get(cid)
          if (!cSnap || !cSnap.exists()) continue
          const cData = cSnap.data() as Contract

          let totalRestoredAmount = deds.reduce((sum, item) => sum + item.sessionAmount, 0)
          if (cData.contractType === 'dual') {
            totalRestoredAmount = 1
          } else if (cData.contractType === 'shared') {
            totalRestoredAmount = recordData.sessionAmount || 1
          }

          if (cData.contractType === 'group' && cData.groupMemberQuotas) {
            const updatedQuotas = { ...cData.groupMemberQuotas }
            deds.forEach(d => {
              const currentQuota = updatedQuotas[d.customerId]
              if (currentQuota) {
                updatedQuotas[d.customerId] = {
                  ...currentQuota,
                  remainingSessions: Math.min(currentQuota.totalSessions, currentQuota.remainingSessions + d.sessionAmount)
                }
              }
            })

            const newTotalRemaining = Math.min(cData.totalSessions, cData.remainingSessions + totalRestoredAmount)
            const newStatus = cData.status === 'completed' && newTotalRemaining > 0 ? 'active' : cData.status
            transaction.update(contractRefsMap.get(cid), {
              remainingSessions: newTotalRemaining,
              groupMemberQuotas: updatedQuotas,
              status: newStatus,
              updatedAt: serverTimestamp()
            })
          } else {
            const newTotalRemaining = Math.min(cData.totalSessions, cData.remainingSessions + totalRestoredAmount)
            const newStatus = cData.status === 'completed' && newTotalRemaining > 0 ? 'active' : cData.status
            transaction.update(contractRefsMap.get(cid), {
              remainingSessions: newTotalRemaining,
              status: newStatus,
              updatedAt: serverTimestamp()
            })
          }
        }

        deductions.forEach(d => {
          const uref = customerRefsMap.get(d.customerId)
          const cType = contractSnapsMap.get(d.contractId)?.data()?.contractType
          const decAmount = cType === 'dual' ? 1 : d.sessionAmount
          if (uref && customerSnapsMap.get(d.customerId)?.exists()) {
            transaction.update(uref, {
              historicalSessions: increment(-decAmount),
              updatedAt: serverTimestamp()
            })
          }
        })

        transaction.delete(recordRef)

        return {
          recordData,
          trainerName
        }
      })

      if (result) {
        await logActivity({
          centerId,
          trainerId: result.recordData.trainerId,
          trainerName: result.trainerName,
          action: 'delete',
          module: 'lessonRecords',
          recordId: id,
          recordSummary: `刪除銷課: ${result.recordData.attendingCustomerNames?.join('、') || result.recordData.customerName} - ${result.recordData.sessionAmount}堂`,
          previousValue: result.recordData
        })
      }

      await fetchRecords()
    } catch (err: any) {
      console.error('Error deleting lesson record:', err)
      throw err
    }
  }

  const updateRecord = async (id: string, data: LessonRecordFormValues) => {
    try {
      const recordRef = doc(db, 'lessonRecords', id)
      
      await runTransaction(db, async (transaction) => {
        // READS FIRST
        const recordSnap = await transaction.get(recordRef)
        if (!recordSnap.exists()) throw new Error('找不到該筆紀錄')
        
        const oldData = recordSnap.data() as any
        
        const contractRef = data.contractId ? doc(db, 'contracts', data.contractId) : null
        const contractSnap = contractRef ? await transaction.get(contractRef) : null

        const oldAttendeeIds = oldData.attendingCustomerIds && oldData.attendingCustomerIds.length > 0
          ? oldData.attendingCustomerIds
          : [oldData.customerId]

        const newAttendeeIds = data.attendingCustomerIds && data.attendingCustomerIds.length > 0
          ? data.attendingCustomerIds
          : [data.customerId]

        const uniqueAttendeeIds = Array.from(new Set([...oldAttendeeIds, ...newAttendeeIds]))
        const attendeeRefs = uniqueAttendeeIds.map(aId => doc(db, 'customers', aId))
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

        // WRITES LATER
        const diff = data.sessionAmount - oldData.sessionAmount

        if (diff !== 0) {
          if (contractRef && contractSnap?.exists()) {
            transaction.update(contractRef, {
              remainingSessions: increment(-diff),
              updatedAt: serverTimestamp()
            })
          }
        }

        uniqueAttendeeIds.forEach((aId, index) => {
          const wasAttendee = oldAttendeeIds.includes(aId)
          const isAttendee = newAttendeeIds.includes(aId)
          const attendeeSnap = attendeeSnaps[index]
          const attendeeRef = attendeeRefs[index]

          if (attendeeSnap.exists()) {
            let change = 0
            if (wasAttendee && isAttendee) {
              change = diff
            } else if (wasAttendee && !isAttendee) {
              change = -oldData.sessionAmount
            } else if (!wasAttendee && isAttendee) {
              change = data.sessionAmount
            }

            if (change !== 0) {
              transaction.update(attendeeRef, {
                historicalSessions: increment(change),
                updatedAt: serverTimestamp()
              })
            }
          }
        })

        const attendeeNames = newAttendeeIds.map(id => {
          const idx = uniqueAttendeeIds.indexOf(id)
          const snap = attendeeSnaps[idx]
          return snap?.exists() ? snap.data().name : ''
        })

        const contractTrainerId = contractSnap?.exists() ? contractSnap.data().trainerId : null
        const finalTrainerId = data.trainerId || contractTrainerId || oldData.trainerId || user.uid

        const updateData = {
          ...data,
          trainerId: finalTrainerId,
          contractTrainerId: contractTrainerId || finalTrainerId,
          attendingCustomerIds: newAttendeeIds,
          attendingCustomerNames: attendeeNames,
          sessionDate: Timestamp.fromDate(data.sessionDate),
          updatedAt: serverTimestamp(),
        }
        transaction.update(recordRef, updateData)
      })

      await fetchRecords()
    } catch (err: any) {
      console.error('Error updating lesson record:', err)
      throw err
    }
  }

  return {
    records,
    loading,
    error,
    createRecord,
    updateRecord,
    deleteRecord,
    refresh: fetchRecords,
  }
}
