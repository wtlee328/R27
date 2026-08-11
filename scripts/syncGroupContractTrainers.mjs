import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function syncGroupContracts() {
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
  console.log(`找到 ${groupContracts.length} 筆團體合約，開始校正成員檔案教練...`)
  console.log(`==========================================\n`)

  let updatedCustomerCount = 0
  const updatedDetails = []

  for (const c of groupContracts) {
    const groupTrainerId = c.trainerId
    if (!groupTrainerId) continue

    const memberIds = Array.isArray(c.customerIds) 
      ? c.customerIds 
      : (c.groupMemberQuotas ? Object.keys(c.groupMemberQuotas) : [])

    for (const custIdx of memberIds) {
      const custObj = customerMap.get(custIdx)
      if (!custObj) continue

      if (custObj.trainerId !== groupTrainerId) {
        const oldTrainerName = trainerMap.get(custObj.trainerId)?.name || custObj.trainerId || '未設定 / 無'
        const newTrainerName = trainerMap.get(groupTrainerId)?.name || groupTrainerId || '未知'

        console.log(`  [團體合約 ${c.contractNo || c.id}] 學員: ${custObj.name} (${custIdx}) | 校正教練: ${oldTrainerName} → ${newTrainerName}`)
        
        updatedDetails.push({
          contractNo: c.contractNo || c.id,
          customerName: custObj.name,
          customerId: custIdx,
          oldTrainer: oldTrainerName,
          newTrainer: newTrainerName,
        })

        await db.collection('customers').doc(custIdx).update({
          trainerId: groupTrainerId,
          updatedAt: new Date(),
        })
        updatedCustomerCount++
      }
    }
  }

  console.log(`\n==========================================`)
  console.log(`✅ 團體合約校正完成！一共更新了 ${updatedCustomerCount} 筆團員檔案教練。`)
  console.log(`==========================================\n`)
  process.exit(0)
}

syncGroupContracts().catch(console.error)
