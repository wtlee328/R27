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
      let q = query(contractsRef)

      if (user.role !== 'admin') {
        q = query(q, where('trainerId', '==', user.uid))
      }

      if (customerId) {
        q = query(q, where('customerId', '==', customerId))
      }

      const querySnapshot = await getDocs(q)
      const data = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Contract[]

      // Also fetch shared contracts
      if (customerId) {
        let sharedQ = query(collection(db, 'contracts'), where('sharedWithCustomerId', '==', customerId))
        const sharedSnapshot = await getDocs(sharedQ)
        const sharedData = sharedSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Contract[]
        
        // Merge and deduplicate
        const allData = [...data, ...sharedData]
        const unique = Array.from(new Map(allData.map(item => [item.id, item])).values())
        setContracts(unique)
      } else {
        setContracts(data)
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
