import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function checkGroupContracts() {
  console.log('Fetching all contracts, customers, and trainers...')
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()
  const trainersSnap = await db.collection('trainers').get()

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const groupContracts = contractsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.contractType === 'group' || !!c.groupMemberQuotas)

  console.log(`\n==========================================`)
  console.log(`找到 ${groupContracts.length} 筆團體合約：`)
  console.log(`==========================================\n`)

  groupContracts.forEach((c, idx) => {
    console.log(`[${idx + 1}] 合約 ID: ${c.id} (編號: ${c.contractNo || '無'})`)
    console.log(`    合約主教練 (trainerId): ${trainerMap.get(c.trainerId)?.name || c.trainerId || '未指定'}`)
    console.log(`    customerIds:`, c.customerIds)
    console.log(`    groupMemberQuotas:`, c.groupMemberQuotas)

    const memberIds = Array.isArray(c.customerIds) 
      ? c.customerIds 
      : (c.groupMemberQuotas ? Object.keys(c.groupMemberQuotas) : [])

    memberIds.forEach((custIdx, i) => {
      const custObj = customerMap.get(custIdx)
      const custTrainerName = trainerMap.get(custObj?.trainerId)?.name || '未對應'
      const isMatch = custObj?.trainerId === c.trainerId
      console.log(`      - 學員 ${i + 1}: ${custObj?.name || custIdx} | 學員檔案教練: ${custTrainerName} | 與合約教練一致: ${isMatch ? '✓' : '✗ (需校正)'}`)
    })
    console.log('------------------------------------------')
  })
}

checkGroupContracts().catch(console.error)
