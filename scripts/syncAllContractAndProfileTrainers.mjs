import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function syncAllContractAndProfileTrainers() {
  console.log('Fetching all contracts, customers, and trainers for full synchronization...')
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()
  const trainersSnap = await db.collection('trainers').get()

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const updates = []

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
      if (!cust) return

      const custName = cust.name || mId
      const custProfileTrainerId = cust.trainerId || null

      let contractAssignedTrainerId = studentTrainers[mId]
      if (!contractAssignedTrainerId) {
        if (cType === 'dual' && idx === 1 && c.secondaryTrainerId) {
          contractAssignedTrainerId = c.secondaryTrainerId
        } else {
          contractAssignedTrainerId = c.trainerId
        }
      }

      if (!contractAssignedTrainerId) return

      if (custProfileTrainerId !== contractAssignedTrainerId) {
        const oldTrainerName = trainerMap.get(custProfileTrainerId)?.name || custProfileTrainerId || '未設定'
        const newTrainerName = trainerMap.get(contractAssignedTrainerId)?.name || contractAssignedTrainerId || '未知'
        updates.push({
          customerId: mId,
          customerName: custName,
          contractNo,
          cType,
          oldTrainerName,
          newTrainerName,
          targetTrainerId: contractAssignedTrainerId,
        })
      }
    })
  })

  console.log(`\n==========================================`)
  console.log(`掃描完畢！準備校正 ${updates.length} 筆不一致的學員檔案教練紀錄：`)
  console.log(`==========================================\n`)

  const batch = db.batch()
  updates.forEach(u => {
    console.log(`  - 學員: ${u.customerName} (${u.customerId}) | 合約: ${u.contractNo} (${u.cType}) | 檔案教練: "${u.oldTrainerName}" → "${u.newTrainerName}"`)
    const ref = db.collection('customers').doc(u.customerId)
    batch.update(ref, {
      trainerId: u.targetTrainerId,
      updatedAt: new Date(),
    })
  })

  await batch.commit()

  console.log(`\n==========================================`)
  console.log(`✅ 成功完成全庫 ${updates.length} 筆學員檔案與合約指定教練的同步校正！`)
  console.log(`==========================================\n`)
  process.exit(0)
}

syncAllContractAndProfileTrainers().catch(console.error)
