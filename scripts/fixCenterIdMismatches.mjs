import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function syncCenterIds(dryRun = true) {
  console.log(`[${dryRun ? 'PREVIEW / DRY-RUN MODE' : 'EXECUTION MODE'}] Synchronizing centerIds...\n`)

  console.log('Fetching contracts, customers, and lesson records...')
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()
  const recordsSnap = await db.collection('lessonRecords').get()

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))

  let contractFixCount = 0
  let recordFixCount = 0

  // 1. Sync contracts to match their primary customer's centerId
  console.log('1. Checking contracts...')
  for (const docSnap of contractsSnap.docs) {
    const cData = docSnap.data()
    const cid = docSnap.id
    const primaryCustId = cData.primaryCustomerId || cData.customerId || (Array.isArray(cData.customerIds) ? cData.customerIds[0] : null)
    
    if (primaryCustId) {
      const cust = customerMap.get(primaryCustId)
      if (cust && cust.centerId && cData.centerId !== cust.centerId) {
        contractFixCount++
        console.log(`  [Contract ${cid}] (編號 ${cData.contractNo || '無'}) - 學員: ${cust.name} | 目前合約館別: "${cData.centerId}" → 修正為: "${cust.centerId}"`)
        if (!dryRun) {
          await db.collection('contracts').doc(cid).update({ centerId: cust.centerId })
        }
      }
    }
  }

  // 2. Sync lesson records to match their contract's/customer's centerId
  console.log('\n2. Checking lesson records...')
  for (const docSnap of recordsSnap.docs) {
    const rData = docSnap.data()
    const rid = docSnap.id
    
    // Find expected centerId from contract first, then customer
    let expectedCenterId = null
    if (rData.contractId && contractMap.has(rData.contractId)) {
      const contract = contractMap.get(rData.contractId)
      const primaryCustId = contract.primaryCustomerId || contract.customerId || (Array.isArray(contract.customerIds) ? contract.customerIds[0] : null)
      const cust = primaryCustId ? customerMap.get(primaryCustId) : null
      expectedCenterId = cust?.centerId || contract.centerId
    } else if (rData.customerId && customerMap.has(rData.customerId)) {
      expectedCenterId = customerMap.get(rData.customerId).centerId
    }

    if (expectedCenterId && rData.centerId !== expectedCenterId) {
      recordFixCount++
      const name = rData.attendingCustomerNames?.join('、') || rData.customerName || '未知學員'
      console.log(`  [LessonRecord ${rid}] (${name}) | 目前銷課館別: "${rData.centerId}" → 修正為: "${expectedCenterId}"`)
      if (!dryRun) {
        await db.collection('lessonRecords').doc(rid).update({ centerId: expectedCenterId })
      }
    }
  }

  console.log(`\n==========================================`)
  console.log(`統計 summary (${dryRun ? '預覽模式' : '完成狀態'}):`)
  console.log(`  - 需修正館別 (centerId) 的合約數: ${contractFixCount}`)
  console.log(`  - 需修正館別 (centerId) 的銷課紀錄數: ${recordFixCount}`)
  console.log(`==========================================`)

  if (dryRun) {
    console.log('\n提示: 若要正式執行修改，請傳入 execute 參數。')
  }
}

const isExecute = process.argv.includes('--execute')
syncCenterIds(!isExecute).catch(console.error)
