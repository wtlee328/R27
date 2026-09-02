import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function inspectWangXuezhen() {
  console.log('Fetching student 汪雪貞 details...')

  const trainersSnap = await db.collection('trainers').get()
  const trainerMap = new Map()
  trainersSnap.docs.forEach(d => trainerMap.set(d.id, { id: d.id, ...d.data() }))

  const customersSnap = await db.collection('customers').get()
  const wangList = []
  customersSnap.docs.forEach(d => {
    const data = d.data()
    if (data.name && data.name.includes('汪雪貞')) {
      wangList.push({ id: d.id, ...data })
    }
  })

  console.log(`Found ${wangList.length} customers named 汪雪貞:`)
  wangList.forEach(c => {
    console.log(`- Customer ID: ${c.id}`)
    console.log(`  Name: ${c.name}, phone: ${c.phone}, centerId: ${c.centerId}`)
    console.log(`  trainerId in customer doc: ${c.trainerId} -> (${trainerMap.get(c.trainerId)?.name || '未知'})`)
  })

  if (wangList.length === 0) return

  const targetIds = wangList.map(w => w.id)

  console.log('\n=== CONTRACTS INVOLVING 汪雪貞 ===')
  const contractsSnap = await db.collection('contracts').get()
  contractsSnap.docs.forEach(doc => {
    const con = doc.data()
    const isMember = targetIds.includes(con.customerId) ||
      targetIds.includes(con.primaryCustomerId) ||
      targetIds.includes(con.sharedWithCustomerId) ||
      targetIds.includes(con.partnerId) ||
      (Array.isArray(con.customerIds) && con.customerIds.some(id => targetIds.includes(id)))

    if (isMember) {
      console.log(`- Contract ID: ${doc.id}`)
      console.log(`  Type: ${con.contractType}, Number: ${con.contractNumber || '無'}, Status: ${con.status}`)
      console.log(`  Primary Trainer: ${con.trainerId} (${trainerMap.get(con.trainerId)?.name || '未知'})`)
      console.log(`  Secondary Trainer: ${con.secondaryTrainerId} (${trainerMap.get(con.secondaryTrainerId)?.name || '無'})`)
      console.log(`  studentTrainers map:`, con.studentTrainers)
      if (con.studentTrainers) {
        Object.entries(con.studentTrainers).forEach(([sId, tId]) => {
          console.log(`    Student ${sId}: Trainer ${tId} (${trainerMap.get(tId)?.name || '未知'})`)
        })
      }
      console.log(`  Remaining / Total: ${con.remainingSessions} / ${con.totalSessions}`)
      console.log(`  customerIds:`, con.customerIds)
      console.log(`  sharedWithCustomerId:`, con.sharedWithCustomerId)
      console.log(`-----------------------------------------------`)
    }
  })

  console.log('\n=== RECENT LESSON RECORDS INVOLVING 汪雪貞 ===')
  const lrSnap = await db.collection('lessonRecords').get()
  const records = []
  lrSnap.docs.forEach(doc => {
    const lr = doc.data()
    const isRelated = targetIds.includes(lr.customerId) ||
      (Array.isArray(lr.attendingCustomerIds) && lr.attendingCustomerIds.some(id => targetIds.includes(id))) ||
      (Array.isArray(lr.deductions) && lr.deductions.some(d => targetIds.includes(d.customerId)))

    if (isRelated) {
      records.push({ id: doc.id, ...lr })
    }
  })

  records.sort((a, b) => {
    const dateA = a.sessionDate?.toDate ? a.sessionDate.toDate().getTime() : new Date(a.sessionDate || 0).getTime()
    const dateB = b.sessionDate?.toDate ? b.sessionDate.toDate().getTime() : new Date(b.sessionDate || 0).getTime()
    return dateB - dateA
  })

  console.log(`Found ${records.length} lesson records:`)
  records.slice(0, 10).forEach(r => {
    console.log(`- Record ID: ${r.id}`)
    console.log(`  sessionDate: ${r.sessionDate}`)
    console.log(`  trainerId on record: ${r.trainerId} -> (${trainerMap.get(r.trainerId)?.name || '未知'})`)
    console.log(`  contractId: ${r.contractId}`)
    console.log(`  sessionAmount: ${r.sessionAmount}`)
    console.log(`  notes: ${r.notes || ''}`)
    console.log(`  deductions:`, r.deductions)
    console.log(`-----------------------------------------------`)
  })
}

inspectWangXuezhen().catch(console.error)
