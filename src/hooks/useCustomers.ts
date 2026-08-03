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
import { generateContractNo, nextDailySequence } from '../lib/contractNo'
import { logActivity } from '../lib/activityLogger'
import { ensureDate } from '../lib/utils'

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

      // 1. Fetch Customers in current center
      const qCust = query(
        customersRef,
        where('centerId', '==', centerId),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(qCust)
      custData = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[]

      setCustomers(custData)

      // 2. Fetch Contracts in current center
      const contractsRef = collection(db, 'contracts')
      const qCont = query(contractsRef, where('centerId', '==', centerId))

      const contSnapshot = await getDocs(qCont)
      const contData = contSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Contract[]

      // Data integrity check & auto-repair for group contracts and session caps
      const fixedContData = await Promise.all(
        contData.map(async (c) => {
          let isRepaired = false
          const updates: any = {}

          // Auto repair 1: Group contract type and customerIds restoration
          const quotaKeys = c.groupMemberQuotas ? Object.keys(c.groupMemberQuotas) : []
          if (quotaKeys.length > 0 || c.contractType === 'group') {
            if (c.contractType !== 'group') {
              updates.contractType = 'group'
              c.contractType = 'group'
              isRepaired = true
            }
            const fullCustomerIds = Array.from(new Set([...(c.customerIds || []), ...quotaKeys, c.customerId].filter(Boolean)))
            const currentSorted = [...(c.customerIds || [])].sort().join(',')
            const fullSorted = [...fullCustomerIds].sort().join(',')
            if (currentSorted !== fullSorted) {
              updates.customerIds = fullCustomerIds
              c.customerIds = fullCustomerIds
              isRepaired = true
            }
          }

          // Auto repair 1.5: Dual contract type and customerIds restoration
          const isDualContract = c.contractType === 'dual' || !!c.sharedWithCustomerId
          if (isDualContract) {
            if (c.contractType !== 'dual') {
              updates.contractType = 'dual'
              c.contractType = 'dual'
              isRepaired = true
            }
            const dualCustomerIds = Array.from(new Set([...(c.customerIds || []), c.customerId, (c as any).primaryCustomerId, c.sharedWithCustomerId].filter((id): id is string => !!id)))
            const currentSorted = [...(c.customerIds || [])].sort().join(',')
            const fullSorted = [...dualCustomerIds].sort().join(',')
            if (currentSorted !== fullSorted) {
              updates.customerIds = dualCustomerIds
              c.customerIds = dualCustomerIds
              isRepaired = true
            }
          }

          // Auto repair 2: remainingSessions cap check & repair for pending contracts
          if (c.contractType !== 'group') {
            if (c.totalSessions > 0 && (c.remainingSessions === undefined || c.remainingSessions === null || (c.status === 'pending_signature' && c.remainingSessions === 0))) {
              updates.remainingSessions = c.totalSessions
              c.remainingSessions = c.totalSessions
              isRepaired = true
            } else if (c.remainingSessions > c.totalSessions) {
              console.warn(`Contract ${c.id} has remainingSessions (${c.remainingSessions}) > totalSessions (${c.totalSessions}). Fixing...`)
              updates.remainingSessions = c.totalSessions
              c.remainingSessions = c.totalSessions
              isRepaired = true
            }
          }

          // Auto repair 3: Check if contract is unsigned (Single/Group needs primary signature, Dual needs both signatures)
          const isUnsigned = c.status === 'pending_signature' || !c.signatureDataUrl || (isDualContract && !c.secondarySignatureDataUrl)

          // Auto repair 4: If contract is missing required signature(s), ensure status is 'pending_signature' (unless cancelled)
          if (isUnsigned && c.status !== 'pending_signature' && c.status !== 'cancelled') {
            console.log(`Contract ${c.id} is missing required signature(s). Restoring status to pending_signature...`)
            updates.status = 'pending_signature'
            c.status = 'pending_signature'
            isRepaired = true
          }

          if (!isUnsigned && c.remainingSessions <= 0 && c.status !== 'completed' && c.status !== 'cancelled') {
            console.log(`Contract ${c.id} has remainingSessions <= 0 and is fully signed. Syncing status to completed...`)
            updates.status = 'completed'
            c.status = 'completed'
            isRepaired = true
          }

          // Auto repair 5: Sync group contract totalSessions vs member quotas sum
          if (c.contractType === 'group' && c.groupMemberQuotas) {
            const memberKeys = Object.keys(c.groupMemberQuotas)
            if (memberKeys.length > 0) {
              const quotaSum = memberKeys.reduce((sum, key) => sum + (c.groupMemberQuotas![key].totalSessions || 0), 0)
              if (quotaSum > 0 && c.totalSessions !== quotaSum) {
                console.log(`Group contract ${c.id} totalSessions (${c.totalSessions}) !== quotaSum (${quotaSum}). Auto syncing totalSessions to ${quotaSum}...`)
                updates.totalSessions = quotaSum
                c.totalSessions = quotaSum
                const newPricePerSession = Math.round(c.totalAmount / quotaSum)
                updates.pricePerSession = newPricePerSession
                c.pricePerSession = newPricePerSession
                isRepaired = true
              }
            }
          }

          if (isRepaired) {
            try {
              const contractDocRef = doc(db, 'contracts', c.id)
              await updateDoc(contractDocRef, {
                ...updates,
                updatedAt: serverTimestamp(),
              })
            } catch (err) {
              console.error(`Failed to automatically repair contract ${c.id}:`, err)
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

  const logCustomerActivity = async (action: 'create' | 'update' | 'delete', recordId: string, clientName: string, newValue?: any, previousValue?: any) => {
    if (!user) return
    try {
      const activeTrainerId = selectedTrainerId || user.uid
      const trainerSnap = await getDoc(doc(db, 'trainers', activeTrainerId))
      const trainerName = trainerSnap.exists() ? trainerSnap.data().name : (user.displayName || '教練')

      await logActivity({
        centerId: centerId as any,
        trainerId: activeTrainerId,
        trainerName,
        action,
        module: 'customers',
        recordId,
        recordSummary: `${action === 'create' ? '新增' : action === 'update' ? '編輯' : '刪除'}學員: ${clientName}`,
        newValue,
        previousValue
      })
    } catch (err) {
      console.error('Failed to log customer activity:', err)
    }
  }

  // ─── Customer Profile Actions ───────────────────────────────
  
  const createCustomerProfile = async (data: CustomerFormValues) => {
    if (!user) throw new Error('Not authenticated')

    const newCustomer = {
      ...data,
      dateOfBirth: Timestamp.fromDate(ensureDate(data.dateOfBirth)),
      trainerId: selectedTrainerId || user.uid,
      centerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, 'customers'), newCustomer)
    await logCustomerActivity('create', docRef.id, data.name, newCustomer)
    await fetchAllData()
    return docRef.id
  }

  const updateCustomerProfile = async (id: string, data: CustomerFormValues) => {
    const customerRef = doc(db, 'customers', id)
    const oldSnap = await getDoc(customerRef)
    const oldData = oldSnap.exists() ? oldSnap.data() : null

    // Strip any fields that don't belong on the customer document
    // (contract, partnerMode, partnerId, partnerCustomerData may leak in from the combined form)
    const { contract, partnerMode, partnerId, partnerCustomerData, ...profileData } = data as any
    void contract; void partnerMode; void partnerId; void partnerCustomerData
    const updateData = {
      ...profileData,
      dateOfBirth: Timestamp.fromDate(ensureDate(data.dateOfBirth)),
      updatedAt: serverTimestamp(),
    }
    await updateDoc(customerRef, updateData)
    await logCustomerActivity('update', id, data.name, updateData, oldData)
    await fetchAllData()
  }

  // ─── Contract Actions ───────────────────────────────────────

  const createContract = async (customerId: string, data: ContractFormValues) => {
    if (!user) throw new Error('Not authenticated')

    if (data.bindExistingContractMode && data.existingContractId) {
      console.log('Contract Renewal: Binding existing contract:', data.existingContractId)
      const existingContractRef = doc(db, 'contracts', data.existingContractId)
      const contractSnap = await getDoc(existingContractRef)
      if (contractSnap.exists()) {
        const existingContractData = contractSnap.data()
        const isGroup = existingContractData.contractType === 'group'
        const isShared = existingContractData.contractType === 'shared' || updatedCustomerIds.length > 2
        const primaryCustId = existingContractData.customerId || existingContractData.primaryCustomerId
        const currentCustomerIds = existingContractData.customerIds || (primaryCustId ? [primaryCustId] : [])
        const updatedCustomerIds = Array.from(new Set([primaryCustId, ...currentCustomerIds, customerId].filter(Boolean)))

        const secondaryTrainerId = data.secondaryTrainerId || existingContractData.trainerId || selectedTrainerId || user.uid

        const contractUpdate: any = {
          customerIds: updatedCustomerIds,
          updatedAt: serverTimestamp(),
        }

        if (isGroup) {
          contractUpdate.contractType = 'group'
          const existingQuotas = { ...(existingContractData.groupMemberQuotas || {}) }
          const targetCust = customers.find(c => c.id === customerId)
          existingQuotas[customerId] = {
            customerId,
            customerName: targetCust?.name || '學員',
            totalSessions: 0,
            remainingSessions: 0,
          }
          contractUpdate.groupMemberQuotas = existingQuotas
          contractUpdate.status = 'pending_signature'
        } else if (isShared || existingContractData.contractType === 'shared') {
          contractUpdate.contractType = 'shared'
          contractUpdate.secondaryTrainerId = secondaryTrainerId
          if (data.secondarySignatureDataUrl) {
            contractUpdate.secondarySignatureDataUrl = data.secondarySignatureDataUrl
          }
        } else {
          contractUpdate.contractType = 'dual'
          contractUpdate.sharedWithCustomerId = customerId
          contractUpdate.secondaryTrainerId = secondaryTrainerId
          contractUpdate.coachRatio = 2
          if (data.secondarySignatureDataUrl) {
            contractUpdate.secondarySignatureDataUrl = data.secondarySignatureDataUrl
          }
        }

        await updateDoc(existingContractRef, contractUpdate)
        
        try {
          await updateDoc(doc(db, 'customers', customerId), {
            trainerId: secondaryTrainerId,
            updatedAt: serverTimestamp(),
          })
        } catch (err) {
          console.error('Failed to sync customer trainer:', err)
        }

        await fetchAllData()
        return data.existingContractId
      }
    }

    let finalPartnerId = data.sharedWithCustomerId || null
    if (data.partnerMode === 'new' && data.partnerCustomerData) {
      console.log('Contract Renewal: Creating partner customer B profile...')
      const partnerCustomer = {
        ...data.partnerCustomerData,
        dateOfBirth: Timestamp.fromDate(ensureDate(data.partnerCustomerData.dateOfBirth)),
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

    const isGroup = data.contractType === 'group'
    const isShared = data.contractType === 'shared'
    const isDual = !isGroup && !isShared && (data.contractType === 'dual' || !!finalPartnerId)
    const partnerId = finalPartnerId

    let customerIds: string[]
    if (isGroup || isShared) {
      customerIds = Array.from(new Set([customerId, ...(data.customerIds || [])]))
    } else if (isDual) {
      customerIds = Array.from(new Set([customerId, partnerId].filter((id): id is string => !!id)))
    } else {
      customerIds = [customerId]
    }

    const contractType = isShared ? 'shared' : (isGroup ? 'group' : (isDual ? 'dual' : 'single'))
    
    const cleanData = { ...data }
    delete (cleanData as any).partnerMode
    delete (cleanData as any).partnerId
    delete (cleanData as any).partnerCustomerData

    const totSessions = Number(cleanData.totalSessions) || 0
    const remSessions = typeof cleanData.remainingSessions === 'number' && cleanData.remainingSessions > 0
      ? cleanData.remainingSessions
      : totSessions

    const isUnsignedContract = !cleanData.signatureDataUrl || (isDual && !cleanData.secondarySignatureDataUrl)
    const status = isUnsignedContract ? 'pending_signature' : (data.status || 'active')

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
      contractType,
      coachRatio: isGroup ? (Object.keys((cleanData as any).groupMemberQuotas || {}).length || 3) : (isDual ? 2 : 1),
      status,
      totalSessions: totSessions,
      remainingSessions: remSessions,
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
          dateOfBirth: Timestamp.fromDate(ensureDate(data.partnerCustomerData.dateOfBirth)),
          trainerId: data.contract?.secondaryTrainerId || data.contract?.trainerId || selectedTrainerId || user.uid,
          centerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
        const partnerDoc = await addDoc(collection(db, 'customers'), partnerCustomer)
        finalPartnerId = partnerDoc.id
        await logCustomerActivity('create', partnerDoc.id, data.partnerCustomerData.name, partnerCustomer)
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
        dateOfBirth: Timestamp.fromDate(ensureDate(data.dateOfBirth)),
        trainerId: finalTrainerId,
        centerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const customerDoc = await addDoc(collection(db, 'customers'), newCustomer)
      const customerId = customerDoc.id
      await logCustomerActivity('create', customerId, data.name, newCustomer)

      // 2. Create or Update Contract
      if (data.bindExistingContractMode && data.existingContractId && existingContractData) {
        console.log('Onboarding: Linking new customer to existing contract...')
        const existingContractRef = doc(db, 'contracts', data.existingContractId)
        
        const isGroup = existingContractData.contractType === 'group'
        const primaryCustId = existingContractData.customerId || existingContractData.primaryCustomerId
        const currentCustomerIds = existingContractData.customerIds || (primaryCustId ? [primaryCustId] : [])
        const updatedCustomerIds = Array.from(new Set([primaryCustId, ...currentCustomerIds, customerId].filter(Boolean)))
        
        // Use the selected secondaryTrainerId for the new (second) customer
        const secondaryTrainerId = data.contract?.secondaryTrainerId || existingContractData.trainerId || selectedTrainerId || user.uid

        const contractUpdate: any = {
          customerIds: updatedCustomerIds,
          updatedAt: serverTimestamp(),
        }

        if (isGroup) {
          contractUpdate.contractType = 'group'
          const existingQuotas = { ...(existingContractData.groupMemberQuotas || {}) }
          existingQuotas[customerId] = {
            customerId,
            customerName: data.name,
            totalSessions: 0,
            remainingSessions: 0,
          }
          contractUpdate.groupMemberQuotas = existingQuotas
          contractUpdate.status = 'pending_signature'
        } else {
          contractUpdate.contractType = 'dual'
          contractUpdate.sharedWithCustomerId = customerId
          contractUpdate.secondaryTrainerId = secondaryTrainerId
          contractUpdate.coachRatio = 2
          if (data.contract?.secondarySignatureDataUrl) {
            contractUpdate.secondarySignatureDataUrl = data.contract.secondarySignatureDataUrl
          }
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
          const isGroup = data.contract.contractType === 'group'
          const isDual = !isGroup && !!finalPartnerId
          
          let customerIds: string[]
          if (isGroup) {
            customerIds = data.contract.customerIds || [customerId]
            if (!customerIds.includes(customerId)) {
              customerIds.unshift(customerId)
            }
            if (data.contract.groupMemberQuotas) {
              const primaryQuota = (data as any)._primaryMemberQuota || Math.floor(totalSessions / customerIds.length)
              data.contract.groupMemberQuotas[customerId] = {
                customerId,
                customerName: data.name,
                totalSessions: primaryQuota,
                remainingSessions: primaryQuota,
              }
            }
          } else if (isDual) {
            customerIds = [customerId, finalPartnerId!]
          } else {
            customerIds = [customerId]
          }

          const contractData = {
            ...data.contract,
            sharedWithCustomerId: finalPartnerId,
            contractType: isGroup ? ('group' as const) : (isDual ? ('dual' as const) : ('single' as const)),
            customerIds,
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
      const oldSnap = await getDoc(doc(db, 'customers', id))
      const oldData = oldSnap.exists() ? (oldSnap.data() as Customer) : null
      const clientName = oldData?.name || '未知學員'

      // 1. Find all contracts linked to this customer (including group contracts via customerIds)
      const contractsRef = collection(db, 'contracts')
      const [snap1, snap2, snap3, snap4] = await Promise.all([
        getDocs(query(contractsRef, where('customerId', '==', id))),
        getDocs(query(contractsRef, where('sharedWithCustomerId', '==', id))),
        getDocs(query(contractsRef, where('partnerId', '==', id))),
        getDocs(query(contractsRef, where('customerIds', 'array-contains', id))),
      ])

      const linkedContractDocsMap = new Map<string, any>()
      snap1.docs.forEach((d) => linkedContractDocsMap.set(d.id, d))
      snap2.docs.forEach((d) => linkedContractDocsMap.set(d.id, d))
      snap3.docs.forEach((d) => linkedContractDocsMap.set(d.id, d))
      snap4.docs.forEach((d) => linkedContractDocsMap.set(d.id, d))

      let deletedContractsCount = 0
      let convertedDualContractsCount = 0
      let updatedGroupContractsCount = 0

      // 2. Process each linked contract
      for (const [contractId, docSnap] of linkedContractDocsMap.entries()) {
        const cData = docSnap.data() as Contract
        const contractRef = doc(db, 'contracts', contractId)

        // Case A: Group Contract
        if (cData.contractType === 'group') {
          const currentCustomerIds = cData.customerIds || []
          const remainingMemberIds = currentCustomerIds.filter((cid) => cid !== id)

          if (remainingMemberIds.length > 0) {
            // Unbind target customer from group contract while preserving remaining members
            const updatedQuotas = { ...(cData.groupMemberQuotas || {}) }
            const removedQuota = updatedQuotas[id]
            delete updatedQuotas[id]

            // Calculate new total and remaining sessions for the contract
            const newTotalSessions = Math.max(0, (cData.totalSessions || 0) - (removedQuota?.totalSessions || 0))
            const newRemainingSessions = Math.max(0, (cData.remainingSessions || 0) - (removedQuota?.remainingSessions || 0))

            // If deleted customer was primary customerId, transfer primary role to first remaining member
            const newPrimaryId = cData.customerId === id ? remainingMemberIds[0] : cData.customerId

            await updateDoc(contractRef, {
              customerId: newPrimaryId,
              customerIds: remainingMemberIds,
              groupMemberQuotas: updatedQuotas,
              totalSessions: newTotalSessions,
              remainingSessions: newRemainingSessions,
              updatedAt: serverTimestamp(),
            })
            updatedGroupContractsCount++
          } else {
            // No remaining members left: Delete contract
            await deleteDoc(contractRef)
            deletedContractsCount++
          }
        }
        // Case B: Dual Contract
        else if (cData.contractType === 'dual' || Boolean(cData.sharedWithCustomerId) || Boolean(cData.partnerId)) {
          let partnerCustomerId: string | null = null
          if (cData.customerId !== id && cData.customerId) {
            partnerCustomerId = cData.customerId
          } else if (cData.sharedWithCustomerId && cData.sharedWithCustomerId !== id) {
            partnerCustomerId = cData.sharedWithCustomerId
          } else if (cData.partnerId && cData.partnerId !== id) {
            partnerCustomerId = cData.partnerId
          } else if (cData.customerIds && Array.isArray(cData.customerIds)) {
            partnerCustomerId = cData.customerIds.find((cid) => cid !== id) || null
          }

          if (partnerCustomerId) {
            await updateDoc(contractRef, {
              customerId: partnerCustomerId,
              primaryCustomerId: partnerCustomerId,
              contractType: 'single',
              partnerMode: 'none',
              partnerId: null,
              sharedWithCustomerId: null,
              partnerCustomerData: null,
              secondaryTrainerId: null,
              secondarySignatureDataUrl: null,
              customerIds: [partnerCustomerId],
              updatedAt: serverTimestamp(),
            })
            convertedDualContractsCount++
          } else {
            await deleteDoc(contractRef)
            deletedContractsCount++
          }
        }
        // Case C: Single Contract
        else {
          await deleteDoc(contractRef)
          deletedContractsCount++
        }
      }

      // 3. Clean up any customer profiles referring to this customer as partner
      const customersRef = collection(db, 'customers')
      const [pSnap1, pSnap2] = await Promise.all([
        getDocs(query(customersRef, where('partnerId', '==', id))),
        getDocs(query(customersRef, where('sharedWithCustomerId', '==', id))),
      ])
      const partnerCustDocsMap = new Map<string, any>()
      pSnap1.docs.forEach((d) => partnerCustDocsMap.set(d.id, d))
      pSnap2.docs.forEach((d) => partnerCustDocsMap.set(d.id, d))

      for (const [custDocId] of partnerCustDocsMap.entries()) {
        await updateDoc(doc(db, 'customers', custDocId), {
          partnerId: null,
          sharedWithCustomerId: null,
          updatedAt: serverTimestamp(),
        })
      }

      // 4. Delete the customer profile itself
      await deleteDoc(doc(db, 'customers', id))

      // 5. Log activity
      await logCustomerActivity('delete', id, clientName, undefined, {
        ...oldData,
        deletedContractsCount,
        convertedDualContractsCount,
      })

      // 6. Refresh data
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
