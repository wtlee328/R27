import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function checkSharedContracts() {
  console.log('Fetching all contracts and customers...')
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()
  const trainersSnap = await db.collection('trainers').get()

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const sharedContracts = contractsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.contractType === 'shared')

  console.log(`\n==========================================`)
  console.log(`找到 ${sharedContracts.length} 筆共享合約：`)
  console.log(`==========================================\n`)

  sharedContracts.forEach((c, idx) => {
    console.log(`[${idx + 1}] 合約 ID: ${c.id} (編號: ${c.contractNo || '無'})`)
    console.log(`    主教練 (trainerId): ${trainerMap.get(c.trainerId)?.name || c.trainerId || '未指定'}`)
    console.log(`    副教練 (secondaryTrainerId): ${trainerMap.get(c.secondaryTrainerId)?.name || c.secondaryTrainerId || '無'}`)
    console.log(`    customerIds:`, c.customerIds)
    console.log(`    studentTrainers 紀錄:`, c.studentTrainers)

    if (Array.isArray(c.customerIds)) {
      c.customerIds.forEach((custIdx, i) => {
        const custObj = customerMap.get(custIdx)
        const tIdInContract = c.studentTrainers?.[custIdx]
        const tNameInContract = trainerMap.get(tIdInContract)?.name || '未對應'
        const custTrainerName = trainerMap.get(custObj?.trainerId)?.name || '未對應'
        console.log(`      - 學員 ${i + 1}: ${custObj?.name || custIdx} | 合約指定教練: ${tNameInContract} | 學員檔案教練: ${custTrainerName}`)
      })
    }
    console.log('------------------------------------------')
  })
}

checkSharedContracts().catch(console.error)
