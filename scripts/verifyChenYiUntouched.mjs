import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function verifyChenYiUntouched() {
  const c1 = await db.collection('customers').doc('ZzL0z5uQNelsAI7sRHd9').get()
  const c2 = await db.collection('customers').doc('waZ5O3as4Fhba25zK5Rg').get()
  const contract = await db.collection('contracts').doc('tdDcLsBsdQJkwKCxTKeB').get()

  console.log('=== Real Customer 1 (陳怡彣) ===')
  console.log(c1.id, c1.data())

  console.log('\n=== Real Customer 2 (陳怡均) ===')
  console.log(c2.id, c2.data())

  console.log('\n=== Real Contract (tdDcLsBsdQJkwKCxTKeB) ===')
  console.log(contract.id, contract.data())
}

verifyChenYiUntouched().catch(console.error)
