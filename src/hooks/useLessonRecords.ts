import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
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
import type { LessonRecord, StudentDeduction, Contract } from '../types'
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
    if (!user || !centerId) return

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

      // Auto repair for legacy group lesson records where each deduction had sessionAmount equal to deductions.length (e.g., 3 instead of 1)
      data.forEach(async (r) => {
        if (Array.isArray(r.deductions) && r.deductions.length > 1) {
          const isCorrupted = r.deductions.every(d => d.sessionAmount === r.deductions!.length)
          if (isCorrupted) {
            console.log(`Auto repairing corrupted group lesson record ${r.id}...`)
            const repairedDeductions = r.deductions.map(d => ({ ...d, sessionAmount: 1 }))
            const recordRef = doc(db, 'lessonRecords', r.id)
            await updateDoc(recordRef, {
              deductions: repairedDeductions,
              sessionAmount: r.deductions.length,
              updatedAt: serverTimestamp()
            }).catch(e => console.warn('Auto repair record error:', e))

            // Also repair contract member quotas if contractId is available
            if (r.contractId) {
              const contractRef = doc(db, 'contracts', r.contractId)
              const cSnap = await getDoc(contractRef).catch(() => null)
              if (cSnap && cSnap.exists()) {
                const cData = cSnap.data() as Contract
                if (cData.contractType === 'group' && cData.groupMemberQuotas) {
                  const updatedQuotas = { ...cData.groupMemberQuotas }
                  let quotaChanged = false
                  const overDeducted = r.deductions.length - 1
                  r.deductions.forEach(d => {
                    const q = updatedQuotas[d.customerId]
                    if (q !== undefined && q !== null) {
                      if (typeof q === 'object') {
                        const total = typeof q.totalSessions === 'number' ? q.totalSessions : (cData.totalSessions || 0)
                        const rem = typeof q.remainingSessions === 'number' ? q.remainingSessions : 0
                        updatedQuotas[d.customerId] = {
                          ...q,
                          remainingSessions: Math.min(total, rem + overDeducted)
                        }
                        quotaChanged = true
                      } else if (typeof q === 'number') {
                        const total = cData.totalSessions || 0
                        updatedQuotas[d.customerId] = Math.min(total, q + overDeducted)
                        quotaChanged = true
                      }
                    }
                  })
                  if (quotaChanged) {
                    await updateDoc(contractRef, {
                      groupMemberQuotas: updatedQuotas,
                      updatedAt: serverTimestamp()
                    }).catch(e => console.warn('Auto repair contract quota error:', e))
                  }
                }
              }
            }
          }
        }
      })

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
        const uniqueContractIds = Array.from(new Set(rawDeductions.map(d => d.contractId).concat(data.contractId ? [data.contractId] : []).filter((cid): cid is string => Boolean(cid))))
        const uniqueCustomerIds = Array.from(new Set(attendeeIds.concat(rawDeductions.map(d => d.customerId)).filter((uid): uid is string => Boolean(uid))))

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
        const contractTrainerId = (() => {
          if (!contractData) return null
          if (contractData.contractType === 'shared' && contractData.studentTrainers?.[data.customerId]) {
            return contractData.studentTrainers[data.customerId]
          }
          if (contractData.contractType === 'dual') {
            const isPrimary = data.customerId === (contractData.customerId || contractData.primaryCustomerId)
            if (!isPrimary && contractData.secondaryTrainerId) {
              return contractData.secondaryTrainerId
            }
            if (contractData.studentTrainers?.[data.customerId]) {
              return contractData.studentTrainers[data.customerId]
            }
          }
          return contractData.trainerId || null
        })()
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
          if (d.contractId) {
            const list = deductionsByContract.get(d.contractId) || []
            list.push(d)
            deductionsByContract.set(d.contractId, list)
          }
        })

        for (const [cid, deds] of deductionsByContract.entries()) {
          const cSnap = contractSnapsMap.get(cid)
          if (!cSnap || !cSnap.exists()) continue
          const cData = cSnap.data() as Contract

          let totalDeductedAmount = deds.reduce((sum, item) => sum + (Number(item.sessionAmount) || 1), 0)
          if (cData.contractType === 'dual') {
            totalDeductedAmount = 1
          } else if (cData.contractType === 'shared') {
            totalDeductedAmount = effectiveSessionAmount
          }

          if (cData.contractType === 'group' && cData.groupMemberQuotas) {
            const updatedQuotas = { ...cData.groupMemberQuotas }
            deds.forEach(d => {
              const currentQuota = updatedQuotas[d.customerId]
              const amountToDeduct = Number(d.sessionAmount) || 1
              if (currentQuota !== undefined && currentQuota !== null) {
                if (typeof currentQuota === 'object') {
                  const memberRem = typeof currentQuota.remainingSessions === 'number' ? currentQuota.remainingSessions : 0
                  updatedQuotas[d.customerId] = {
                    ...currentQuota,
                    remainingSessions: Math.max(0, memberRem - amountToDeduct)
                  }
                } else if (typeof currentQuota === 'number') {
                  updatedQuotas[d.customerId] = Math.max(0, currentQuota - amountToDeduct)
                }
              }
            })

            const currentRemaining = Number(cData.remainingSessions) || 0
            const newTotalRemaining = Math.max(0, currentRemaining - totalDeductedAmount)
            const isCompleted = newTotalRemaining === 0
            transaction.update(contractRefsMap.get(cid), {
              remainingSessions: newTotalRemaining,
              groupMemberQuotas: updatedQuotas,
              status: isCompleted ? 'completed' : cData.status,
              updatedAt: serverTimestamp()
            })
          } else {
            const currentRemaining = Number(cData.remainingSessions) || 0
            const newTotalRemaining = Math.max(0, currentRemaining - totalDeductedAmount)
            const isCompleted = newTotalRemaining === 0
            transaction.update(contractRefsMap.get(cid), {
              remainingSessions: newTotalRemaining,
              status: isCompleted ? 'completed' : cData.status,
              updatedAt: serverTimestamp()
            })
          }
        }

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
      let recordDataForLog: LessonRecord | null = null
      let trainerNameForLog = '未知教練'

      try {
        const result = await runTransaction(db, async (transaction) => {
          const recordSnap = await transaction.get(recordRef)
          if (!recordSnap.exists()) return null

          const recordData = recordSnap.data() as LessonRecord
          recordDataForLog = recordData

          const deductions: StudentDeduction[] = (recordData.deductions && recordData.deductions.length > 0)
            ? recordData.deductions
            : [{
                customerId: recordData.customerId,
                customerName: recordData.customerName,
                contractId: recordData.contractId,
                sessionAmount: recordData.sessionAmount
              }]

          const uniqueContractIds = Array.from(new Set(
            deductions.map(d => d.contractId).concat(recordData.contractId ? [recordData.contractId] : []).filter((cid): cid is string => Boolean(cid))
          ))
          const uniqueCustomerIds = Array.from(new Set(
            deductions.map(d => d.customerId).concat(recordData.customerId ? [recordData.customerId] : []).filter((uid): uid is string => Boolean(uid))
          ))

          const contractRefsMap = new Map<string, any>()
          uniqueContractIds.forEach(cid => {
            if (cid) contractRefsMap.set(cid, doc(db, 'contracts', cid))
          })

          const customerRefsMap = new Map<string, any>()
          uniqueCustomerIds.forEach(uid => {
            if (uid) customerRefsMap.set(uid, doc(db, 'customers', uid))
          })

          // 1. ALL READS FIRST
          const contractSnapsMap = new Map<string, any>()
          for (const [cid, pref] of contractRefsMap.entries()) {
            try {
              const snap = await transaction.get(pref)
              contractSnapsMap.set(cid, snap)
            } catch (e) {
              console.warn(`Contract ${cid} read failed in transaction`, e)
            }
          }

          const customerSnapsMap = new Map<string, any>()
          for (const [uid, uref] of customerRefsMap.entries()) {
            try {
              const snap = await transaction.get(uref)
              customerSnapsMap.set(uid, snap)
            } catch (e) {
              console.warn(`Customer ${uid} read failed in transaction`, e)
            }
          }

          if (recordData.trainerId) {
            try {
              const trainerRef = doc(db, 'trainers', recordData.trainerId)
              const trainerSnap = await transaction.get(trainerRef)
              if (trainerSnap.exists()) {
                trainerNameForLog = trainerSnap.data().name || '未知教練'
              }
            } catch (e) {
              console.warn('Trainer read failed in transaction', e)
            }
          }

          // 2. ALL WRITES LATER
          const deductionsByContract = new Map<string, StudentDeduction[]>()
          deductions.forEach(d => {
            if (d.contractId) {
              const list = deductionsByContract.get(d.contractId) || []
              list.push(d)
              deductionsByContract.set(d.contractId, list)
            }
          })

          for (const [cid, deds] of deductionsByContract.entries()) {
            const cSnap = contractSnapsMap.get(cid)
            if (!cSnap || !cSnap.exists()) continue
            const cData = cSnap.data() as Contract

            let totalRestoredAmount = deds.reduce((sum, item) => sum + (Number(item.sessionAmount) || 1), 0)
            if (cData.contractType === 'dual') {
              totalRestoredAmount = 1
            } else if (cData.contractType === 'shared') {
              totalRestoredAmount = Number(recordData.sessionAmount) || 1
            }

            const totalSessions = Number(cData.totalSessions) || 0
            const currentRemaining = Number(cData.remainingSessions) || 0
            const newTotalRemaining = totalSessions > 0 ? Math.min(totalSessions, currentRemaining + totalRestoredAmount) : (currentRemaining + totalRestoredAmount)
            const newStatus = cData.status === 'completed' && newTotalRemaining > 0 ? 'active' : cData.status

            if (cData.contractType === 'group' && cData.groupMemberQuotas) {
              const updatedQuotas = { ...cData.groupMemberQuotas }
              deds.forEach(d => {
                const currentQuota = updatedQuotas[d.customerId]
                const amountToRestore = Number(d.sessionAmount) || 1
                if (currentQuota !== undefined && currentQuota !== null) {
                  if (typeof currentQuota === 'object') {
                    const memberTotal = typeof currentQuota.totalSessions === 'number' ? currentQuota.totalSessions : totalSessions
                    const memberRem = typeof currentQuota.remainingSessions === 'number' ? currentQuota.remainingSessions : 0
                    updatedQuotas[d.customerId] = {
                      ...currentQuota,
                      remainingSessions: memberTotal > 0 ? Math.min(memberTotal, memberRem + amountToRestore) : (memberRem + amountToRestore)
                    }
                  } else if (typeof currentQuota === 'number') {
                    updatedQuotas[d.customerId] = totalSessions > 0 ? Math.min(totalSessions, currentQuota + amountToRestore) : (currentQuota + amountToRestore)
                  }
                }
              })

              transaction.update(contractRefsMap.get(cid), {
                remainingSessions: newTotalRemaining,
                groupMemberQuotas: updatedQuotas,
                status: newStatus,
                updatedAt: serverTimestamp()
              })
            } else {
              transaction.update(contractRefsMap.get(cid), {
                remainingSessions: newTotalRemaining,
                status: newStatus,
                updatedAt: serverTimestamp()
              })
            }
          }

          transaction.delete(recordRef)
          return true
        })

        if (!result) return
      } catch (txErr) {
        console.warn('Transaction failed while deleting record, falling back to direct deleteDoc:', txErr)
        // Fallback: direct delete doc if contract transaction fails (e.g. orphaned/deleted contract)
        await deleteDoc(recordRef)
      }

      if (recordDataForLog) {
        const logData: LessonRecord = recordDataForLog
        await logActivity({
          centerId,
          trainerId: logData.trainerId,
          trainerName: trainerNameForLog,
          action: 'delete',
          module: 'lessonRecords',
          recordId: id,
          recordSummary: `刪除銷課: ${logData.attendingCustomerNames?.join('、') || logData.customerName || '未知學員'} - ${logData.sessionAmount || 1}堂`,
          previousValue: logData
        }).catch(e => console.warn('Failed to log deletion activity:', e))
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
        // ── 1. READS FIRST ──
        const recordSnap = await transaction.get(recordRef)
        if (!recordSnap.exists()) throw new Error('找不到該筆紀錄')
        
        const oldData = recordSnap.data() as any
        const oldDeductions: StudentDeduction[] = Array.isArray(oldData.deductions) && oldData.deductions.length > 0
          ? oldData.deductions
          : [{
              customerId: oldData.customerId,
              customerName: oldData.customerName || '',
              contractId: oldData.contractId,
              sessionAmount: oldData.sessionAmount || 1,
            }]

        // Collect all contract IDs that need to be read (both old and new)
        const oldContractIds = oldDeductions.map(d => d.contractId).filter(Boolean) as string[]
        if (oldData.contractId && !oldContractIds.includes(oldData.contractId)) {
          oldContractIds.push(oldData.contractId)
        }

        const newPrimaryContractId = data.contractId
        const newDeductions: StudentDeduction[] = Array.isArray((data as any).deductions) && (data as any).deductions.length > 0
          ? (data as any).deductions
          : [{
              customerId: data.customerId,
              customerName: data.customerName || '',
              contractId: data.contractId,
              sessionAmount: data.sessionAmount || 1,
            }]

        const newContractIds = newDeductions.map(d => d.contractId).filter(Boolean) as string[]
        if (newPrimaryContractId && !newContractIds.includes(newPrimaryContractId)) {
          newContractIds.push(newPrimaryContractId)
        }

        const allContractIds = Array.from(new Set([...oldContractIds, ...newContractIds]))
        const contractRefsMap = new Map<string, any>()
        const contractSnapsMap = new Map<string, any>()

        for (const cid of allContractIds) {
          const cRef = doc(db, 'contracts', cid)
          contractRefsMap.set(cid, cRef)
          const cSnap = await transaction.get(cRef)
          contractSnapsMap.set(cid, cSnap)
        }

        // Collect all customer IDs (both old and new)
        const oldAttendeeIds = oldData.attendingCustomerIds && oldData.attendingCustomerIds.length > 0
          ? oldData.attendingCustomerIds
          : [oldData.customerId]

        const newAttendeeIds = data.attendingCustomerIds && data.attendingCustomerIds.length > 0
          ? data.attendingCustomerIds
          : [data.customerId]

        const uniqueAttendeeIds = Array.from(new Set([...oldAttendeeIds, ...newAttendeeIds]))
        const attendeeRefs = uniqueAttendeeIds.map(aId => doc(db, 'customers', aId))
        const attendeeSnaps = await Promise.all(attendeeRefs.map(ref => transaction.get(ref)))

        const customerSnapsMap = new Map<string, any>()
        uniqueAttendeeIds.forEach((aId, idx) => {
          customerSnapsMap.set(aId, attendeeSnaps[idx])
        })

        // ── 2. COMPUTE CONTRACT SESSION REFUNDS & DEDUCTIONS ──
        const contractNetChanges = new Map<string, number>()
        const groupQuotaChanges = new Map<string, Record<string, number>>()

        const trackContractChange = (cid: string, delta: number) => {
          const current = contractNetChanges.get(cid) || 0
          contractNetChanges.set(cid, current + delta)
        }

        const trackQuotaChange = (cid: string, custId: string, delta: number) => {
          let quotas = groupQuotaChanges.get(cid)
          if (!quotas) {
            quotas = {}
            groupQuotaChanges.set(cid, quotas)
          }
          quotas[custId] = (quotas[custId] || 0) + delta
        }

        // Refund old contract sessions
        for (const cid of oldContractIds) {
          const cSnap = contractSnapsMap.get(cid)
          if (!cSnap || !cSnap.exists()) continue
          const cData = cSnap.data() as Contract
          const deds = oldDeductions.filter(d => d.contractId === cid)

          let refundAmount = deds.reduce((sum, item) => sum + (Number(item.sessionAmount) || 1), 0)
          if (cData.contractType === 'dual') {
            refundAmount = 1
          } else if (cData.contractType === 'shared') {
            refundAmount = Number(oldData.sessionAmount) || 1
          }
          trackContractChange(cid, +refundAmount)

          if (cData.contractType === 'group' && cData.groupMemberQuotas) {
            deds.forEach(d => {
              const amountToRestore = Number(d.sessionAmount) || 1
              trackQuotaChange(cid, d.customerId, +amountToRestore)
            })
          }
        }

        // Deduct new contract sessions
        const newPrimaryContractSnap = contractSnapsMap.get(newPrimaryContractId)
        const newPrimaryContractData = newPrimaryContractSnap?.exists() ? (newPrimaryContractSnap.data() as Contract) : null
        const isNewDualContract = newPrimaryContractData?.contractType === 'dual'
        const effectiveNewSessionAmount = isNewDualContract ? 1 : (data.sessionAmount || 1)

        for (const cid of newContractIds) {
          const cSnap = contractSnapsMap.get(cid)
          if (!cSnap || !cSnap.exists()) continue
          const cData = cSnap.data() as Contract

          let deductAmount = effectiveNewSessionAmount
          if (cData.contractType === 'dual') {
            deductAmount = 1
          }

          trackContractChange(cid, -deductAmount)

          if (cData.contractType === 'group' && cData.groupMemberQuotas) {
            newAttendeeIds.forEach(aId => {
              trackQuotaChange(cid, aId, -effectiveNewSessionAmount)
            })
          }
        }

        // ── 3. APPLY CONTRACT UPDATES (WRITES) ──
        for (const [cid, netDelta] of contractNetChanges.entries()) {
          const cSnap = contractSnapsMap.get(cid)
          const cRef = contractRefsMap.get(cid)
          if (!cSnap || !cSnap.exists() || !cRef) continue
          const cData = cSnap.data() as Contract

          const totalSessions = Number(cData.totalSessions) || 0
          const currentRemaining = Number(cData.remainingSessions) || 0
          const rawNewRemaining = currentRemaining + netDelta
          const newTotalRemaining = totalSessions > 0 ? Math.min(totalSessions, Math.max(0, rawNewRemaining)) : Math.max(0, rawNewRemaining)

          let newStatus = cData.status
          if (newTotalRemaining <= 0 && cData.status !== 'cancelled') {
            newStatus = 'completed'
          } else if (cData.status === 'completed' && newTotalRemaining > 0) {
            const isUnsigned = !cData.signatureDataUrl || (cData.contractType === 'dual' && !cData.secondarySignatureDataUrl)
            newStatus = isUnsigned ? 'pending_signature' : 'active'
          }

          const contractUpdates: any = {
            remainingSessions: newTotalRemaining,
            status: newStatus,
            updatedAt: serverTimestamp(),
          }

          if (cData.contractType === 'group' && cData.groupMemberQuotas) {
            const quotaDeltas = groupQuotaChanges.get(cid) || {}
            const updatedQuotas = { ...cData.groupMemberQuotas }

            for (const [mCustId, qDelta] of Object.entries(quotaDeltas)) {
              const currentQuota = updatedQuotas[mCustId]
              if (currentQuota !== undefined && currentQuota !== null) {
                if (typeof currentQuota === 'object') {
                  const memberTotal = typeof currentQuota.totalSessions === 'number' ? currentQuota.totalSessions : totalSessions
                  const memberRem = typeof currentQuota.remainingSessions === 'number' ? currentQuota.remainingSessions : 0
                  const rawMemberRem = memberRem + qDelta
                  updatedQuotas[mCustId] = {
                    ...currentQuota,
                    remainingSessions: memberTotal > 0 ? Math.min(memberTotal, Math.max(0, rawMemberRem)) : Math.max(0, rawMemberRem)
                  }
                } else if (typeof currentQuota === 'number') {
                  const rawMemberRem = currentQuota + qDelta
                  updatedQuotas[mCustId] = totalSessions > 0 ? Math.min(totalSessions, Math.max(0, rawMemberRem)) : Math.max(0, rawMemberRem)
                }
              }
            }
            contractUpdates.groupMemberQuotas = updatedQuotas
          }

          transaction.update(cRef, contractUpdates)
        }

        // ── 4. COMPUTE NEW LESSON RECORD FIELDS & UPDATE RECORD ──
        const attendeeNames = newAttendeeIds.map(id => {
          const snap = customerSnapsMap.get(id)
          return snap?.exists() ? snap.data().name : ''
        })

        const correctContractTrainerId = (() => {
          if (!newPrimaryContractData) return null
          if (newPrimaryContractData.contractType === 'shared' && newPrimaryContractData.studentTrainers?.[data.customerId]) {
            return newPrimaryContractData.studentTrainers[data.customerId]
          }
          if (newPrimaryContractData.contractType === 'dual') {
            const isPrimary = data.customerId === (newPrimaryContractData.customerId || newPrimaryContractData.primaryCustomerId)
            if (!isPrimary && newPrimaryContractData.secondaryTrainerId) {
              return newPrimaryContractData.secondaryTrainerId
            }
            if (newPrimaryContractData.studentTrainers?.[data.customerId]) {
              return newPrimaryContractData.studentTrainers[data.customerId]
            }
          }
          return newPrimaryContractData.trainerId || null
        })()

        const finalTrainerId = data.trainerId || correctContractTrainerId || oldData.trainerId || user.uid

        const unitPriceAtDeduction = newPrimaryContractData
          ? (newPrimaryContractData.totalSessions > 0
              ? Math.round((newPrimaryContractData.totalAmount || 0) / newPrimaryContractData.totalSessions)
              : (newPrimaryContractData.pricePerSession || 0))
          : (oldData.unitPriceAtDeduction || 0)
        const recognizedAmount = Math.round(effectiveSessionAmount * unitPriceAtDeduction)

        const newFinalDeductions: StudentDeduction[] = newAttendeeIds.map((aId, idx) => ({
          customerId: aId,
          customerName: attendeeNames[idx] || '',
          contractId: data.contractId,
          sessionAmount: effectiveSessionAmount,
        }))

        const updateData: any = {
          ...data,
          sessionAmount: effectiveSessionAmount,
          deductions: newFinalDeductions,
          trainerId: finalTrainerId,
          contractTrainerId: correctContractTrainerId || finalTrainerId,
          attendingCustomerIds: newAttendeeIds,
          attendingCustomerNames: attendeeNames,
          unitPriceAtDeduction,
          recognizedAmount,
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
