import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function searchChenYi() {
  console.log('Searching for customers named 陳怡均 or 陳怡彣...')
  const customersSnap = await db.collection('customers').get()
  const trainersSnap = await db.collection('trainers').get()

  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const targetCustomers = []
  customersSnap.docs.forEach(d => {
    const data = d.data()
    if (data.name && (data.name.includes('陳怡均') || data.name.includes('陳怡彣') || data.name.includes('怡均') || data.name.includes('怡彣'))) {
      targetCustomers.push({ id: d.id, ...data })
    }
  })

  console.log(`Found ${targetCustomers.length} matching customers:`)
  targetCustomers.forEach(c => {
    console.log(`- ID: ${c.id} | Name: ${c.name} | phone: ${c.phone} | trainerId: ${c.trainerId} -> (${trainerMap.get(c.trainerId)?.name})`)
  })

  console.log('\nSearching for contracts involving these customers...')
  const contractsSnap = await db.collection('contracts').get()
  contractsSnap.docs.forEach(doc => {
    const c = doc.data()
    const cIds = c.customerIds || (c.customerId ? [c.customerId] : [])
    const matches = targetCustomers.filter(tc => cIds.includes(tc.id))
    if (matches.length > 0) {
      console.log(`\n=== CONTRACT ID: ${doc.id} ===`)
      console.log('contractNo:', c.contractNo)
      console.log('contractType:', c.contractType)
      console.log('trainerId (主教練):', c.trainerId, '->', trainerMap.get(c.trainerId)?.name)
      console.log('secondaryTrainerId (副教練):', c.secondaryTrainerId, '->', trainerMap.get(c.secondaryTrainerId)?.name)
      console.log('customerIds:', c.customerIds)
      console.log('studentTrainers:', c.studentTrainers)
      console.log('groupMemberQuotas:', c.groupMemberQuotas)
    }
  })
}

searchChenYi().catch(console.error)
