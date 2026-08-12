import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function fixMislabeledLessonRecords() {
  console.log('Fetching lesson records, contracts, customers, and trainers for batch update...')
  const lessonsSnap = await db.collection('lessonRecords').get()
  const contractsSnap = await db.collection('contracts').get()
  const customersSnap = await db.collection('customers').get()
  const trainersSnap = await db.collection('trainers').get()

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const customerMap = new Map()
  customersSnap.docs.forEach(d => customerMap.set(d.id, { id: d.id, ...d.data() }))

  const contractMap = new Map()
  contractsSnap.docs.forEach(d => contractMap.set(d.id, { id: d.id, ...d.data() }))

  const toUpdate = []

  lessonsSnap.docs.forEach(doc => {
    const l = doc.data()
    const contractObj = contractMap.get(l.contractId)
    if (!contractObj) return

    const studentId = l.customerId || (Array.isArray(l.attendingCustomerIds) ? l.attendingCustomerIds[0] : null)
    if (!studentId) return

    let correctContractTrainerId = null

    if (contractObj.contractType === 'shared' && contractObj.studentTrainers?.[studentId]) {
      correctContractTrainerId = contractObj.studentTrainers[studentId]
    } else if (contractObj.contractType === 'dual') {
      const isPrimary = studentId === (contractObj.customerId || contractObj.primaryCustomerId)
      if (!isPrimary && contractObj.secondaryTrainerId) {
        correctContractTrainerId = contractObj.secondaryTrainerId
      } else if (contractObj.studentTrainers?.[studentId]) {
        correctContractTrainerId = contractObj.studentTrainers[studentId]
      } else {
        correctContractTrainerId = contractObj.trainerId
      }
    } else {
      correctContractTrainerId = contractObj.trainerId
    }

    if (!correctContractTrainerId) return

    const currentContractTrainerId = l.contractTrainerId || null
    if (currentContractTrainerId !== correctContractTrainerId) {
      const custObj = customerMap.get(studentId)
      toUpdate.push({
        lessonId: doc.id,
        studentName: custObj?.name || l.customerName || studentId,
        oldTrainer: trainerMap.get(currentContractTrainerId)?.name || '未記錄',
        newTrainer: trainerMap.get(correctContractTrainerId)?.name || '未知',
        correctContractTrainerId,
      })
    }
  })

  console.log(`\n準備對 ${toUpdate.length} 筆銷課紀錄進行批次更動...`)

  const batch = db.batch()
  toUpdate.forEach(item => {
    console.log(`  - 銷課 ID: ${item.lessonId} | 學員: ${item.studentName} | contractTrainerId: "${item.oldTrainer}" → "${item.newTrainer}"`)
    const ref = db.collection('lessonRecords').doc(item.lessonId)
    batch.update(ref, {
      contractTrainerId: item.correctContractTrainerId,
      updatedAt: new Date(),
    })
  })

  await batch.commit()

  console.log(`\n==========================================`)
  console.log(`✅ 成功更動並校正了 ${toUpdate.length} 筆銷課紀錄的合約原教練標註！`)
  console.log(`==========================================\n`)

  process.exit(0)
}

fixMislabeledLessonRecords().catch(console.error)
