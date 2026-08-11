import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function checkAllMismatches() {
  console.log('Fetching all contracts...')
  const contractsSnap = await db.collection('contracts').get()
  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))

  console.log('Fetching all customers...')
  const customersSnap = await db.collection('customers').get()
  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  console.log('Fetching all lesson records...')
  const recordsSnap = await db.collection('lessonRecords').get()
  
  console.log(`\n==========================================`)
  console.log(`統計數據:`)
  console.log(`  - 合約總數: ${contractMap.size}`)
  console.log(`  - 學員總數: ${customerMap.size}`)
  console.log(`  - 銷課紀錄總數: ${recordsSnap.docs.length}`)
  console.log(`==========================================\n`)

  const centerMismatchedContracts = []
  const centerMismatchedRecords = []
  const unlinkedRecords = []

  // 1. Check contracts centerId vs customer centerId
  contractMap.forEach((contract, cid) => {
    const custId = contract.customerId || contract.primaryCustomerId
    const cust = custId ? customerMap.get(custId) : null
    if (cust && contract.centerId !== cust.centerId) {
      centerMismatchedContracts.push({
        contractId: cid,
        contractNo: contract.contractNo || '無編號',
        contractCenterId: contract.centerId,
        customerName: cust.name,
        customerCenterId: cust.centerId
      })
    }
  })

  // 2. Check lessonRecords contractId lookup and centerId mismatches
  recordsSnap.docs.forEach(docSnap => {
    const r = { id: docSnap.id, ...docSnap.data() }
    const contract = r.contractId ? contractMap.get(r.contractId) : null
    const dateStr = r.sessionDate ? new Date(r.sessionDate._seconds * 1000).toISOString().split('T')[0] : '無日期'
    const nameStr = r.attendingCustomerNames?.join('、') || r.customerName || '未知學員'

    if (!r.contractId) {
      unlinkedRecords.push({
        id: r.id,
        date: dateStr,
        name: nameStr,
        reason: '銷課紀錄未關聯合約 (contractId 為空)'
      })
    } else if (!contract) {
      unlinkedRecords.push({
        id: r.id,
        date: dateStr,
        name: nameStr,
        contractId: r.contractId,
        reason: '對應的合約在資料庫中不存在 (已刪除)'
      })
    } else {
      // Contract exists, check if centerId matches record or customer
      if (r.centerId && contract.centerId !== r.centerId) {
        centerMismatchedRecords.push({
          id: r.id,
          date: dateStr,
          name: nameStr,
          recordCenterId: r.centerId,
          contractId: r.contractId,
          contractCenterId: contract.centerId
        })
      }
    }
  })

  console.log(`1. 【CenterID 不一致的合約】(合約與所屬學員的 centerId 不符合，導致前端撈不到): ${centerMismatchedContracts.length} 筆`)
  centerMismatchedContracts.forEach((item, i) => {
    console.log(`   [${i+1}] 合約ID: ${item.contractId} (編號: ${item.contractNo}) | 學員: ${item.customerName} (學員館別: ${item.customerCenterId}) | 合約館別: ${item.contractCenterId}`)
  })

  console.log(`\n2. 【CenterID 不一致的銷課紀錄】(銷課紀錄與所屬合約的 centerId 不符合): ${centerMismatchedRecords.length} 筆`)
  centerMismatchedRecords.forEach((item, i) => {
    console.log(`   [${i+1}] 銷課ID: ${item.id} | 日期: ${item.date} | 學員: ${item.name} | 銷課館別: ${item.recordCenterId} | 合約館別: ${item.contractCenterId}`)
  })

  console.log(`\n3. 【無合約資訊/關聯失敗的銷課紀錄】: ${unlinkedRecords.length} 筆`)
  unlinkedRecords.forEach((item, i) => {
    console.log(`   [${i+1}] 銷課ID: ${item.id} | 日期: ${item.date} | 學員: ${item.name} | 原因: ${item.reason}`)
  })

  return {
    centerMismatchedContracts,
    centerMismatchedRecords,
    unlinkedRecords
  }
}

checkAllMismatches().catch(console.error)
