import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function fixMismatchedLessonContracts() {
  console.log('Fetching contracts and lesson records...')
  const contractsSnap = await db.collection('contracts').get()
  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))

  const recordsSnap = await db.collection('lessonRecords').get()
  const mismatchedRecords = []

  recordsSnap.docs.forEach(docSnap => {
    const data = docSnap.data()
    const recordId = docSnap.id
    const contract = data.contractId ? contractMap.get(data.contractId) : null
    const contractType = contract?.contractType || 'single'

    if (contractType !== 'group' && Array.isArray(data.deductions)) {
      const hasMismatch = data.deductions.some(d => d.contractId && d.contractId !== data.contractId)
      if (hasMismatch) {
        mismatchedRecords.push({
          id: recordId,
          data,
          targetContractId: data.contractId,
          oldContractId: data.deductions[0]?.contractId
        })
      }
    }
  })

  console.log(`共發現 ${mismatchedRecords.length} 筆主合約與明細不一致的紀錄。`)
  if (mismatchedRecords.length === 0) {
    console.log('無須修復。')
    return
  }

  for (const item of mismatchedRecords) {
    console.log(`\n正在修復銷課紀錄 ${item.id}...`)
    console.log(`  - 舊扣抵合約 (退回堂數): ${item.oldContractId}`)
    console.log(`  - 新主合約 (扣除堂數): ${item.targetContractId}`)

    await db.runTransaction(async (transaction) => {
      const recRef = db.collection('lessonRecords').doc(item.id)
      const oldContractRef = item.oldContractId ? db.collection('contracts').doc(item.oldContractId) : null
      const newContractRef = db.collection('contracts').doc(item.targetContractId)

      const oldContractSnap = oldContractRef ? await transaction.get(oldContractRef) : null
      const newContractSnap = await transaction.get(newContractRef)

      if (oldContractSnap && oldContractSnap.exists) {
        const oldC = oldContractSnap.data()
        const oldRem = Number(oldC.remainingSessions || 0)
        const total = Number(oldC.totalSessions || 0)
        const newOldRem = total > 0 ? Math.min(total, oldRem + 1) : oldRem + 1
        console.log(`  -> 退回合約 ${item.oldContractId}: ${oldRem} → ${newOldRem}`)
        transaction.update(oldContractRef, {
          remainingSessions: newOldRem,
          status: newOldRem > 0 && oldC.status === 'completed' ? 'active' : oldC.status,
          updatedAt: FieldValue.serverTimestamp()
        })
      }

      if (newContractSnap && newContractSnap.exists) {
        const newC = newContractSnap.data()
        const newRem = Number(newC.remainingSessions || 0)
        const newUpdatedRem = Math.max(0, newRem - 1)
        console.log(`  -> 扣除合約 ${item.targetContractId}: ${newRem} → ${newUpdatedRem}`)
        transaction.update(newContractRef, {
          remainingSessions: newUpdatedRem,
          status: newUpdatedRem === 0 ? 'completed' : newC.status,
          updatedAt: FieldValue.serverTimestamp()
        })
      }

      const updatedDeductions = (item.data.deductions || []).map(d => ({
        ...d,
        contractId: item.targetContractId
      }))

      transaction.update(recRef, {
        deductions: updatedDeductions,
        updatedAt: FieldValue.serverTimestamp()
      })
    })

    console.log(`✅ 紀錄 ${item.id} 及其合約剩餘堂數修復完成！`)
  }
}

fixMismatchedLessonContracts().catch(console.error)
