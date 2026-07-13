import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useCenterStore } from '../stores/centerStore'
import { useTrainerProfileStore } from '../stores/trainerProfileStore'
import type { Customer, Contract } from '../types'
import type { CustomerFormValues, CombinedCustomerContractValues, ContractFormValues } from '../lib/validators'
import { generateContractNo, nextDailySequence } from '../lib/contractNo'

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuthStore()
  const { centerId } = useCenterStore()
  const { selectedTrainerId } = useTrainerProfileStore()


  const fetchAllData = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)
    try {
      // 1. Fetch Customers
      const customersRef = collection(db, 'customers')
      let custData: Customer[] = []

      if (user.role === 'admin') {
        const qCust = query(
          customersRef,
          where('centerId', '==', centerId),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(qCust)
        custData = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]
      } else {
        const trainerFilterId = selectedTrainerId || user.uid
        // Own customers (as primary trainer)
        const qOwn = query(
          customersRef,
          where('centerId', '==', centerId),
          where('trainerId', '==', trainerFilterId),
          orderBy('createdAt', 'desc')
        )
        const ownSnap = await getDocs(qOwn)
        const ownMap = new Map<string, Customer>()
        ownSnap.docs.forEach(d => ownMap.set(d.id, { id: d.id, ...d.data() } as Customer))

        // Also include customers from contracts where this trainer is secondaryTrainerId
        // (needed so substitute/secondary trainers can log lessons for other trainers' students)
        const qSecondary = query(
          collection(db, 'contracts'),
          where('centerId', '==', centerId),
          where('secondaryTrainerId', '==', trainerFilterId)
        )
        const secondarySnap = await getDocs(qSecondary)
        const extraCustomerIds = new Set<string>()
        secondarySnap.docs.forEach(d => {
          const data = d.data()
          ;(data.customerIds || [data.customerId]).filter(Boolean).forEach((id: string) => {
            if (!ownMap.has(id)) extraCustomerIds.add(id)
          })
        })

        // Fetch extra customers by ID (in batches of 10 per Firestore 'in' limit)
        const extraIds = Array.from(extraCustomerIds)
        for (let i = 0; i < extraIds.length; i += 10) {
          const batch = extraIds.slice(i, i + 10)
          const qExtra = query(
            customersRef,
            where('centerId', '==', centerId),
            where('__name__', 'in', batch)
          )
          const extraSnap = await getDocs(qExtra)
          extraSnap.docs.forEach(d => {
            if (!ownMap.has(d.id)) ownMap.set(d.id, { id: d.id, ...d.data() } as Customer)
          })
        }

        custData = Array.from(ownMap.values())
      }

      setCustomers(custData)

      // 2. Fetch Contracts
      const contractsRef = collection(db, 'contracts')
      let qCont
      if (user.role === 'admin') {
        qCont = query(contractsRef, where('centerId', '==', centerId))
      } else {
        const trainerFilterId = selectedTrainerId || user.uid
        qCont = query(
          contractsRef,
          where('centerId', '==', centerId),
          where('trainerId', '==', trainerFilterId)
        )
      }

      const contSnapshot = await getDocs(qCont)
      const contData = contSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Contract[]

      // Data integrity check: for each contract, remain classes number should not exceed total classes number
      const fixedContData = await Promise.all(
        contData.map(async (c) => {
          if (c.remainingSessions > c.totalSessions) {
            console.warn(`Contract ${c.id} has remainingSessions (${c.remainingSessions}) > totalSessions (${c.totalSessions}). Fixing...`)
            try {
              const contractDocRef = doc(db, 'contracts', c.id)
              await updateDoc(contractDocRef, {
                remainingSessions: c.totalSessions,
                updatedAt: serverTimestamp(),
              })
              return {
                ...c,
                remainingSessions: c.totalSessions,
              }
            } catch (err) {
              console.error(`Failed to automatically repair contract ${c.id}:`, err)
              return c
            }
          }
          return c
        })
      )

      setContracts(fixedContData)
    } catch (err: any) {
      console.error('Error fetching customers/contracts:', err)
      setError(err.message || '無法載入資料')
    } finally {
      setLoading(false)
    }
  }, [user, centerId, selectedTrainerId])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // --- Real-time Stats Computations ---
  const activeContractsCount = useMemo(() => {
    return contracts.filter(c => c.status === 'active' || c.status === 'expiring').length
  }, [contracts])

  const expiringContractsCount = useMemo(() => {
    const now = new Date()
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(now.getDate() + 30)

    return contracts.filter(c => {
      if (c.status !== 'active' && c.status !== 'expiring' && c.status !== 'expired') return false
      if (!c.endDate) return false
      const end = c.endDate.toDate()
      // Expired or expiring within next 30 days
      return end <= thirtyDaysFromNow
    }).length
  }, [contracts])

  const thisMonthBirthdaysCount = useMemo(() => {
    const currentMonth = new Date().getMonth() // 0-11
    return customers.filter(customer => {
      if (!customer.dateOfBirth) return false
      const dob = customer.dateOfBirth.toDate()
      return dob.getMonth() === currentMonth
    }).length
  }, [customers])

  // ─── Customer Profile Actions ───────────────────────────────
  
  const createCustomerProfile = async (data: CustomerFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const newCustomer = {
      ...data,
      dateOfBirth: Timestamp.fromDate(data.dateOfBirth),
      trainerId: selectedTrainerId || user.uid,
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, 'customers'), newCustomer)
    await fetchAllData()
    return docRef.id
  }

  const updateCustomerProfile = async (id: string, data: CustomerFormValues) => {
    const customerRef = doc(db, 'customers', id)
    // Strip any fields that don't belong on the customer document
    // (contract, partnerMode, partnerId, partnerCustomerData may leak in from the combined form)
    const { contract, partnerMode, partnerId, partnerCustomerData, ...profileData } = data as any
    void contract; void partnerMode; void partnerId; void partnerCustomerData
    const updateData = {
      ...profileData,
      dateOfBirth: Timestamp.fromDate(data.dateOfBirth),
      updatedAt: serverTimestamp(),
    }
    await updateDoc(customerRef, updateData)
    await fetchAllData()
  }

  // ─── Contract Actions ───────────────────────────────────────

  const createContract = async (customerId: string, data: ContractFormValues) => {
    if (!user) throw new Error('Not authenticated')

    console.log('Creating contract for customer:', customerId, data)

    const ensureDate = (d: any) => {
      if (d instanceof Date) return d
      if (d?.toDate && typeof d.toDate === 'function') return d.toDate()
      if (typeof d === 'string') return new Date(d)
      return new Date()
    }

    let finalPartnerId = data.sharedWithCustomerId || null
    if (data.partnerMode === 'new' && data.partnerCustomerData) {
      console.log('Contract Renewal: Creating partner customer B profile...')
      const partnerCustomer = {
        ...data.partnerCustomerData,
        dateOfBirth: Timestamp.fromDate(new Date(data.partnerCustomerData.dateOfBirth)),
        trainerId: selectedTrainerId || user.uid,
        centerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const partnerDoc = await addDoc(collection(db, 'customers'), partnerCustomer)
      finalPartnerId = partnerDoc.id
    } else if (data.partnerMode === 'existing' && data.partnerId) {
      finalPartnerId = data.partnerId
    }

    const isDual = data.contractType === 'dual' || !!finalPartnerId
    const partnerId = finalPartnerId
    const customerIds = isDual 
      ? [customerId, partnerId].filter((id): id is string => !!id)
      : [customerId]

    const cleanData = { ...data }
    delete (cleanData as any).partnerMode
    delete (cleanData as any).partnerId
    delete (cleanData as any).partnerCustomerData

    // ── Generate contract number (ROC date + daily sequence) ──
    const today = new Date()
    const allContractsSnap = await getDocs(
      query(collection(db, 'contracts'), where('centerId', '==', centerId))
    )
    const existingNos = allContractsSnap.docs
      .map(d => d.data().contractNo as string)
      .filter(Boolean)
    const seq = nextDailySequence(today, existingNos)
    const contractNo = generateContractNo(today, seq)

    const newContract = {
      ...cleanData,
      contractNo,
      customerId,
      sharedWithCustomerId: partnerId,
      customerIds,
      contractType: isDual ? 'dual' : 'single',
      primaryCustomerId: customerId,
      startDate: Timestamp.fromDate(ensureDate(data.startDate)),
      endDate: Timestamp.fromDate(ensureDate(data.endDate)),
      installments: (data.installments || []).map(ins => ({
        ...ins,
        dueDate: Timestamp.fromDate(ensureDate(ins.dueDate)),
        paidDate: ins.paidDate ? Timestamp.fromDate(ensureDate(ins.paidDate)) : null,
      })),
      trainerId: data.trainerId || user.uid,
      secondaryTrainerId: data.secondaryTrainerId || null,
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, 'contracts'), newContract)
    console.log('Contract created with ID:', docRef.id)

    // Sync Customer A's trainer
    if (data.trainerId) {
      try {
        await updateDoc(doc(db, 'customers', customerId), {
          trainerId: data.trainerId,
          updatedAt: serverTimestamp()
        })
      } catch (err) {
        console.error('Failed to sync Customer A trainer:', err)
      }
    }

    // Sync Customer B's trainer if dual
    if (isDual && partnerId) {
      const syncTrainerId = data.secondaryTrainerId || data.trainerId || selectedTrainerId || user.uid
      try {
        await updateDoc(doc(db, 'customers', partnerId), {
          trainerId: syncTrainerId,
          updatedAt: serverTimestamp()
        })
      } catch (err) {
        console.error('Failed to sync Customer B trainer:', err)
      }
    }

    await fetchAllData()
    return docRef.id
  }

  const fetchCustomerContracts = async (customerId: string) => {
    console.log('Fetching contracts for customer:', customerId)
    const contractsRef = collection(db, 'contracts')
    
    const q1 = query(contractsRef, where('centerId', '==', centerId), where('customerIds', 'array-contains', customerId))
    const q2 = query(contractsRef, where('centerId', '==', centerId), where('customerId', '==', customerId))
    const q3 = query(contractsRef, where('centerId', '==', centerId), where('sharedWithCustomerId', '==', customerId))
    
    const [snap1, snap2, snap3] = await Promise.all([
      getDocs(q1),
      getDocs(q2),
      getDocs(q3)
    ])
    
    const resultMap = new Map<string, any>()
    const addDocs = (snap: any) => {
      snap.docs.forEach((doc: any) => {
        resultMap.set(doc.id, { id: doc.id, ...doc.data() })
      })
    }
    
    addDocs(snap1)
    addDocs(snap2)
    addDocs(snap3)
    
    const results = Array.from(resultMap.values()).sort((a: any, b: any) => {
      const timeA = a.createdAt?.toMillis?.() || 0
      const timeB = b.createdAt?.toMillis?.() || 0
      return timeB - timeA
    }) as Contract[]
    
    console.log('Found contracts:', results.length)
    return results
  }

  // ─── Combined Flows (Onboarding) ───────────────────────────

  const onboardNewCustomer = async (data: CombinedCustomerContractValues) => {
    if (!user) throw new Error('Not authenticated')

    try {
      // Create partner customer if partnerMode is 'new'
      let finalPartnerId: string | null = null
      if (data.partnerMode === 'new' && data.partnerCustomerData) {
        console.log('Onboarding: Creating partner customer B profile...')
        const partnerCustomer = {
          ...data.partnerCustomerData,
          dateOfBirth: Timestamp.fromDate(new Date(data.partnerCustomerData.dateOfBirth)),
          trainerId: data.contract?.secondaryTrainerId || data.contract?.trainerId || selectedTrainerId || user.uid,
          centerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        const partnerDoc = await addDoc(collection(db, 'customers'), partnerCustomer)
        finalPartnerId = partnerDoc.id
      } else if (data.partnerMode === 'existing' && data.partnerId) {
        finalPartnerId = data.partnerId
      }

      // 1. Create Profile
      const customerData = { ...data }
      delete (customerData as any).contract
      delete (customerData as any).partnerMode
      delete (customerData as any).partnerId
      delete (customerData as any).partnerCustomerData
      delete (customerData as any).bindExistingContractMode
      delete (customerData as any).existingContractId

      let finalTrainerId = selectedTrainerId || user.uid
      let existingContractData: any = null

      if (data.bindExistingContractMode && data.existingContractId) {
        console.log('Onboarding: Binding to existing contract:', data.existingContractId)
        const contractSnap = await getDoc(doc(db, 'contracts', data.existingContractId))
        if (contractSnap.exists()) {
          existingContractData = contractSnap.data()
          if (existingContractData.trainerId) {
            finalTrainerId = existingContractData.trainerId
          }
        }
      } else if (data.contract?.trainerId) {
        finalTrainerId = data.contract.trainerId
      }

      const newCustomer = {
        ...customerData,
        dateOfBirth: Timestamp.fromDate(data.dateOfBirth),
        trainerId: finalTrainerId,
        centerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const customerDoc = await addDoc(collection(db, 'customers'), newCustomer)
      const customerId = customerDoc.id

      // 2. Create or Update Contract
      if (data.bindExistingContractMode && data.existingContractId && existingContractData) {
        console.log('Onboarding: Linking new customer to existing contract...')
        const existingContractRef = doc(db, 'contracts', data.existingContractId)
        
        const currentCustomerIds = existingContractData.customerIds || []
        const updatedCustomerIds = Array.from(new Set([...currentCustomerIds, customerId]))
        
        // Use the selected secondaryTrainerId for the new (second) customer
        const secondaryTrainerId = data.contract?.secondaryTrainerId || existingContractData.trainerId || selectedTrainerId || user.uid

        const contractUpdate: any = {
          contractType: 'dual',
          customerIds: updatedCustomerIds,
          sharedWithCustomerId: customerId,
          secondaryTrainerId,
          updatedAt: serverTimestamp(),
        }

        if (data.contract?.secondarySignatureDataUrl) {
          contractUpdate.secondarySignatureDataUrl = data.contract.secondarySignatureDataUrl
        }
        
        await updateDoc(existingContractRef, contractUpdate)

        // Sync the new customer's trainerId to the selected secondary trainer
        try {
          await updateDoc(doc(db, 'customers', customerId), {
            trainerId: secondaryTrainerId,
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.error('Failed to sync new customer trainer:', err)
        }

        console.log('Onboarding: Existing contract updated successfully.')
      } else {
        const totalSessions = Number(data.contract?.totalSessions || 0)
        if (data.contract && totalSessions > 0) {
          console.log('Onboarding: Creating initial contract...')
          const contractData = {
            ...data.contract,
            sharedWithCustomerId: finalPartnerId,
            contractType: finalPartnerId ? 'dual' as const : 'single' as const,
            customerIds: finalPartnerId ? [customerId, finalPartnerId] : [customerId],
          }
          await createContract(customerId, contractData as any)
        } else {
          console.log('Onboarding: No contract sessions provided, skipping contract creation.')
        }
      }

      // 3. Final refresh
      await fetchAllData()
      return customerId
    } catch (err) {
      console.error('Error in onboarding flow:', err)
      throw err
    }
  }

  const deleteCustomer = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'customers', id))
      await fetchAllData()
    } catch (err: any) {
      console.error('Error deleting customer:', err)
      throw err
    }
  }

  return {
    customers,
    contracts,
    loading,
    error,
    activeContractsCount,
    expiringContractsCount,
    thisMonthBirthdaysCount,
    createCustomerProfile,
    updateCustomerProfile,
    createContract,
    fetchCustomerContracts,
    onboardNewCustomer,
    deleteCustomer,
    refresh: fetchAllData,
  }
}
