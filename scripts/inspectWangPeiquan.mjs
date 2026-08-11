import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectWangPeiquan() {
  console.log('Fetching student 王沛權 details...')

  const trainersSnap = await db.collection('trainers').get()
  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const customersSnap = await db.collection('customers').get()
  const wangList = []
  customersSnap.docs.forEach(d => {
    const data = d.data()
    if (data.name && data.name.includes('王沛權')) {
      wangList.push({ id: d.id, ...data })
    }
  })

  console.log(`Found ${wangList.length} customers named 王沛權:`)
  wangList.forEach(c => {
    console.log(`- Customer ID: ${c.id}`)
    console.log(`  Name: ${c.name}, phone: ${c.phone}, centerId: ${c.centerId}`)
    console.log(`  trainerId in customer doc: ${c.trainerId} -> (${trainerMap.get(c.trainerId)?.name || '未知'})`)
  })

  if (wangList.length === 0) return

  const targetIds = wangList.map(w => w.id)

  console.log('\n=== CONTRACTS INVOLVING 王沛權 ===')
  const contractsSnap = await db.collection('contracts').get()
  contractsSnap.docs.forEach(doc => {
    const c = doc.data()
    const cIds = c.customerIds || (c.customerId ? [c.customerId] : [])
    const matches = targetIds.filter(id => cIds.includes(id) || c.customerId === id || c.sharedWithCustomerId === id)
    if (matches.length > 0) {
      console.log(`\nContract ID: ${doc.id}`)
      console.log('contractNo:', c.contractNo)
      console.log('contractType:', c.contractType)
      console.log('primaryCustomerId / customerId:', c.customerId || c.primaryCustomerId)
      console.log('customerIds:', c.customerIds)
      console.log('trainerId (主教練):', c.trainerId, '->', trainerMap.get(c.trainerId)?.name)
      console.log('secondaryTrainerId (副教練):', c.secondaryTrainerId, '->', trainerMap.get(c.secondaryTrainerId)?.name)
      console.log('studentTrainers:', c.studentTrainers)
      console.log('groupMemberQuotas:', c.groupMemberQuotas)
    }
  })

  console.log('\n=== LESSON RECORDS FOR 王沛權 ===')
  const lessonsSnap = await db.collection('lessons').get()
  lessonsSnap.docs.forEach(doc => {
    const l = doc.data()
    if (targetIds.includes(l.customerId)) {
      console.log(`\nLesson ID: ${doc.id}`)
      console.log('contractId:', l.contractId)
      console.log('contractType:', l.contractType)
      console.log('sessionDate:', l.sessionDate)
      console.log('trainerId in lesson:', l.trainerId, '->', trainerMap.get(l.trainerId)?.name)
      console.log('recognizedAmount:', l.recognizedAmount)
    }
  })
}

inspectWangPeiquan().catch(console.error)
