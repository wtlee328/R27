import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function reinspectAll() {
  console.log('Re-inspecting all shared and group contract customer documents...')

  const customersSnap = await db.collection('customers').get()
  const contractsSnap = await db.collection('contracts').get()
  const trainersSnap = await db.collection('trainers').get()

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const sharedContracts = contractsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.contractType === 'shared')

  const groupContracts = contractsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.contractType === 'group' || !!c.groupMemberQuotas)

  console.log('\n==========================================')
  console.log('1. SHARED CONTRACTS DETAILS:')
  console.log('==========================================\n')

  const sharedList = []
  for (const c of sharedContracts) {
    const studentTrainers = c.studentTrainers || {}
    if (Array.isArray(c.customerIds)) {
      c.customerIds.forEach((custIdx, i) => {
        const custObj = customerMap.get(custIdx)
        const assignedTrainerId = studentTrainers[custIdx] || (i === 0 ? c.trainerId : (i === 1 ? (c.secondaryTrainerId || custObj?.trainerId || c.trainerId) : (custObj?.trainerId || c.trainerId)))
        sharedList.push({
          contractId: c.id,
          contractNo: c.contractNo || '無',
          memberIndex: i + 1,
          customerId: custIdx,
          customerName: custObj?.name || '未知學員',
          phone: custObj?.phone || '',
          trainerInDocId: custObj?.trainerId,
          trainerInDocName: trainerMap.get(custObj?.trainerId)?.name || '未設定',
          assignedTrainerId,
          assignedTrainerName: trainerMap.get(assignedTrainerId)?.name || '未指定',
        })
      })
    }
  }

  sharedList.forEach(item => {
    console.log(`[共享合約 ${item.contractNo}] 學員: ${item.customerName} (${item.customerId}) | 檔案教練: ${item.trainerInDocName} | 合約指定: ${item.assignedTrainerName}`)
  })

  console.log('\n==========================================')
  console.log('2. GROUP CONTRACTS DETAILS:')
  console.log('==========================================\n')

  const groupList = []
  for (const c of groupContracts) {
    const groupTrainerId = c.trainerId
    const memberIds = Array.isArray(c.customerIds) 
      ? c.customerIds 
      : (c.groupMemberQuotas ? Object.keys(c.groupMemberQuotas) : [])

    memberIds.forEach((custIdx, i) => {
      const custObj = customerMap.get(custIdx)
      groupList.push({
        contractId: c.id,
        contractNo: c.contractNo || '無',
        memberIndex: i + 1,
        customerId: custIdx,
        customerName: custObj?.name || '未知學員',
        phone: custObj?.phone || '',
        trainerInDocId: custObj?.trainerId,
        trainerInDocName: trainerMap.get(custObj?.trainerId)?.name || '未設定',
        groupTrainerId,
        groupTrainerName: trainerMap.get(groupTrainerId)?.name || '未指定',
      })
    })
  }

  groupList.forEach(item => {
    console.log(`[團體合約 ${item.contractNo}] 學員: ${item.customerName} (${item.customerId}) | 檔案教練: ${item.trainerInDocName} | 團課教練: ${item.groupTrainerName}`)
  })
}

reinspectAll().catch(console.error)
