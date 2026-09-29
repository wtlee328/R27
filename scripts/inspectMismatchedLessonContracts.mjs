import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectMismatchedLessonContracts() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))
  console.log(`Loaded ${contractMap.size} contracts.`)

  console.log('Fetching all lesson records...')
  const recordsSnap = await db.collection('lessonRecords').get()
  console.log(`Loaded ${recordsSnap.docs.length} lesson records.`)

  const mismatchedRecords = []

  recordsSnap.docs.forEach(docSnap => {
    const data = docSnap.data()
    const recordId = docSnap.id
    const contract = data.contractId ? contractMap.get(data.contractId) : null
    const contractType = contract?.contractType || 'single'

    // Non-group contracts should always have matching deductions contractId
    if (contractType !== 'group' && Array.isArray(data.deductions)) {
      const hasMismatch = data.deductions.some(d => d.contractId && d.contractId !== data.contractId)
      if (hasMismatch) {
        const dateStr = data.sessionDate ? new Date(data.sessionDate._seconds * 1000).toISOString().split('T')[0] : '無日期'
        const customerName = data.attendingCustomerNames?.join('、') || data.customerName || '未知學員'

        mismatchedRecords.push({
          id: recordId,
          date: dateStr,
          customerName,
          primaryContractId: data.contractId,
          primaryContractType: contractType,
          deductions: data.deductions.map(d => ({
            customerId: d.customerId,
            customerName: d.customerName,
            contractId: d.contractId,
            sessionAmount: d.sessionAmount,
          }))
        })
      }
    }
  })

  console.log(`\n==========================================`)
  console.log(`掃描完成！共發現 ${mismatchedRecords.length} 筆主合約與明細不一致的銷課紀錄`)
  console.log(`==========================================\n`)

  mismatchedRecords.forEach((item, index) => {
    console.log(`[${index + 1}] 銷課 ID: ${item.id}`)
    console.log(`    日期: ${item.date}`)
    console.log(`    學員: ${item.customerName}`)
    console.log(`    主合約 ID: ${item.primaryContractId} (${item.primaryContractType})`)
    console.log(`    扣堂明細:`)
    item.deductions.forEach((d, i) => {
      const isDiff = d.contractId !== item.primaryContractId
      console.log(`      (${i + 1}) ${d.customerName || d.customerId} -> 合約: ${d.contractId} ${isDiff ? '⚠️ 不一致' : '✅'}`)
    })
    console.log('------------------------------------------')
  })
}

inspectMismatchedLessonContracts().catch(console.error)
