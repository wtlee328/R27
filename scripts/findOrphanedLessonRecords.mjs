import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function findOrphanedRecords() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const validContractIds = new Set(contractsSnap.docs.map(d => d.id))
  console.log(`Found ${validContractIds.size} valid contracts in DB.`)

  console.log('Fetching all lesson records in batches...')
  const orphanedRecords = []
  let lastDoc = null
  let totalProcessed = 0
  const batchSize = 100

  while (true) {
    let query = db.collection('lessonRecords').limit(batchSize)
    if (lastDoc) {
      query = query.startAfter(lastDoc)
    }

    try {
      const snap = await query.get()
      if (snap.empty) break

      snap.docs.forEach(docSnap => {
        totalProcessed++
        const data = docSnap.data()
        const recordId = docSnap.id
        
        // Check main contractId
        const mainContractId = data.contractId
        const isMainContractMissing = mainContractId ? !validContractIds.has(mainContractId) : true

        // Check deductions contractIds
        const missingDeductionContracts = []
        if (Array.isArray(data.deductions)) {
          data.deductions.forEach((d, idx) => {
            if (d.contractId && !validContractIds.has(d.contractId)) {
              missingDeductionContracts.push({ index: idx, contractId: d.contractId, customerId: d.customerId, customerName: d.customerName })
            }
          })
        }

        const isOrphaned = isMainContractMissing || missingDeductionContracts.length > 0

        if (isOrphaned) {
          const sessionDateStr = data.sessionDate ? new Date(data.sessionDate._seconds * 1000).toISOString().split('T')[0] : '無日期'
          const customerName = data.attendingCustomerNames?.join('、') || data.customerName || '未知學員'

          orphanedRecords.push({
            recordId,
            sessionDate: sessionDateStr,
            customerName,
            sessionAmount: data.sessionAmount || 1,
            mainContractId: mainContractId || '(未設定/無合約)',
            isMainContractMissing,
            missingDeductionContracts,
            raw: data
          })
        }
      })

      lastDoc = snap.docs[snap.docs.length - 1]
      console.log(`Processed ${totalProcessed} lesson records... (Found ${orphanedRecords.length} orphaned so far)`)

      if (snap.docs.length < batchSize) break
      await new Promise(res => setTimeout(res, 200))
    } catch (err) {
      console.error(`Batch fetch error at ${totalProcessed}:`, err.message)
      break
    }
  }

  console.log(`\n==========================================`)
  console.log(`掃描完成！共檢查 ${totalProcessed} 筆，發現 ${orphanedRecords.length} 筆孤兒銷課紀錄`)
  console.log(`==========================================\n`)

  orphanedRecords.forEach((item, index) => {
    console.log(`[${index + 1}] 銷課 ID: ${item.recordId}`)
    console.log(`    日期: ${item.sessionDate}`)
    console.log(`    學員: ${item.customerName}`)
    console.log(`    堂數: ${item.sessionAmount}`)
    console.log(`    主要合約 ID: ${item.mainContractId} ${item.isMainContractMissing ? '❌(不存在)' : ''}`)
    if (item.missingDeductionContracts.length > 0) {
      console.log(`    扣堂明細中不存在的合約:`)
      item.missingDeductionContracts.forEach(md => {
        console.log(`      - 明細學員 ${md.customerName} (${md.customerId}): 合約 ${md.contractId} ❌(不存在)`)
      })
    }
    console.log('------------------------------------------')
  })

  return orphanedRecords
}

findOrphanedRecords().catch(console.error)
