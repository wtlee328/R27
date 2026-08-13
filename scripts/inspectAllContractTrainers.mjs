import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectAllContractTrainers() {
  console.log('Scanning all contracts and customers for trainer sync status...')
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()
  const trainersSnap = await db.collection('trainers').get()

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  let outOfSyncCount = 0

  contractsSnap.docs.forEach(doc => {
    const c = doc.data()
    const cId = doc.id
    const contractNo = c.contractNo || cId
    const cType = c.contractType || 'single'

    const rawMemberIds = [
      c.customerId,
      c.primaryCustomerId,
      c.sharedWithCustomerId,
      ...(Array.isArray(c.customerIds) ? c.customerIds : []),
      ...(c.groupMemberQuotas ? Object.keys(c.groupMemberQuotas) : []),
      ...(c.studentTrainers ? Object.keys(c.studentTrainers) : []),
    ].filter(id => Boolean(id))

    const memberIds = Array.from(new Set(rawMemberIds))
    const studentTrainers = c.studentTrainers || {}

    memberIds.forEach((mId, idx) => {
      const cust = customerMap.get(mId)
      const custName = cust?.name || mId
      const custProfileTrainerId = cust?.trainerId || null

      let contractAssignedTrainerId = studentTrainers[mId]
      if (!contractAssignedTrainerId) {
        if (cType === 'dual' && idx === 1 && c.secondaryTrainerId) {
          contractAssignedTrainerId = c.secondaryTrainerId
        } else {
          contractAssignedTrainerId = c.trainerId
        }
      }

      const profileTrainerName = trainerMap.get(custProfileTrainerId)?.name || custProfileTrainerId || '未設定'
      const contractTrainerName = trainerMap.get(contractAssignedTrainerId)?.name || contractAssignedTrainerId || '未設定'

      if (custProfileTrainerId !== contractAssignedTrainerId) {
        outOfSyncCount++
        console.log(`[不一致] 合約: ${contractNo} (${cType}) | 學員: ${custName} (${mId})`)
        console.log(`    合約指定教練: ${contractTrainerName} | 學員檔案教練: ${profileTrainerName}`)
      }
    })
  })

  console.log(`\n==========================================`)
  console.log(`掃描完成！發現 ${outOfSyncCount} 處合約指定教練與學員檔案教練不一致。`)
  console.log(`==========================================\n`)
}

inspectAllContractTrainers().catch(console.error)
