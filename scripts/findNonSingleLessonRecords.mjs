import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function findNonSingleRecords() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))

  console.log('Fetching all lesson records...')
  const recordsSnap = await db.collection('lessonRecords').get()

  const nonSingleRecords = []

  recordsSnap.docs.forEach(docSnap => {
    const data = docSnap.data()
    const recordId = docSnap.id
    const contract = data.contractId ? contractMap.get(data.contractId) : null
    
    // Check if contract is non-single or if deductions/attending count > 1
    const contractType = contract?.contractType || 'unknown'
    const isMultiDeductions = Array.isArray(data.deductions) && data.deductions.length > 1
    const isMultiAttendees = Array.isArray(data.attendingCustomerIds) && data.attendingCustomerIds.length > 1

    const isNonSingleContract = contractType === 'group' || contractType === 'shared' || contractType === 'dual'
    
    if (isNonSingleContract || isMultiDeductions || isMultiAttendees) {
      const dateStr = data.sessionDate ? new Date(data.sessionDate._seconds * 1000).toISOString().split('T')[0] : '無日期'
      const customerName = data.attendingCustomerNames?.join(' & ') || data.customerName || '未知學員'

      let typeLabel = '未知類型'
      if (contractType === 'group') typeLabel = '👥 團體合約'
      else if (contractType === 'shared') typeLabel = '👥 共享合約'
      else if (contractType === 'dual') typeLabel = '👥 雙人合約'
      else if (isMultiDeductions || isMultiAttendees) typeLabel = '👥 多人銷課紀錄'

      nonSingleRecords.push({
        id: recordId,
        date: dateStr,
        name: customerName,
        sessionAmount: data.sessionAmount || 1,
        contractId: data.contractId || '無',
        contractType,
        typeLabel,
        raw: data
      })
    }
  })

  console.log(`\n==========================================`)
  console.log(`掃描完成！共發現 ${nonSingleRecords.length} 筆非單人合約銷課紀錄`)
  console.log(`==========================================\n`)

  nonSingleRecords.forEach((item, index) => {
    console.log(`[${index + 1}] 銷課 ID: ${item.id}`)
    console.log(`    日期: ${item.date}`)
    console.log(`    學員: ${item.name}`)
    console.log(`    堂數: ${item.sessionAmount}堂`)
    console.log(`    合約類型: ${item.typeLabel} (ID: ${item.contractId})`)
    console.log('------------------------------------------')
  })

  return nonSingleRecords
}

findNonSingleRecords().catch(console.error)
