import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function syncSharedContracts() {
  console.log('Fetching all contracts, customers, and trainers...')
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const sharedContracts = contractsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.contractType === 'shared')

  console.log(`找到 ${sharedContracts.length} 筆共享合約，開始同步校正...`)

  let updatedContractCount = 0
  let updatedCustomerCount = 0

  for (const c of sharedContracts) {
    const studentTrainers = c.studentTrainers || {}
    const primaryTrainerId = c.trainerId
    const secondaryTrainerId = c.secondaryTrainerId
    let contractNeedsUpdate = false

    if (Array.isArray(c.customerIds)) {
      c.customerIds.forEach((custIdx, i) => {
        const custObj = customerMap.get(custIdx)
        if (!custObj) return

        // Resolve contract assigned trainer for this member
        let assignedTrainerId = studentTrainers[custIdx]
        if (!assignedTrainerId) {
          assignedTrainerId = (i === 0 ? primaryTrainerId : (i === 1 ? (secondaryTrainerId || custObj.trainerId || primaryTrainerId) : (custObj.trainerId || primaryTrainerId)))
          studentTrainers[custIdx] = assignedTrainerId
          contractNeedsUpdate = true
        }

        // Sync customer's trainerId in Firestore if it doesn't match assignedTrainerId
        if (assignedTrainerId && custObj.trainerId !== assignedTrainerId) {
          console.log(`  [Customer ${custIdx}] (${custObj.name}) - 同步教練: "${custObj.trainerId || '無'}" → "${assignedTrainerId}"`)
          db.collection('customers').doc(custIdx).update({
            trainerId: assignedTrainerId,
            updatedAt: new Date(),
          }).catch(console.error)
          updatedCustomerCount++
        }
      })
    }

    if (contractNeedsUpdate) {
      console.log(`  [Contract ${c.id}] 同步更新 studentTrainers...`)
      await db.collection('contracts').doc(c.id).update({
        studentTrainers,
        updatedAt: new Date(),
      })
      updatedContractCount++
    }
  }

  console.log(`\n==========================================`)
  console.log(`✅ 校正完成！更新了 ${updatedContractCount} 筆合約 studentTrainers 紀錄，以及 ${updatedCustomerCount} 筆學員檔案教練。`)
  console.log(`==========================================\n`)
  process.exit(0)
}

syncSharedContracts().catch(console.error)
