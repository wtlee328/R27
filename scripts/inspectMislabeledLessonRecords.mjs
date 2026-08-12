import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectMislabeledLessonRecords() {
  console.log('Fetching all lesson records, contracts, customers, and trainers...')
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

  const mislabeledRecords = []

  lessonsSnap.docs.forEach(doc => {
    const l = doc.data()
    const contractObj = contractMap.get(l.contractId)
    if (!contractObj) return

    const studentId = l.customerId || (Array.isArray(l.attendingCustomerIds) ? l.attendingCustomerIds[0] : null)
    if (!studentId) return

    // Resolve what the correct contract trainer for this student & contract SHOULD be
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
    const teachingTrainerId = l.trainerId

    // Current stored substitute status
    const currentIsSubstitute = currentContractTrainerId ? (currentContractTrainerId !== teachingTrainerId) : false
    // Correct substitute status
    const correctIsSubstitute = correctContractTrainerId !== teachingTrainerId

    // Check if contractTrainerId or substitute status is mislabeled
    if (currentContractTrainerId !== correctContractTrainerId || currentIsSubstitute !== correctIsSubstitute) {
      const custObj = customerMap.get(studentId)
      mislabeledRecords.push({
        lessonId: doc.id,
        sessionDate: l.sessionDate ? (l.sessionDate.toDate ? l.sessionDate.toDate().toISOString().substring(0, 10) : l.sessionDate) : '未知日期',
        contractId: l.contractId,
        contractNo: contractObj.contractNo || '無',
        contractType: contractObj.contractType,
        studentName: custObj?.name || l.customerName || studentId,
        teachingTrainerName: trainerMap.get(teachingTrainerId)?.name || teachingTrainerId || '未知',
        currentContractTrainerName: trainerMap.get(currentContractTrainerId)?.name || currentContractTrainerId || '未記錄',
        correctContractTrainerName: trainerMap.get(correctContractTrainerId)?.name || correctContractTrainerId || '未知',
        currentIsSubstitute,
        correctIsSubstitute,
      })
    }
  })

  console.log(`\n==========================================`)
  console.log(`掃描完成！共發現 ${mislabeledRecords.length} 筆銷課紀錄其合約原教練標註需要校正：`)
  console.log(`==========================================\n`)

  mislabeledRecords.forEach((r, idx) => {
    console.log(`[${idx + 1}] 銷課 ID: ${r.lessonId}`)
    console.log(`    上課日期: ${r.sessionDate} | 合約編號: ${r.contractNo} (${r.contractType})`)
    console.log(`    學員: ${r.studentName} | 授課教練: ${r.teachingTrainerName}`)
    console.log(`    舊原教練: ${r.currentContractTrainerName} (舊代課判定: ${r.currentIsSubstitute ? '代課' : '正常'})`)
    console.log(`    正確專屬教練: ${r.correctContractTrainerName} (正確代課判定: ${r.correctIsSubstitute ? '代課' : '正常'})`)
    console.log('------------------------------------------')
  })
}

inspectMislabeledLessonRecords().catch(console.error)
