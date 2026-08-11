import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
// Handle default export mismatch in some build environments (Vite/ESM)
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import {
  RiUserLine,
  RiFileTextLine,
  RiHeartPulseLine,
  RiShieldCheckLine,
  RiCheckboxCircleFill,
  RiArrowRightSLine,
  RiArrowLeftSLine,
  RiUser3Line,
  RiGroupLine,
  RiLink,
  RiLinkM,
  RiCurrencyLine,
  RiBankCardLine,
  RiInformationLine,
  RiAlertLine,
  RiUserAddLine,
  RiUserSharedLine,
  RiArrowDownSLine,
  RiTeamLine,
} from '@remixicon/react'
import { collection, getDocs, query, where, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { combinedCustomerContractSchema, type CombinedCustomerContractValues } from '../../lib/validators'
import { cn } from '@/lib/utils'
import { MinguoDatePickerInput } from '../shared/MinguoDatePickerInput'
import { SearchableCustomerSelect } from '../shared/SearchableCustomerSelect'
import type { Customer, Contract } from '../../types'
import { useCenterStore } from '@/stores/centerStore'
function addOneYearToDateString(dateVal: string | Date): string {
  if (!dateVal) return ''
  let d: Date
  if (dateVal instanceof Date) {
    d = new Date(dateVal)
  } else if (typeof dateVal === 'string') {
    const parts = dateVal.split('-')
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      const day = parseInt(parts[2], 10)
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        d = new Date(year, month - 1, day)
      } else {
        d = new Date(dateVal)
      }
    } else {
      d = new Date(dateVal)
    }
  } else {
    d = new Date(dateVal as any)
  }
  if (isNaN(d.getTime())) return ''
  d.setFullYear(d.getFullYear() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

interface CustomerFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CombinedCustomerContractValues) => Promise<void>
  initialData?: Partial<CombinedCustomerContractValues>
  initialCustomer?: Customer | null
  isEditMode?: boolean
  customers?: Customer[]
  contracts?: Contract[]
}

const STEPS = [
  { id: 'basic', title: '基本資料', icon: RiUserLine, fields: ['name', 'phone', 'idNumber', 'dateOfBirth', 'emergencyContact.name', 'emergencyContact.relation', 'emergencyContact.phone'] },
  { id: 'medical', title: '健康狀態', icon: RiHeartPulseLine, fields: ['medicalHistory.chronicConditions', 'medicalHistory.injuries'] },
  { id: 'contract', title: '合約設定', icon: RiFileTextLine, fields: ['contract.totalSessions', 'contract.totalAmount', 'contract.startDate', 'contract.endDate'] },
  { id: 'signature', title: '簽署確認', icon: RiShieldCheckLine, fields: [] },
]

const formatCustomerInitialData = (cust: any): Partial<CombinedCustomerContractValues> => {
  if (!cust) return {}

  const ensureIsoString = (val: any) => {
    if (!val) return ''
    if (val instanceof Date) return isNaN(val.getTime()) ? '' : val.toISOString().split('T')[0]
    if (val?.toDate && typeof val.toDate === 'function') return val.toDate().toISOString().split('T')[0]
    if (typeof val === 'string') return val
    return ''
  }

  const dobStr = ensureIsoString(cust.dateOfBirth)
  const startDateStr = ensureIsoString(cust.contract?.startDate)
  const endDateStr = ensureIsoString(cust.contract?.endDate)

  return {
    name: cust.name || '',
    idNumber: cust.idNumber || '',
    phone: cust.phone || '',
    email: cust.email || '',
    dateOfBirth: dobStr || new Date().toISOString().split('T')[0],
    historicalSessions: cust.historicalSessions || 0,
    emergencyContact: cust.emergencyContact || { name: '', relation: '', phone: '' },
    medicalHistory: cust.medicalHistory || { chronicConditions: [], injuries: [], notes: '' },
    gender: cust.gender || 'female',
    exerciseHabit: cust.exerciseHabit || 'none',
    source: cust.source || 'instagram',
    sharedContractCustomerId: cust.sharedContractCustomerId || null,
    partnerMode: cust.partnerMode || 'none',
    partnerId: cust.partnerId || null,
    partnerCustomerData: cust.partnerCustomerData || null,
    bindExistingContractMode: cust.bindExistingContractMode || false,
    existingContractId: cust.existingContractId || null,
    contract: cust.contract ? {
      ...cust.contract,
      startDate: startDateStr || new Date().toISOString().split('T')[0],
      endDate: endDateStr || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    } : undefined
  }
}

export function CustomerFormModal({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  initialCustomer,
  isEditMode = false,
  customers = [],
  contracts = [],
}: CustomerFormModalProps) {
  const { centerId } = useCenterStore()
  const isCoffit = centerId === 'coffit'
  const brandName = isCoffit ? 'Coffit' : 'R27 Fitness'

  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const sigCanvas = useRef<SignatureCanvas>(null)
  const secondarySigCanvas = useRef<SignatureCanvas>(null)
  const [trainers, setTrainers] = useState<any[]>([])
  const [isOneToTwo, setIsOneToTwo] = useState(true)
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState<string>('')
  const [fetchedCustomers, setFetchedCustomers] = useState<Customer[]>([])
  const [fetchedContracts, setFetchedContracts] = useState<Contract[]>([])

  const activeCustomers = useMemo(() => customers.length > 0 ? customers : fetchedCustomers, [customers, fetchedCustomers])
  const activeContracts = useMemo(() => contracts.length > 0 ? contracts : fetchedContracts, [contracts, fetchedContracts])

  // Group & Shared Contract State
  const [groupMemberCount, setGroupMemberCount] = useState<number>(2)
  const [sharedMemberCount, setSharedMemberCount] = useState<number>(2)
  const [joiningStudentSessions, setJoiningStudentSessions] = useState<number>(10)
  const [additionalGroupMembers, setAdditionalGroupMembers] = useState<Array<{
    memberMode?: 'existing' | 'new'
    existingCustomerId?: string
    assignedTrainerId?: string
    name: string
    idNumber: string
    phone: string
    email: string
    dateOfBirth: string
    gender: 'female' | 'male' | 'other'
    exerciseHabit: 'none' | 'weekly_1_2' | 'weekly_3_plus'
    source: string
    emergencyContact: { name: string; relation: string; phone: string }
    medicalHistory: { chronicConditions: string[]; injuries: string[]; notes: string }
    allocatedSessions: number
  }>>([
    {
      memberMode: 'existing',
      existingCustomerId: '',
      name: '',
      idNumber: '',
      phone: '',
      email: '',
      dateOfBirth: new Date().toISOString().split('T')[0],
      gender: 'female',
      exerciseHabit: 'none',
      source: 'existing',
      emergencyContact: { name: '', relation: '', phone: '' },
      medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
      allocatedSessions: 0,
    }
  ])

  // Helper to sync additionalGroupMembers array length to target new student count
  const syncAdditionalMembersCount = (targetNewCount: number, totalSessions: number) => {
    setAdditionalGroupMembers(prev => {
      const current = [...prev]
      if (current.length < targetNewCount) {
        for (let i = current.length; i < targetNewCount; i++) {
          current.push({
            memberMode: 'existing',
            existingCustomerId: '',
            name: '',
            idNumber: '',
            phone: '',
            email: '',
            dateOfBirth: new Date().toISOString().split('T')[0],
            gender: 'female',
            exerciseHabit: 'none',
            source: 'existing',
            emergencyContact: { name: '', relation: '', phone: '' },
            medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
            allocatedSessions: 0,
          })
        }
      } else if (current.length > targetNewCount) {
        current.splice(targetNewCount)
      }
      return current
    })
  }

  const defaultValues = useMemo(() => ({
    name: '',
    idNumber: '',
    phone: '',
    email: '',
    dateOfBirth: new Date().toISOString().split('T')[0],
    historicalSessions: 0,
    emergencyContact: { name: '', relation: '', phone: '' },
    sharedContractCustomerId: null,
    medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
    partnerMode: 'none' as const,
    partnerId: null,
    partnerCustomerData: null,
    bindExistingContractMode: false,
    existingContractId: null,
    contract: {
      sharedWithCustomerId: null,
      trainerId: '',
      secondaryTrainerId: null,
      totalSessions: 0,
      remainingSessions: 0,
      pricePerSession: 0,
      totalAmount: 0,
      paidAmount: 0,
      installments: [
        {
          id: `inst-single-${Date.now()}`,
          amount: 0,
          dueDate: new Date().toISOString().split('T')[0],
          paidDate: new Date().toISOString().split('T')[0],
          status: 'paid' as const,
        }
      ],
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      status: 'active' as const,
      signatureDataUrl: null,
      secondarySignatureDataUrl: null,
      contractType: 'single' as const,
      isAgreed: false,
      paymentType: 'single' as const,
      installmentCount: 2,
    },
  }), [])

  const form = useForm<CombinedCustomerContractValues>({
    resolver: zodResolver(combinedCustomerContractSchema),
    mode: 'onChange',
    defaultValues: defaultValues as any,
  })

  const existingCustomerContracts = useMemo(() => {
    if (!selectedExistingCustomerId) return []
    return activeContracts.filter(c => 
      c.customerId === selectedExistingCustomerId || 
      c.customerIds?.includes(selectedExistingCustomerId)
    )
  }, [selectedExistingCustomerId, activeContracts])

  const selectedContract = useMemo(() => {
    const cid = form.watch('existingContractId')
    if (!cid) return null
    return activeContracts.find(c => c.id === cid) || null
  }, [form.watch('existingContractId'), activeContracts])

  const isSingleBinding = useMemo(() => {
    if (!form.watch('bindExistingContractMode') || !selectedContract) return false
    return selectedContract.contractType === 'single'
  }, [form.watch('bindExistingContractMode'), selectedContract])

  const isCustomerAlreadyInContract = (c: any) => {
    const custId = initialCustomer?.id || initialData?.id
    if (!custId || !c) return false
    return Boolean(
      c.customerId === custId ||
      (Array.isArray(c.customerIds) && c.customerIds.includes(custId)) ||
      c.sharedWithCustomerId === custId ||
      (c.groupMemberQuotas && Boolean(c.groupMemberQuotas[custId]))
    )
  }

  useEffect(() => {
    const fetchTrainersAndData = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'trainers'), where('centerId', '==', centerId)))
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setTrainers(list)
        if (list.length > 0 && !form.getValues('contract.trainerId')) {
          form.setValue('contract.trainerId', list[0].id)
        }

        if (customers.length === 0) {
          const custSnap = await getDocs(query(collection(db, 'customers'), where('centerId', '==', centerId)))
          setFetchedCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)))
        }

        if (contracts.length === 0) {
          const contractSnap = await getDocs(query(collection(db, 'contracts'), where('centerId', '==', centerId)))
          setFetchedContracts(contractSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contract)))
        }
      } catch (err) {
        console.error('Error fetching trainers/customers/contracts data:', err)
      }
    }
    if (open) {
      fetchTrainersAndData()
    }
  }, [open, form, centerId, customers.length, contracts.length])


  useEffect(() => {
    if (open) {
      const sourceData = initialData || initialCustomer
      if (sourceData) {
        const formattedData = formatCustomerInitialData(sourceData)
        form.reset({
          ...defaultValues,
          ...formattedData,
          contract: formattedData.contract ? {
            ...defaultValues.contract,
            ...formattedData.contract,
            trainerId: formattedData.contract.trainerId || (trainers[0]?.id || ''),
          } : {
            ...defaultValues.contract,
            trainerId: trainers[0]?.id || '',
          }
        } as any)
      } else {
        const resetVals = {
          ...defaultValues,
          contract: {
            ...defaultValues.contract,
            trainerId: trainers[0]?.id || '',
          }
        }
        form.reset(resetVals as any)
      }
      setCurrentStep(0)
      setIsOneToTwo(true)
    }
  }, [open, initialData, initialCustomer, form, trainers, defaultValues])

  const watchedValues = form.watch()

  const [primaryMemberQuota, setPrimaryMemberQuota] = useState<number>(0)

  const groupQuotaRemainder = useMemo(() => {
    const totalSess = Number(watchedValues.contract?.totalSessions) || 0
    if (groupMemberCount === 0 || totalSess === 0) return 0
    return totalSess % groupMemberCount
  }, [watchedValues.contract?.totalSessions, groupMemberCount])

  const groupQuotaSum = useMemo(() => {
    const additionalSum = additionalGroupMembers.reduce((acc, m) => acc + (Number(m.allocatedSessions) || 0), 0)
    return primaryMemberQuota + additionalSum
  }, [primaryMemberQuota, additionalGroupMembers])

  const partnerNameStr = useMemo(() => {
    const isBindMode = watchedValues.bindExistingContractMode
    if (isBindMode) {
      return activeCustomers.find(c => c.id === selectedExistingCustomerId)?.name || '原合約成員'
    }
    return watchedValues.partnerMode === 'existing'
      ? (activeCustomers.find(c => c.id === watchedValues.partnerId)?.name || '已選學員')
      : (watchedValues.partnerCustomerData?.name || '新學員')
  }, [watchedValues.bindExistingContractMode, watchedValues.partnerMode, watchedValues.partnerId, watchedValues.partnerCustomerData, selectedExistingCustomerId, activeCustomers])

  const displayAmount = useMemo(() => {
    return watchedValues.bindExistingContractMode
      ? selectedContract?.totalAmount 
      : watchedValues.contract?.totalAmount
  }, [watchedValues.bindExistingContractMode, selectedContract, watchedValues.contract?.totalAmount])

  const displaySessions = useMemo(() => {
    return watchedValues.bindExistingContractMode
      ? selectedContract?.totalSessions 
      : watchedValues.contract?.totalSessions
  }, [watchedValues.bindExistingContractMode, selectedContract, watchedValues.contract?.totalSessions])

  const activeSteps = useMemo(() => {
    if (isEditMode) return STEPS.slice(0, 2)

    const isGroupContract = (watchedValues.contract?.contractType === 'group' || watchedValues.contract?.contractType === 'shared') && !watchedValues.bindExistingContractMode
    const isFromExistingCustomer = !!initialCustomer || !!initialData?.name
    const dynamicSteps: Array<{ id: string; title: string; icon: any; fields: string[] }> = []

    // 1. Primary Member Steps (Only for Global New Customer entry)
    if (!isFromExistingCustomer) {
      dynamicSteps.push(
        { id: 'basic', title: '基本資料', icon: RiUserLine, fields: ['name', 'phone', 'idNumber', 'dateOfBirth', 'emergencyContact.name', 'emergencyContact.relation', 'emergencyContact.phone'] },
        { id: 'medical', title: '健康狀態', icon: RiHeartPulseLine, fields: ['medicalHistory.chronicConditions', 'medicalHistory.injuries'] }
      )
    }

    // 2. Contract Settings Step (User chooses single/dual/group & member count N here)
    const contractFields = ['contract.totalSessions', 'contract.totalAmount', 'contract.startDate', 'contract.endDate']
    if (watchedValues.contract?.contractType === 'dual' && watchedValues.partnerMode === 'existing') {
      contractFields.push('partnerId')
    }
    dynamicSteps.push({
      id: 'contract',
      title: watchedValues.contract?.contractType === 'group' ? '團體合約設定' : '合約設定',
      icon: RiFileTextLine,
      fields: contractFields
    })

    // 3. Dual Contract Partner Step (If 1-on-2 dual contract)
    if (watchedValues.partnerMode === 'new') {
      dynamicSteps.push(
        { 
          id: 'partner_basic', 
          title: '共享學員基本資料', 
          icon: RiUserLine, 
          fields: [
            'partnerCustomerData.name', 
            'partnerCustomerData.phone', 
            'partnerCustomerData.idNumber', 
            'partnerCustomerData.dateOfBirth', 
            'partnerCustomerData.emergencyContact.name', 
            'partnerCustomerData.emergencyContact.relation', 
            'partnerCustomerData.emergencyContact.phone'
          ] 
        },
        { 
          id: 'partner_medical', 
          title: '共享學員健康狀態', 
          icon: RiHeartPulseLine, 
          fields: [
            'partnerCustomerData.medicalHistory.chronicConditions', 
            'partnerCustomerData.medicalHistory.injuries'
          ] 
        }
      )
    }

    // 4. Group Contract Additional Members Steps (Only for NEW members)
    if (isGroupContract) {
      const effectiveCount = watchedValues.contract?.contractType === 'shared' ? sharedMemberCount : groupMemberCount
      for (let i = 2; i <= effectiveCount; i++) {
        const mData = additionalGroupMembers[i - 2]
        if (mData?.memberMode === 'new') {
          dynamicSteps.push(
            {
              id: `group_member_${i}_basic`,
              title: `學員 ${i} 基本資料`,
              icon: RiUserLine,
              fields: []
            },
            {
              id: `group_member_${i}_medical`,
              title: `學員 ${i} 健康狀態`,
              icon: RiHeartPulseLine,
              fields: []
            }
          )
        }
      }
    }

    // 5. Final Step: Signature
    dynamicSteps.push({ id: 'signature', title: '簽署確認', icon: RiShieldCheckLine, fields: [] })

    return dynamicSteps
  }, [isEditMode, watchedValues.contract?.contractType, watchedValues.bindExistingContractMode, watchedValues.partnerMode, groupMemberCount, sharedMemberCount, additionalGroupMembers, initialCustomer, initialData?.name])

  const formatROCDate = (dateVal: any) => {
    if (!dateVal) return { y: '   ', m: '  ', d: '  ' }
    let d: Date
    if (dateVal instanceof Date) {
      d = dateVal
    } else if (typeof dateVal === 'string') {
      d = new Date(dateVal)
    } else {
      return { y: '   ', m: '  ', d: '  ' }
    }
    if (isNaN(d.getTime())) return { y: '   ', m: '  ', d: '  ' }
    return {
      y: (d.getFullYear() - 1911).toString(),
      m: (d.getMonth() + 1).toString().padStart(2, '0'),
      d: d.getDate().toString().padStart(2, '0')
    }
  }

  const generateDefaultInstallments = (total: number, count: number, startD: Date) => {
    if (count < 2 || count > 16) return;
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    const amounts = Array(count).fill(base);
    for (let i = 0; i < remainder; i++) {
      amounts[i] += 1;
    }

    const currentInstallments = form.getValues('contract.installments') || [];
    const newInstallments = Array.from({ length: count }, (_, idx) => {
      const existing = currentInstallments[idx];
      const dueDate = existing?.dueDate 
        ? new Date(existing.dueDate)
        : (() => {
            const d = new Date(startD);
            d.setMonth(d.getMonth() + idx);
            return d;
          })();
      
      return {
        id: existing?.id || `inst-${idx + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: amounts[idx],
        dueDate: dueDate,
        paidDate: idx === 0 ? new Date() : (existing?.paidDate ? new Date(existing.paidDate) : null),
        status: idx === 0 ? 'paid' as const : (existing?.status || 'pending' as const),
      };
    });

    form.setValue('contract.installments', newInstallments);
    const paidSum = newInstallments.reduce((sum, ins) => ins.status === 'paid' ? sum + ins.amount : sum, 0);
    form.setValue('contract.paidAmount', paidSum);
  };

  const generateSinglePaymentInstallments = (total: number, startD: Date) => {
    const inst = [
      {
        id: `inst-single-${Date.now()}`,
        amount: total,
        dueDate: new Date(startD),
        paidDate: new Date(),
        status: 'paid' as const,
      }
    ];
    form.setValue('contract.installments', inst);
    form.setValue('contract.paidAmount', total);
  };

  const syncInstallments = (
    type: 'single' | 'installments', 
    count: number, 
    total: number, 
    startD: Date
  ) => {
    if (type === 'single') {
      generateSinglePaymentInstallments(total, startD);
    } else {
      generateDefaultInstallments(total, count, startD);
    }
  };

  const stepStatus = useMemo(() => {
    return activeSteps.map((step) => {
      if (step.id === 'signature') {
        const isBindMode = !!watchedValues.bindExistingContractMode
        if (isBindMode) {
          return !!watchedValues.contract?.secondarySignatureDataUrl
        }
        const isDual = watchedValues.contract?.contractType === 'dual' || watchedValues.partnerMode !== 'none'
        if (isDual) {
          return !!watchedValues.contract?.signatureDataUrl && !!watchedValues.contract?.secondarySignatureDataUrl
        }
        return !!watchedValues.contract?.signatureDataUrl
      }

      if (step.id === 'contract') {
        const isBindMode = !!watchedValues.bindExistingContractMode
        if (isBindMode) {
          if (isSingleBinding) {
            return !!watchedValues.existingContractId && !!watchedValues.contract?.secondaryTrainerId
          }
          return !!watchedValues.existingContractId
        }

        let groupOk = true
        if (watchedValues.contract?.contractType === 'group' || watchedValues.contract?.contractType === 'shared') {
          const effectiveCount = watchedValues.contract?.contractType === 'shared' ? sharedMemberCount : groupMemberCount
          groupOk = additionalGroupMembers.slice(0, effectiveCount - 1).every(m => {
            if (m.memberMode === 'existing') {
              return !!m.existingCustomerId
            }
            return true
          })
        }
        if (!groupOk) return false

        const stepFields = step.fields as any[]
        const isComplete = stepFields.every(field => {
          const value = field.split('.').reduce((obj: any, key: any) => obj?.[key], watchedValues)
          if (Array.isArray(value)) return value.length > 0
          if (typeof value === 'number') return value > 0
          return value !== undefined && value !== '' && value !== null
        })
        if (!isComplete) return false;

        const contractVal = watchedValues.contract;
        if (contractVal?.paymentType === 'installments') {
          if (!contractVal.installments || contractVal.installments.length !== contractVal.installmentCount) return false;
          const sum = contractVal.installments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          if (Math.abs(sum - contractVal.totalAmount) > 0.01) return false;

          for (let i = 0; i < contractVal.installments.length - 1; i++) {
            const currentVal = contractVal.installments[i];
            const nextVal = contractVal.installments[i + 1];
            if (!currentVal.dueDate || !nextVal.dueDate) return false;
            if (new Date(currentVal.dueDate) > new Date(nextVal.dueDate)) return false;
          }
        }
        return true;
      }
      
      if (step.id === 'partner_basic') {
        if (watchedValues.partnerMode === 'existing') {
          return !!watchedValues.partnerId
        }
        const pData = watchedValues.partnerCustomerData
        return !!pData?.name?.trim() &&
               !!pData?.phone?.trim() &&
               !!pData?.idNumber?.trim() &&
               !!pData?.dateOfBirth &&
               !!pData?.emergencyContact?.name?.trim() &&
               !!pData?.emergencyContact?.relation?.trim() &&
               !!pData?.emergencyContact?.phone?.trim()
      }
      if (step.id === 'partner_medical') {
        if (watchedValues.partnerMode === 'existing') {
          return !!watchedValues.partnerId
        }
        const pData = watchedValues.partnerCustomerData
        const chronicOk = (pData?.medicalHistory?.chronicConditions?.length ?? 0) > 0
        const injuriesOk = (pData?.medicalHistory?.injuries?.length ?? 0) > 0
        return chronicOk && injuriesOk
      }
      
      if (step.id.startsWith('group_member_')) {
        const match = step.id.match(/^group_member_(\d+)_(basic|medical)$/)
        if (!match) return false
        const memberNum = parseInt(match[1], 10)
        const memberArrIdx = memberNum - 2
        const mData = additionalGroupMembers[memberArrIdx]
        if (!mData) return false

        if (match[2] === 'basic') {
          if (mData.memberMode === 'existing') {
            return !!mData.existingCustomerId && !!mData.name?.trim()
          }
          return !!mData.name?.trim() &&
                 !!mData.idNumber?.trim() &&
                 !!mData.phone?.trim() &&
                 !!mData.dateOfBirth &&
                 !!mData.emergencyContact?.name?.trim() &&
                 !!mData.emergencyContact?.relation?.trim() &&
                 !!mData.emergencyContact?.phone?.trim()
        }
        if (match[2] === 'medical') {
          if (mData.memberMode === 'existing') {
            return !!mData.existingCustomerId && !!mData.name?.trim()
          }
          const chronicOk = (mData.medicalHistory?.chronicConditions?.length ?? 0) > 0
          const injuriesOk = (mData.medicalHistory?.injuries?.length ?? 0) > 0
          return chronicOk && injuriesOk
        }
      }
      
      const stepFields = step.fields as any[]
      const isComplete = stepFields.every(field => {
        const value = field.split('.').reduce((obj: any, key: any) => obj?.[key], watchedValues)
        if (Array.isArray(value)) return value.length > 0
        if (typeof value === 'number') return value >= 0 // Historical sessions can be 0
        return value !== undefined && value !== '' && value !== null
      })
      return isComplete
    })
  }, [watchedValues, activeSteps, additionalGroupMembers])

  const canGoNext = stepStatus[currentStep]

  const handleNext = async () => {
    const currentStepObj = activeSteps[currentStep]
    if (currentStepObj.id.startsWith('group_member_')) {
      if (stepStatus[currentStep] && currentStep < activeSteps.length - 1) {
        setCurrentStep(prev => prev + 1)
      }
      return
    }
    const fieldsToValidate = currentStepObj.fields as any[]
    const isContractStep = currentStepObj.id === 'contract'
    const isBindMode = form.getValues('bindExistingContractMode')
    
    const isValid = (isContractStep && isBindMode)
      ? (isSingleBinding ? (!!form.getValues('existingContractId') && !!form.getValues('contract.secondaryTrainerId')) : !!form.getValues('existingContractId'))
      : await form.trigger(fieldsToValidate)
    
    if (isContractStep && isBindMode && selectedContract && isCustomerAlreadyInContract(selectedContract)) {
      alert(`防呆警告：學員 ${form.getValues('name') || '此學員'} 已在此合約中，無法重複綁定加入！`)
      return
    }

    if (isValid && currentStep < activeSteps.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }

  const recalculateGroupQuotas = (totalSess: number, count: number) => {
    if (count <= 0) return
    const baseQuota = Math.floor(totalSess / count)
    setPrimaryMemberQuota(baseQuota)
    setAdditionalGroupMembers(prev => prev.map(m => ({ ...m, allocatedSessions: baseQuota })))
  }

  const handleSessionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sessions = Number(e.target.value)
    const totalAmount = form.getValues('contract.totalAmount') || 0
    form.setValue('contract.totalSessions', sessions)
    
    if (form.getValues('contract.contractType') === 'group') {
      recalculateGroupQuotas(sessions, groupMemberCount)
    }

    const initialCont = initialCustomer?.contract || initialData?.contract
    const usedSessions = initialCont
      ? Math.max(0, (initialCont.totalSessions || 0) - (initialCont.remainingSessions || 0))
      : 0
    const newRemaining = Math.max(0, sessions - usedSessions)
    form.setValue('contract.remainingSessions', newRemaining)

    if (sessions > 0) {
      form.setValue('contract.pricePerSession', Math.round((totalAmount / sessions) * 100) / 100)
    } else {
      form.setValue('contract.pricePerSession', 0)
    }
    syncInstallments(
      form.getValues('contract.paymentType') || 'single',
      form.getValues('contract.installmentCount') || 2,
      totalAmount,
      form.getValues('contract.startDate') || new Date()
    )
  }

  const handleTotalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const totalAmount = Number(e.target.value)
    const sessions = form.getValues('contract.totalSessions') || 0
    form.setValue('contract.totalAmount', totalAmount)
    if (sessions > 0) {
      form.setValue('contract.pricePerSession', Math.round((totalAmount / sessions) * 100) / 100)
    } else {
      form.setValue('contract.pricePerSession', 0)
    }
    syncInstallments(
      form.getValues('contract.paymentType') || 'single',
      form.getValues('contract.installmentCount') || 2,
      totalAmount,
      form.getValues('contract.startDate') || new Date()
    )
  }

  const handleFinalSubmit = async (data: CombinedCustomerContractValues) => {
    // Validate all active fields first.
    // When in bindExistingContractMode, skip contract creation fields (totalSessions,
    // totalAmount, startDate, endDate) since they belong to the existing contract.
    const contractCreationFields = ['contract.totalSessions', 'contract.totalAmount', 'contract.startDate', 'contract.endDate']
    const isBindMode = form.getValues('bindExistingContractMode')
    const allActiveFields = (activeSteps.flatMap(s => s.fields) as string[])
      .filter(f => !(isBindMode && contractCreationFields.includes(f))) as any[]
    const isValid = await form.trigger(allActiveFields)
    if (!isValid) {
      alert('請確認所有步驟欄位填寫正確。')
      return
    }

    if (isBindMode && selectedContract) {
      if (data.contract) {
        ;(data.contract as any).joiningStudentSessions = joiningStudentSessions
      }
      ;(data as any).joiningStudentSessions = joiningStudentSessions
      if (isCustomerAlreadyInContract(selectedContract)) {
        alert(`防呆警告：學員 ${form.getValues('name') || '此學員'} 已在此合約中，無法重複綁定加入！`)
        return
      }
      const isGroup = selectedContract.contractType === 'group'
      const isShared = selectedContract.contractType === 'shared'
      const isDual = !isGroup && !isShared && (selectedContract.contractType === 'dual' || (!!selectedContract.sharedWithCustomerId && selectedContract.contractType !== 'shared' && selectedContract.contractType !== 'group'))
      const currentCount = (isGroup || isShared)
        ? (Object.keys(selectedContract.groupMemberQuotas || {}).length || (Array.isArray(selectedContract.customerIds) ? selectedContract.customerIds.length : 1))
        : isDual ? 2 : 1
      if (isDual) {
        alert('此雙人合約成員已滿 (2/2人)，無法再進行新增綁定！')
        return
      }
      if (isShared && currentCount >= 4) {
        alert('此共享合約成員已達人數上限 (4/4人)，無法再進行新增綁定！')
        return
      }
      if (isGroup && currentCount >= 6) {
        alert('此團體合約成員已達人數上限 (6/6人)，無法再進行新增綁定！')
        return
      }
    }

    // Group contract quota validation & additional member creation
    if (data.contract?.contractType === 'group' && !data.bindExistingContractMode) {
      const totalSess = Number(data.contract.totalSessions) || 0
      if (groupQuotaSum !== totalSess) {
        alert(`團體合約成員配額總和 (${groupQuotaSum} 堂) 必須等於合約總堂數 (${totalSess} 堂)，請手動微調每位成員的分配堂數！`)
        return
      }

      setLoading(true)
      try {
        // Batch create additional new members in Firestore customers collection
        const createdMemberIds: string[] = []
        const createdMemberNames: string[] = []
        const createdMemberQuotas: number[] = []

        for (let i = 0; i < additionalGroupMembers.length; i++) {
          const m = additionalGroupMembers[i]
          const groupTrainerId = data.contract.trainerId || ''
          if (m.memberMode === 'existing' && m.existingCustomerId) {
            createdMemberIds.push(m.existingCustomerId)
            createdMemberNames.push(m.name || `團員${i + 2}`)
            createdMemberQuotas.push(m.allocatedSessions)
            if (groupTrainerId) {
              try {
                await updateDoc(doc(db, 'customers', m.existingCustomerId), {
                  trainerId: groupTrainerId,
                  updatedAt: serverTimestamp(),
                })
              } catch (err) {
                console.error('Failed to update existing group member trainer:', err)
              }
            }
          } else {
            if (!m.name || !m.phone) {
              alert(`請填寫學員 ${i + 2} 的姓名與電話！`)
              setLoading(false)
              return
            }
            const docRef = await addDoc(collection(db, 'customers'), {
              centerId,
              name: m.name,
              idNumber: m.idNumber || '',
              phone: m.phone,
              email: m.email || '',
              dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : new Date(),
              gender: m.gender || 'female',
              exerciseHabit: m.exerciseHabit || 'none',
              source: m.source || 'existing',
              emergencyContact: m.emergencyContact,
              medicalHistory: m.medicalHistory,
              historicalSessions: 0,
              status: 'active',
              trainerId: groupTrainerId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
            createdMemberIds.push(docRef.id)
            createdMemberNames.push(m.name)
            createdMemberQuotas.push(m.allocatedSessions)
          }
        }

        const isFromExistingCustomer = !!initialCustomer || !!initialData?.name
        const primaryCustId = initialCustomer?.id || (initialData as any)?.id
        const primaryCustName = data.name || initialCustomer?.name || '主學員'

        const allMemberQuotas: Record<string, any> = {}
        const allCustomerIds: string[] = []

        if (isFromExistingCustomer && primaryCustId) {
          allCustomerIds.push(primaryCustId)
          allMemberQuotas[primaryCustId] = {
            customerId: primaryCustId,
            customerName: primaryCustName,
            totalSessions: primaryMemberQuota,
            remainingSessions: primaryMemberQuota,
          }
        } else {
          (data as any)._primaryMemberQuota = primaryMemberQuota
        }

        createdMemberIds.forEach((id, idx) => {
          allCustomerIds.push(id)
          allMemberQuotas[id] = {
            customerId: id,
            customerName: createdMemberNames[idx],
            totalSessions: createdMemberQuotas[idx],
            remainingSessions: createdMemberQuotas[idx],
          }
        })

        ;(data.contract as any).groupMemberQuotas = allMemberQuotas
        ;(data.contract as any).customerIds = allCustomerIds
      } catch (err: any) {
        console.error('Error creating additional group members:', err)
        alert('建立團體課成員失敗：' + err.message)
        setLoading(false)
        return
      }
    }

    // Shared contract additional member creation & studentTrainers mapping
    if (data.contract?.contractType === 'shared' && !data.bindExistingContractMode) {
      setLoading(true)
      try {
        const createdMemberIds: string[] = []
        const studentTrainersMap: Record<string, string> = {}
        const coStudentCount = sharedMemberCount - 1

        for (let i = 0; i < coStudentCount; i++) {
          const m = additionalGroupMembers[i]
          if (!m) continue
          let memberId = ''
          const memberTrainerId = (m as any).assignedTrainerId || data.contract.trainerId || ''

          if (m.memberMode === 'existing' && m.existingCustomerId) {
            memberId = m.existingCustomerId
            if (memberTrainerId) {
              try {
                await updateDoc(doc(db, 'customers', memberId), {
                  trainerId: memberTrainerId,
                  updatedAt: serverTimestamp(),
                })
              } catch (err) {
                console.error('Failed to sync existing member trainer:', err)
              }
            }
          } else {
            if (!m.name || !m.phone) {
              alert(`請填寫成員 ${i + 2} 的姓名與電話！`)
              setLoading(false)
              return
            }
            const docRef = await addDoc(collection(db, 'customers'), {
              centerId,
              name: m.name,
              idNumber: m.idNumber || '',
              phone: m.phone,
              email: m.email || '',
              dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth) : new Date(),
              gender: m.gender || 'female',
              exerciseHabit: m.exerciseHabit || 'none',
              source: m.source || 'existing',
              emergencyContact: m.emergencyContact,
              medicalHistory: m.medicalHistory,
              historicalSessions: 0,
              status: 'active',
              trainerId: memberTrainerId || data.contract.trainerId || '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })
            memberId = docRef.id
          }
          createdMemberIds.push(memberId)
          if (memberTrainerId) {
            studentTrainersMap[memberId] = memberTrainerId
          }
        }

        const primaryCustId = initialCustomer?.id || (initialData as any)?.id
        const allCustomerIds: string[] = []

        if (primaryCustId) {
          allCustomerIds.push(primaryCustId)
          if (data.contract.trainerId) {
            studentTrainersMap[primaryCustId] = data.contract.trainerId
          }
        }

        createdMemberIds.forEach(id => {
          if (!allCustomerIds.includes(id)) {
            allCustomerIds.push(id)
          }
        })

        ;(data.contract as any).customerIds = allCustomerIds
        ;(data.contract as any).studentTrainers = studentTrainersMap
      } catch (err: any) {
        console.error('Error creating additional shared contract members:', err)
        alert('建立共享合約成員失敗：' + err.message)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    try {
      // Use getCanvas() to bypass getTrimmedCanvas() which has a broken
      // CJS/ESM dep (trim-canvas) in Vite production builds
      if (sigCanvas.current) {
        const canvas = sigCanvas.current as any
        const isEmpty = typeof canvas.isEmpty === 'function' ? canvas.isEmpty() : true
        if (!isEmpty) {
          const rawCanvas: HTMLCanvasElement = canvas.getCanvas()
          if (isBindMode) {
            data.contract!.secondarySignatureDataUrl = rawCanvas.toDataURL('image/png')
          } else {
            data.contract!.signatureDataUrl = rawCanvas.toDataURL('image/png')
          }
        }
      }

      if (secondarySigCanvas.current) {
        const canvas = secondarySigCanvas.current as any
        const isEmpty = typeof canvas.isEmpty === 'function' ? canvas.isEmpty() : true
        if (!isEmpty) {
          const rawCanvas: HTMLCanvasElement = canvas.getCanvas()
          data.contract!.secondarySignatureDataUrl = rawCanvas.toDataURL('image/png')
        }
      }

      await onSubmit(data)
      onOpenChange(false)
    } catch (error) {
      console.error('Submit error:', error)
      alert('儲存失敗：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setLoading(false)
    }
  }

  const renderDynamicGroupMemberStep = () => {
    const currentStepObj = activeSteps[currentStep]
    if (!currentStepObj || !currentStepObj.id.startsWith('group_member_')) return null
    const stepId = currentStepObj.id
    const match = stepId.match(/group_member_(\d+)_(basic|medical)/)
    if (!match) return null
    const memberNum = parseInt(match[1], 10)
    const memberArrIdx = memberNum - 2
    const memberData = additionalGroupMembers[memberArrIdx]
    if (!memberData) return null

    const type = match[2]

    if (type === 'basic') {
      const isExistingMode = (memberData.memberMode || 'existing') === 'existing'
      return (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="space-y-1 pb-4 border-b border-stone-100 dark:border-stone-800">
            <h2 className="text-xl font-bold text-stone-900 dark:text-white">學員 {memberNum} 資料與綁定</h2>
            <p className="text-stone-400 dark:text-stone-500 text-sm">請設定合約第 {memberNum} 位學員的綁定方式與基本資訊。</p>
          </div>

          <div className="space-y-2 p-4 bg-stone-50 dark:bg-stone-800/60 rounded-2xl border border-stone-200/60 dark:border-stone-700/60">
            <Label className="text-stone-700 dark:text-stone-300 font-semibold block text-xs">學員 {memberNum} 綁定方式 *</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, memberMode: 'existing', existingCustomerId: '' } : m))
                }}
                className={cn(
                  "flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1.5",
                  isExistingMode
                    ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                    : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 hover:border-stone-300"
                )}
              >
                <RiLinkM className="w-4 h-4" />
                連結系統現有學員
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? {
                    ...m,
                    memberMode: 'new',
                    existingCustomerId: undefined,
                    name: '',
                    idNumber: '',
                    phone: '',
                    email: '',
                    dateOfBirth: new Date().toISOString().split('T')[0],
                    emergencyContact: { name: '', relation: '', phone: '' },
                    medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
                  } : m))
                }}
                className={cn(
                  "flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1.5",
                  !isExistingMode
                    ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                    : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500 hover:border-stone-300"
                )}
              >
                <RiUserAddLine className="w-4 h-4" />
                新增全新學員
              </button>
            </div>
          </div>

          {isExistingMode ? (
            <div className="p-5 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl space-y-4 animate-in fade-in duration-300">
              <div className="space-y-2">
                <Label className="text-xs text-stone-700 dark:text-stone-300 font-semibold">選擇現有學員 *</Label>
                <SearchableCustomerSelect
                  customers={activeCustomers}
                  value={memberData.existingCustomerId || ''}
                  onChange={(selectedId) => {
                    const selectedCust = activeCustomers.find(c => c.id === selectedId)
                    if (selectedCust) {
                      let dobStr = ''
                      if (selectedCust.dateOfBirth) {
                        const d = (selectedCust.dateOfBirth as any).seconds 
                          ? new Date((selectedCust.dateOfBirth as any).seconds * 1000) 
                          : new Date(selectedCust.dateOfBirth)
                        if (!isNaN(d.getTime())) {
                          dobStr = d.toISOString().split('T')[0]
                        }
                      }
                      setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? {
                        ...m,
                        memberMode: 'existing',
                        existingCustomerId: selectedCust.id,
                        name: selectedCust.name,
                        idNumber: selectedCust.idNumber || '',
                        phone: selectedCust.phone || '',
                        email: selectedCust.email || '',
                        dateOfBirth: dobStr || new Date().toISOString().split('T')[0],
                        gender: (selectedCust.gender as any) || 'female',
                        exerciseHabit: (selectedCust.exerciseHabit as any) || 'none',
                        source: selectedCust.source || 'existing',
                        emergencyContact: selectedCust.emergencyContact || { name: '', relation: '', phone: '' },
                        medicalHistory: selectedCust.medicalHistory || { chronicConditions: [], injuries: [], notes: '' },
                        assignedTrainerId: m.assignedTrainerId || selectedCust.trainerId || form.watch('contract.trainerId') || '',
                      } : m))
                    } else {
                      setAdditionalGroupMembers(prev => prev.map((item, i) => i === memberArrIdx ? { ...item, memberMode: 'existing', existingCustomerId: '', name: '' } : item))
                    }
                  }}
                  excludeIds={[
                    ...(initialCustomer?.id ? [initialCustomer.id] : []),
                    ...additionalGroupMembers.filter((_, oIdx) => oIdx !== memberArrIdx).map(item => item.existingCustomerId).filter(Boolean) as string[]
                  ]}
                  placeholder="-- 請搜尋或選擇現有學員 --"
                />
              </div>

              {memberData.name && (
                <div className="p-3 bg-white dark:bg-stone-800 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-2">
                  <div className="flex items-center justify-between text-emerald-900 dark:text-emerald-300 font-bold border-b border-stone-100 dark:border-stone-700 pb-2">
                    <span className="flex items-center gap-1.5">
                      <RiUserSharedLine className="w-4 h-4 text-emerald-600" />
                      已連結現有學員：{memberData.name}
                    </span>
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200 dark:border-emerald-800">
                      連動成功
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-stone-600 dark:text-stone-300 text-[11px] pt-1">
                    <div>行動電話：<span className="font-semibold text-stone-900 dark:text-white">{memberData.phone || '無'}</span></div>
                    <div>身分證字號：<span className="font-semibold text-stone-900 dark:text-white">{memberData.idNumber || '無'}</span></div>
                    <div>緊急聯絡人：<span className="font-semibold text-stone-900 dark:text-white">{memberData.emergencyContact?.name || '無'} ({memberData.emergencyContact?.relation || '無'})</span></div>
                    <div>緊急電話：<span className="font-semibold text-stone-900 dark:text-white">{memberData.emergencyContact?.phone || '無'}</span></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">姓名 *</Label>
                  <Input
                    value={memberData.name}
                    onChange={(e) => {
                      const val = e.target.value
                      setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, name: val } : m))
                    }}
                    placeholder="例如：王小明"
                    className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white text-stone-900 dark:text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">身分證字號 *</Label>
                  <Input
                    value={memberData.idNumber}
                    onChange={(e) => {
                      const val = e.target.value
                      setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, idNumber: val } : m))
                    }}
                    placeholder="A123456789"
                    className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white text-stone-900 dark:text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">電話 *</Label>
                  <Input
                    value={memberData.phone}
                    onChange={(e) => {
                      const val = e.target.value
                      setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, phone: val } : m))
                    }}
                    placeholder="0912-345-678"
                    className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white text-stone-900 dark:text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">Email</Label>
                  <Input
                    type="email"
                    value={memberData.email}
                    onChange={(e) => {
                      const val = e.target.value
                      setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, email: val } : m))
                    }}
                    placeholder="example@mail.com"
                    className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white text-stone-900 dark:text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">出生年月日 *</Label>
                  <MinguoDatePickerInput
                    value={memberData.dateOfBirth}
                    onChange={(d) => {
                      const str = d instanceof Date ? d.toISOString().split('T')[0] : String(d || '')
                      setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, dateOfBirth: str } : m))
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">性別</Label>
                  <div className="relative">
                    <select
                      value={memberData.gender}
                      onChange={(e) => {
                        const val = e.target.value as any
                        setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, gender: val } : m))
                      }}
                      className="w-full h-10 px-3 pr-8 border border-stone-200 dark:border-stone-700 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-semibold cursor-pointer appearance-none"
                    >
                      <option value="female">女 (Female)</option>
                      <option value="male">男 (Male)</option>
                      <option value="other">不透露 (Other)</option>
                    </select>
                    <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="p-5 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-700/50 space-y-4">
                <h3 className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2 uppercase tracking-wide">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  學員 {memberNum} 緊急聯絡人資訊
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-stone-500 dark:text-stone-400">姓名 *</Label>
                    <Input
                      value={memberData.emergencyContact.name}
                      onChange={(e) => {
                        const val = e.target.value
                        setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, emergencyContact: { ...m.emergencyContact, name: val } } : m))
                      }}
                      className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-stone-500 dark:text-stone-400">關係 *</Label>
                    <Input
                      value={memberData.emergencyContact.relation}
                      onChange={(e) => {
                        const val = e.target.value
                        setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, emergencyContact: { ...m.emergencyContact, relation: val } } : m))
                      }}
                      className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-stone-500 dark:text-stone-400">電話 *</Label>
                    <Input
                      value={memberData.emergencyContact.phone}
                      onChange={(e) => {
                        const val = e.target.value
                        setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, emergencyContact: { ...m.emergencyContact, phone: val } } : m))
                      }}
                      className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (type === 'medical') {
      return (
        <div className="space-y-7">
          <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
            <h2 className="text-xl font-bold text-stone-900 dark:text-white">學員 {memberNum} 健康狀態</h2>
            <p className="text-stone-400 dark:text-stone-500 text-sm">了解學員 {memberNum} 的身體狀況以進行課程設計。</p>
          </div>
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide block">慢性病史 (可複選)</Label>
              <div className="grid grid-cols-3 gap-2">
                {['無狀況', '高血壓', '心臟病', '糖尿病', '氣喘', '癲癇', '骨質疏鬆', '自體免疫', '癌症', '其他'].map((cond) => {
                  const isChecked = memberData.medicalHistory.chronicConditions.includes(cond)
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => {
                        let updated: string[]
                        if (cond === '無狀況') {
                          updated = ['無狀況']
                        } else {
                          const current = memberData.medicalHistory.chronicConditions.filter(x => x !== '無狀況')
                          updated = isChecked ? current.filter(x => x !== cond) : [...current, cond]
                        }
                        setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, medicalHistory: { ...m.medicalHistory, chronicConditions: updated } } : m))
                      }}
                      className={cn(
                        "flex items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all",
                        isChecked
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                          : "bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400"
                      )}
                    >
                      {cond}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide block">過往傷病史 (可複選)</Label>
              <div className="grid grid-cols-3 gap-2">
                {['無狀況', '肩部', '手肘', '手腕', '下背', '髖關節', '膝蓋', '腳踝', '其他'].map((injury) => {
                  const isChecked = memberData.medicalHistory.injuries.includes(injury)
                  return (
                    <button
                      key={injury}
                      type="button"
                      onClick={() => {
                        let updated: string[]
                        if (injury === '無狀況') {
                          updated = ['無狀況']
                        } else {
                          const current = memberData.medicalHistory.injuries.filter(x => x !== '無狀況')
                          updated = isChecked ? current.filter(x => x !== injury) : [...current, injury]
                        }
                        setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, medicalHistory: { ...m.medicalHistory, injuries: updated } } : m))
                      }}
                      className={cn(
                        "flex items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all",
                        isChecked
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                          : "bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400"
                      )}
                    >
                      {injury}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">其他身體狀況說明</Label>
              <textarea
                value={memberData.medicalHistory.notes}
                onChange={(e) => {
                  const val = e.target.value
                  setAdditionalGroupMembers(prev => prev.map((m, idx) => idx === memberArrIdx ? { ...m, medicalHistory: { ...m.medicalHistory, notes: val } } : m))
                }}
                className="w-full h-24 p-3 rounded-xl border border-stone-200 dark:border-stone-700 text-sm outline-none bg-stone-50 dark:bg-stone-800 dark:text-white"
                placeholder="例如：開過刀或右膝韌帶傷..."
              />
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/50 dark:border-stone-700/50 shadow-2xl shadow-stone-900/20">
        <div className="sr-only">
          <DialogTitle>{isEditMode ? '編輯客戶資料' : '建立新客戶'}</DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? '更新客戶的基本聯絡資訊與健康狀態。' 
              : '請按照步驟填寫客戶資料、健康狀態、合約設定並完成簽名。'}
          </DialogDescription>
        </div>
        <div className="flex h-[80vh] min-h-[600px]">
          {/* Sidebar — dark premium */}
          <div className="w-64 bg-stone-900 dark:bg-black border-r border-stone-200/50 dark:border-stone-800/80 flex flex-col shrink-0">
            {/* Sidebar Header */}
            <div className="px-7 pt-8 pb-6 border-b border-white/5">
              <p className="text-[10px] font-bold tracking-widest uppercase text-stone-500 mb-1">
                {isEditMode ? 'Edit Profile' : 'New Client'}
              </p>
              <h3 className="text-white font-bold text-base leading-tight">
                {isEditMode ? '編輯客戶資料' : '建立新客戶'}
              </h3>
            </div>

            {/* Steps */}
            <nav className="flex-1 px-5 py-6 space-y-1 overflow-y-auto">
              {activeSteps.map((step, idx) => {
                const Icon = step.icon
                const isActive = currentStep === idx
                const isCompleted = stepStatus[idx]
                
                return (
                  <button
                    key={step.id}
                    type="button"
                    disabled={idx > 0 && !stepStatus[idx-1] && idx > currentStep}
                    onClick={() => setCurrentStep(idx)}
                    className={cn(
                      "flex items-center gap-3 w-full text-left transition-all duration-200 px-3 py-2.5 rounded-xl group",
                      isActive
                        ? "bg-white/10 text-white"
                        : isCompleted
                        ? "text-stone-300 hover:bg-white/5"
                        : "text-stone-600 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
                      isCompleted
                        ? "bg-brand-500 text-white"
                        : isActive
                        ? "bg-white text-stone-900"
                        : "bg-white/8 text-stone-500"
                    )}>
                      {isCompleted
                        ? <RiCheckboxCircleFill className="w-3.5 h-3.5" />
                        : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-[9px] font-bold tracking-widest uppercase mb-0.5",
                        isActive ? "text-brand-400" : "text-stone-600"
                      )}>Step {idx + 1}</p>
                      <p className={cn(
                        "text-xs font-semibold leading-tight truncate",
                        isActive ? "text-white" : isCompleted ? "text-stone-300" : "text-stone-500"
                      )}>{step.title}</p>
                    </div>
                  </button>
                )
              })}
            </nav>
            
            {/* Progress bar container fixed height */}
            <div className="h-16 px-5 border-t border-white/5 flex flex-col justify-center shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">整體進度</p>
                <p className="text-[10px] font-bold text-stone-400">
                  {stepStatus.filter(s => s).length}/{activeSteps.length}
                </p>
              </div>
              <div className="h-1 w-full bg-white/8 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(stepStatus.filter(s => s).length / activeSteps.length) * 100}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="h-full bg-brand-500 rounded-full"
                />
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col bg-white dark:bg-stone-900 min-w-0">
            <div className="flex-1 overflow-y-auto px-10 py-9">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  {activeSteps[currentStep]?.id === 'basic' && (
                    <div className="space-y-7">
                      <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-stone-900 dark:text-white">基本資料</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm">輸入客戶的聯絡方式與緊急聯繫人資訊。</p>
                      </div>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">姓名 *</Label>
                          <Input {...form.register('name')} placeholder="例如：王小明" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white dark:focus:bg-stone-750 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                          {form.formState.errors.name && <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.name.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">身分證字號 *</Label>
                          <Input {...form.register('idNumber')} placeholder="A123456789" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white dark:focus:bg-stone-750 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">電話 *</Label>
                          <Input {...form.register('phone')} placeholder="0912-345-678" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white dark:focus:bg-stone-750 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">Email</Label>
                          <Input type="email" {...form.register('email')} placeholder="example@mail.com" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 focus:bg-white dark:focus:bg-stone-750 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">出生年月日 *</Label>
                          <MinguoDatePickerInput
                            value={form.watch('dateOfBirth')}
                            onChange={(d) => form.setValue('dateOfBirth', d as any, { shouldValidate: true })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">性別</Label>
                          <div className="relative">
                            <select
                              {...form.register('gender')}
                              className="w-full h-10 px-3 pr-8 border border-stone-200 dark:border-stone-700 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-white/10 cursor-pointer appearance-none"
                            >
                              <option value="female">女 (Female)</option>
                              <option value="male">男 (Male)</option>
                              <option value="other">不透露 (Other)</option>
                            </select>
                            <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">運動習慣 *</Label>
                          <div className="relative">
                            <select
                              {...form.register('exerciseHabit')}
                              className="w-full h-10 px-3 pr-8 border border-stone-200 dark:border-stone-700 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-white/10 cursor-pointer appearance-none"
                            >
                              <option value="none">完全沒運動</option>
                              <option value="weekly_1_2">每週 1-2 次</option>
                              <option value="weekly_3_plus">每週 3 次以上</option>
                            </select>
                            <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">來客渠道</Label>
                          <div className="relative">
                            <select
                              {...form.register('source')}
                              className="w-full h-10 px-3 pr-8 border border-stone-200 dark:border-stone-700 rounded-xl text-xs bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-stone-200 font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-white/10 cursor-pointer appearance-none"
                            >
                              <option value="existing">舊客戶</option>
                              <option value="instagram">Instagram</option>
                              <option value="facebook">Facebook</option>
                              <option value="google">Google 搜尋/地圖</option>
                              <option value="referral">親友/會員介紹</option>
                              <option value="walk_in">過路/現場親洽</option>
                              <option value="other">其他管道</option>
                            </select>
                            <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">歷史已上堂數</Label>
                          <Input type="number" {...form.register('historicalSessions')} className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white transition-all rounded-xl" />
                        </div>
                      </div>
                      <div className="p-5 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-700/50 space-y-4">
                        <h3 className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2 uppercase tracking-wide">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                          緊急聯絡人資訊
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-stone-500 dark:text-stone-400">姓名 *</Label>
                            <Input {...form.register('emergencyContact.name')} className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-stone-500 dark:text-stone-400">關係 *</Label>
                            <Input {...form.register('emergencyContact.relation')} className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-stone-500 dark:text-stone-400">電話 *</Label>
                            <Input {...form.register('emergencyContact.phone')} className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'medical' && (
                    <div className="space-y-7">
                      <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-stone-900 dark:text-white">健康狀態</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm">了解客戶的身體狀況以進行更安全的課程設計。</p>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide block">慢性病史 (可複選)</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {['無狀況', '高血壓', '心臟病', '糖尿病', '氣喘', '癲癇', '骨質疏鬆', '自體免疫', '癌症', '其他'].map((condition) => (
                              <label key={condition} className={cn(
                                "flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer",
                                (form.watch('medicalHistory.chronicConditions') || []).includes(condition) 
                                  ? "bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/40 text-brand-700 dark:text-brand-400" 
                                  : "bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-600"
                              )}>
                                <input
                                  type="checkbox"
                                  value={condition}
                                  className="hidden"
                                  {...form.register('medicalHistory.chronicConditions', {
                                    onChange: (e) => {
                                      const checked = e.target.checked
                                      const val = e.target.value
                                      const current = form.getValues('medicalHistory.chronicConditions') || []
                                      if (val === '無狀況' && checked) {
                                        form.setValue('medicalHistory.chronicConditions', ['無狀況'])
                                      } else if (val !== '無狀況' && checked) {
                                        form.setValue('medicalHistory.chronicConditions', current.filter(x => x !== '無狀況'))
                                      }
                                    }
                                  })}
                                />
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center shrink-0",
                                  (form.watch('medicalHistory.chronicConditions') || []).includes(condition) 
                                    ? "bg-brand-500 border-brand-500" 
                                    : "border-stone-300 dark:border-stone-600"
                                )}>
                                  {(form.watch('medicalHistory.chronicConditions') || []).includes(condition) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <span className="text-xs font-semibold">{condition}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide block">傷病史 (可複選)</Label>
                          <div className="grid grid-cols-5 gap-2">
                            {['無狀況', '肩部', '手肘', '手腕', '下背', '髖關節', '膝蓋', '腳踝', '其他'].map((injury) => (
                              <label key={injury} className={cn(
                                "flex items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer text-center",
                                (form.watch('medicalHistory.injuries') || []).includes(injury) 
                                  ? "bg-stone-900 dark:bg-white border-stone-900 dark:border-white text-white dark:text-stone-900" 
                                  : "bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500"
                              )}>
                                <input
                                  type="checkbox"
                                  value={injury}
                                  className="hidden"
                                  {...form.register('medicalHistory.injuries', {
                                    onChange: (e) => {
                                      const checked = e.target.checked
                                      const val = e.target.value
                                      const current = form.getValues('medicalHistory.injuries') || []
                                      if (val === '無狀況' && checked) {
                                        form.setValue('medicalHistory.injuries', ['無狀況'])
                                      } else if (val !== '無狀況' && checked) {
                                        form.setValue('medicalHistory.injuries', current.filter(x => x !== '無狀況'))
                                      }
                                    }
                                  })}
                                />
                                <span className="text-[11px] font-bold">{injury}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">其他身體狀況說明</Label>
                          <textarea 
                            {...form.register('medicalHistory.notes')} 
                            className="w-full h-28 p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-stone-750 focus:ring-2 focus:ring-brand-500/20 transition-all text-sm outline-none placeholder:text-stone-400"
                            placeholder="例如：右膝前十字韌帶曾開刀..." 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Group Members Steps (Member 2..N) */}
                  {renderDynamicGroupMemberStep()}

                  {activeSteps[currentStep]?.id === 'contract' && (
                    <div className="space-y-7">
                      <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-stone-900 dark:text-white">合約設定</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm">設定合約堂數、單價以及生效日期。</p>
                      </div>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                        <div className="col-span-2 space-y-2">
                          <Label className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wide block">合約模式 *</Label>
                          <div className="flex gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('bindExistingContractMode', false)
                                form.setValue('contract.contractType', 'single')
                                form.setValue('partnerMode', 'none')
                                form.setValue('partnerId', null)
                                form.setValue('partnerCustomerData', null)
                                form.setValue('existingContractId', null)
                              }}
                              className={cn(
                                "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                                (!form.watch('bindExistingContractMode') && form.watch('contract.contractType') === 'single')
                                  ? "bg-stone-950 dark:bg-white border-stone-950 dark:border-white text-white dark:text-stone-900 shadow-lg"
                                  : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-500"
                              )}
                            >
                              <RiUser3Line className="w-4.5 h-4.5" />
                              單人合約
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('bindExistingContractMode', false)
                                form.setValue('contract.contractType', 'dual')
                                form.setValue('partnerMode', 'new')
                                form.setValue('partnerId', null)
                                form.setValue('partnerCustomerData', {
                                  name: '',
                                  idNumber: '',
                                  phone: '',
                                  email: '',
                                  dateOfBirth: new Date(),
                                  historicalSessions: 0,
                                  emergencyContact: { name: '', relation: '', phone: '' },
                                  sharedContractCustomerId: null,
                                  medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
                                })
                                form.setValue('existingContractId', null)
                              }}
                              className={cn(
                                "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                                (!form.watch('bindExistingContractMode') && form.watch('contract.contractType') === 'dual')
                                  ? "bg-amber-500 border-amber-500 text-white shadow-lg"
                                  : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-500"
                              )}
                            >
                              <RiGroupLine className="w-4.5 h-4.5" />
                              雙人合約
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('bindExistingContractMode', false)
                                form.setValue('contract.contractType', 'shared')
                                form.setValue('partnerMode', 'none')
                                form.setValue('partnerId', null)
                                form.setValue('partnerCustomerData', null)
                                form.setValue('existingContractId', null)
                              }}
                              className={cn(
                                "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                                (!form.watch('bindExistingContractMode') && form.watch('contract.contractType') === 'shared')
                                  ? "bg-blue-600 border-blue-600 text-white shadow-lg"
                                  : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-500"
                              )}
                            >
                              <RiUserSharedLine className="w-4.5 h-4.5" />
                              共享合約
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('bindExistingContractMode', false)
                                form.setValue('contract.contractType', 'group')
                                form.setValue('partnerMode', 'none')
                                form.setValue('partnerId', null)
                                form.setValue('partnerCustomerData', null)
                                form.setValue('existingContractId', null)
                              }}
                              className={cn(
                                "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                                (!form.watch('bindExistingContractMode') && form.watch('contract.contractType') === 'group')
                                  ? "bg-emerald-600 border-emerald-600 text-white shadow-lg"
                                  : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-500"
                              )}
                            >
                              <RiTeamLine className="w-4.5 h-4.5" />
                              團體合約
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('bindExistingContractMode', true)
                                form.setValue('sharedWithCustomerId', null)
                                form.setValue('partnerMode', 'none')
                                form.setValue('partnerId', null)
                                form.setValue('partnerCustomerData', null)
                              }}
                              className={cn(
                                "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                                form.watch('bindExistingContractMode')
                                  ? "bg-blue-600 border-blue-600 text-white shadow-lg"
                                  : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-500"
                              )}
                            >
                              <RiLinkM className="w-4.5 h-4.5" />
                              連結合約
                            </button>
                          </div>
                        </div>

                        {/* 團體與共享合約人數、教練與堂數設定區塊 */}
                        {!form.watch('bindExistingContractMode') && (form.watch('contract.contractType') === 'group' || form.watch('contract.contractType') === 'shared') && (
                          <div className={cn(
                            "col-span-2 p-5 rounded-2xl space-y-5 animate-in fade-in duration-300 border",
                            form.watch('contract.contractType') === 'shared'
                              ? "bg-blue-50/50 border-blue-100"
                              : "bg-emerald-50/50 border-emerald-100"
                          )}>
                            {/* 1. 人數選擇 */}
                            <div className="space-y-2">
                              <Label className="text-stone-900 font-bold block text-xs">
                                1. 選擇{form.watch('contract.contractType') === 'shared' ? '多人共享合約 (2~4 人)' : '團體課 (2~6 人)'}總人數 *
                              </Label>
                              <div className="flex gap-2">
                                {(form.watch('contract.contractType') === 'shared' ? [2, 3, 4] : [2, 3, 4, 5, 6]).map((count) => {
                                  const isSelected = form.watch('contract.contractType') === 'shared'
                                    ? sharedMemberCount === count
                                    : groupMemberCount === count
                                  return (
                                    <button
                                      key={count}
                                      type="button"
                                      onClick={() => {
                                        if (form.watch('contract.contractType') === 'shared') {
                                          setSharedMemberCount(count)
                                        } else {
                                          setGroupMemberCount(count)
                                        }
                                        const targetNewCount = count - 1
                                        syncAdditionalMembersCount(targetNewCount, Number(watchedValues.contract?.totalSessions) || 0)
                                        if (form.watch('contract.contractType') === 'group') {
                                          recalculateGroupQuotas(Number(watchedValues.contract?.totalSessions) || 0, count)
                                        }
                                      }}
                                      className={cn(
                                        "flex-1 py-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1",
                                        isSelected
                                          ? form.watch('contract.contractType') === 'shared'
                                            ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20"
                                            : "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-500/20"
                                          : "bg-white border-stone-200 text-stone-700 hover:border-stone-300"
                                      )}
                                    >
                                      {count} 人{form.watch('contract.contractType') === 'shared' ? '共享' : '團課'}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* 2. 成員綁定方式與指導教練 */}
                            <div className="space-y-3 pt-2 border-t border-stone-200/60">
                              <Label className="text-stone-900 font-bold block text-xs">2. 設定成員綁定方式與指導教練 *</Label>
                              
                              <div className="space-y-3">
                                {/* 成員 1 (主學員) - 僅用於共享合約顯示與設定教練 */}
                                {form.watch('contract.contractType') === 'shared' && (
                                  <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200/80 shadow-xs space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center">
                                          1
                                        </span>
                                        主學員 (成員 1)：{watchedValues.name || initialCustomer?.name || '主學員'}
                                      </span>
                                      <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                                        合約主要紀錄者
                                      </span>
                                    </div>
                                    <div className="space-y-1.5 pt-1 border-t border-blue-100">
                                      <Label className="text-[11px] font-bold text-blue-900">指導教練 *</Label>
                                      <select
                                        value={form.watch('contract.trainerId') || ''}
                                        onChange={(e) => form.setValue('contract.trainerId', e.target.value)}
                                        className="w-full h-9 rounded-lg border border-blue-200 bg-white px-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                      >
                                        <option value="">-- 請選擇主學員教練 --</option>
                                        {trainers.map((t) => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                )}

                                {additionalGroupMembers.slice(0, (form.watch('contract.contractType') === 'shared' ? sharedMemberCount : groupMemberCount) - 1).map((m, idx) => (
                                  <div key={idx} className="p-3.5 bg-white rounded-xl border border-stone-200 shadow-xs space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                                        <span className={cn(
                                          "w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center",
                                          form.watch('contract.contractType') === 'shared'
                                            ? "bg-blue-100 text-blue-800"
                                            : "bg-emerald-100 text-emerald-800"
                                        )}>
                                          {idx + 2}
                                        </span>
                                        學員 {idx + 2} {m.name ? `(${m.name})` : ''}
                                      </span>
                                      
                                      {/* Member Mode Switcher */}
                                      <div className="flex gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? { ...item, memberMode: 'existing', existingCustomerId: '' } : item))
                                          }}
                                          className={cn(
                                            "py-1 px-2.5 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1",
                                            m.memberMode === 'existing'
                                              ? form.watch('contract.contractType') === 'shared'
                                                ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                                : "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                                              : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                                          )}
                                        >
                                          <RiLinkM className="w-3 h-3" />
                                          連結現有學員
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? {
                                              ...item,
                                              memberMode: 'new',
                                              existingCustomerId: undefined,
                                              name: '',
                                              idNumber: '',
                                              phone: '',
                                              email: '',
                                              dateOfBirth: new Date().toISOString().split('T')[0],
                                              emergencyContact: { name: '', relation: '', phone: '' },
                                              medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
                                            } : item))
                                          }}
                                          className={cn(
                                            "py-1 px-2.5 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1",
                                            m.memberMode === 'new'
                                              ? form.watch('contract.contractType') === 'shared'
                                                ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                                : "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                                              : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                                          )}
                                        >
                                          <RiUserAddLine className="w-3 h-3" />
                                          新增全新學員
                                        </button>
                                      </div>
                                    </div>

                                    {/* Mode Content */}
                                    {m.memberMode === 'existing' ? (
                                      <div className="space-y-1.5">
                                        <SearchableCustomerSelect
                                          customers={activeCustomers}
                                          value={m.existingCustomerId || ''}
                                          onChange={(selectedId) => {
                                            if (selectedId) {
                                              const selectedCust = activeCustomers.find(c => c.id === selectedId)
                                              if (selectedCust) {
                                                let dobStr = ''
                                                if (selectedCust.dateOfBirth) {
                                                  const d = (selectedCust.dateOfBirth as any).seconds 
                                                    ? new Date((selectedCust.dateOfBirth as any).seconds * 1000) 
                                                    : new Date(selectedCust.dateOfBirth)
                                                  if (!isNaN(d.getTime())) dobStr = d.toISOString().split('T')[0]
                                                }
                                                setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? {
                                                  ...item,
                                                  memberMode: 'existing',
                                                  existingCustomerId: selectedCust.id,
                                                  name: selectedCust.name,
                                                  idNumber: selectedCust.idNumber || '',
                                                  phone: selectedCust.phone || '',
                                                  email: selectedCust.email || '',
                                                  dateOfBirth: dobStr || new Date().toISOString().split('T')[0],
                                                  gender: (selectedCust.gender as any) || 'female',
                                                  exerciseHabit: (selectedCust.exerciseHabit as any) || 'none',
                                                  source: selectedCust.source || 'existing',
                                                  emergencyContact: selectedCust.emergencyContact || { name: '', relation: '', phone: '' },
                                                  medicalHistory: selectedCust.medicalHistory || { chronicConditions: [], injuries: [], notes: '' },
                                                  assignedTrainerId: item.assignedTrainerId || selectedCust.trainerId || form.watch('contract.trainerId') || '',
                                                } : item))
                                              }
                                            } else {
                                              setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? { ...item, memberMode: 'existing', existingCustomerId: '', name: '' } : item))
                                            }
                                          }}
                                          excludeIds={[
                                            ...(initialCustomer?.id ? [initialCustomer.id] : []),
                                            ...additionalGroupMembers.filter((_, oIdx) => oIdx !== idx).map(item => item.existingCustomerId).filter(Boolean) as string[]
                                          ]}
                                          placeholder="-- 請搜尋或選擇現有學員 --"
                                        />
                                      </div>
                                    ) : (
                                      <p className={cn(
                                        "text-[11px] font-semibold p-2 rounded-lg border",
                                        form.watch('contract.contractType') === 'shared'
                                          ? "text-blue-700 bg-blue-50/80 border-blue-200/60"
                                          : "text-emerald-700 bg-emerald-50/80 border-emerald-200/60"
                                      )}>
                                        學員 {idx + 2} 之基本資料與健康狀態將於點擊「下一步」後填寫。
                                      </p>
                                    )}

                                    {/* 教練選擇 (共享合約獨立設定成員教練) */}
                                    {form.watch('contract.contractType') === 'shared' && (
                                      <div className="space-y-1.5 pt-2 border-t border-stone-100">
                                        <Label className="text-[11px] font-bold text-stone-700">指導教練 *</Label>
                                        <select
                                          value={m.assignedTrainerId || form.watch('contract.trainerId') || ''}
                                          onChange={(e) => {
                                            const tId = e.target.value
                                            setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? { ...item, assignedTrainerId: tId } : item))
                                          }}
                                          className="w-full h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                          <option value="">-- 請選擇成員教練 (預設同主學員教練) --</option>
                                          {trainers.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 3. 堂數模式 (團體課配額 vs 多人共享堂數池) */}
                            {form.watch('contract.contractType') === 'shared' ? (
                              <div className="p-4 bg-white rounded-xl border border-blue-200/60 space-y-2">
                                <div className="flex items-center gap-1.5 font-bold text-xs text-blue-950">
                                  <RiUserSharedLine className="w-4 h-4 text-blue-600" />
                                  <span>3. 多人共享合約堂數模式說明</span>
                                </div>
                                <p className="text-xs text-stone-600 leading-relaxed font-medium">
                                  本合約設定為 <span className="font-bold text-blue-900">「多人共享合約」</span>，由全體 {sharedMemberCount} 位學員共同持有一份合約堂數池（合約總堂數: <span className="font-bold text-stone-900">{watchedValues.contract?.totalSessions || 0} 堂</span>）。學員各自約課銷課時直接由該合約剩餘堂數扣抵，無需為每位成員個別設定堂數上限。
                                </p>
                              </div>
                            ) : (
                              <div className="p-4 bg-white rounded-xl border border-emerald-200/60 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-stone-800">3. 堂數分配設定（全體總堂數: {watchedValues.contract?.totalSessions || 0} 堂）</span>
                                  {groupQuotaRemainder > 0 && (
                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                      餘 {groupQuotaRemainder} 堂可微調分配
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                  <div className="space-y-1 bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-100">
                                    <span className="text-[11px] font-bold text-stone-700 block truncate">
                                      學員 1 (主學員: {watchedValues.name || initialCustomer?.name || '請於基本資料填寫'})
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        value={primaryMemberQuota}
                                        onChange={(e) => setPrimaryMemberQuota(Number(e.target.value) || 0)}
                                        className="w-full h-8 rounded-lg border border-stone-200 px-2 text-xs font-bold bg-white"
                                      />
                                      <span className="text-[10px] text-stone-500 font-bold shrink-0">堂</span>
                                    </div>
                                  </div>

                                  {additionalGroupMembers.map((m, idx) => (
                                    <div key={idx} className="space-y-1 bg-stone-50 p-2.5 rounded-lg border border-stone-200/60">
                                      <span className="text-[11px] font-bold text-stone-700 block truncate">
                                        學員 {idx + 2} {m.name ? `(${m.name})` : ''}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min={0}
                                          value={m.allocatedSessions}
                                          onChange={(e) => {
                                            const val = Number(e.target.value) || 0
                                            setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? { ...item, allocatedSessions: val } : item))
                                          }}
                                          className="w-full h-8 rounded-lg border border-stone-200 px-2 text-xs font-bold bg-white"
                                        />
                                        <span className="text-[10px] text-stone-500 font-bold shrink-0">堂</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {groupQuotaSum !== (Number(watchedValues.contract?.totalSessions) || 0) && (
                                  <p className="text-[10px] font-bold text-red-500 flex items-center gap-1 pt-1">
                                    <RiAlertLine className="w-3 h-3 shrink-0" />
                                    目前個人配額小計 ({groupQuotaSum} 堂) 與合約總堂數 ({watchedValues.contract?.totalSessions || 0} 堂) 不一致，請微調個人堂數。
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 連結現有合約 */}
                        {form.watch('bindExistingContractMode') && (
                          <div className="col-span-2 p-6 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Label className="text-blue-950 font-bold block text-sm">連結現有合約 *</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-xs text-blue-900 font-medium">選擇現有學員 *</Label>
                                <SearchableCustomerSelect
                                  customers={activeCustomers}
                                  value={selectedExistingCustomerId || ''}
                                  onChange={(id) => {
                                    setSelectedExistingCustomerId(id || '')
                                    form.setValue('existingContractId', null)
                                  }}
                                  placeholder="-- 請搜尋或選擇學員 --"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-blue-900 font-medium">選擇其現有合約 *</Label>
                                <div className="relative">
                                  <select
                                    value={form.watch('existingContractId') || ''}
                                    onChange={(e) => form.setValue('existingContractId', e.target.value || null)}
                                    disabled={!selectedExistingCustomerId}
                                    className="w-full h-10 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 appearance-none cursor-pointer"
                                  >
                                    <option value="">-- 請選擇合約 --</option>
                                    {existingCustomerContracts.map((c) => {
                                      const trainerName = trainers.find(t => t.id === c.trainerId)?.name || c.trainerId || '未指定'
                                      const isGroup = c.contractType === 'group'
                                      const isShared = c.contractType === 'shared'
                                      const isDual = !isGroup && !isShared && (c.contractType === 'dual' || (!!c.sharedWithCustomerId && c.contractType !== 'group' && c.contractType !== 'shared'))
                                      const maxCap = isGroup ? 6 : (isShared ? 4 : (isDual ? 2 : 1))
                                      const currentMemberCount = (isGroup || isShared)
                                        ? (Object.keys(c.groupMemberQuotas || {}).length || (Array.isArray(c.customerIds) ? c.customerIds.length : 1))
                                        : isDual ? 2 : 1
                                      const isFull = currentMemberCount >= maxCap
                                      const isAlreadyMember = isCustomerAlreadyInContract(c)

                                      const tagText = isGroup ? '[團體]' : isShared ? '[共享]' : isDual ? '[雙人]' : '[個人]'
                                      const statusSuffix = isAlreadyMember
                                        ? ' (此學員已在此合約中 - 無法重複加入)'
                                        : isFull
                                        ? ` (已滿額 ${currentMemberCount}/${maxCap}人 - 無法綁定)`
                                        : isDual
                                        ? ''
                                        : isGroup || isShared
                                        ? ` (${currentMemberCount}/${maxCap}人)`
                                        : ' (綁定後轉雙人合約)'

                                      return (
                                        <option key={c.id} value={c.id} disabled={isFull}>
                                          {tagText} 合約編號: {c.contractNumber || c.id.substring(0, 8)} ({c.remainingSessions}/{c.totalSessions} 堂, 教練: {trainerName}){statusSuffix}
                                        </option>
                                      )
                                    })}
                                  </select>
                                  <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              </div>
                            </div>

                              {selectedContract && (() => {
                                const isGroup = selectedContract.contractType === 'group'
                                const isShared = selectedContract.contractType === 'shared'
                                const isDual = !isGroup && !isShared && (selectedContract.contractType === 'dual' || (!!selectedContract.sharedWithCustomerId && selectedContract.contractType !== 'shared' && selectedContract.contractType !== 'group'))
                                const maxCap = isGroup ? 6 : (isShared ? 4 : (isDual ? 2 : 1))
                                const currentCount = (isGroup || isShared)
                                  ? (Object.keys(selectedContract.groupMemberQuotas || {}).length || (Array.isArray(selectedContract.customerIds) ? selectedContract.customerIds.length : 1))
                                  : isDual ? 2 : 1
                                const isFull = currentCount >= maxCap

                                if (isGroup) {
                                  const pricePerSession = selectedContract.pricePerSession || (selectedContract.totalSessions > 0 ? Math.round((selectedContract.totalAmount || 0) / selectedContract.totalSessions) : 0)
                                  const addedAmount = Math.round(joiningStudentSessions * pricePerSession)
                                  const newTotalSessions = selectedContract.totalSessions + joiningStudentSessions
                                  const newRemainingSessions = selectedContract.remainingSessions + joiningStudentSessions
                                  const newTotalAmount = (selectedContract.totalAmount || 0) + addedAmount

                                  return (
                                    <div className="mt-4 p-4 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-3 text-xs text-stone-700 shadow-sm animate-in fade-in duration-300">
                                      <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                                        <h4 className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                                          <RiTeamLine className="w-4 h-4 text-emerald-600" />
                                          <span>👥 團體合約連結與新增學員說明</span>
                                        </h4>
                                        <span className={cn(
                                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                          isFull
                                            ? "bg-red-50 text-red-700 border-red-200"
                                            : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                        )}>
                                          {isFull ? `成員滿額 (${currentCount}/6人)` : `現有成員: ${currentCount}/6人 (尚有 ${6 - currentCount} 個空位)`}
                                        </span>
                                      </div>
                                      {!isFull && (
                                         <div className="p-3.5 bg-white rounded-xl border border-emerald-200 space-y-2">
                                           <Label className="text-xs font-bold text-emerald-950 block">
                                             設定新學員 ({form.watch('name') || '新學員'}) 新增分配堂數 *
                                           </Label>
                                           <div className="flex items-center gap-3">
                                             <input
                                               type="number"
                                               min={0}
                                               value={joiningStudentSessions}
                                               onChange={(e) => {
                                                 const val = Math.max(0, parseInt(e.target.value) || 0)
                                                 setJoiningStudentSessions(val)
                                               }}
                                               className="h-9 w-32 rounded-xl border border-emerald-300 bg-emerald-50/30 px-3 text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                             />
                                             <span className="text-xs font-bold text-stone-600">堂</span>
                                             <div className="text-[11px] text-emerald-800 font-semibold">
                                               (新增金額: <span className="font-bold font-mono">NT$ {addedAmount.toLocaleString()}</span>)
                                             </div>
                                           </div>
                                           <div className="text-[11px] text-stone-600 font-medium pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                                             <span>更新後團體合約總堂數：<strong className="text-emerald-900 font-mono text-xs">{newTotalSessions} 堂</strong></span>
                                             <span>更新後團體合約總金額：<strong className="text-emerald-900 font-mono text-xs">NT$ {newTotalAmount.toLocaleString()}</strong></span>
                                           </div>
                                         </div>
                                       )}

                                       {isFull && (
                                         <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-[11px] font-bold border border-red-200 flex items-center gap-1.5">
                                           <RiAlertLine className="w-4 h-4 shrink-0" />
                                           <span>此團體合約成員人數已達上限 (6人)，無法再新增綁定！</span>
                                         </div>
                                       )}

                                       <div className="p-3 bg-emerald-100/50 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-950 font-medium space-y-1.5">
                                         <div className="font-bold text-emerald-900 flex items-center gap-1">
                                           💡 團體合約分配與使用說明：
                                         </div>
                                         <ul className="list-disc pl-4 space-y-1 text-stone-700 leading-relaxed">
                                           <li>連結完成後，新學員 <strong className="text-stone-900">{form.watch('name') || '新學員'}</strong> 將加入成為該團體合約第 {currentCount + 1} 位成員。</li>
                                           <li>各學員於團體合約中擁有專屬配額堂數，修改學員堂數時，系統會比照每堂金額 (NT$ {pricePerSession}/堂) 同步更新團體合約之<strong>總堂數、剩餘堂數與總金額</strong>。</li>
                                           <li>學員出席團體課銷課時，將同步扣抵該學員之個人配額與合約之剩餘堂數。</li>
                                         </ul>
                                       </div>
                                       {selectedContract.groupMemberQuotas && (
                                         <div className="space-y-1.5 bg-white/80 p-3 rounded-xl border border-emerald-100">
                                           <div className="text-[11px] font-bold text-emerald-900 mb-1">現有合約團員名單：</div>
                                           <div className="grid grid-cols-2 gap-1.5">
                                             {Object.values(selectedContract.groupMemberQuotas as Record<string, any>).map((gm: any, i: number) => (
                                               <div key={i} className="px-2 py-1 bg-emerald-50 rounded border border-emerald-200/60 flex justify-between text-[10px]">
                                                 <span className="font-bold text-stone-800">👤 {gm.customerName}</span>
                                                 <span className="font-mono text-emerald-700 font-bold">{gm.remainingSessions}/{gm.totalSessions}堂</span>
                                               </div>
                                             ))}
                                           </div>
                                         </div>
                                       )}
                                     </div>
                                   )
                                 }

                                if (isShared) {
                                  return (
                                    <div className="mt-4 p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-3 text-xs text-stone-700 shadow-sm animate-in fade-in duration-300">
                                      <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                                        <h4 className="font-bold text-blue-950 text-sm flex items-center gap-1.5">
                                          <RiUserSharedLine className="w-4 h-4 text-blue-600" />
                                          <span>👥 多人共享合約新增成員明細</span>
                                        </h4>
                                        <span className={cn(
                                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                          isFull
                                            ? "bg-red-50 text-red-700 border-red-200"
                                            : "bg-blue-100 text-blue-800 border-blue-200"
                                        )}>
                                          {isFull ? `成員滿額 (${currentCount}/4人)` : `現有成員: ${currentCount}/4人 (尚有 ${4 - currentCount} 個空位)`}
                                        </span>
                                      </div>

                                      {!isFull && (
                                        <div className="p-2.5 bg-blue-100/70 text-blue-900 rounded-xl text-[11px] font-bold border border-blue-200 flex items-center gap-1.5">
                                          <span>✨ 新學員「{form.watch('name') || '新學員'}」將新增綁定為共享合約成員之一。</span>
                                        </div>
                                      )}

                                      {isFull && (
                                        <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-[11px] font-bold border border-red-200 flex items-center gap-1.5">
                                          <RiAlertLine className="w-4 h-4 shrink-0" />
                                          <span>此共享合約成員人數已達上限 (4人)，無法再新增綁定！</span>
                                        </div>
                                      )}

                                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 pt-1 text-[11px] text-stone-600">
                                        <div>合約編號: <span className="font-bold text-stone-900">{selectedContract.contractNumber || selectedContract.id}</span></div>
                                        <div>授課教練: <span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract.trainerId)?.name || selectedContract.trainerId || '未指定'}</span></div>
                                        <div>合約總堂數: <span className="font-bold text-stone-900">{selectedContract.totalSessions} 堂</span></div>
                                        <div>合約剩餘堂數: <span className="font-bold text-stone-900">{selectedContract.remainingSessions} 堂</span></div>
                                      </div>
                                    </div>
                                  )
                                }

                                if (isDual) {
                                  return (
                                    <div className="mt-4 p-4 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-3 text-xs text-stone-700 shadow-sm animate-in fade-in duration-300">
                                      <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                                        <h4 className="font-bold text-amber-950 text-sm">👥 雙人合約明細</h4>
                                        <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold border border-red-200">
                                          已滿額 (2/2人)
                                        </span>
                                      </div>
                                      <div className="p-2.5 bg-red-50 text-red-700 rounded-xl text-[11px] font-bold border border-red-200 flex items-center gap-1.5">
                                        <RiAlertLine className="w-4 h-4 shrink-0" />
                                        <span>此雙人合約成員已滿 (2/2人)，無法再新增綁定學員。</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 pt-1 text-[11px]">
                                        <div>合約編號: <span className="font-bold text-stone-900">{selectedContract.contractNumber || selectedContract.id}</span></div>
                                        <div>授課教練: <span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract.trainerId)?.name || selectedContract.trainerId || '未指定'}</span></div>
                                      </div>
                                    </div>
                                  )
                                }

                                return (
                                  <div className="mt-4 p-4 bg-white rounded-xl border border-blue-100 space-y-3 text-xs text-stone-600 shadow-sm animate-in fade-in duration-300">
                                    <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                                      <h4 className="font-bold text-blue-950 text-sm">👤 個人合約明細</h4>
                                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold text-[10px]">
                                        個人合約 (綁定後轉雙人)
                                      </span>
                                    </div>

                                    <div className="p-2.5 bg-blue-50 text-blue-900 rounded-xl text-[11px] font-bold border border-blue-100 flex items-center gap-1.5">
                                      <RiInformationLine className="w-4 h-4 shrink-0 text-blue-600" />
                                      <span>綁定此個人合約後，系統將自動升級轉換為「雙人共享合約」，由兩位學員共同持用。</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 pt-1 text-[11px]">
                                      <div>合約編號: <span className="font-bold text-stone-900">{selectedContract.contractNumber || selectedContract.id}</span></div>
                                      <div>授課教練: <span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract.trainerId)?.name || selectedContract.trainerId || '未指定'}</span></div>
                                      <div>總堂數: <span className="font-bold text-stone-900">{selectedContract.totalSessions} 堂</span></div>
                                      <div>剩餘堂數: <span className="font-bold text-stone-900">{selectedContract.remainingSessions} 堂</span></div>
                                      <div>合約金額: <span className="font-bold text-stone-900">NT$ {selectedContract.totalAmount.toLocaleString()}</span></div>
                                      <div>已付金額: <span className="font-bold text-stone-900">NT$ {selectedContract.paidAmount.toLocaleString()}</span></div>
                                    </div>
                                  </div>
                                )
                              })()}

                            {/* 第二位學員的授課教練選擇 (僅在個人合約轉雙人合約時出現) */}
                            {isSingleBinding && (
                              <div className="space-y-2 pt-2 border-t border-blue-100">
                                <Label className="text-blue-950 dark:text-blue-200 font-bold block text-xs">第二位學員的授課教練 *</Label>
                                <p className="text-[10px] text-blue-700 dark:text-blue-400">請為即將加入此合約的第二位學員選擇授課教練</p>
                                <div className="relative">
                                  <select
                                    value={form.watch('contract.secondaryTrainerId') || ''}
                                    onChange={(e) => form.setValue('contract.secondaryTrainerId', e.target.value || null)}
                                    className="w-full h-10 rounded-xl border border-blue-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                                  >
                                    <option value="">-- 請選擇教練 --</option>
                                    {trainers.map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                  <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                                {form.formState.errors.contract?.secondaryTrainerId && (
                                  <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.secondaryTrainerId.message}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {!form.watch('bindExistingContractMode') && (
                          <>
                            {form.watch('contract.contractType') === 'dual' && (
                              <div className="col-span-2 p-5 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                <Label className="text-stone-700 font-semibold block text-xs">共享學員綁定方式 *</Label>
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      form.setValue('partnerMode', 'existing')
                                      form.setValue('partnerCustomerData', null)
                                    }}
                                    className={cn(
                                      "flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1.5",
                                      form.watch('partnerMode') === 'existing'
                                        ? "bg-amber-500 border-amber-500 text-white shadow-md"
                                        : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                    )}
                                  >
                                    <RiLinkM className="w-4 h-4" />
                                    連結現有學員
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      form.setValue('partnerMode', 'new')
                                      form.setValue('partnerId', null)
                                      form.setValue('sharedWithCustomerId', null)
                                      form.setValue('partnerCustomerData', {
                                        name: '',
                                        idNumber: '',
                                        phone: '',
                                        email: '',
                                        dateOfBirth: new Date() as any,
                                        historicalSessions: 0,
                                        emergencyContact: { name: '', relation: '', phone: '' },
                                        sharedContractCustomerId: null,
                                        medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
                                      })
                                    }}
                                    className={cn(
                                      "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all",
                                      form.watch('partnerMode') === 'new'
                                        ? "bg-amber-500 border-amber-500 text-white shadow-md"
                                        : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                    )}
                                  >
                                    <RiUserAddLine className="w-4 h-4" />
                                    新增全新學員
                                  </button>
                                </div>

                                {form.watch('partnerMode') === 'existing' && (
                                  <div className="space-y-2 pt-1">
                                    <Label className="text-xs text-stone-500 font-medium">選擇現有學員 *</Label>
                                    <SearchableCustomerSelect
                                      customers={activeCustomers}
                                      value={form.watch('sharedWithCustomerId') || ''}
                                      onChange={(val) => {
                                        form.setValue('sharedWithCustomerId', val || null)
                                        form.setValue('partnerId', val || null)
                                      }}
                                      excludeIds={initialCustomer?.id ? [initialCustomer.id] : []}
                                      placeholder="-- 請搜尋或選擇共享學員 --"
                                    />
                                    {form.watch('sharedWithCustomerId') && (
                                      <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-100">
                                        <RiUserSharedLine className="w-3 h-3 shrink-0" />
                                        此合約將由主學員與 {(activeCustomers || []).find(c => c.id === form.watch('sharedWithCustomerId'))?.name || '選擇的學員'} 共同持有。
                                      </p>
                                    )}
                                  </div>
                                )}

                                {form.watch('partnerMode') === 'new' && (
                                  <div className="flex items-start gap-2.5 p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-semibold border border-amber-100">
                                    <RiUserAddLine className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>已選擇新增全新學員。下一步將引導您填寫第二位學員的基本資料與健康狀態。</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* 課程教練分配 (單人、雙人與團體合約) — 共享合約教練於各學員卡片中獨立設定 */}
                            {!form.watch('bindExistingContractMode') && (watchedValues.contract?.contractType === 'single' || watchedValues.contract?.contractType === 'dual' || watchedValues.contract?.contractType === 'group') && (
                              <div className="space-y-4 border-t border-stone-100 dark:border-stone-800 pt-6 col-span-2">
                                <div className="space-y-1">
                                  <Label className="text-stone-700 dark:text-stone-300 font-bold block text-xs">分配課程教練 *</Label>
                                  <p className="text-[10px] text-stone-400 dark:text-stone-500">
                                    {watchedValues.contract?.contractType === 'group' ? '設定指導本團體合約 (1位教練+多位學員) 之主授課教練' : watchedValues.contract?.contractType === 'dual' ? '設定指導本雙人合約 (1位教練+2位學員) 之授課教練' : '設定指導本合約學員之授課教練'}
                                  </p>
                                </div>

                                <div className="space-y-2 max-w-md">
                                  <Label className="text-xs text-stone-500 dark:text-stone-400 font-medium">授課教練 *</Label>
                                  <div className="relative">
                                    <select
                                      value={form.watch('contract.trainerId') || ''}
                                      onChange={(e) => {
                                        form.setValue('contract.trainerId', e.target.value)
                                        form.setValue('contract.secondaryTrainerId', null)
                                      }}
                                      className="w-full h-10 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20 appearance-none cursor-pointer"
                                    >
                                      <option value="">-- 請選擇教練 --</option>
                                      {trainers.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                    <RiArrowDownSLine className="w-4 h-4 text-stone-400 dark:text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                  {form.formState.errors.contract?.trainerId && (
                                    <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.trainerId.message}</p>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="col-span-2 pt-3 border-t border-stone-200/60">
                              <Label className="text-stone-900 dark:text-stone-100 font-bold block text-xs">4. 合約方案與金額設定 *</Label>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">合約總堂數 *</Label>
                              <Input type="number" {...form.register('contract.totalSessions')} onChange={handleSessionsChange} className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">合約總金額 *</Label>
                              <Input type="number" {...form.register('contract.totalAmount')} onChange={handleTotalAmountChange} className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">已付金額</Label>
                              <Input type="number" {...form.register('contract.paidAmount')} className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white" readOnly={form.watch('contract.paymentType') === 'installments'} />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">合約開始日 *</Label>
                              <Input 
                                type="date" 
                                {...form.register('contract.startDate')} 
                                onChange={(e) => {
                                  const val = e.target.value
                                  form.setValue('contract.startDate', val as any, { shouldValidate: true })
                                  if (val) {
                                    const oneYearLater = addOneYearToDateString(val)
                                    if (oneYearLater) {
                                      form.setValue('contract.endDate', oneYearLater as any, { shouldValidate: true })
                                    }
                                  }
                                }}
                                className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white" 
                              />
                              {form.formState.errors.contract?.startDate && (
                                <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.startDate.message}</p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">合約結束日 *</Label>
                              <Input 
                                type="date" 
                                {...form.register('contract.endDate')} 
                                onChange={(e) => {
                                  form.setValue('contract.endDate', e.target.value as any, { shouldValidate: true })
                                }}
                                className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white" 
                              />
                              {form.formState.errors.contract?.endDate && (
                                <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.endDate.message}</p>
                              )}
                            </div>

                            {/* 付款方式與分期設定 */}
                            <div className="space-y-3 border-t border-stone-100 dark:border-stone-800 pt-5 col-span-2">
                              <Label className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wide block">付款方式 *</Label>
                              <div className="flex gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    form.setValue('contract.paymentType', 'single');
                                    syncInstallments('single', 2, form.getValues('contract.totalAmount') || 0, form.getValues('contract.startDate') || new Date());
                                  }}
                                  className={cn(
                                    "flex-1 py-2.5 px-4 rounded-xl border-2 font-semibold text-xs transition-all flex items-center justify-center gap-2",
                                    form.watch('contract.paymentType') !== 'installments'
                                      ? "bg-stone-950 dark:bg-white border-stone-950 dark:border-white text-white dark:text-stone-900 shadow-md"
                                      : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300"
                                  )}
                                >
                                  <RiCurrencyLine className="w-3.5 h-3.5" />
                                  一次付清
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    form.setValue('contract.paymentType', 'installments');
                                    syncInstallments('installments', form.getValues('contract.installmentCount') || 2, form.getValues('contract.totalAmount') || 0, form.getValues('contract.startDate') || new Date());
                                  }}
                                  className={cn(
                                    "flex-1 py-2.5 px-4 rounded-xl border-2 font-semibold text-xs transition-all flex items-center justify-center gap-2",
                                    form.watch('contract.paymentType') === 'installments'
                                      ? "bg-brand-500 border-brand-500 text-white shadow-md shadow-brand-500/20"
                                      : "bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300"
                                  )}
                                >
                                  <RiBankCardLine className="w-3.5 h-3.5" />
                                  分期付款
                                </button>
                              </div>

                              {form.watch('contract.paymentType') === 'installments' && (
                                <div className="p-5 bg-stone-50 border border-stone-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                  <div className="flex justify-between items-center">
                                    <Label className="text-stone-700 dark:text-stone-300 font-bold block text-xs">選擇分期期數 *</Label>
                                    <div className="relative">
                                      <select
                                        value={form.watch('contract.installmentCount') || 2}
                                        onChange={(e) => {
                                          const count = Number(e.target.value);
                                          form.setValue('contract.installmentCount', count);
                                          syncInstallments('installments', count, form.getValues('contract.totalAmount') || 0, form.getValues('contract.startDate') || new Date());
                                        }}
                                        className="h-9 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-3 pr-7 text-xs font-bold focus:outline-none appearance-none cursor-pointer"
                                      >
                                        {Array.from({ length: 15 }, (_, i) => i + 2).map(num => (
                                          <option key={num} value={num}>{num} 期</option>
                                        ))}
                                      </select>
                                      <RiArrowDownSLine className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    {form.watch('contract.installments')?.map((inst, idx) => {
                                      const isFirst = idx === 0;
                                      return (
                                        <div key={inst.id || idx} className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-xl border border-stone-200">
                                          <div className="col-span-3 text-xs font-bold text-stone-700">
                                            第 {idx + 1} 期
                                            {isFirst && <span className="ml-1 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-normal">首期即付</span>}
                                          </div>
                                          <div className="col-span-4">
                                            <Label className="text-[10px] text-stone-400 block mb-1">繳款金額 *</Label>
                                            <Input
                                              type="number"
                                              value={inst.amount}
                                              onChange={(e) => {
                                                const val = Number(e.target.value) || 0;
                                                const updated = [...(form.getValues('contract.installments') || [])];
                                                updated[idx] = { ...updated[idx], amount: val };
                                                form.setValue('contract.installments', updated);
                                                
                                                const paidSum = updated.reduce((sum, item) => item.status === 'paid' ? sum + item.amount : sum, 0);
                                                form.setValue('contract.paidAmount', paidSum);
                                              }}
                                              className="h-8 text-xs font-bold bg-stone-50 border-stone-200"
                                              placeholder="金額"
                                            />
                                          </div>
                                          <div className="col-span-5">
                                            <Label className="text-[10px] text-stone-400 block mb-1">繳款日期 *</Label>
                                            <Input
                                              type="date"
                                              value={inst.dueDate ? (inst.dueDate instanceof Date ? inst.dueDate.toISOString().split('T')[0] : new Date(inst.dueDate).toISOString().split('T')[0]) : ''}
                                              onChange={(e) => {
                                                const dateVal = e.target.value ? new Date(e.target.value) : new Date();
                                                const updated = [...(form.getValues('contract.installments') || [])];
                                                updated[idx] = { ...updated[idx], dueDate: dateVal };
                                                form.setValue('contract.installments', updated);
                                              }}
                                              className="h-8 text-xs bg-stone-50 border-stone-200"
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {(() => {
                                    const insts = form.watch('contract.installments') || [];
                                    const sum = insts.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                                    const total = form.watch('contract.totalAmount') || 0;
                                    const isDiff = Math.abs(sum - total) > 0.01;
                                    
                                    let isDateError = false;
                                    for (let i = 0; i < insts.length - 1; i++) {
                                      const currentVal = insts[i];
                                      const nextVal = insts[i + 1];
                                      if (currentVal.dueDate && nextVal.dueDate && new Date(currentVal.dueDate) > new Date(nextVal.dueDate)) {
                                        isDateError = true;
                                        break;
                                      }
                                    }

                                    if (isDiff || isDateError) {
                                      return (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl col-span-12">
                                          <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                                            <RiAlertLine className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <div className="space-y-0.5">
                                              {isDiff && <div className="text-[11px] font-semibold">分期繳款總額 (NT$ {sum.toLocaleString()}) 與合約總金額 (NT$ {total.toLocaleString()}) 不符！</div>}
                                              {isDateError && <div className="text-[11px] font-semibold">繳款日期防呆：前一期繳款日期不能晚於下一期！</div>}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      
                      {!form.watch('bindExistingContractMode') && (
                        <div className="mt-2 p-4 bg-stone-950 dark:bg-white/5 rounded-xl flex items-center justify-between">
                          <div>
                            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1">單堂平均價格</p>
                            <div className="text-xl font-black text-brand-400 flex items-baseline gap-1.5">
                              <span className="text-sm font-medium text-stone-500">NT$</span>
                              <span>{(form.watch('contract.pricePerSession') || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-stone-600 text-[10px] mb-1">根據總金額與堂數自動計算</p>
                            <RiCurrencyLine className="w-5 h-5 text-stone-700 ml-auto" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'partner_basic' && (
                    <div className="space-y-7">
                      <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-stone-900 dark:text-white">共享學員基本資料</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm">輸入第二位共享學員的聯絡方式與緊急聯繫人資訊。</p>
                      </div>
                      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">共享學員姓名 *</Label>
                          <Input {...form.register('partnerCustomerData.name')} placeholder="例如：陳小美" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">身分證字號 *</Label>
                          <Input {...form.register('partnerCustomerData.idNumber')} placeholder="B223456789" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">電話 *</Label>
                          <Input {...form.register('partnerCustomerData.phone')} placeholder="0987-654-321" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">Email</Label>
                          <Input type="email" {...form.register('partnerCustomerData.email')} placeholder="partner@mail.com" className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white placeholder:text-stone-400 transition-all rounded-xl" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">出生年月日 *</Label>
                          <MinguoDatePickerInput
                            value={form.watch('partnerCustomerData.dateOfBirth')}
                            onChange={(d) => form.setValue('partnerCustomerData.dateOfBirth', d as any, { shouldValidate: true })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">歷史已上堂數</Label>
                          <Input type="number" {...form.register('partnerCustomerData.historicalSessions')} className="h-10 bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-900 dark:text-white transition-all rounded-xl" />
                        </div>
                      </div>
                      <div className="p-5 bg-stone-50 dark:bg-stone-800/50 rounded-2xl border border-stone-100 dark:border-stone-700/50 space-y-4">
                        <h3 className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2 uppercase tracking-wide">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          緊急聯絡人資訊（共享學員）
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-stone-500 dark:text-stone-400">姓名 *</Label>
                            <Input {...form.register('partnerCustomerData.emergencyContact.name')} className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-stone-500 dark:text-stone-400">關係 *</Label>
                            <Input {...form.register('partnerCustomerData.emergencyContact.relation')} className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] text-stone-500 dark:text-stone-400">電話 *</Label>
                            <Input {...form.register('partnerCustomerData.emergencyContact.phone')} className="h-9 text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-white rounded-xl" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'partner_medical' && (
                    <div className="space-y-7">
                      <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-stone-900 dark:text-white">共享學員健康狀態</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm">了解第二位學員的身體狀況以進行更安全的課程設計。</p>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide block">慢性病史 (可複選)</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {['無狀況', '高血壓', '心臟病', '糖尿病', '氣喘', '癲癇', '骨質疏鬆', '自體免疫', '癌症', '其他'].map((condition) => (
                              <label key={condition} className={cn(
                                "flex items-center gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer",
                                (form.watch('partnerCustomerData.medicalHistory.chronicConditions') || []).includes(condition) 
                                  ? "bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/40 text-brand-700 dark:text-brand-400" 
                                  : "bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-600"
                              )}>
                                <input
                                  type="checkbox"
                                  value={condition}
                                  className="hidden"
                                  {...form.register('partnerCustomerData.medicalHistory.chronicConditions', {
                                    onChange: (e) => {
                                      const checked = e.target.checked
                                      const val = e.target.value
                                      const current = form.getValues('partnerCustomerData.medicalHistory.chronicConditions') || []
                                      if (val === '無狀況' && checked) {
                                        form.setValue('partnerCustomerData.medicalHistory.chronicConditions', ['無狀況'])
                                      } else if (val !== '無狀況' && checked) {
                                        form.setValue('partnerCustomerData.medicalHistory.chronicConditions', current.filter(x => x !== '無狀況'))
                                      }
                                    }
                                  })}
                                />
                                <div className={cn(
                                  "w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center shrink-0",
                                  (form.watch('partnerCustomerData.medicalHistory.chronicConditions') || []).includes(condition) 
                                    ? "bg-brand-500 border-brand-500" 
                                    : "border-stone-300 dark:border-stone-600"
                                )}>
                                  {(form.watch('partnerCustomerData.medicalHistory.chronicConditions') || []).includes(condition) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <span className="text-xs font-semibold">{condition}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wide block">傷病史 (可複選)</Label>
                          <div className="grid grid-cols-5 gap-2">
                            {['無狀況', '肩部', '手肘', '手腕', '下背', '髖關節', '膝蓋', '腳踝', '其他'].map((injury) => (
                              <label key={injury} className={cn(
                                "flex items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer text-center",
                                (form.watch('partnerCustomerData.medicalHistory.injuries') || []).includes(injury) 
                                  ? "bg-stone-900 dark:bg-white border-stone-900 dark:border-white text-white dark:text-stone-900" 
                                  : "bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500"
                              )}>
                                <input
                                  type="checkbox"
                                  value={injury}
                                  className="hidden"
                                  {...form.register('partnerCustomerData.medicalHistory.injuries', {
                                    onChange: (e) => {
                                      const checked = e.target.checked
                                      const val = e.target.value
                                      const current = form.getValues('partnerCustomerData.medicalHistory.injuries') || []
                                      if (val === '無狀況' && checked) {
                                        form.setValue('partnerCustomerData.medicalHistory.injuries', ['無狀況'])
                                      } else if (val !== '無狀況' && checked) {
                                        form.setValue('partnerCustomerData.medicalHistory.injuries', current.filter(x => x !== '無狀況'))
                                      }
                                    }
                                  })}
                                />
                                <span className="text-[11px] font-bold">{injury}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-stone-600 dark:text-stone-400">其他身體狀況說明</Label>
                          <textarea 
                            {...form.register('partnerCustomerData.medicalHistory.notes')} 
                            className="w-full h-28 p-3.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white focus:bg-white dark:focus:bg-stone-750 focus:ring-2 focus:ring-brand-500/20 transition-all text-sm outline-none placeholder:text-stone-400"
                            placeholder="例如：右膝前十字韌帶曾開刀..." 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'signature' && (
                    <div className="space-y-6">
                      <div className="space-y-1 pb-5 border-b border-stone-100 dark:border-stone-800">
                        <h2 className="text-xl font-bold text-stone-900 dark:text-white">簽署確認</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm">請閱讀合約條款並在下方簽名。</p>
                      </div>

                      <div className="space-y-4">
                        {/* Summary Card */}
                        <div className={cn(
                          "rounded-3xl p-6 text-white space-y-4 shadow-xl transition-colors duration-500",
                          form.watch('contract.contractType') === 'dual' ? "bg-[#293847]" : "bg-stone-900"
                        )}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">客戶姓名</p>
                              <h3 className="text-xl font-bold">
                                {form.watch('name') || '未填寫'}
                                {form.watch('contract.contractType') === 'dual' && (
                                  <>
                                    {' ＆ '}
                                    {partnerNameStr}
                                  </>
                                )}
                              </h3>
                            </div>
                            <div className="text-right">
                              <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">合約總金額</p>
                              <p className="text-xl font-bold text-brand-400">NT$ {displayAmount?.toLocaleString() || '0'}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-white/10">
                            <div>
                              <p className="text-white/40 text-[10px] uppercase font-bold">聯絡電話</p>
                              <p>{form.watch('phone') || '-'}</p>
                            </div>
                            <div>
                              <p className="text-white/40 text-[10px] uppercase font-bold">合約堂數</p>
                              <p>{displaySessions || 0} 堂</p>
                            </div>
                          </div>
                        </div>

                        {/* Contract Terms */}
                        <div className="space-y-2">
                          <Label className="text-stone-700 font-bold text-sm">合約預覽與條款</Label>
                          {(() => {
                            const isDual = form.watch('contract.contractType') === 'dual'
                            const isGroup = form.watch('contract.contractType') === 'group'
                            const isShared = form.watch('contract.contractType') === 'shared'
                            const partnerMode = form.watch('partnerMode')
                            const reviewDate = formatROCDate(form.watch('contract.startDate') || new Date())
                            
                            // Primary Info
                            const primaryInfo = {
                              name: form.watch('name'),
                              idNumber: form.watch('idNumber'),
                              dobStr: (() => {
                            const d = formatROCDate(form.watch('dateOfBirth'))
                                return d.y ? `${d.y}/${d.m}/${d.d}` : ''
                              })(),
                              phone: form.watch('phone'),
                              email: form.watch('email'),
                              emergencyName: form.watch('emergencyContact.name'),
                              emergencyRelation: form.watch('emergencyContact.relation'),
                              emergencyPhone: form.watch('emergencyContact.phone'),
                            }

                            // Partner Info
                            let partnerInfo = null
                            if (isDual) {
                              if (partnerMode === 'existing') {
                                const partnerObj = activeCustomers.find(c => c.id === form.watch('partnerId'))
                                if (partnerObj) {
                                  partnerInfo = {
                                    name: partnerObj.name,
                                    idNumber: partnerObj.idNumber || '',
                                    dobStr: (() => {
                                      const d = formatROCDate(partnerObj.dateOfBirth)
                                      return d.y ? `${d.y}/${d.m}/${d.d}` : ''
                                    })(),
                                    phone: partnerObj.phone,
                                    email: partnerObj.email || '',
                                    emergencyName: partnerObj.emergencyContact?.name || '',
                                    emergencyRelation: partnerObj.emergencyContact?.relation || '',
                                    emergencyPhone: partnerObj.emergencyContact?.phone || '',
                                  }
                                }
                              } else if (partnerMode === 'new') {
                                partnerInfo = {
                                  name: form.watch('partnerCustomerData.name'),
                                  idNumber: form.watch('partnerCustomerData.idNumber'),
                                  dobStr: (() => {
                                    const d = formatROCDate(form.watch('partnerCustomerData.dateOfBirth'))
                                    return d.y ? `${d.y}/${d.m}/${d.d}` : ''
                                  })(),
                                  phone: form.watch('partnerCustomerData.phone'),
                                  email: form.watch('partnerCustomerData.email'),
                                  emergencyName: form.watch('partnerCustomerData.emergencyContact.name'),
                                  emergencyRelation: form.watch('partnerCustomerData.emergencyContact.relation'),
                                  emergencyPhone: form.watch('partnerCustomerData.emergencyContact.phone'),
                                }
                              }
                            }

                            const coachA = trainers.find(t => t.id === form.watch('contract.trainerId'))?.name || '未指定'
                            const coachB = trainers.find(t => t.id === form.watch('contract.secondaryTrainerId'))?.name
                            const coachNames = (() => {
                              if (isShared) {
                                const list = [`學員 1 (${primaryInfo.name || '主學員'}): ${coachA}`]
                                additionalGroupMembers.forEach((m, idx) => {
                                  const tName = trainers.find(t => t.id === (m as any).assignedTrainerId)?.name || coachA
                                  list.push(`學員 ${idx + 2} (${m.name || '成員'}): ${tName}`)
                                })
                                return list.join('；')
                              }
                              if (isDual) {
                                return coachB && coachB !== coachA ? `學員 A: ${coachA} / 學員 B: ${coachB}` : `${coachA} (同教練)`
                              }
                              return coachA
                            })()

                            const totalSessions = form.watch('contract.totalSessions') || 0
                            const totalAmount = form.watch('contract.totalAmount') || 0
                            const pricePerSession = totalSessions > 0 ? Math.round(totalAmount / totalSessions) : 0
                            const startDate = formatROCDate(form.watch('contract.startDate'))
                            const endDate = formatROCDate(form.watch('contract.endDate'))
                            const paymentType = form.watch('contract.paymentType')
                            const installmentCount = form.watch('contract.installmentCount') || 2
                            const paymentTypeStr = paymentType === 'single'
                              ? '☑ 單次付清  □ 分期付款'
                              : `□ 單次付清  ☑ 分期付款（共 ${installmentCount} 期）`

                            const isBindMode = form.watch('bindExistingContractMode')
                            if (isBindMode) {
                              return (
                                <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-stone-200 bg-stone-100 p-4 space-y-6">
                                  <div className="printable-contract-sheet bg-white text-stone-900 border border-stone-150 rounded-2xl p-6 space-y-5 leading-relaxed text-xs shadow-sm">
                                    <div className="text-center space-y-1.5 border-b-2 border-stone-800 pb-3">
                                      <h1 className="text-base font-black text-stone-900 tracking-tight">{brandName} 連結現有合約同意書</h1>
                                      <div className="flex justify-between text-[9px] font-bold text-stone-500">
                                        <span>紅二七健身有限公司</span>
                                        <span>連結合約編號：{selectedContract?.contractNumber || selectedContract?.id?.substring(0, 8)}</span>
                                      </div>
                                    </div>

                                    {selectedContract?.contractType === 'group' ? (
                                      <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl space-y-2 text-xs">
                                        <p className="font-bold text-emerald-950">👥 連結團體合約說明：</p>
                                        <p>本同意書旨在確認新學員 <span className="font-bold underline">{primaryInfo.name}</span> 加入並連結原屬於學員 <span className="font-bold underline">{partnerNameStr}</span> 之現有團體合約（合約編號：{selectedContract?.contractNumber || selectedContract?.id}）。</p>
                                        <p>學員簽署後，將加入該團體合約並新增分配 <span className="font-bold text-emerald-950">{joiningStudentSessions} 堂</span> 個人配額，系統已自動按每堂金額 (NT$ {(selectedContract?.pricePerSession || (selectedContract?.totalSessions ? Math.round((selectedContract.totalAmount || 0) / selectedContract.totalSessions) : 0)).toLocaleString()}/堂) 同步更新合約總堂數、剩餘堂數與總金額。</p>
                                      </div>
                                    ) : selectedContract?.contractType === 'shared' ? (
                                      <div className="p-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl space-y-2 text-xs">
                                        <p className="font-bold text-blue-950">👥 連結共享合約說明：</p>
                                        <p>本同意書旨在確認新學員 <span className="font-bold underline">{primaryInfo.name}</span> 加入並連結原屬於學員 <span className="font-bold underline">{partnerNameStr}</span> 之現有共享合約（合約編號：{selectedContract?.contractNumber || selectedContract?.id}）。</p>
                                        <p>新學員簽署後，將成為該共享合約成員之一，全體成員共享合約內剩餘之 {selectedContract?.remainingSessions} 堂課程。</p>
                                      </div>
                                    ) : (
                                      <div className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl space-y-2 text-xs">
                                        <p className="font-bold text-amber-950">👥 連結雙人合約說明：</p>
                                        <p>本同意書旨在確認新學員 <span className="font-bold underline">{primaryInfo.name}</span> 加入並連結原屬於學員 <span className="font-bold underline">{partnerNameStr}</span> 之現有合約（合約編號：{selectedContract?.contractNumber || selectedContract?.id}）。</p>
                                        <p>新學員簽署後，該合約將轉為「雙人合約」，雙方共同持用該合約內剩餘之 {selectedContract?.remainingSessions} 堂課程，並共同遵守原合約之所有條款與請假、退費規定。</p>
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      <h3 className="font-bold text-stone-900 text-xs border-b border-stone-300 pb-1">現有合約內容</h3>
                                      <div className="grid grid-cols-2 gap-y-1.5 text-stone-600 text-[10px]">
                                        <div>原合約持有人：<span className="font-bold text-stone-900">{partnerNameStr}</span></div>
                                        <div>新加入持有人：<span className="font-bold text-stone-900">{primaryInfo.name}</span></div>
                                        {selectedContract?.contractType === 'group' ? (
                                          <>
                                            <div>原合約總堂數：<span className="font-bold text-stone-900">{selectedContract?.totalSessions} 堂</span></div>
                                            <div>新成員分配堂數：<span className="font-bold text-emerald-800">{joiningStudentSessions} 堂</span></div>
                                            <div>更新後總堂數：<span className="font-bold text-stone-900">{(selectedContract?.totalSessions || 0) + joiningStudentSessions} 堂</span></div>
                                            <div>更新後總金額：<span className="font-bold text-stone-900">NT$ {((selectedContract?.totalAmount || 0) + Math.round(joiningStudentSessions * (selectedContract?.pricePerSession || (selectedContract?.totalSessions ? Math.round((selectedContract.totalAmount || 0) / selectedContract.totalSessions) : 0)))).toLocaleString()}</span></div>
                                          </>
                                        ) : (
                                          <>
                                            <div>合約總堂數：<span className="font-bold text-stone-900">{selectedContract?.totalSessions} 堂</span></div>
                                            <div>剩餘堂數：<span className="font-bold text-stone-900">{selectedContract?.remainingSessions} 堂</span></div>
                                            <div>合約總金額：<span className="font-bold text-stone-900">NT$ {selectedContract?.totalAmount.toLocaleString()}</span></div>
                                          </>
                                        )}
                                        <div>授課教練：<span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract?.trainerId)?.name || '未指定'}</span></div>
                                        <div className="col-span-2">合約期間：<span className="font-bold text-stone-900">
                                          {selectedContract?.startDate ? new Date(selectedContract.startDate.seconds ? selectedContract.startDate.seconds * 1000 : selectedContract.startDate).toLocaleDateString() : ''}
                                          {' ~ '}
                                          {selectedContract?.endDate ? new Date(selectedContract.endDate.seconds ? selectedContract.endDate.seconds * 1000 : selectedContract.endDate).toLocaleDateString() : ''}
                                        </span></div>
                                      </div>
                                    </div>

                                    {selectedContract?.contractType === 'group' ? (
                                      <div className="border-t border-stone-300 pt-4 space-y-3.5 text-[11px] text-stone-600">
                                        <p className="font-bold text-stone-900">團體合約成員共同簽約同意條款</p>
                                        <p>1. 各成員於團體合約中擁有獨立專屬之堂數配額，出席上課時將由個人配額與合約剩餘堂數同步扣抵。</p>
                                        <p>2. 各成員已充分閱讀並同意 {brandName} 私人教練/團體課程服務定型化契約之各項條款（包含退費、請假規則、過期處理等）。</p>
                                        <p>3. 簽署本同意書後，本合約變更立即生效，全體成員不得有異議。</p>
                                      </div>
                                    ) : (
                                      <div className="border-t border-stone-300 pt-4 space-y-3.5 text-[11px] text-stone-600">
                                        <p className="font-bold text-stone-900">學員共同簽約同意條款</p>
                                        <p>1. 雙方同意本合約之堂數為共享額度，任一方上課皆會扣除剩餘堂數。</p>
                                        <p>2. 雙方已充分閱讀並同意 {brandName} 私人教練服務定型化契約之各項條款（包含退費、請假規則、過期處理等）。</p>
                                        <p>3. 簽署本同意書後，本合約變更立即生效，雙方不得有異議。</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            }

                            return (
                              <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-stone-200 bg-stone-100 p-4 space-y-6">
                                <div className="printable-contract-sheet bg-white text-stone-900 border border-stone-150 rounded-2xl p-6 space-y-5 leading-relaxed text-xs shadow-sm">
                                   {/* Header */}
                                  <div className="text-center space-y-1.5 border-b-2 border-stone-800 pb-3">
                                    <h1 className="text-base font-black text-stone-900 tracking-tight">
                                      {brandName} {isGroup ? '團體健身教練課程契約書' : isShared ? '多人共享健身教練課程契約書' : isDual ? '雙人共享健身教練課程契約書' : '健身教練課程契約書'}
                                    </h1>
                                    <div className="flex justify-between text-[9px] font-bold text-stone-500">
                                      <span>紅二七健身有限公司</span>
                                      <span>合約編號：(系統自動產生)</span>
                                    </div>
                                  </div>

                                  {/* Review Agreement */}
                                  <div className="border border-stone-200 bg-stone-50/50 p-3.5 rounded-xl space-y-1.5">
                                    <h3 className="font-bold text-stone-900 text-xs border-b border-stone-200 pb-1 flex justify-between">
                                      <span>契約審閱權確認</span>
                                    </h3>
                                    <p className="leading-relaxed text-[11px]">
                                      本契約於中華民國 <span className="underline font-bold px-1">{reviewDate.y || '   '}</span> 年 <span className="underline font-bold px-1">{reviewDate.m || '  '}</span> 月 <span className="underline font-bold px-1">{reviewDate.d || '  '}</span> 日交由消費者審閱。
                                    </p>
                                    <p className="font-bold text-stone-900 text-[11px]">
                                      甲方確認已享有 三日以上 之契約審閱期間，並充分瞭解本契約條款內容。
                                    </p>
                                    <div className="flex justify-end items-center gap-2 pt-1">
                                      <span className="font-bold text-stone-700 text-[10px]">簽名確認：</span>
                                      <div className="w-28 h-6 border-b border-stone-400 flex items-center justify-center">
                                        <span className="text-stone-300 italic text-[9px]">(請於下方簽署)</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Parties */}
                                  <div className="space-y-3">
                                    <h3 className="font-bold text-stone-900 text-xs border-b border-stone-300 pb-1 flex justify-between">
                                      <span>立契約書人</span>
                                      {isGroup ? (
                                        <span className="text-[9px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                          <RiTeamLine className="w-3 h-3" /> 團體課合約模式 ({groupMemberCount} 人團課)
                                        </span>
                                      ) : isShared ? (
                                        <span className="text-[9px] text-blue-800 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                                          <RiUserSharedLine className="w-3 h-3" /> 多人共享合約模式 ({sharedMemberCount} 人共享堂數)
                                        </span>
                                      ) : isDual ? (
                                        <span className="text-[9px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                          雙人共享合約模式
                                        </span>
                                      ) : null}
                                    </h3>

                                    {/* 團體課成員堂數配額總覽 */}
                                    {isGroup && (
                                      <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-2 text-xs">
                                        <div className="font-bold text-emerald-900 text-[11px] flex items-center gap-1.5">
                                          <RiTeamLine className="w-3.5 h-3.5" />
                                          團體合約成員與獨立個人堂數配額明細 (全體總堂數: {totalSessions} 堂)：
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 bg-white rounded-lg border border-emerald-100 flex items-center justify-between text-[11px]">
                                            <span className="font-bold text-stone-800">學員 1 (主學員: {primaryInfo.name || '待定'})</span>
                                            <span className="font-mono font-bold text-emerald-700">{primaryMemberQuota} 堂</span>
                                          </div>
                                          {additionalGroupMembers.map((m, idx) => (
                                            <div key={idx} className="p-2 bg-white rounded-lg border border-emerald-100 flex items-center justify-between text-[11px]">
                                              <span className="font-bold text-stone-800">學員 {idx + 2} ({m.name || '待填寫'})</span>
                                              <span className="font-mono font-bold text-emerald-700">{m.allocatedSessions} 堂</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Primary Customer */}
                                    <div className="space-y-1.5 bg-stone-50/60 p-2.5 rounded-xl border border-stone-150">
                                      <div className="font-bold text-stone-800 border-b border-stone-200 pb-0.5 text-[9px] flex justify-between">
                                        <span>會員姓名（簡稱甲方）{isGroup ? ' - 學員 1 (主學員)' : isShared ? ' - 學員 1 (主學員)' : isDual ? ' - 學員 A' : ''}</span>
                                        {isGroup && <span className="text-emerald-700 font-mono">分配: {primaryMemberQuota} 堂</span>}
                                      </div>
                                      <div className="grid grid-cols-6 gap-x-2 gap-y-1 text-stone-600 text-[10px]">
                                        <div className="col-span-2">姓名：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[50px]">{primaryInfo.name || '──────'}</span></div>
                                        <div className="col-span-2">身分證字號：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{primaryInfo.idNumber || '──────'}</span></div>
                                        <div className="col-span-2">生日：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{primaryInfo.dobStr || '──────'}</span></div>
                                        <div className="col-span-3">電話：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{primaryInfo.phone || '──────'}</span></div>
                                        <div className="col-span-3">Email：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[120px] break-all">{primaryInfo.email || '──────'}</span></div>
                                        <div className="col-span-2">緊急聯絡人：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[40px]">{primaryInfo.emergencyName || '──────'}</span></div>
                                        <div className="col-span-2">關係：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[30px]">{primaryInfo.emergencyRelation || '──────'}</span></div>
                                        <div className="col-span-2">電話：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{primaryInfo.emergencyPhone || '──────'}</span></div>
                                      </div>
                                    </div>

                                    {/* Additional Shared or Group Members */}
                                    {(isGroup || isShared) && additionalGroupMembers.map((m, idx) => {
                                      const mDob = formatROCDate(m.dateOfBirth)
                                      const mDobStr = mDob.y ? `${mDob.y}/${mDob.m}/${mDob.d}` : ''
                                      const mCoach = trainers.find(t => t.id === (m as any).assignedTrainerId)?.name || coachA
                                      return (
                                        <div key={idx} className={cn(
                                          "space-y-1.5 p-2.5 rounded-xl border",
                                          isGroup ? "bg-emerald-50/30 border-emerald-100/60" : "bg-blue-50/30 border-blue-100/60"
                                        )}>
                                          <div className={cn(
                                            "font-bold border-b pb-0.5 text-[9px] flex justify-between",
                                            isGroup ? "text-emerald-900 border-emerald-200" : "text-blue-900 border-blue-200"
                                          )}>
                                            <span>會員姓名（簡稱甲方） - 學員 {idx + 2}</span>
                                            {isGroup ? (
                                              <span className="text-emerald-700 font-mono">分配: {m.allocatedSessions} 堂</span>
                                            ) : (
                                              <span className="text-blue-700 font-mono">對應教練: {mCoach}</span>
                                            )}
                                          </div>
                                          <div className="grid grid-cols-6 gap-x-2 gap-y-1 text-stone-600 text-[10px]">
                                            <div className="col-span-2">姓名：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[50px]">{m.name || '──────'}</span></div>
                                            <div className="col-span-2">身分證字號：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{m.idNumber || '──────'}</span></div>
                                            <div className="col-span-2">生日：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{mDobStr || '──────'}</span></div>
                                            <div className="col-span-3">電話：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{m.phone || '──────'}</span></div>
                                            <div className="col-span-3">Email：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[120px] break-all">{m.email || '──────'}</span></div>
                                            <div className="col-span-2">緊急聯絡人：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[40px]">{m.emergencyContact?.name || '──────'}</span></div>
                                            <div className="col-span-2">關係：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[30px]">{m.emergencyContact?.relation || '──────'}</span></div>
                                            <div className="col-span-2">電話：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{m.emergencyContact?.phone || '──────'}</span></div>
                                          </div>
                                        </div>
                                      )
                                    })}

                                    {/* Partner Customer */}
                                    {isDual && partnerInfo && (
                                      <div className="space-y-1.5 bg-orange-50/30 p-2.5 rounded-xl border border-orange-100/60">
                                        <div className="font-bold text-orange-900 border-b border-orange-200 pb-0.5 text-[9px]">
                                          <span>會員姓名（簡稱甲方） - 學員 B</span>
                                        </div>
                                        <div className="grid grid-cols-6 gap-x-2 gap-y-1 text-stone-600 text-[10px]">
                                          <div className="col-span-2">姓名：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[50px]">{partnerInfo.name || '──────'}</span></div>
                                          <div className="col-span-2">身分證字號：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{partnerInfo.idNumber || '──────'}</span></div>
                                          <div className="col-span-2">生日：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{partnerInfo.dobStr || '──────'}</span></div>
                                          <div className="col-span-3">電話：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{partnerInfo.phone || '──────'}</span></div>
                                          <div className="col-span-3">Email：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[120px] break-all">{partnerInfo.email || '──────'}</span></div>
                                          <div className="col-span-2">緊急聯絡人：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[40px]">{partnerInfo.emergencyName || '──────'}</span></div>
                                          <div className="col-span-2">關係：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[30px]">{partnerInfo.emergencyRelation || '──────'}</span></div>
                                          <div className="col-span-2">電話：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[70px]">{partnerInfo.emergencyPhone || '──────'}</span></div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Company Details */}
                                    <div className="space-y-1.5 bg-stone-50/60 p-2.5 rounded-xl border border-stone-150 text-stone-600 text-[10px]">
                                      <div className="font-bold text-stone-850 border-b border-stone-200 pb-0.5 text-[9px]">
                                        <span>{isCoffit ? 'coffit健身咖' : 'R27健身站'}（簡稱乙方）</span>
                                      </div>
                                      <div className="space-y-1 text-[10px]">
                                        <div>公司名稱：<span className="font-bold text-stone-900">紅二七健身有限公司</span></div>
                                        <div>負責人：<span className="font-bold text-stone-900">郭沛霖</span></div>
                                        <div className="grid grid-cols-3 gap-y-1 gap-x-2 pt-0.5">
                                          <div>電話：<span className="font-bold text-stone-900">0905396658</span></div>
                                          <div className="col-span-2">營業/履約地址：<span className="font-bold text-stone-900">{isCoffit ? '台北市士林區中山北路六段184號1樓' : '新北市淡水區中正東路二段68號'}</span></div>
                                          <div>網址 / Email：<span className="font-bold text-stone-900 underline font-mono">{isCoffit ? 'https://www.instagram.com/coffit0184/' : 'https://www.instagram.com/r27fitness'}</span></div>
                                          <div className="col-span-2">公共意外責任險：<span className="font-bold text-stone-900">{isCoffit ? '已投保足額公共意外責任險' : '已投保（效期：114/11/21-115/11/21）'}</span></div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Course Detail */}
                                  <div className="space-y-3">
                                    <h3 className="font-bold text-stone-900 text-xs border-b border-stone-300 pb-1">課程內容與費用明細</h3>
                                    <div className="grid grid-cols-12 gap-y-1.5 gap-x-3 text-stone-600 text-[10px]">
                                      <div className="col-span-6">
                                        課程名稱：<span className="font-bold text-stone-900">
                                          {isGroup ? '團體教練課程' : isShared ? '多人共享教練課程' : isDual ? '雙人共享教練課程' : '一對一私人教練課程'}
                                        </span>
                                      </div>
                                      <div className="col-span-6">
                                        教練比例：<span className="font-bold text-stone-900">
                                          {(isDual && !isOneToTwo) ? '2' : '1'} 位教練對 {isGroup ? groupMemberCount : isShared ? sharedMemberCount : isDual ? '2' : '1'} 位學員
                                        </span>
                                      </div>
                                      <div className="col-span-12">指定教練：<span className="font-bold text-stone-900 bg-stone-50 px-2 py-0.5 rounded border border-stone-200">{coachNames}</span></div>
                                      <div className="col-span-4">購買堂數：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 underline">{totalSessions}</span> 堂</div>
                                      <div className="col-span-4">契約總金額：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 underline">NT$ {totalAmount.toLocaleString()}</span> 元</div>
                                      <div className="col-span-4">每堂單價：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 underline">NT$ {pricePerSession.toLocaleString()}</span> 元</div>
                                      
                                      {isGroup && (
                                        <div className="col-span-12 p-2 bg-emerald-50/50 rounded-lg border border-emerald-100 text-[10px]">
                                          <span className="font-bold text-emerald-900">個人堂數配額劃分：</span>
                                          <span className="text-stone-700 font-medium ml-1">
                                            學員 1 ({primaryInfo.name || '主學員'}): {primaryMemberQuota} 堂
                                            {additionalGroupMembers.map((m, i) => `；學員 ${i+2} (${m.name || '未填'}): ${m.allocatedSessions} 堂`)}
                                          </span>
                                        </div>
                                      )}

                                      <div className="col-span-12 text-[9px] text-stone-400 font-bold italic mt-[-2px]">
                                        （註：此單價為日後若發生「退費」時的計算基準）
                                      </div>
                                      <div className="col-span-12">
                                        課程期限：自 <span className="font-bold text-stone-900 underline mx-0.5">{startDate.y || '   '}</span> 年 <span className="font-bold text-stone-900 underline mx-0.5">{startDate.m || '  '}</span> 月 <span className="font-bold text-stone-900 underline mx-0.5">{startDate.d || '  '}</span> 日起至 <span className="font-bold text-stone-900 underline mx-0.5">{endDate.y || '   '}</span> 年 <span className="font-bold text-stone-900 underline mx-0.5">{endDate.m || '  '}</span> 月 <span className="font-bold text-stone-900 underline mx-0.5">{endDate.d || '  '}</span> 日止
                                      </div>
                                      <div className="col-span-12 p-2.5 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
                                        <div>付款方式：<span className="font-bold text-stone-900">{paymentTypeStr}</span></div>
                                        {paymentType === 'installments' && (
                                          <div className="text-[9px] text-stone-500 font-medium">
                                            本課程共分 {installmentCount} 期支付。首期款項應於簽約時支付，後續各期款項應於約定期限前完成支付。
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Articles 1-12 */}
                                  <div className="border-t border-stone-300 pt-4 space-y-3.5 text-[11px] text-stone-600">
                                    <h4 className="font-bold text-stone-900 text-center text-sm underline decoration-stone-400 underline-offset-4">
                                      {brandName} {isGroup ? '團體健身教練服務定型化契約條款' : '健身教練服務定型化契約條款'}
                                    </h4>
                                    
                                    <div>
                                      <p className="font-bold text-stone-900">第一條（服務內容與異動通知）</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>乙方應依約定提供健身指導服務。</li>
                                        <li>乙方所提供服務內容與時間如有異動，應於 24小時前 通知甲方。</li>
                                        <li>通知方式：依甲方留存之電話、LINE 或電子郵件通知，或公告於官方社群網站。</li>
                                        <li>若乙方未依約定時間通知，甲方得請求於 7 日內提供同意之補課方案。</li>
                                      </ol>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第二條（預約與請假規則）</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>預約制：需事先預約（LINE、電話或電子郵件通知）。</li>
                                        <li>請假時限：甲方取消或改期，應於課程開始前 24 小時 通知乙方。（乙方於3日內無償補課）</li>
                                        <li>未依約請假：乙方未依前項約定時間方式通知，在限期3日內提供甲方同意之補課方案。</li>
                                      </ol>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第三條（課程暫停/請假機制）</p>
                                      <p className="pl-1">甲方若有下列事由之一，提出證明文件後，乙方應於七個工作日內辦理暫停課程期限順延，停權期間免繳課程費用：</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>出國逾一個月。</li>
                                        <li>傷害、疾病或身體不適致不宜運動。（未能事先提出者，得於事由發生後一個月內補辦）</li>
                                        <li>懷孕、育嬰、侍親之需要。</li>
                                        <li>服兵役。</li>
                                        <li>職務異動或遷居。</li>
                                        <li>其他不可歸責於甲方之事由（如疫情一級開設）。</li>
                                        <li>甲方於本條暫停（停權）期間仍具有健身中心會員資格，且於會員期限屆滿仍未完成堂數者，無需補足會籍，得繼續完成剩餘堂數。</li>
                                      </ol>
                                      
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第四條（退費規定與計算公式）</p>
                                      <p className="pl-1">甲方得隨時通知乙方終止契約，退費標準依法規計算如下：</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>購買後七日內（未上課）：契約生效七日內尚未使用任何課程者，乙方應全額退還。如於7日內使用應適用第二款退費公式。</li>
                                        <li>購買後七日以上（或已上課）：若甲方因個人因素欲終止契約，退費金額計算如下：應退金額 ＝ 實繳總金額 －（已使用堂數 × 每堂單價）
                                          <ul className="list-disc pl-4 mt-0.5 text-stone-500">
                                            <li>已使用堂數包含：已上課堂數 + 曠課（未依規定請假）堂數。</li>
                                            <li>每堂單價定義: 契約總金額 ÷ (購買堂數 + 贈送堂數)。(註: 贈送堂數一併納入分母計算，以確保消費者退費比例之公平)</li>
                                          </ul>
                                        </li>
                                        <li>明確事先約定逐月分配使用堂數限制者：乙方應就剩餘之堂數乘以每堂平均價退費。但已到期且可歸責於甲方而未使用之堂數，得不予退費。</li>
                                        <li>手續費（違約金）：辦理前項退費時，乙方得收取手續費。手續費金額為：應退金額 × 20%（但最高以新臺幣 9,000 元為上限）。</li>
                                        <li>贈送課：贈送堂數不得超過總金額之 20%，退費時贈送堂數需一併納入計算。</li>
                                      </ol>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第五條（不可歸責於消費者之終止與效果）</p>
                                      <p className="pl-1">若因下列事由終止契約，乙方應按比例退費，且不得收取手續費或違約金：</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>指定教練無法執行業務（如離職），且甲方不同意替換教練。</li>
                                        <li>乙方變更履約地點，未經甲方同意。</li>
                                        <li>乙方暫停營業、歇業，或因天災、政府法令等不可抗力因素導致無法履約。</li>
                                        <li>甲方因不可歸責事由暫停課程超過一年。</li>
                                        <li>累積教練服務契約量（含同一業者不同教練），已達每週平均逾五堂課。</li>
                                        <li>退費規定：因前項第一款至第四款終止契約者，乙方不得收取手續費、違約金或任何名目費用。若因第五款（暫停課程超過一年）終止契約者，乙方得酌收手續費 $600。</li>
                                      </ol>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第六條（不可歸責雙方事由之終止與效果）</p>
                                      <p className="pl-1">
                                        因天災、戰亂、政府法令之新增或變更等不可抗力或其他不可歸責於雙方當事人之事由，致難以完成本契約之服務時，任何一方得終止契約，乙方應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費用、違約金或任何名目費用。
                                      </p>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第七條（可歸責消費者-業者終止契約）</p>
                                      <p className="pl-1">
                                        甲方於期限屆滿前，得隨時終止。契約期限屆滿後，未使用剩餘堂數，乙方得不予退費。甲方有影響乙方營運之不當行為且情節重大，經勸告無效者，乙方得終止契約，並應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費、違約金或任何名目費用。
                                      </p>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第八條（可歸責業者事由之終止與效果）</p>
                                      <p className="pl-1">
                                        因可歸責於乙方之事由致無法繼續提供約定服務，乙方應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費、違約金或任何名目之扣費。前項退費，乙方應準用第四條計算違約金（手續費）之標準，額外支付違約金予甲方。
                                      </p>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第九條（終止契約之通知及退款方式）</p>
                                      <p className="pl-1">
                                        甲方得以書面或雙方事先約定方式（如LINE、電子郵件等）通知終止契約，通知到達乙方時立即生效。乙方應於甲方通知後 15 個「工作日」內，將應退款項擇 □現金 □轉帳 方式退還予甲方（乙方應於簽收或確認後出具證明交予甲方收執）。
                                      </p>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第十條（贈品約款及其效果）</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>
                                          乙方提供對甲方之贈品價值總計新臺幣 ________ 元，包括：
                                          <div className="flex gap-4 mt-1 text-stone-500 font-semibold">
                                            <span>□ 商品：________________</span>
                                            <span>□ 課程堂數：____________</span>
                                            <span>□ 其他：________________</span>
                                          </div>
                                        </li>
                                        <li>
                                          乙方以商品及其他內容為贈品者（其價值不得逾契約總金額百分之二十），於契約終止時，不得向甲方請求返還該贈品，或主張自應返還費用當中扣除該贈品價額。
                                        </li>
                                      </ol>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第十一條（契約讓與）</p>
                                      <p className="pl-1">
                                        甲方經乙方同意，得將本契約讓與第三人（轉讓）。乙方得向甲方收取轉讓必要費用新台幣600元。
                                      </p>
                                    </div>

                                    <div>
                                      <p className="font-bold text-stone-900">第十二條（爭議處理與管轄法院）</p>
                                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                                        <li>本契約未盡事宜，悉依中華民國法律及教育部公告之相關規範辦理。</li>
                                        <li>甲乙雙方發生爭議時，甲方得依消費者保護法之規定申訴及申請調解，相關法令、習慣及誠信原則公平解決之。</li>
                                        <li>本契約涉訟時，雙方同意以臺灣士林地方法院為第一審管轄法院（因履約地淡水屬士林地院管轄），但不得排除消費者保護法第四十七條及民事訴訟法第四百三十六條之九規定之小額訴訟管轄法院之適用。</li>
                                      </ol>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>

                        {/* Agreement Checkbox */}
                        <div className="flex items-center space-x-3 p-4 rounded-2xl bg-stone-50 border border-stone-200 transition-all duration-300">
                          <input 
                            type="checkbox" 
                            id="agree-contract"
                            checked={form.watch('contract.isAgreed')}
                            onChange={(e) => form.setValue('contract.isAgreed', e.target.checked)}
                            className="w-5 h-5 rounded border-stone-300 text-brand-600 focus:ring-brand-500 accent-brand-500 cursor-pointer"
                          />
                          <label htmlFor="agree-contract" className="text-sm font-medium text-stone-700 cursor-pointer">
                            我已閱讀並同意上述「{brandName} 健身教練課程契約書」
                          </label>
                        </div>

                        {/* Signature Area */}
                        <div className={cn(
                          "grid gap-6 transition-all duration-500",
                          (form.watch('contract.contractType') === 'dual' && !form.watch('bindExistingContractMode')) ? "grid-cols-2" : "grid-cols-1",
                          !form.watch('contract.isAgreed') ? "opacity-30 pointer-events-none grayscale" : "opacity-100"
                        )}>
                          {/* Signature A */}
                          <div className="relative">
                            <Label className="text-stone-700 font-bold mb-2 block">
                              {form.watch('bindExistingContractMode') 
                                ? '新加入學員數位簽名 *' 
                                : (form.watch('contract.contractType') === 'dual' ? '甲方學員 A 簽名 *' : '學員數位簽名 *')}
                            </Label>
                            <div className="border-2 border-dashed border-stone-300 rounded-3xl p-2 bg-white shadow-inner relative min-h-[200px]">
                              {form.watch('bindExistingContractMode') 
                                ? (form.watch('contract.secondarySignatureDataUrl') && form.watch('contract.secondarySignatureDataUrl') !== 'signed' && (
                                    <div className="absolute inset-2 z-10 bg-white rounded-2xl flex items-center justify-center">
                                      <img 
                                        src={form.watch('contract.secondarySignatureDataUrl')!} 
                                        alt="Signature A" 
                                        className="max-h-full max-w-full object-contain"
                                      />
                                    </div>
                                  ))
                                : (form.watch('contract.signatureDataUrl') && form.watch('contract.signatureDataUrl') !== 'signed' && (
                                    <div className="absolute inset-2 z-10 bg-white rounded-2xl flex items-center justify-center">
                                      <img 
                                        src={form.watch('contract.signatureDataUrl')!} 
                                        alt="Signature A" 
                                        className="max-h-full max-w-full object-contain"
                                      />
                                    </div>
                                  ))
                              }
                              <SignatureCanvas
                                ref={sigCanvas}
                                onEnd={() => {
                                  if (form.watch('bindExistingContractMode')) {
                                    form.setValue('contract.secondarySignatureDataUrl', 'signed')
                                  } else {
                                    form.setValue('contract.signatureDataUrl', 'signed')
                                  }
                                }}
                                canvasProps={{ className: 'w-full h-48 rounded-2xl bg-white cursor-crosshair' }}
                              />
                            </div>
                            <div className="absolute right-6 top-10 z-20 flex gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => {
                                sigCanvas.current?.clear()
                                if (form.watch('bindExistingContractMode')) {
                                  form.setValue('contract.secondarySignatureDataUrl', null)
                                } else {
                                  form.setValue('contract.signatureDataUrl', null)
                                }
                              }} className="h-8 text-xs text-stone-400 hover:text-red-500 bg-white/80 backdrop-blur-sm">
                                清除
                              </Button>
                            </div>
                          </div>

                          {/* Signature B */}
                          {form.watch('contract.contractType') === 'dual' && !form.watch('bindExistingContractMode') && (
                            <div className="relative">
                              <Label className="text-stone-900 font-bold mb-2 block">甲方學員 B 簽名 *</Label>
                              <div className="border-2 border-dashed border-orange-200 rounded-3xl p-2 bg-white shadow-inner relative min-h-[200px]">
                                {form.watch('contract.secondarySignatureDataUrl') && form.watch('contract.secondarySignatureDataUrl') !== 'signed' && (
                                  <div className="absolute inset-2 z-10 bg-white rounded-2xl flex items-center justify-center">
                                    <img 
                                      src={form.watch('contract.secondarySignatureDataUrl')!} 
                                      alt="Signature B" 
                                      className="max-h-full max-w-full object-contain"
                                    />
                                  </div>
                                )}
                                <SignatureCanvas
                                  ref={secondarySigCanvas}
                                  onEnd={() => form.setValue('contract.secondarySignatureDataUrl', 'signed')}
                                  canvasProps={{ className: 'w-full h-48 rounded-2xl bg-white cursor-crosshair' }}
                                />
                              </div>
                              <div className="absolute right-6 top-10 z-20 flex gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => {
                                  secondarySigCanvas.current?.clear()
                                  form.setValue('contract.secondarySignatureDataUrl', null)
                                }} className="h-8 text-xs text-stone-400 hover:text-red-500 bg-white/80 backdrop-blur-sm">
                                  清除
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Sticky Footer Navigation fixed height */}
            <div className="h-16 px-8 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between bg-white/90 dark:bg-stone-900/90 backdrop-blur-md shrink-0">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handlePrev}
                disabled={currentStep === 0}
                className={cn("gap-2 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white h-9", currentStep === 0 && "opacity-0 pointer-events-none")}
              >
                <RiArrowLeftSLine className="w-4 h-4" />
                上一步
              </Button>

              <div className="flex gap-2.5">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  className="h-9 text-xs dark:bg-transparent dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white"
                >
                  取消
                </Button>
                
                {currentStep < activeSteps.length - 1 ? (
                  <Button 
                    type="button" 
                    onClick={handleNext}
                    disabled={!canGoNext}
                    className="gap-2 h-9 text-xs bg-stone-950 dark:bg-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-100 transition-all px-6"
                  >
                    下一步
                    <RiArrowRightSLine className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    onClick={() => handleFinalSubmit(form.getValues())}
                    disabled={loading || !canGoNext}
                    className="gap-2 h-9 text-xs bg-brand-500 hover:bg-brand-600 transition-all px-6 shadow-md shadow-brand-500/20"
                  >
                    {loading ? '儲存中...' : isEditMode ? '儲存修改' : '完成並建立'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
