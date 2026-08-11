import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function scanAllCollections() {
  const collections = ['contracts', 'customers', 'lessonRecords', 'trainers', 'cashFlowRecords', 'venueRentals', 'trialRecords']
  
  console.log('Scanning all collections for centerId values...\n')

  for (const colName of collections) {
    const snap = await db.collection(colName).get()
    const centerIdCounts = {}
    snap.docs.forEach(doc => {
      const data = doc.data()
      const cid = data.centerId || '(missing)'
      centerIdCounts[cid] = (centerIdCounts[cid] || 0) + 1
    })
    console.log(`[Collection: ${colName}] Total docs: ${snap.docs.length}`)
    Object.entries(centerIdCounts).forEach(([cid, count]) => {
      console.log(`  - centerId: "${cid}" -> ${count} docs`)
    })
    console.log('------------------------------------------')
  }
}

scanAllCollections().catch(console.error)
