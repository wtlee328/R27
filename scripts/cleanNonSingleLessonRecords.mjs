import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function cleanNonSingleRecords() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))

  console.log('Fetching all lesson records...')
  const recordsSnap = await db.collection('lessonRecords').get()

  const targetDocIds = []

  recordsSnap.docs.forEach(docSnap => {
    const data = docSnap.data()
    const recordId = docSnap.id
    const contract = data.contractId ? contractMap.get(data.contractId) : null
    
    const contractType = contract?.contractType || 'unknown'
    const isMultiDeductions = Array.isArray(data.deductions) && data.deductions.length > 1
    const isMultiAttendees = Array.isArray(data.attendingCustomerIds) && data.attendingCustomerIds.length > 1
    const isNonSingleContract = contractType === 'group' || contractType === 'shared' || contractType === 'dual'

    if (isNonSingleContract || isMultiDeductions || isMultiAttendees) {
      targetDocIds.push(recordId)
    }
  })

  console.log(`\n找到 ${targetDocIds.length} 筆非單人合約銷課紀錄，準備清除...`)

  if (targetDocIds.length === 0) {
    console.log('沒有需要清除的非單人合約銷課紀錄！')
    process.exit(0)
  }

  let deletedCount = 0
  for (const docId of targetDocIds) {
    try {
      await db.collection('lessonRecords').doc(docId).delete()
      deletedCount++
      console.log(`  ✓ 已刪除非單人合約銷課紀錄 ID: ${docId}`)
    } catch (err) {
      console.error(`  ✗ 刪除 ${docId} 失敗:`, err.message)
    }
  }

  console.log(`\n✅ 清理完成！成功刪除 ${deletedCount}/${targetDocIds.length} 筆非單人合約銷課紀錄。`)
  process.exit(0)
}

cleanNonSingleRecords().catch(console.error)
