import { useState, useEffect, useCallback } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import type { Contract } from '../types'

export function useContracts(customerId?: string) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()

  const fetchContracts = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const contractsRef = collection(db, 'contracts')

      if (customerId) {
        // When looking up a specific customer's contracts, don't restrict by trainerId —
        // the trainerId filter breaks dual-contract partner lookups where the contract's
        // primary customerId is a different customer.
        // Use all 3 lookup strategies and merge results.
        const [snap1, snap2, snap3] = await Promise.all([
          getDocs(query(contractsRef, where('customerIds', 'array-contains', customerId))),
          getDocs(query(contractsRef, where('customerId', '==', customerId))),
          getDocs(query(contractsRef, where('sharedWithCustomerId', '==', customerId))),
        ])
        const map = new Map<string, Contract>()
        ;[...snap1.docs, ...snap2.docs, ...snap3.docs].forEach(d =>
          map.set(d.id, { id: d.id, ...d.data() } as Contract)
        )
        setContracts(
          Array.from(map.values()).sort((a: any, b: any) =>
            (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
          )
        )
      } else {
        // No customerId: return all contracts visible to this user
        let q = query(contractsRef)
        if (user.role !== 'admin') {
          q = query(q, where('trainerId', '==', user.uid))
        }
        const snap = await getDocs(q)
        setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Contract[])
      }
    } catch (err) {
      console.error('Error fetching contracts:', err)
    } finally {
      setLoading(false)
    }
  }, [user, customerId])

  useEffect(() => {
    fetchContracts()
  }, [fetchContracts])

  return {
    contracts,
    loading,
    refresh: fetchContracts,
  }
}
