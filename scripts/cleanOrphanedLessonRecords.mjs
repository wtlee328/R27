import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function cleanOrphanedRecords() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const validContractIds = new Set(contractsSnap.docs.map(d => d.id))
  console.log(`Found ${validContractIds.size} valid contracts in DB.`)

  console.log('Fetching all lesson records...')
  const recordsSnap = await db.collection('lessonRecords').get()
  console.log(`Found ${recordsSnap.docs.length} total lesson records in DB.`)

  const orphanedDocIds = []

  recordsSnap.docs.forEach(docSnap => {
    const data = docSnap.data()
    const recordId = docSnap.id
    
    // Check main contractId
    const mainContractId = data.contractId
    const isMainContractMissing = mainContractId ? !validContractIds.has(mainContractId) : true

    // Check deductions contractIds
    let isDeductionContractMissing = false
    if (Array.isArray(data.deductions)) {
      data.deductions.forEach(d => {
        if (d.contractId && !validContractIds.has(d.contractId)) {
          isDeductionContractMissing = true
        }
      })
    }

    if (isMainContractMissing || isDeductionContractMissing) {
      orphanedDocIds.push(recordId)
    }
  })

  console.log(`\n找到 ${orphanedDocIds.length} 筆孤兒銷課紀錄，準備清除...`)

  if (orphanedDocIds.length === 0) {
    console.log('沒有需要清除的孤兒銷課紀錄！')
    process.exit(0)
  }

  let deletedCount = 0
  for (const docId of orphanedDocIds) {
    try {
      await db.collection('lessonRecords').doc(docId).delete()
      deletedCount++
      console.log(`  ✓ 已刪除孤兒銷課紀錄 ID: ${docId}`)
    } catch (err) {
      console.error(`  ✗ 刪除 ${docId} 失敗:`, err.message)
    }
  }

  console.log(`\n✅ 清理完成！成功刪除 ${deletedCount}/${orphanedDocIds.length} 筆孤兒銷課紀錄。`)
  process.exit(0)
}

cleanOrphanedRecords().catch(console.error)
