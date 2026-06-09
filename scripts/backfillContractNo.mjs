/**
 * One-time backfill: assign contractNo to all existing contracts.
 * Uses firebase-admin with application default credentials (Firebase CLI login).
 *
 * Run: node scripts/backfillContractNo.mjs
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function generateContractNo(date, sequence) {
  const rocYear = date.getFullYear() - 1911
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const seq = String(sequence).padStart(2, '0')
  return `${rocYear}${month}${day}${seq}`
}

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function backfill() {
  console.log('Fetching all contracts...')
  const snap = await db.collection('contracts').get()
  const contracts = snap.docs.map(d => ({ _docId: d.id, ...d.data() }))

  console.log(`Found ${contracts.length} contracts total.`)

  const alreadyAssigned = contracts.filter(c => c.contractNo)
  const needsAssignment = contracts.filter(c => !c.contractNo)

  console.log(`Already have contractNo: ${alreadyAssigned.length}`)
  console.log(`Need assignment: ${needsAssignment.length}`)

  if (needsAssignment.length === 0) {
    console.log('Nothing to do! All contracts already have a contractNo.')
    process.exit(0)
  }

  // Collect all existing contractNos to avoid collision
  const existingNos = new Set(alreadyAssigned.map(c => c.contractNo))

  // Sort by createdAt ascending (oldest first)
  needsAssignment.sort((a, b) => {
    const ta = a.createdAt?._seconds ?? 0
    const tb = b.createdAt?._seconds ?? 0
    return ta - tb
  })

  // Track per-day sequence counters — pre-seed from already-assigned
  const daySequences = {}
  for (const c of alreadyAssigned) {
    const no = String(c.contractNo)
    const seq = parseInt(no.slice(-2), 10)
    const prefix = no.slice(0, -2)
    if (!daySequences[prefix] || seq > daySequences[prefix]) {
      daySequences[prefix] = seq
    }
  }

  let updated = 0
  for (const contract of needsAssignment) {
    const secs = contract.createdAt?._seconds ?? Math.floor(Date.now() / 1000)
    const createdAt = new Date(secs * 1000)
    const rocYear = createdAt.getFullYear() - 1911
    const month = String(createdAt.getMonth() + 1).padStart(2, '0')
    const day = String(createdAt.getDate()).padStart(2, '0')
    const prefix = `${rocYear}${month}${day}`

    daySequences[prefix] = (daySequences[prefix] ?? 0) + 1

    let contractNo = generateContractNo(createdAt, daySequences[prefix])
    while (existingNos.has(contractNo)) {
      daySequences[prefix]++
      contractNo = generateContractNo(createdAt, daySequences[prefix])
    }
    existingNos.add(contractNo)

    console.log(`  ${contract._docId} → ${contractNo}  (created: ${createdAt.toISOString().split('T')[0]})`)

    try {
      await db.collection('contracts').doc(contract._docId).update({ contractNo })
      updated++
    } catch (err) {
      console.error(`  ✗ Failed to update ${contract._docId}:`, err.message)
    }
  }

  console.log(`\n✅ Done! Updated ${updated}/${needsAssignment.length} contracts.`)
  process.exit(0)
}

backfill().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
