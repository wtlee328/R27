/**
 * Database Migration Script: Migrate approved venueBookings to venueRentals & cashFlowRecords,
 * and then delete the venueBookings collection.
 *
 * Run: node scripts/migrateVenueData.mjs
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

initializeApp({
  credential: applicationDefault(),
  projectId: 'r27-app-7c5bc',
})

const db = getFirestore()

async function migrate() {
  console.log('Fetching all bookings from "venueBookings" collection...')
  const bookingsSnap = await db.collection('venueBookings').get()
  const bookings = bookingsSnap.docs.map(d => ({ _id: d.id, ...d.data() }))
  
  console.log(`Found ${bookings.length} total bookings.`)

  const approvedBookings = bookings.filter(b => b.status === 'approved')
  console.log(`Approved bookings to migrate: ${approvedBookings.length}`)

  let createdRentals = 0
  let alreadyExist = 0

  for (const booking of approvedBookings) {
    let rentalExists = false
    
    // Check if it already has a venueRentalId
    if (booking.venueRentalId) {
      const rentalSnap = await db.collection('venueRentals').doc(booking.venueRentalId).get()
      if (rentalSnap.exists) {
        rentalExists = true
        alreadyExist++
      }
    }

    if (!rentalExists) {
      console.log(`Migrating booking ${booking._id} (${booking.trainerName} - ${booking.startTime || ''})`)
      
      const rentalRef = db.collection('venueRentals').doc()
      const cashFlowRef = db.collection('cashFlowRecords').doc()
      
      // Determine rental date (Timestamp)
      const bookingDate = booking.date || FieldValue.serverTimestamp()
      const amount = 500 // Default charge amount for migrated rentals
      
      const renterName = booking.renterName || booking.trainerName || '未知租借人'
      const notes = booking.purpose || ''
      const centerId = booking.centerId || 'r27'

      const cashFlowData = {
        date: bookingDate,
        trainerId: booking.trainerId || 'system',
        debitCategory: '現金',
        debitAmount: amount,
        creditCategory: '場租收入',
        creditAmount: amount,
        description: `場租收入 - ${renterName}`,
        notes: notes,
        source: 'venue_rental',
        sourceId: rentalRef.id,
        centerId: centerId,
        createdAt: booking.createdAt || FieldValue.serverTimestamp(),
        updatedAt: booking.updatedAt || FieldValue.serverTimestamp(),
      }

      const rentalData = {
        date: bookingDate,
        amount: amount,
        notes: notes,
        renterName: renterName,
        renterTrainerId: booking.trainerId || 'system',
        renterCustomerId: booking.renterCustomerId || '',
        trainerId: booking.trainerId || 'system',
        cashFlowRecordId: cashFlowRef.id,
        centerId: centerId,
        createdAt: booking.createdAt || FieldValue.serverTimestamp(),
        updatedAt: booking.updatedAt || FieldValue.serverTimestamp(),
      }

      // Write in a transaction or individual writes
      const batch = db.batch()
      batch.set(cashFlowRef, cashFlowData)
      batch.set(rentalRef, rentalData)
      await batch.commit()

      createdRentals++
    }
  }

  console.log(`\nMigration completed:`)
  console.log(`- Created ${createdRentals} new venue rental and cash flow records.`)
  console.log(`- ${alreadyExist} bookings were already linked to active rental records.`)

  // Now delete the venueBookings collection entirely as requested
  console.log('\nDeleting all documents in "venueBookings" collection...')
  let deletedCount = 0
  const deleteBatchSize = 100
  
  while (true) {
    const snap = await db.collection('venueBookings').limit(deleteBatchSize).get()
    if (snap.size === 0) {
      break
    }
    const batch = db.batch()
    snap.docs.forEach(doc => {
      batch.delete(doc.ref)
      deletedCount++
    })
    await batch.commit()
    console.log(`Deleted ${deletedCount} documents...`)
  }

  console.log(`\n✅ Done! Deleted a total of ${deletedCount} documents from "venueBookings".`)
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
