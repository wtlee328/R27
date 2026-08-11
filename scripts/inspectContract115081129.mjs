import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectContract() {
  console.log('Fetching contract ID RlXXfFI16wMNAwsA706A...')
  const docSnap = await db.collection('contracts').doc('RlXXfFI16wMNAwsA706A').get()

  if (!docSnap.exists) {
    console.log('Contract ID RlXXfFI16wMNAwsA706A does not exist.')
    return
  }

  const trainersSnap = await db.collection('trainers').get()
  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const c = docSnap.data()
  console.log('\n=== CONTRACT DOCUMENT ===')
  console.log('Contract ID:', docSnap.id)
  console.log('contractNo:', c.contractNo)
  console.log('contractType:', c.contractType)
  console.log('trainerId:', c.trainerId, '-> Name:', trainerMap.get(c.trainerId)?.name)
  console.log('secondaryTrainerId:', c.secondaryTrainerId, '-> Name:', trainerMap.get(c.secondaryTrainerId)?.name)
  console.log('customerIds:', c.customerIds)
  console.log('studentTrainers:', c.studentTrainers)
  console.log('groupMemberQuotas:', c.groupMemberQuotas)

  if (Array.isArray(c.customerIds)) {
    for (const custId of c.customerIds) {
      const custSnap = await db.collection('customers').doc(custId).get()
      const cust = custSnap.data()
      console.log(`\n--- CUSTOMER DOCUMENT: ${custId} ---`)
      console.log('Name:', cust?.name)
      console.log('phone:', cust?.phone)
      console.log('trainerId in customer doc:', cust?.trainerId, '-> Name:', trainerMap.get(cust?.trainerId)?.name)
    }
  }
}

inspectContract().catch(console.error)
