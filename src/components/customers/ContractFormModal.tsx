import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import {
  RiGroupLine,
  RiTeamLine,
  RiArrowDownSLine,
  RiUser3Line,
  RiUserLine,
  RiUserAddLine,
  RiUserSharedLine,
  RiHeartPulseLine,
  RiFileTextLine,
  RiShieldCheckLine,
  RiCheckboxCircleFill,
  RiLinkM,
  RiBankCardLine,
  RiMoneyDollarCircleLine,
  RiAlertLine,
  RiCheckLine,
  RiTeamFill,
} from '@remixicon/react'
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
import { contractFormSchema, type ContractFormValues } from '../../lib/validators'
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

interface ContractFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ContractFormValues) => Promise<void>
  customer: Customer | null
  customers: Customer[]
}

const STEPS = [
  { id: 'contract', title: '合約設定', icon: RiFileTextLine, fields: ['totalSessions', 'totalAmount', 'startDate', 'endDate'] },
  { id: 'signature', title: '簽署確認', icon: RiShieldCheckLine, fields: [] },
]

export function ContractFormModal({
  open,
  onOpenChange,
  onSubmit,
  customer,
  customers = [],
}: ContractFormModalProps) {
  const { centerId } = useCenterStore()
  const isCoffit = centerId === 'coffit'
  const brandName = isCoffit ? 'Coffit' : 'R27 Fitness'

  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const sigCanvas = useRef<SignatureCanvas>(null)
  const secondarySigCanvas = useRef<SignatureCanvas>(null)
  const [trainers, setTrainers] = useState<any[]>([])
  const [isOneToTwo, setIsOneToTwo] = useState(true)
  const [fetchedCustomers, setFetchedCustomers] = useState<Customer[]>([])
  const activeCustomers = useMemo(() => (customers && customers.length > 0 ? customers : fetchedCustomers), [customers, fetchedCustomers])

  // Contract binding states
  const [allContracts, setAllContracts] = useState<Contract[]>([])
  const [selectedExistingCustomerId, setSelectedExistingCustomerId] = useState<string | null>(null)

  // Group & Shared contract states
  const [groupMemberCount, setGroupMemberCount] = useState<number>(2)
  const [sharedMemberCount, setSharedMemberCount] = useState<number>(2)
  const [primaryMemberQuota, setPrimaryMemberQuota] = useState<number>(0)
  const [additionalGroupMembers, setAdditionalGroupMembers] = useState<Array<{
    memberMode: 'existing' | 'new'
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
      assignedTrainerId: '',
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

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      customerId: customer?.id || '',
      sharedWithCustomerId: null,
      trainerId: '',
      secondaryTrainerId: null,
      totalSessions: 0,
      remainingSessions: 0,
      pricePerSession: 0,
      totalAmount: 0,
      paidAmount: 0,
      installments: [],
      startDate: new Date().toISOString().split('T')[0] as any,
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] as any,
      status: 'active',
      signatureDataUrl: null,
      secondarySignatureDataUrl: null,
      isAgreed: false,
      contractType: 'single',
      partnerMode: 'none',
      partnerId: null,
      partnerCustomerData: null,
      paymentType: 'single',
      installmentCount: 2,
      bindExistingContractMode: false,
      existingContractId: null,
    },
  })

  const watchedValues = form.watch()

  const existingCustomerContracts = useMemo(() => {
    if (!selectedExistingCustomerId) return []
    return allContracts.filter(c => 
      c.status !== 'cancelled' && (
        c.customerId === selectedExistingCustomerId || 
        (Array.isArray(c.customerIds) && c.customerIds.includes(selectedExistingCustomerId))
      )
    )
  }, [selectedExistingCustomerId, allContracts])

  const selectedContract = useMemo(() => {
    const cid = form.watch('existingContractId')
    if (!cid) return null
    return allContracts.find(c => c.id === cid) || null
  }, [form.watch('existingContractId'), allContracts])

  const isCustomerAlreadyInContract = (c: any) => {
    if (!customer?.id || !c) return false
    return Boolean(
      c.customerId === customer.id ||
      (Array.isArray(c.customerIds) && c.customerIds.includes(customer.id)) ||
      c.sharedWithCustomerId === customer.id ||
      (c.groupMemberQuotas && Boolean(c.groupMemberQuotas[customer.id]))
    )
  }

  const isSingleBinding = useMemo(() => {
    if (!form.watch('bindExistingContractMode') || !selectedContract) return false
    return selectedContract.contractType === 'single'
  }, [form.watch('bindExistingContractMode'), selectedContract])

  const groupQuotaSum = useMemo(() => {
    const sumAdditional = additionalGroupMembers.reduce((acc, curr) => acc + (Number(curr.allocatedSessions) || 0), 0)
    return primaryMemberQuota + sumAdditional
  }, [primaryMemberQuota, additionalGroupMembers])

  const groupQuotaRemainder = useMemo(() => {
    const totalSess = Number(form.watch('totalSessions')) || 0
    if (groupMemberCount <= 0) return 0
    return totalSess % groupMemberCount
  }, [form.watch('totalSessions'), groupMemberCount])

  const syncAdditionalMembersCount = (targetNewCount: number) => {
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

  const recalculateGroupQuotas = (totalSess: number, count: number) => {
    if (count <= 0) return
    const baseQuota = Math.floor(totalSess / count)
    setPrimaryMemberQuota(baseQuota)
    setAdditionalGroupMembers(prev => prev.map(m => ({ ...m, allocatedSessions: baseQuota })))
  }

  useEffect(() => {
    const fetchTrainersAndCustomers = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'trainers'), where('centerId', '==', centerId)))
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setTrainers(list)
        if (list.length > 0 && !form.getValues('trainerId')) {
          form.setValue('trainerId', list[0].id)
        }
        if (!customers || customers.length === 0) {
          const custSnap = await getDocs(query(collection(db, 'customers'), where('centerId', '==', centerId)))
          setFetchedCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)))
        }
        const contractSnap = await getDocs(query(collection(db, 'contracts'), where('centerId', '==', centerId)))
        setAllContracts(contractSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contract)))
      } catch (err) {
        console.error('Error fetching trainers/customers/contracts:', err)
      }
    }
    if (open) {
      fetchTrainersAndCustomers()
    }
  }, [open, form, centerId, customers])

  useEffect(() => {
    if (open && customer) {
      setSelectedExistingCustomerId(null)
      form.reset({
        customerId: customer.id,
        sharedWithCustomerId: null,
        trainerId: trainers[0]?.id || '',
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
            dueDate: new Date(),
            paidDate: new Date(),
            status: 'paid' as const,
          }
        ],
        startDate: new Date().toISOString().split('T')[0],
        endDate: addOneYearToDateString(new Date().toISOString().split('T')[0]),
        status: 'active',
        signatureDataUrl: null,
        secondarySignatureDataUrl: null,
        isAgreed: false,
        contractType: 'single',
        partnerMode: 'none',
        partnerId: null,
        partnerCustomerData: null,
        paymentType: 'single',
        installmentCount: 2,
        bindExistingContractMode: false,
        existingContractId: null,
      })
      setCurrentStep(0)
      setIsOneToTwo(true)

      // Fetch previous contract to default partner combination
      const fetchLastContract = async () => {
        try {
          const contractsRef = collection(db, 'contracts')
          const q = query(
            contractsRef,
            where('customerIds', 'array-contains', customer.id),
            orderBy('createdAt', 'desc'),
            limit(1)
          )
          const snap = await getDocs(q)
          if (!snap.empty) {
            const lastCon = { id: snap.docs[0].id, ...snap.docs[0].data() } as Contract
            const isDual = lastCon.contractType === 'dual' || !!lastCon.sharedWithCustomerId
            const partnerId = isDual
              ? (lastCon.customerIds && lastCon.customerIds.find(id => id !== customer.id)) || lastCon.sharedWithCustomerId
              : null

            if (isDual && partnerId) {
              form.setValue('contractType', 'dual')
              form.setValue('partnerMode', 'existing')
              form.setValue('partnerId', partnerId)
              form.setValue('sharedWithCustomerId', partnerId)
            }
          }
        } catch (err) {
          console.error('Error fetching last contract for default partner:', err)
        }
      }
      fetchLastContract()
    }
  }, [open, customer, form, trainers])


  const activeSteps = useMemo(() => {
    if (watchedValues.bindExistingContractMode) {
      return STEPS
    }
    const steps = [...STEPS]
    
    if (watchedValues.partnerMode === 'existing') {
      const contractStep = { ...steps[0], fields: [...steps[0].fields, 'sharedWithCustomerId'] }
      steps[0] = contractStep
    }

    if (watchedValues.partnerMode === 'new') {
      steps.splice(1, 0, 
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
    } else if (watchedValues.contractType === 'group' || watchedValues.contractType === 'shared') {
      const effectiveCount = watchedValues.contractType === 'shared' ? sharedMemberCount : groupMemberCount
      const groupSteps: any[] = []
      for (let i = 2; i <= effectiveCount; i++) {
        const mData = additionalGroupMembers[i - 2]
        if (mData?.memberMode === 'new') {
          groupSteps.push(
            { id: `group_member_${i}_basic`, title: `學員 ${i} 基本資料`, icon: RiUserLine, fields: [] },
            { id: `group_member_${i}_medical`, title: `學員 ${i} 健康狀態`, icon: RiHeartPulseLine, fields: [] }
          )
        }
      }
      steps.splice(1, 0, ...groupSteps)
    }
    return steps
  }, [watchedValues.bindExistingContractMode, watchedValues.partnerMode, watchedValues.contractType, groupMemberCount, sharedMemberCount, additionalGroupMembers])

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

    const currentInstallments = form.getValues('installments') || [];
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

    form.setValue('installments', newInstallments);
    const paidSum = newInstallments.reduce((sum, ins) => ins.status === 'paid' ? sum + ins.amount : sum, 0);
    form.setValue('paidAmount', paidSum);
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
    form.setValue('installments', inst);
    form.setValue('paidAmount', total);
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
      if (step.id === 'contract') {
        if (watchedValues.bindExistingContractMode) {
          if (!watchedValues.existingContractId) return false
          if (selectedContract && isCustomerAlreadyInContract(selectedContract)) return false
          if (isSingleBinding && !watchedValues.secondaryTrainerId) return false
          return true
        }
        let groupOk = true
        if (watchedValues.contractType === 'group' || watchedValues.contractType === 'shared') {
          const effectiveCount = watchedValues.contractType === 'shared' ? sharedMemberCount : groupMemberCount
          groupOk = additionalGroupMembers.slice(0, effectiveCount - 1).every(m => {
            if (m.memberMode === 'existing') {
              return !!m.existingCustomerId
            }
            return true
          })
        }

        const isDualPartnerOk = watchedValues.contractType !== 'dual' || (
          watchedValues.partnerMode === 'existing'
            ? !!watchedValues.sharedWithCustomerId
            : watchedValues.partnerMode === 'new'
        )

        const hasBasicData = watchedValues.totalSessions > 0 &&
               watchedValues.pricePerSession > 0 &&
               !!watchedValues.startDate &&
               !!watchedValues.endDate &&
               isDualPartnerOk &&
               groupOk;

        if (!hasBasicData) return false;

        if (watchedValues.paymentType === 'installments') {
          if (!watchedValues.installments || watchedValues.installments.length !== watchedValues.installmentCount) return false;
          const sum = watchedValues.installments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          if (Math.abs(sum - watchedValues.totalAmount) > 0.01) return false;

          for (let i = 0; i < watchedValues.installments.length - 1; i++) {
            const currentVal = watchedValues.installments[i];
            const nextVal = watchedValues.installments[i + 1];
            if (!currentVal.dueDate || !nextVal.dueDate) return false;
            if (new Date(currentVal.dueDate) > new Date(nextVal.dueDate)) return false;
          }
        }
        return true;
      }
      if (step.id === 'partner_basic') {
        const pData = watchedValues.partnerCustomerData
        return !!pData?.name &&
               !!pData?.phone &&
               !!pData?.idNumber &&
               !!pData?.dateOfBirth &&
               !!pData?.emergencyContact?.name &&
               !!pData?.emergencyContact?.relation &&
               !!pData?.emergencyContact?.phone
      }
      if (step.id === 'partner_medical') {
        if (watchedValues.partnerMode === 'existing') {
          return !!watchedValues.sharedWithCustomerId
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
      if (step.id === 'signature') {
        const isDual = watchedValues.contractType === 'dual'
        return !!watchedValues.signatureDataUrl &&
               (!isDual || !!watchedValues.secondarySignatureDataUrl) &&
               watchedValues.isAgreed
      }
      return false
    })
  }, [activeSteps, watchedValues, additionalGroupMembers, isSingleBinding, selectedContract, customer])

  const handleNext = async () => {
    const currentStepObj = activeSteps[currentStep]
    if (watchedValues.bindExistingContractMode && currentStepObj.id === 'contract') {
      if (!form.getValues('existingContractId')) {
        alert('請選擇欲連結的現有合約！')
        return
      }
      if (selectedContract && isCustomerAlreadyInContract(selectedContract)) {
        alert(`防呆警告：學員 ${customer.name} 已在此合約中，無法重複綁定加入！`)
        return
      }
      if (isSingleBinding && !form.getValues('secondaryTrainerId')) {
        alert('請選擇第二位學員的授課教練！')
        return
      }
      setCurrentStep(prev => prev + 1)
      return
    }
    if (currentStepObj.id.startsWith('group_member_')) {
      if (stepStatus[currentStep] && currentStep < activeSteps.length - 1) {
        setCurrentStep(prev => prev + 1)
      }
      return
    }
    const fieldsToValidate = currentStepObj.fields as any[]
    const isValid = await form.trigger(fieldsToValidate)
    if (isValid && currentStep < activeSteps.length - 1) setCurrentStep(prev => prev + 1)
  }

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }

  const handleSessionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sessions = Number(e.target.value)
    const totalAmount = form.getValues('totalAmount') || 0
    form.setValue('totalSessions', sessions)
    
    const usedSessions = initialContract
      ? Math.max(0, (initialContract.totalSessions || 0) - (initialContract.remainingSessions || 0))
      : 0
    const newRemaining = Math.max(0, sessions - usedSessions)
    form.setValue('remainingSessions', newRemaining)

    if (sessions > 0) {
      form.setValue('pricePerSession', Math.round((totalAmount / sessions) * 100) / 100)
    } else {
      form.setValue('pricePerSession', 0)
    }
    syncInstallments(
      form.getValues('paymentType') || 'single',
      form.getValues('installmentCount') || 2,
      totalAmount,
      form.getValues('startDate') || new Date()
    )
  }

  const handleTotalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const totalAmount = Number(e.target.value)
    const sessions = form.getValues('totalSessions') || 0
    form.setValue('totalAmount', totalAmount)
    if (sessions > 0) {
      form.setValue('pricePerSession', Math.round((totalAmount / sessions) * 100) / 100)
    } else {
      form.setValue('pricePerSession', 0)
    }
    syncInstallments(
      form.getValues('paymentType') || 'single',
      form.getValues('installmentCount') || 2,
      totalAmount,
      form.getValues('startDate') || new Date()
    )
  }

  const handleFinalSubmit = async (data: ContractFormValues) => {
    setLoading(true)
    try {
      if (data.bindExistingContractMode) {
        if (!data.existingContractId) {
          alert('請選擇欲連結的現有合約！')
          setLoading(false)
          return
        }
        if (selectedContract && isCustomerAlreadyInContract(selectedContract)) {
          alert(`防呆警告：學員 ${customer.name} 已在此合約中，無法重複綁定加入！`)
          setLoading(false)
          return
        }
        if (isSingleBinding && !data.secondaryTrainerId) {
          alert('請選擇第二位學員的授課教練！')
          setLoading(false)
          return
        }
        if (sigCanvas.current) {
          const canvas = sigCanvas.current as any
          if (!canvas.isEmpty()) {
            const rawCanvas: HTMLCanvasElement = canvas.getCanvas()
            if (isSingleBinding) {
              data.secondarySignatureDataUrl = rawCanvas.toDataURL('image/png')
            } else {
              data.signatureDataUrl = rawCanvas.toDataURL('image/png')
            }
          }
        }
        await onSubmit(data)
        onOpenChange(false)
        return
      }
      if (sigCanvas.current) {
        const canvas = sigCanvas.current as any
        if (!canvas.isEmpty()) {
          const rawCanvas: HTMLCanvasElement = canvas.getCanvas()
          data.signatureDataUrl = rawCanvas.toDataURL('image/png')
        }
      }
      if (secondarySigCanvas.current && data.contractType === 'dual') {
        const canvas = secondarySigCanvas.current as any
        if (!canvas.isEmpty()) {
          const rawCanvas: HTMLCanvasElement = canvas.getCanvas()
          data.secondarySignatureDataUrl = rawCanvas.toDataURL('image/png')
        }
      }

      if (data.contractType === 'shared') {
        const activeMembers = additionalGroupMembers.slice(0, sharedMemberCount - 1)
        for (let i = 0; i < activeMembers.length; i++) {
          const m = activeMembers[i]
          if (m.memberMode === 'existing') {
            if (!m.existingCustomerId || !m.name) {
              alert(`請選擇學員 ${i + 2} 的現有學員資料。`)
              setLoading(false)
              return
            }
          } else {
            if (!m.name || !m.phone || !m.idNumber) {
              alert(`請完整填寫學員 ${i + 2} 的真實姓名、電話與身分證字號。`)
              setLoading(false)
              return
            }
          }
        }

        const createdMemberIds: string[] = []
        for (let i = 0; i < activeMembers.length; i++) {
          const m = activeMembers[i]
          if (m.memberMode === 'existing' && m.existingCustomerId) {
            createdMemberIds.push(m.existingCustomerId)
          } else {
            const mCustomer = {
              name: m.name || `共享成員${i + 2}`,
              idNumber: m.idNumber || '',
              phone: m.phone || '',
              email: m.email || '',
              dateOfBirth: m.dateOfBirth ? Timestamp.fromDate(new Date(m.dateOfBirth)) : serverTimestamp(),
              gender: m.gender,
              exerciseHabit: m.exerciseHabit,
              source: m.source || 'existing',
              emergencyContact: m.emergencyContact,
              medicalHistory: m.medicalHistory,
              trainerId: (m as any).assignedTrainerId || data.trainerId || customer?.trainerId,
              centerId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }
            const newDocRef = await addDoc(collection(db, 'customers'), mCustomer)
            createdMemberIds.push(newDocRef.id)
          }
        }

        const allCustomerIds = [customer!.id, ...createdMemberIds]
        const studentTrainersMap: Record<string, string> = {
          [customer!.id]: data.trainerId || customer?.trainerId || ''
        }
        activeMembers.forEach((m, idx) => {
          const id = createdMemberIds[idx]
          if (id) {
            studentTrainersMap[id] = (m as any).assignedTrainerId || data.trainerId || ''
          }
        })

        ;(data as any).customerIds = allCustomerIds
        ;(data as any).studentTrainers = studentTrainersMap
        ;(data as any).primaryCustomerId = customer!.id
      }

      if (data.contractType === 'group') {
        if (groupQuotaSum !== Number(data.totalSessions)) {
          alert(`目前學員個人配額小計 (${groupQuotaSum} 堂) 與合約總堂數 (${data.totalSessions} 堂) 不一致，請修正配額。`)
          setLoading(false)
          return
        }

        // Validate required basic info for dynamic members 2..N
        for (let i = 0; i < additionalGroupMembers.length; i++) {
          const m = additionalGroupMembers[i]
          if (m.memberMode === 'existing') {
            if (!m.existingCustomerId || !m.name) {
              alert(`請選擇學員 ${i + 2} 的現有學員資料。`)
              setLoading(false)
              return
            }
          } else {
            if (!m.name || !m.phone || !m.idNumber) {
              alert(`請完整填寫學員 ${i + 2} 的真實姓名、電話與身分證字號。`)
              setLoading(false)
              return
            }
          }
        }

        // Process additional members 2..N (existing or newly created)
        const createdMemberIds: string[] = []
        const createdMemberNames: string[] = []
        const createdMemberQuotas: number[] = []

        for (let i = 0; i < additionalGroupMembers.length; i++) {
          const m = additionalGroupMembers[i]
          if (m.memberMode === 'existing' && m.existingCustomerId) {
            createdMemberIds.push(m.existingCustomerId)
            createdMemberNames.push(m.name || `團員${i + 2}`)
            createdMemberQuotas.push(m.allocatedSessions)
          } else {
            const mCustomer = {
              name: m.name || `團員${i + 2}`,
              idNumber: m.idNumber || '',
              phone: m.phone || '',
              email: m.email || '',
              dateOfBirth: m.dateOfBirth ? Timestamp.fromDate(new Date(m.dateOfBirth)) : serverTimestamp(),
              gender: m.gender,
              exerciseHabit: m.exerciseHabit,
              source: m.source || 'existing',
              emergencyContact: m.emergencyContact,
              medicalHistory: m.medicalHistory,
              trainerId: data.trainerId || customer?.trainerId,
              centerId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }
            const newDocRef = await addDoc(collection(db, 'customers'), mCustomer)
            createdMemberIds.push(newDocRef.id)
            createdMemberNames.push(mCustomer.name)
            createdMemberQuotas.push(m.allocatedSessions)
          }
        }

        const allCustomerIds = [customer!.id, ...createdMemberIds]
        const allMemberQuotas: Record<string, any> = {
          [customer!.id]: {
            customerId: customer!.id,
            customerName: customer!.name,
            totalSessions: primaryMemberQuota,
            remainingSessions: primaryMemberQuota,
          }
        }
        createdMemberIds.forEach((id, idx) => {
          allMemberQuotas[id] = {
            customerId: id,
            customerName: createdMemberNames[idx],
            totalSessions: createdMemberQuotas[idx],
            remainingSessions: createdMemberQuotas[idx],
          }
        })

        ;(data as any).groupMemberQuotas = allMemberQuotas
        ;(data as any).customerIds = allCustomerIds
      }

      if (!data.remainingSessions || data.remainingSessions <= 0) {
        data.remainingSessions = Number(data.totalSessions) || 0
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

  if (!customer) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-white rounded-3xl border-none shadow-2xl">
        <div className="sr-only">
          <DialogTitle>合約續約/新增</DialogTitle>
          <DialogDescription>為現有客戶 {customer.name} 建立新合約。</DialogDescription>
        </div>
        <div className="flex h-[82vh] min-h-[640px]">
          {/* Sidebar — dark premium (unified with CustomerFormModal) */}
          <div className="w-64 bg-stone-900 border-r border-stone-800 flex flex-col shrink-0">
            {/* Sidebar Header */}
            <div className="px-7 pt-8 pb-6 border-b border-white/5">
              <p className="text-[10px] font-bold tracking-widest uppercase text-stone-500 mb-1">
                Contract Renewal
              </p>
              <h3 className="text-white font-bold text-base leading-tight truncate">
                {customer.name}
              </h3>
              <p className="text-stone-400 text-xs mt-1 font-medium">新增 / 續約合約</p>
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

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="flex-1 overflow-y-auto p-10 lg:p-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSteps[currentStep]?.id || currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {activeSteps[currentStep]?.id === 'contract' && (
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">合約設定</h2>
                        <p className="text-stone-500 text-sm">請輸入新合約的課程方案與效期。</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-stone-700 font-bold block text-xs">合約模式 *</Label>
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue('bindExistingContractMode', false)
                              form.setValue('existingContractId', null)
                              form.setValue('contractType', 'single')
                              form.setValue('sharedWithCustomerId', null)
                              form.setValue('partnerMode', 'none')
                              form.setValue('partnerId', null)
                              form.setValue('partnerCustomerData', null)
                            }}
                            className={cn(
                              "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                              !form.watch('bindExistingContractMode') && form.watch('contractType') === 'single'
                                ? "bg-stone-950 border-stone-950 text-white shadow-lg"
                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50"
                            )}
                          >
                            <RiUser3Line className="w-4.5 h-4.5" />
                            單人合約
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue('bindExistingContractMode', false)
                              form.setValue('existingContractId', null)
                              form.setValue('contractType', 'dual')
                              form.setValue('partnerMode', 'existing')
                            }}
                            className={cn(
                              "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                              !form.watch('bindExistingContractMode') && form.watch('contractType') === 'dual'
                                ? "bg-amber-500 border-amber-500 text-white shadow-lg"
                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50"
                            )}
                          >
                            <RiGroupLine className="w-4.5 h-4.5" />
                            雙人合約
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue('bindExistingContractMode', false)
                              form.setValue('existingContractId', null)
                              form.setValue('contractType', 'shared')
                              form.setValue('sharedWithCustomerId', null)
                              form.setValue('partnerMode', 'none')
                              form.setValue('partnerId', null)
                              form.setValue('partnerCustomerData', null)
                            }}
                            className={cn(
                              "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                              !form.watch('bindExistingContractMode') && form.watch('contractType') === 'shared'
                                ? "bg-blue-600 border-blue-600 text-white shadow-lg"
                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50"
                            )}
                          >
                            <RiUserSharedLine className="w-4.5 h-4.5" />
                            共享合約
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue('bindExistingContractMode', false)
                              form.setValue('existingContractId', null)
                              form.setValue('contractType', 'group')
                              form.setValue('sharedWithCustomerId', null)
                              form.setValue('partnerMode', 'none')
                              form.setValue('partnerId', null)
                              form.setValue('partnerCustomerData', null)
                              recalculateGroupQuotas(Number(form.getValues('totalSessions')) || 0, groupMemberCount)
                            }}
                            className={cn(
                              "flex-1 py-3 px-3 rounded-2xl border-2 font-bold text-xs transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                              !form.watch('bindExistingContractMode') && form.watch('contractType') === 'group'
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-lg"
                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50"
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
                                : "bg-white border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50"
                            )}
                          >
                            <RiLinkM className="w-4.5 h-4.5" />
                            連結合約
                          </button>
                        </div>
                      </div>

                      {form.watch('bindExistingContractMode') && (
                        <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="space-y-1">
                            <h4 className="font-bold text-blue-950 text-sm flex items-center gap-1.5">
                              <RiLinkM className="w-4 h-4 text-blue-600" />
                              <span>連結場館現有學員之合約</span>
                            </h4>
                            <p className="text-xs text-blue-700">
                              將現有學員 {customer.name} 連結並加入至場館其他學員已持有的個人合約或團體課合約。
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-blue-100">
                            <div className="space-y-2">
                              <Label className="text-xs text-blue-900 font-medium">選擇欲連結的場館學員 (主學員 / 合約持有者) *</Label>
                                <SearchableCustomerSelect
                                  customers={activeCustomers}
                                  value={selectedExistingCustomerId || ''}
                                  onChange={(id) => {
                                    setSelectedExistingCustomerId(id || null)
                                    form.setValue('existingContractId', null)
                                    form.setValue('secondaryTrainerId', null)
                                  }}
                                  excludeIds={customer?.id ? [customer.id] : []}
                                  placeholder="-- 請搜尋或選擇場館學員 --"
                                />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs text-blue-900 font-medium">選擇其現有合約 *</Label>
                              <div className="relative">
                                <select
                                  value={form.watch('existingContractId') || ''}
                                  onChange={(e) => {
                                    form.setValue('existingContractId', e.target.value || null)
                                    form.setValue('secondaryTrainerId', null)
                                  }}
                                  disabled={!selectedExistingCustomerId}
                                  className="w-full h-10 rounded-xl border border-stone-200 bg-white text-stone-800 px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 appearance-none cursor-pointer"
                                >
                                  <option value="">-- 請選擇合約 --</option>
                                  {existingCustomerContracts.map((c) => {
                                    const trainerName = trainers.find(t => t.id === c.trainerId)?.name || c.trainerId || '未指定'
                                    const isGroup = c.contractType === 'group'
                                    const isShared = c.contractType === 'shared'
                                    const isDual = !isGroup && !isShared && (c.contractType === 'dual' || (!!c.sharedWithCustomerId && c.contractType !== 'shared' && c.contractType !== 'group'))
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
                                      : isShared
                                      ? ` (${currentMemberCount}/4人)`
                                      : isGroup
                                      ? ` (${currentMemberCount}/6人)`
                                      : ' (綁定後轉共享合約)'

                                    return (
                                      <option key={c.id} value={c.id} disabled={isFull || isAlreadyMember}>
                                        {tagText} 合約編號: {c.contractNumber || c.contractNo || c.id.substring(0, 8)} ({c.remainingSessions}/{c.totalSessions} 堂, 教練: {trainerName}){statusSuffix}
                                      </option>
                                    )
                                  })}
                                </select>
                                <RiArrowDownSLine className="w-4 h-4 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                            const isAlreadyMember = isCustomerAlreadyInContract(selectedContract)

                            if (isAlreadyMember) {
                              return (
                                <div className="mt-4 p-4 bg-red-50/80 border border-red-200 rounded-2xl text-xs text-red-900 space-y-1.5 font-medium animate-in fade-in duration-300 shadow-xs">
                                  <div className="flex items-center gap-1.5 font-bold text-sm text-red-950">
                                    <RiAlertLine className="w-4 h-4 shrink-0 text-red-600" />
                                    <span>防呆警告：無法綁定此合約</span>
                                  </div>
                                  <p className="text-red-700 leading-relaxed">
                                    學員 <span className="font-bold underline">{customer?.name}</span> 目前已是此合約（編號：<span className="font-mono font-bold">{selectedContract.contractNumber || selectedContract.contractNo || selectedContract.id.substring(0, 8)}</span>）的成員之一，無法重複新增或綁定至同一合約！
                                  </p>
                                </div>
                              )
                            }

                            if (isShared) {
                              return (
                                <div className="mt-4 p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-3 text-xs text-stone-700 shadow-xs animate-in fade-in duration-300">
                                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                                    <h4 className="font-bold text-blue-950 text-sm flex items-center gap-1.5">
                                      <RiUserSharedLine className="w-4 h-4 text-blue-600" />
                                      <span>👥 多人共享合約新增成員明細</span>
                                    </h4>
                                    <span className={cn(
                                      "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                      isFull
                                        ? "bg-red-100 text-red-700 border-red-200"
                                        : "bg-blue-100 text-blue-800 border-blue-200"
                                    )}>
                                      目前成員: {currentCount} / 6 人 ({isFull ? '已滿額' : `可再加入 ${6 - currentCount} 人`})
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-stone-600 font-medium">
                                    <div>合約編號: <span className="font-mono font-bold text-stone-900">{selectedContract.contractNumber || selectedContract.contractNo || selectedContract.id.substring(0, 8)}</span></div>
                                    <div>總課堂數: <span className="font-bold text-stone-900">{selectedContract.totalSessions} 堂</span> (剩餘 {selectedContract.remainingSessions} 堂)</div>
                                    <div>合約效期: <span className="font-bold text-stone-900">{selectedContract.startDate ? new Date((selectedContract.startDate as any).seconds ? (selectedContract.startDate as any).seconds * 1000 : selectedContract.startDate).toLocaleDateString() : ''} ~ {selectedContract.endDate ? new Date((selectedContract.endDate as any).seconds ? (selectedContract.endDate as any).seconds * 1000 : selectedContract.endDate).toLocaleDateString() : ''}</span></div>
                                    <div>主教練: <span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract.trainerId)?.name || selectedContract.trainerId || '未指定'}</span></div>
                                  </div>
                                  <p className="text-[10px] text-blue-800 font-medium pt-1 border-t border-blue-200/60">
                                    💡 提示：連結完成後，{customer.name} 將加入成為該合約的共享成員之一，全體成員共享此合約之剩餘堂數 ({selectedContract.remainingSessions} 堂)。
                                  </p>
                                </div>
                              )
                            }

                            if (isGroup) {
                              return (
                                <div className="mt-4 p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/80 space-y-3 text-xs text-stone-700 shadow-xs animate-in fade-in duration-300">
                                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                                    <h4 className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                                      <span>👥 團體合約綁定明細</span>
                                    </h4>
                                    <span className={cn(
                                      "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                      isFull
                                        ? "bg-red-100 text-red-700 border-red-200"
                                        : "bg-emerald-100 text-emerald-800 border-emerald-200"
                                    )}>
                                      目前成員: {currentCount} / 6 人 ({isFull ? '已滿額' : `可再加入 ${6 - currentCount} 人`})
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-stone-600 font-medium">
                                    <div>合約編號: <span className="font-mono font-bold text-stone-900">{selectedContract.contractNumber || selectedContract.contractNo || selectedContract.id.substring(0, 8)}</span></div>
                                    <div>總課堂數: <span className="font-bold text-stone-900">{selectedContract.totalSessions} 堂</span> (剩餘 {selectedContract.remainingSessions} 堂)</div>
                                    <div>合約效期: <span className="font-bold text-stone-900">{selectedContract.startDate ? new Date((selectedContract.startDate as any).seconds ? (selectedContract.startDate as any).seconds * 1000 : selectedContract.startDate).toLocaleDateString() : ''} ~ {selectedContract.endDate ? new Date((selectedContract.endDate as any).seconds ? (selectedContract.endDate as any).seconds * 1000 : selectedContract.endDate).toLocaleDateString() : ''}</span></div>
                                    <div>授課教練: <span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract.trainerId)?.name || selectedContract.trainerId || '未指定'}</span></div>
                                  </div>
                                  <p className="text-[10px] text-emerald-800 font-medium pt-1 border-t border-emerald-200/60">
                                    💡 提示：連結完成後，{customer.name} 將成為該合約第 {currentCount + 1} 位團體成員，初始堂數預設為 0 堂。合約狀態將更新為「待簽名」，供後續編輯合約時分配堂數與簽名。
                                  </p>
                                </div>
                              )
                            }

                            if (isDual) {
                              return (
                                <div className="mt-4 p-3.5 bg-red-50/70 border border-red-200/60 rounded-xl text-xs text-red-800 flex items-center gap-2 font-medium">
                                  <span>此雙人合約成員已滿 (2/2人)，無法再新增綁定學員。</span>
                                </div>
                              )
                            }

                            return (
                              <div className="mt-4 p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-3 text-xs text-stone-700 shadow-xs animate-in fade-in duration-300">
                                <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                                  <h4 className="font-bold text-blue-950 text-sm flex items-center gap-1.5">
                                    <span>🔗 多人共享合約升級說明</span>
                                  </h4>
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    個人合約 ➔ 轉多人共享
                                  </span>
                                </div>
                                <p className="text-stone-600 leading-relaxed font-medium">
                                  將連結學員 <span className="font-bold text-stone-900">{activeCustomers.find(c => c.id === selectedExistingCustomerId)?.name || '原學員'}</span> 的個人合約。連結後，系統將自動升級轉換為「多人共享合約」，由多人共同持用該合約之堂數。
                                </p>
                                <div className="grid grid-cols-2 gap-2 text-stone-600 font-medium bg-white/70 p-3 rounded-xl border border-blue-100">
                                  <div>原合約編號: <span className="font-mono font-bold text-stone-900">{selectedContract.contractNumber || selectedContract.contractNo || selectedContract.id.substring(0, 8)}</span></div>
                                  <div>原主教練: <span className="font-bold text-stone-900">{trainers.find(t => t.id === selectedContract.trainerId)?.name || selectedContract.trainerId || '未指定'}</span></div>
                                  <div>合約總堂數: <span className="font-bold text-stone-900">{selectedContract.totalSessions} 堂</span></div>
                                  <div>剩餘堂數: <span className="font-bold text-stone-900">{selectedContract.remainingSessions} 堂</span></div>
                                </div>
                              </div>
                            )
                          })()}

                          {isSingleBinding && (
                            <div className="space-y-2 pt-2 border-t border-blue-100">
                              <Label className="text-blue-950 font-bold block text-xs">第二位學員 ({customer.name}) 的授課教練 *</Label>
                              <p className="text-[10px] text-blue-700">請為即將加入此合約的學員 {customer.name} 選擇授課教練</p>
                              <div className="relative">
                                <select
                                  value={form.watch('secondaryTrainerId') || ''}
                                  onChange={(e) => form.setValue('secondaryTrainerId', e.target.value || null)}
                                  className="w-full h-10 rounded-xl border border-blue-200 bg-white text-stone-800 px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                                >
                                  <option value="">-- 請選擇教練 --</option>
                                  {trainers.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                <RiArrowDownSLine className="w-4 h-4 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {!form.watch('bindExistingContractMode') && (form.watch('contractType') === 'group' || form.watch('contractType') === 'shared') && (
                        <div className={cn(
                          "p-5 rounded-2xl space-y-5 animate-in fade-in slide-in-from-top-2 duration-300 border",
                          form.watch('contractType') === 'shared'
                            ? "bg-blue-50/50 border-blue-100"
                            : "bg-emerald-50/50 border-emerald-100"
                        )}>
                          {/* 1. 人數選擇 */}
                          <div className="space-y-2">
                            <Label className="text-stone-900 font-bold block text-xs">
                              1. 選擇{form.watch('contractType') === 'shared' ? '多人共享合約 (2~4 人)' : '團體課 (2~6 人)'}總人數 *
                            </Label>
                            <div className="flex gap-2">
                              {(form.watch('contractType') === 'shared' ? [2, 3, 4] : [2, 3, 4, 5, 6]).map(count => {
                                const isSelected = form.watch('contractType') === 'shared'
                                  ? sharedMemberCount === count
                                  : groupMemberCount === count
                                return (
                                  <button
                                    key={count}
                                    type="button"
                                    onClick={() => {
                                      if (form.watch('contractType') === 'shared') {
                                        setSharedMemberCount(count)
                                      } else {
                                        setGroupMemberCount(count)
                                      }
                                      syncAdditionalMembersCount(count - 1)
                                      if (form.getValues('contractType') === 'group') {
                                        recalculateGroupQuotas(Number(form.getValues('totalSessions')) || 0, count)
                                      }
                                    }}
                                    className={cn(
                                      "flex-1 py-2 px-3 rounded-xl border font-bold text-xs transition-all flex items-center justify-center gap-1",
                                      isSelected
                                        ? form.watch('contractType') === 'shared'
                                          ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                                          : "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                        : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                                    )}
                                  >
                                    {count} 人{form.watch('contractType') === 'shared' ? '共享' : '團課'}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* 2. 成員綁定方式與指導教練 */}
                          <div className="space-y-3 pt-2 border-t border-stone-200/50">
                            <Label className="text-stone-900 font-bold block text-xs">2. 設定成員綁定方式與指導教練 *</Label>
                            
                            <div className="space-y-3">
                              {/* 成員 1 (主學員) - 僅用於共享合約顯示與設定教練 */}
                              {form.watch('contractType') === 'shared' && (
                                <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200/80 shadow-xs space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-extrabold flex items-center justify-center">
                                        1
                                      </span>
                                      主學員 (成員 1)：{customer?.name || '主學員'}
                                    </span>
                                    <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                                      合約主要紀錄者
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 pt-1 border-t border-blue-100">
                                    <Label className="text-[11px] font-bold text-blue-900">指導教練 *</Label>
                                    <select
                                      value={form.watch('trainerId') || ''}
                                      onChange={(e) => {
                                        form.setValue('trainerId', e.target.value)
                                        form.setValue('secondaryTrainerId', null)
                                      }}
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

                              {additionalGroupMembers.slice(0, (form.watch('contractType') === 'shared' ? sharedMemberCount : groupMemberCount) - 1).map((m, idx) => (
                                <div key={idx} className="p-3.5 bg-white rounded-xl border border-stone-200/80 shadow-xs space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                                      <span className={cn(
                                        "w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center",
                                        form.watch('contractType') === 'shared'
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
                                          setAdditionalGroupMembers(prev => {
                                            const next = [...prev]
                                            next[idx] = { ...next[idx], memberMode: 'existing', existingCustomerId: '' }
                                            return next
                                          })
                                        }}
                                        className={cn(
                                          "py-1 px-2.5 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1",
                                          m.memberMode === 'existing'
                                            ? form.watch('contractType') === 'shared'
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
                                          setAdditionalGroupMembers(prev => {
                                            const next = [...prev]
                                            next[idx] = {
                                              ...next[idx],
                                              memberMode: 'new',
                                              existingCustomerId: undefined,
                                              name: '',
                                              idNumber: '',
                                              phone: '',
                                              email: '',
                                              dateOfBirth: new Date().toISOString().split('T')[0],
                                              emergencyContact: { name: '', relation: '', phone: '' },
                                              medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
                                            }
                                            return next
                                          })
                                        }}
                                        className={cn(
                                          "py-1 px-2.5 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1",
                                          m.memberMode === 'new'
                                            ? form.watch('contractType') === 'shared'
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
                                                assignedTrainerId: item.assignedTrainerId || selectedCust.trainerId || form.watch('trainerId') || '',
                                              } : item))
                                            }
                                          } else {
                                            setAdditionalGroupMembers(prev => prev.map((item, i) => i === idx ? { ...item, memberMode: 'existing', existingCustomerId: '', name: '' } : item))
                                          }
                                        }}
                                        excludeIds={[
                                          ...(customer?.id ? [customer.id] : []),
                                          ...additionalGroupMembers.filter((_, oIdx) => oIdx !== idx).map(item => item.existingCustomerId).filter(Boolean) as string[]
                                        ]}
                                        placeholder="-- 請搜尋或選擇現有學員 --"
                                      />
                                    </div>
                                  ) : (
                                    <p className={cn(
                                      "text-[11px] font-semibold p-2 rounded-lg border",
                                      form.watch('contractType') === 'shared'
                                        ? "text-blue-700 bg-blue-50/80 border-blue-200/60"
                                        : "text-emerald-700 bg-emerald-50/80 border-emerald-200/60"
                                    )}>
                                      學員 {idx + 2} 之基本資料與健康狀態將於點擊「下一步」後填寫。
                                    </p>
                                  )}

                                  {/* 教練選擇 (共享合約獨立設定成員教練) */}
                                  {form.watch('contractType') === 'shared' && (
                                    <div className="space-y-1.5 pt-2 border-t border-stone-100">
                                      <Label className="text-[11px] font-bold text-stone-700">指導教練 *</Label>
                                      <select
                                        value={m.assignedTrainerId || form.watch('trainerId') || ''}
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
                          {form.watch('contractType') === 'shared' ? (
                            <div className="p-4 bg-white rounded-xl border border-blue-200/60 space-y-2">
                              <div className="flex items-center gap-1.5 font-bold text-xs text-blue-950">
                                <RiUserSharedLine className="w-4 h-4 text-blue-600" />
                                <span>3. 多人共享合約堂數模式說明</span>
                              </div>
                              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                                本合約設定為 <span className="font-bold text-blue-900">「多人共享合約」</span>，由全體 {sharedMemberCount} 位學員共同持有一份合約堂數池（合約總堂數: <span className="font-bold text-stone-900">{form.watch('totalSessions') || 0} 堂</span>）。學員各自約課銷課時直接由該合約剩餘堂數扣抵，無需為每位成員個別設定堂數上限。
                              </p>
                            </div>
                          ) : (
                            <div className="p-4 bg-white rounded-xl border border-emerald-200/60 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-stone-800">3. 堂數分配設定（全體總堂數: {form.watch('totalSessions') || 0} 堂）</span>
                                {groupQuotaRemainder > 0 && (
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                    餘 {groupQuotaRemainder} 堂可微調分配
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1 bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-100">
                                  <span className="text-[11px] font-bold text-stone-700 block truncate">學員 1 (主學員: {customer?.name})</span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min={0}
                                      value={primaryMemberQuota}
                                      onChange={(e) => setPrimaryMemberQuota(Number(e.target.value))}
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
                                          const val = Number(e.target.value)
                                          setAdditionalGroupMembers(prev => {
                                            const next = [...prev]
                                            next[idx] = { ...next[idx], allocatedSessions: val }
                                            return next
                                          })
                                        }}
                                        className="w-full h-8 rounded-lg border border-stone-200 px-2 text-xs font-bold bg-white"
                                      />
                                      <span className="text-[10px] text-stone-500 font-bold shrink-0">堂</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {groupQuotaSum !== Number(form.watch('totalSessions')) && (
                                <p className="text-[10px] font-bold text-red-500 flex items-center gap-1 pt-1">
                                  <RiAlertLine className="w-3 h-3 shrink-0" />
                                  目前個人配額小計 ({groupQuotaSum} 堂) 與合約總堂數 ({form.watch('totalSessions') || 0} 堂) 不一致，請微調個人堂數。
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {form.watch('contractType') === 'dual' && (
                        <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                                excludeIds={customer?.id ? [customer.id] : []}
                                placeholder="-- 請搜尋或選擇共享學員 --"
                              />
                              {form.watch('sharedWithCustomerId') && (
                                <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-100">
                                  <RiUserSharedLine className="w-3 h-3 shrink-0" />
                                  此合約將由 {customer.name} 與 {(activeCustomers || []).find(c => c.id === form.watch('sharedWithCustomerId'))?.name || '選擇的學員'} 共同持有。
                                </p>
                              )}
                            </div>
                          )}

                          {form.watch('partnerMode') === 'new' && (
                            <div className="flex items-start gap-2.5 p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-semibold border border-amber-100">
                              <RiUserAddLine className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>已選擇新增全新學員。下一步將引導您填寫第二位學員的基本資料。</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 課程教練分配 — single, dual & group */}
                      {!form.watch('bindExistingContractMode') && (watchedValues.contractType === 'single' || watchedValues.contractType === 'dual' || watchedValues.contractType === 'group') && (
                        <div className="space-y-4 border-t border-stone-100 pt-6">
                          <div className="space-y-1">
                            <Label className="text-stone-700 font-bold block text-xs">分配課程教練 *</Label>
                            <p className="text-[10px] text-stone-400">
                              {watchedValues.contractType === 'group' ? '設定指導本團體合約 (1位教練+多位學員) 之主授課教練' : watchedValues.contractType === 'dual' ? '設定指導本雙人合約 (1位教練+2位學員) 之授課教練' : '設定指導本合約學員之授課教練'}
                            </p>
                          </div>

                          <div className="space-y-2 max-w-md">
                            <Label className="text-xs text-stone-500 font-medium">授課教練 *</Label>
                            <div className="relative">
                              <select
                                value={form.watch('trainerId') || ''}
                                onChange={(e) => {
                                  form.setValue('trainerId', e.target.value)
                                  form.setValue('secondaryTrainerId', null)
                                }}
                                className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20 appearance-none cursor-pointer"
                              >
                                <option value="">-- 請選擇教練 --</option>
                                {trainers.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                              <RiArrowDownSLine className="w-4 h-4 text-stone-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                            {form.formState.errors.trainerId && (
                              <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.trainerId.message}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {!form.watch('bindExistingContractMode') && (
                        <>
                          <div className="pt-2 border-t border-stone-200/60">
                            <Label className="text-stone-900 font-bold block text-xs">4. 合約方案與金額設定 *</Label>
                          </div>

                        <div className="grid grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600">合約總堂數 *</Label>
                              <Input type="number" {...form.register('totalSessions')} onChange={handleSessionsChange} className="h-10 rounded-xl bg-stone-50 border-stone-200 focus:bg-white" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600">合約總金額 (NT$) *</Label>
                              <Input type="number" {...form.register('totalAmount')} onChange={handleTotalAmountChange} className="h-10 rounded-xl bg-stone-50 border-stone-200 focus:bg-white" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600">合約開始日 *</Label>
                              <Input 
                                type="date" 
                                {...form.register('startDate')} 
                                onChange={(e) => {
                                  const val = e.target.value
                                  form.setValue('startDate', val as any, { shouldValidate: true })
                                  if (val) {
                                    const oneYearLater = addOneYearToDateString(val)
                                    if (oneYearLater) {
                                      form.setValue('endDate', oneYearLater as any, { shouldValidate: true })
                                    }
                                  }
                                }}
                                className="h-10 rounded-xl bg-stone-50 border-stone-200 focus:bg-white" 
                              />
                              {form.formState.errors.startDate && (
                                <p className="text-red-500 text-[10px] font-medium flex items-center gap-1"><RiAlertLine className="w-3 h-3" />{form.formState.errors.startDate.message}</p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold text-stone-600">合約結束日 *</Label>
                              <Input 
                                type="date" 
                                {...form.register('endDate')} 
                                onChange={(e) => {
                                  form.setValue('endDate', e.target.value as any, { shouldValidate: true })
                                }}
                                className="h-10 rounded-xl bg-stone-50 border-stone-200 focus:bg-white" 
                              />
                              {form.formState.errors.endDate && (
                                <p className="text-red-500 text-[10px] font-medium flex items-center gap-1"><RiAlertLine className="w-3 h-3" />{form.formState.errors.endDate.message}</p>
                              )}
                            </div>
                          </div>

                          {/* 付款方式與分期設定 */}
                          <div className="space-y-4 border-t border-stone-100 pt-6">
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold text-stone-600">付款方式 *</Label>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    form.setValue('paymentType', 'single');
                                    syncInstallments('single', 2, form.getValues('totalAmount') || 0, form.getValues('startDate') || new Date());
                                  }}
                                  className={cn(
                                    "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2",
                                    form.watch('paymentType') !== 'installments'
                                      ? "bg-stone-950 border-stone-950 text-white shadow-lg"
                                      : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                  )}
                                >
                                  <RiBankCardLine className="w-4 h-4" />
                                  一次全額付清
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    form.setValue('paymentType', 'installments');
                                    syncInstallments('installments', form.getValues('installmentCount') || 2, form.getValues('totalAmount') || 0, form.getValues('startDate') || new Date());
                                  }}
                                  className={cn(
                                    "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2",
                                    form.watch('paymentType') === 'installments'
                                      ? "bg-amber-500 border-amber-500 text-white shadow-lg"
                                      : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                  )}
                                >
                                  <RiMoneyDollarCircleLine className="w-4 h-4" />
                                  學員分期付款
                                </button>
                              </div>
                            </div>

                            {form.watch('paymentType') === 'installments' && (
                              <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-4 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs font-bold text-amber-900">分期期數設定 *</Label>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-[11px] text-stone-500">選擇期數：</Label>
                                    <select
                                      value={form.watch('installmentCount') || 2}
                                      onChange={(e) => {
                                        const count = Number(e.target.value);
                                        form.setValue('installmentCount', count);
                                        syncInstallments('installments', count, form.getValues('totalAmount') || 0, form.getValues('startDate') || new Date());
                                      }}
                                      className="h-8 rounded-lg border border-stone-200 bg-white text-xs font-bold px-2"
                                    >
                                      {[2, 3, 4, 6, 8, 12, 16].map(n => (
                                        <option key={n} value={n}>{n} 期</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {(form.watch('installments') || []).map((inst, idx) => (
                                    <div key={inst.id || idx} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-stone-200/80 text-xs">
                                      <span className="font-bold text-stone-400 min-w-12">第 {idx + 1} 期</span>
                                      <div className="flex-1 flex items-center gap-1.5">
                                        <span className="text-stone-500 text-[11px]">金額: NT$</span>
                                        <Input
                                          type="number"
                                          value={inst.amount || 0}
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            const current = [...(form.getValues('installments') || [])];
                                            current[idx] = { ...current[idx], amount: val };
                                            form.setValue('installments', current);
                                          }}
                                          className="h-8 text-xs font-bold w-28 bg-stone-50"
                                        />
                                      </div>
                                      <div className="flex-1 flex items-center gap-1.5">
                                        <span className="text-stone-500 text-[11px]">應付日期:</span>
                                        <Input
                                          type="date"
                                          value={inst.dueDate ? (inst.dueDate instanceof Date ? inst.dueDate.toISOString().split('T')[0] : new Date(inst.dueDate).toISOString().split('T')[0]) : ''}
                                          onChange={(e) => {
                                            const val = e.target.value ? new Date(e.target.value) : new Date();
                                            const current = [...(form.getValues('installments') || [])];
                                            current[idx] = { ...current[idx], dueDate: val };
                                            form.setValue('installments', current);
                                          }}
                                          className="h-8 text-xs font-medium w-36 bg-stone-50"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {(() => {
                                  const insts = form.watch('installments') || [];
                                  const sum = insts.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
                                  const total = form.watch('totalAmount') || 0;
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
                                      <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[11px] font-bold space-y-1 border border-red-100">
                                        {isDiff && <div className="flex items-center gap-1"><RiAlertLine className="w-3.5 h-3.5 shrink-0" />分期繳款總額 (NT$ {sum.toLocaleString()}) 與合約總金額 (NT$ {total.toLocaleString()}) 不符！</div>}
                                        {isDateError && <div className="flex items-center gap-1"><RiAlertLine className="w-3.5 h-3.5 shrink-0" />繳款日期防呆：前一期繳款日期不能晚於下一期！</div>}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            )}
                          </div>

                          <div className="bg-stone-50 border border-stone-200/80 p-5 rounded-2xl flex justify-between items-center">
                            <div>
                              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">單堂平均價格</p>
                              <p className="text-2xl font-black text-stone-900 mt-0.5">
                                NT$ {(form.watch('pricePerSession') || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="text-right text-stone-400 text-xs">
                              依總金額與堂數自動計算
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'partner_basic' && (
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">共享學員基本資料</h2>
                        <p className="text-stone-500 text-sm">輸入第二位共享學員的聯絡方式與緊急聯繫人資訊。</p>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-stone-700">共享學員姓名 *</Label>
                          <Input {...form.register('partnerCustomerData.name')} placeholder="例如：陳小美" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">身分證字號 *</Label>
                          <Input {...form.register('partnerCustomerData.idNumber')} placeholder="B223456789" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">電話 *</Label>
                          <Input {...form.register('partnerCustomerData.phone')} placeholder="0987-654-321" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">Email</Label>
                          <Input type="email" {...form.register('partnerCustomerData.email')} placeholder="partner@mail.com" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">出生年月日 *</Label>
                          <MinguoDatePickerInput
                            value={form.watch('partnerCustomerData.dateOfBirth')}
                            onChange={(d) => form.setValue('partnerCustomerData.dateOfBirth', d as any, { shouldValidate: true })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">歷史已上堂數</Label>
                          <Input type="number" {...form.register('partnerCustomerData.historicalSessions')} className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                      </div>
                      <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                          緊急聯絡人資訊 (共享學員) *
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-stone-500">姓名 *</Label>
                            <Input {...form.register('partnerCustomerData.emergencyContact.name')} className="h-9 text-sm" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-stone-500">關係 *</Label>
                            <Input {...form.register('partnerCustomerData.emergencyContact.relation')} className="h-9 text-sm" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-stone-500">電話 *</Label>
                            <Input {...form.register('partnerCustomerData.emergencyContact.phone')} className="h-9 text-sm" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'partner_medical' && (
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">共享學員健康狀態</h2>
                        <p className="text-stone-500 text-sm">了解第二位學員的身體狀況以進行更安全的課程設計。</p>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="text-stone-700 font-bold block mb-4">慢性病史 (可複選)</Label>
                          <div className="grid grid-cols-3 gap-3">
                            {['無狀況', '高血壓', '心臟病', '糖尿病', '氣喘', '癲癇', '骨質疏鬆', '自體免疫', '癌症', '其他'].map((condition) => (
                              <label key={condition} className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                                (form.watch('partnerCustomerData.medicalHistory.chronicConditions') || []).includes(condition) 
                                  ? "bg-brand-50 border-brand-200 text-brand-700" 
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
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
                                  "w-4 h-4 rounded border flex items-center justify-center",
                                  (form.watch('partnerCustomerData.medicalHistory.chronicConditions') || []).includes(condition) 
                                    ? "bg-brand-500 border-brand-500" 
                                    : "border-stone-300"
                                  )}>
                                  {(form.watch('partnerCustomerData.medicalHistory.chronicConditions') || []).includes(condition) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </div>
                                <span className="text-sm font-medium">{condition}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-stone-700 font-bold block mb-4">傷病史 (可複選)</Label>
                          <div className="grid grid-cols-4 gap-3">
                            {['無狀況', '肩部', '手肘', '手腕', '下背', '髖關節', '膝蓋', '腳踝', '其他'].map((injury) => (
                              <label key={injury} className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-center justify-center",
                                (form.watch('partnerCustomerData.medicalHistory.injuries') || []).includes(injury) 
                                  ? "bg-stone-900 border-stone-900 text-white" 
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
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
                                <span className="text-xs font-bold">{injury}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2 pt-4">
                          <Label className="text-stone-700 font-bold">其他身體狀況說明</Label>
                          <textarea 
                            {...form.register('partnerCustomerData.medicalHistory.notes')} 
                            className="w-full h-32 p-4 rounded-2xl border border-stone-200 bg-stone-50 focus:bg-white focus:ring-2 focus:ring-brand-500/20 transition-all text-sm outline-none"
                            placeholder="例如：右膝前十字韌帶曾開刀..." 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id.startsWith('group_member_') && (() => {
                    const stepId = activeSteps[currentStep].id
                    const match = stepId.match(/^group_member_(\d+)_(basic|medical)$/)
                    if (!match) return null
                    const memberNum = parseInt(match[1], 10)
                    const memberIdx = memberNum - 2
                    const isBasic = match[2] === 'basic'
                    const memberData = additionalGroupMembers[memberIdx]
                    if (!memberData) return null

                    const updateMember = (fields: Partial<typeof memberData>) => {
                      setAdditionalGroupMembers(prev => {
                        const next = [...prev]
                        next[memberIdx] = { ...next[memberIdx], ...fields }
                        return next
                      })
                    }

                    if (isBasic) {
                      const isExistingMode = (memberData.memberMode || 'existing') === 'existing'

                      return (
                        <div className="space-y-6 animate-in fade-in duration-300">
                          <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-stone-900">
                              {isExistingMode ? `學員 ${memberNum} 資料與綁定` : `新增學員 ${memberNum} 基本資料`}
                            </h2>
                            <p className="text-stone-500 text-sm">
                              {isExistingMode
                                ? `請確認團體課第 ${memberNum} 位學員的綁定資訊。`
                                : `請填寫團體課第 ${memberNum} 位全新學員的基本資訊與緊急聯絡人。`}
                            </p>
                          </div>

                          {/* Member Mode Switcher (Shown only if in existing mode) */}
                          {isExistingMode && (
                            <div className="space-y-2 p-4 bg-stone-50/80 rounded-2xl border border-stone-200/60">
                              <Label className="text-stone-700 font-semibold block text-xs">學員 {memberNum} 綁定方式 *</Label>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateMember({ memberMode: 'existing', existingCustomerId: '' })
                                  }}
                                  className={cn(
                                    "flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1.5",
                                    isExistingMode
                                      ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                                      : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                  )}
                                >
                                  <RiLinkM className="w-4 h-4" />
                                  連結系統現有學員
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateMember({
                                      memberMode: 'new',
                                      existingCustomerId: undefined,
                                      name: '',
                                      idNumber: '',
                                      phone: '',
                                      email: '',
                                      dateOfBirth: new Date().toISOString().split('T')[0],
                                      emergencyContact: { name: '', relation: '', phone: '' },
                                      medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
                                    })
                                  }}
                                  className={cn(
                                    "flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-1.5",
                                    !isExistingMode
                                      ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                                      : "bg-white border-stone-200 text-stone-500 hover:border-stone-300"
                                  )}
                                >
                                  <RiUserAddLine className="w-4 h-4" />
                                  新增全新學員
                                </button>
                              </div>
                            </div>
                          )}

                          {isExistingMode ? (
                            <div className="p-5 bg-emerald-50/40 border border-emerald-100 rounded-2xl space-y-4 animate-in fade-in duration-300">
                              <div className="space-y-2">
                                <Label className="text-xs text-stone-700 font-semibold">選擇現有學員 *</Label>
                                <SearchableCustomerSelect
                                  customers={(customers || []).filter(c => c.id !== customer?.id && !additionalGroupMembers.some((other, oIdx) => oIdx !== memberIdx && other.existingCustomerId === c.id))}
                                  value={memberData.existingCustomerId || ''}
                                  onChange={(selectedId) => {
                                    if (selectedId) {
                                      const selectedCust = customers.find(c => c.id === selectedId)
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
                                        updateMember({
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
                                        })
                                      } else {
                                        updateMember({ memberMode: 'existing', existingCustomerId: '', name: '' })
                                      }
                                    } else {
                                      updateMember({ memberMode: 'existing', existingCustomerId: '', name: '' })
                                    }
                                  }}
                                  placeholder="-- 請搜尋或選擇現有學員 --"
                                />
                              </div>

                              {memberData.existingCustomerId && (
                                <div className="p-4 bg-white rounded-xl border border-emerald-200 space-y-2 text-xs">
                                  <div className="flex items-center justify-between text-emerald-900 font-bold border-b border-stone-100 pb-2">
                                    <span className="flex items-center gap-1.5">
                                      <RiUserSharedLine className="w-4 h-4 text-emerald-600" />
                                      已連結現有學員：{memberData.name}
                                    </span>
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                                      連動成功
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-stone-600 text-[11px] pt-1">
                                    <div>行動電話：<span className="font-semibold text-stone-900">{memberData.phone || '無'}</span></div>
                                    <div>身分證字號：<span className="font-semibold text-stone-900">{memberData.idNumber || '無'}</span></div>
                                    <div>緊急聯絡人：<span className="font-semibold text-stone-900">{memberData.emergencyContact?.name || '無'} ({memberData.emergencyContact?.relation || '無'})</span></div>
                                    <div>緊急電話：<span className="font-semibold text-stone-900">{memberData.emergencyContact?.phone || '無'}</span></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-6 animate-in fade-in duration-300">
                              <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">真實姓名 *</Label>
                              <Input
                                value={memberData.name}
                                onChange={(e) => updateMember({ name: e.target.value })}
                                placeholder="例如：王小明"
                                className="h-12 rounded-2xl bg-stone-50 border-stone-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">身分證字號 / 護照號碼 *</Label>
                              <Input
                                value={memberData.idNumber}
                                onChange={(e) => updateMember({ idNumber: e.target.value.toUpperCase() })}
                                placeholder="例如：A123456789"
                                className="h-12 rounded-2xl bg-stone-50 border-stone-200 uppercase"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">行動電話 *</Label>
                              <Input
                                value={memberData.phone}
                                onChange={(e) => updateMember({ phone: e.target.value })}
                                placeholder="例如：0912345678"
                                className="h-12 rounded-2xl bg-stone-50 border-stone-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">電子郵件 (選填)</Label>
                              <Input
                                value={memberData.email}
                                onChange={(e) => updateMember({ email: e.target.value })}
                                placeholder="example@email.com"
                                className="h-12 rounded-2xl bg-stone-50 border-stone-200"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">出生日期 *</Label>
                              <MinguoDatePickerInput
                                value={memberData.dateOfBirth}
                                onChange={(d) => {
                                  const str = d ? (d instanceof Date ? d.toISOString().split('T')[0] : String(d)) : ''
                                  updateMember({ dateOfBirth: str })
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">生理性別 *</Label>
                              <div className="flex gap-3">
                                {[
                                  { label: '女性 (Female)', val: 'female' },
                                  { label: '男性 (Male)', val: 'male' },
                                  { label: '其他 (Other)', val: 'other' },
                                ].map(g => (
                                  <button
                                    key={g.val}
                                    type="button"
                                    onClick={() => updateMember({ gender: g.val as any })}
                                    className={cn(
                                      "flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all",
                                      memberData.gender === g.val
                                        ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                                        : "bg-white text-stone-600 border-stone-200"
                                    )}
                                  >
                                    {g.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* 運動習慣與客戶來源 */}
                          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-stone-100">
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">規律運動習慣 *</Label>
                              <div className="flex gap-3">
                                {[
                                  { label: '無運動習慣', val: 'none' },
                                  { label: '每週 1-2 次', val: 'weekly_1_2' },
                                  { label: '每週 3 次以上', val: 'weekly_3_plus' },
                                ].map(item => (
                                  <button
                                    key={item.val}
                                    type="button"
                                    onClick={() => updateMember({ exerciseHabit: item.val as any })}
                                    className={cn(
                                      "flex-1 py-2.5 px-2 rounded-xl border text-[11px] font-bold transition-all",
                                      memberData.exerciseHabit === item.val
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                                        : "bg-white text-stone-600 border-stone-200"
                                    )}
                                  >
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-stone-700 font-bold">客戶來源渠道 *</Label>
                              <select
                                value={memberData.source}
                                onChange={(e) => updateMember({ source: e.target.value })}
                                className="w-full h-12 rounded-2xl bg-stone-50 border border-stone-200 px-4 text-sm font-bold"
                              >
                                <option value="existing">舊客戶</option>
                                <option value="instagram">Instagram</option>
                                <option value="facebook">Facebook</option>
                                <option value="google">Google 搜尋/地圖</option>
                                <option value="friend">親友/會員介紹</option>
                                <option value="passby">過路/現場親洽</option>
                                <option value="other">其他管道</option>
                              </select>
                            </div>
                          </div>

                          {/* 緊急聯絡人卡片 */}
                          <div className="p-5 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-4">
                            <Label className="text-stone-900 font-bold text-sm block">🆘 緊急聯絡人資訊 *</Label>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs text-stone-600 font-medium">姓名 *</Label>
                                <Input
                                  value={memberData.emergencyContact.name}
                                  onChange={(e) => updateMember({
                                    emergencyContact: { ...memberData.emergencyContact, name: e.target.value }
                                  })}
                                  placeholder="緊急聯絡人姓名"
                                  className="h-10 text-xs rounded-xl bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-stone-600 font-medium">關係 *</Label>
                                <Input
                                  value={memberData.emergencyContact.relation}
                                  onChange={(e) => updateMember({
                                    emergencyContact: { ...memberData.emergencyContact, relation: e.target.value }
                                  })}
                                  placeholder="例如：父母、配偶"
                                  className="h-10 text-xs rounded-xl bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-stone-600 font-medium">電話 *</Label>
                                <Input
                                  value={memberData.emergencyContact.phone}
                                  onChange={(e) => updateMember({
                                    emergencyContact: { ...memberData.emergencyContact, phone: e.target.value }
                                  })}
                                  placeholder="聯絡電話"
                                  className="h-10 text-xs rounded-xl bg-white"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                    }

                    // 健康狀態
                    return (
                      <div className="space-y-8 animate-in fade-in duration-300">
                        <div className="space-y-1">
                          <h2 className="text-2xl font-bold text-stone-900">學員 {memberNum} 健康狀態</h2>
                          <p className="text-stone-500 text-sm">請勾選第 {memberNum} 位學員的特殊病史與過去傷病史。</p>
                        </div>

                        <div className="space-y-6">
                          <div>
                            <Label className="text-stone-700 font-bold block mb-3">特殊病史 (可複選)</Label>
                            <div className="grid grid-cols-4 gap-3">
                              {['無狀況', '高血壓', '心臟病', '糖尿病', '氣喘', '癲癇', '懷孕', '其他'].map(cond => {
                                const checked = memberData.medicalHistory.chronicConditions.includes(cond)
                                return (
                                  <label
                                    key={cond}
                                    className={cn(
                                      "flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer justify-center text-xs font-bold",
                                      checked ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-stone-200 text-stone-600"
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      className="hidden"
                                      onChange={(e) => {
                                        const isChecked = e.target.checked
                                        let current = [...memberData.medicalHistory.chronicConditions]
                                        if (cond === '無狀況' && isChecked) {
                                          current = ['無狀況']
                                        } else if (cond !== '無狀況' && isChecked) {
                                          current = current.filter(x => x !== '無狀況')
                                          current.push(cond)
                                        } else {
                                          current = current.filter(x => x !== cond)
                                        }
                                        updateMember({
                                          medicalHistory: { ...memberData.medicalHistory, chronicConditions: current }
                                        })
                                      }}
                                    />
                                    {cond}
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          <div>
                            <Label className="text-stone-700 font-bold block mb-3">傷病史 (可複選)</Label>
                            <div className="grid grid-cols-4 gap-3">
                              {['無狀況', '肩部', '手肘', '手腕', '下背', '髖關節', '膝蓋', '腳踝', '其他'].map(injury => {
                                const checked = memberData.medicalHistory.injuries.includes(injury)
                                return (
                                  <label
                                    key={injury}
                                    className={cn(
                                      "flex items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer justify-center text-xs font-bold",
                                      checked ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-stone-200 text-stone-600"
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      className="hidden"
                                      onChange={(e) => {
                                        const isChecked = e.target.checked
                                        let current = [...memberData.medicalHistory.injuries]
                                        if (injury === '無狀況' && isChecked) {
                                          current = ['無狀況']
                                        } else if (injury !== '無狀況' && isChecked) {
                                          current = current.filter(x => x !== '無狀況')
                                          current.push(injury)
                                        } else {
                                          current = current.filter(x => x !== injury)
                                        }
                                        updateMember({
                                          medicalHistory: { ...memberData.medicalHistory, injuries: current }
                                        })
                                      }}
                                    />
                                    {injury}
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-stone-700 font-bold">其他身體狀況說明</Label>
                            <textarea
                              value={memberData.medicalHistory.notes}
                              onChange={(e) => updateMember({
                                medicalHistory: { ...memberData.medicalHistory, notes: e.target.value }
                              })}
                              className="w-full h-28 p-3 rounded-2xl border border-stone-200 bg-stone-50 text-xs"
                              placeholder="請輸入說明..."
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {activeSteps[currentStep]?.id === 'signature' && (
                    <div className="space-y-6">
                      <h2 className="text-2xl font-bold text-stone-900">簽署確認</h2>
                      <div className="space-y-4">
                        {/* Contract Terms Box */}
                        <div className="space-y-2">
                          <Label className="text-stone-700 font-bold text-sm">合約預覽與條款</Label>
                          {(() => {
                            const contractType = form.watch('contractType')
                            const isDual = contractType === 'dual'
                            const isShared = contractType === 'shared'
                            const isGroup = contractType === 'group'
                            const partnerMode = form.watch('partnerMode')
                            const reviewDate = formatROCDate(form.watch('startDate') || new Date())
                            
                            // Primary Info
                            const primaryInfo = {
                              name: customer?.name || '',
                              idNumber: customer?.idNumber || '',
                              dobStr: (() => {
                                const d = formatROCDate(customer?.dateOfBirth)
                                return d.y ? `${d.y}/${d.m}/${d.d}` : ''
                              })(),
                              phone: customer?.phone || '',
                              email: customer?.email || '',
                              emergencyName: customer?.emergencyContact?.name || '',
                              emergencyRelation: customer?.emergencyContact?.relation || '',
                              emergencyPhone: customer?.emergencyContact?.phone || '',
                            }

                            // Partner Info (Dual)
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

                            const coachA = trainers.find(t => t.id === form.watch('trainerId'))?.name || '未指定'
                            const coachB = trainers.find(t => t.id === form.watch('secondaryTrainerId'))?.name
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

                            const totalSessions = form.watch('totalSessions') || 0
                            const totalAmount = form.watch('totalAmount') || 0
                            const pricePerSession = totalSessions > 0 ? Math.round(totalAmount / totalSessions) : 0
                            const startDate = formatROCDate(form.watch('startDate'))
                            const endDate = formatROCDate(form.watch('endDate'))
                            const paymentType = form.watch('paymentType')
                            const installmentCount = form.watch('installmentCount') || 2
                            const paymentTypeStr = paymentType === 'single'
                              ? '☑ 單次付清  □ 分期付款'
                              : `□ 單次付清  ☑ 分期付款（共 ${installmentCount} 期）`

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
                                          <RiUserSharedLine className="w-3 h-3" /> 多人共享合約模式 ({groupMemberCount} 人共享堂數)
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

                                    {/* Partner Customer (Dual) */}
                                    {isDual && partnerInfo && (
                                      <div className="space-y-1.5 bg-amber-50/30 p-2.5 rounded-xl border border-amber-100/60">
                                        <div className="font-bold text-amber-900 border-b border-amber-200 pb-0.5 text-[9px]">
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
                                        <span>R27健身站（簡稱乙方）</span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-y-1 gap-x-2">
                                        <div>公司名稱：<span className="font-bold text-stone-900">紅二七健身有限公司</span></div>
                                        <div>負責人：<span className="font-bold text-stone-900">郭沛霖</span></div>
                                        <div>電話：<span className="font-bold text-stone-900">0905396658</span></div>
                                        <div className="col-span-2">營業/履約地址：<span className="font-bold text-stone-900">新北市淡水區中正東路二段68號</span></div>
                                        <div>官方IG：<span className="font-bold text-stone-900 underline">r27fitness</span></div>
                                        <div className="col-span-3">公共意外責任險：<span className="font-bold text-stone-900">已投保（效期：114/11/21-115/11/21）</span></div>
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
                                          {(isDual && !isOneToTwo) ? '2' : '1'} 位教練對 {isGroup ? groupMemberCount : isDual ? '2' : '1'} 位學員
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
                                        <li>本契約涉訟時，雙方同意以臺灣士林地方法院為第一審管轄法院（因履約地淡水屬士林地院管轄），但不得排除消費者保護法服務之訴訟管轄法院之適用。</li>
                                      </ol>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>

                        {/* Agreement Checkbox */}
                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="agree-renewal"
                            checked={form.watch('isAgreed')}
                            onChange={e => form.setValue('isAgreed', e.target.checked)}
                            className="w-5 h-5 rounded accent-brand-500 cursor-pointer"
                          />
                          <label htmlFor="agree-renewal" className="text-sm font-medium text-stone-700 cursor-pointer">
                            同意並簽署上述「{brandName} {form.watch('contractType') === 'group' ? '團體健身教練課程契約書' : form.watch('contractType') === 'dual' ? '雙人共享健身教練課程契約書' : '健身教練課程契約書'}」
                          </label>
                        </div>

                        <div className={cn(
                          "grid gap-6 transition-all duration-500",
                          form.watch('contractType') === 'dual' ? "grid-cols-2" : "grid-cols-1",
                          !form.watch('isAgreed') && "opacity-30 pointer-events-none grayscale"
                        )}>
                          {/* Signature A */}
                          <div className="relative">
                            <Label className="font-bold text-stone-700 block mb-2">
                              {form.watch('contractType') === 'group' ? '主學員 (代表簽署人) 數位簽名 *' : form.watch('contractType') === 'dual' ? '甲方學員 A 簽名 *' : '學員數位簽名 *'}
                            </Label>
                            <div className="border-2 border-dashed border-stone-200 rounded-3xl bg-white p-2 relative h-48">
                              <SignatureCanvas
                                ref={sigCanvas}
                                onEnd={() => form.setValue('signatureDataUrl', 'signed')}
                                canvasProps={{ className: 'w-full h-full cursor-crosshair' }}
                              />
                              <Button variant="ghost" size="sm" className="absolute top-4 right-4 text-stone-400" onClick={() => {
                                sigCanvas.current?.clear()
                                form.setValue('signatureDataUrl', null)
                              }}>清除</Button>
                            </div>
                          </div>

                          {/* Signature B */}
                          {form.watch('contractType') === 'dual' && (
                            <div className="relative">
                              <Label className="font-bold text-stone-900 block mb-2">甲方學員 B 簽名 *</Label>
                              <div className="border-2 border-dashed border-orange-200 rounded-3xl bg-white p-2 relative h-48">
                                <SignatureCanvas
                                  ref={secondarySigCanvas}
                                  onEnd={() => form.setValue('secondarySignatureDataUrl', 'signed')}
                                  canvasProps={{ className: 'w-full h-full cursor-crosshair' }}
                                />
                                <Button variant="ghost" size="sm" className="absolute top-4 right-4 text-stone-400" onClick={() => {
                                  secondarySigCanvas.current?.clear()
                                  form.setValue('secondarySignatureDataUrl', null)
                                }}>清除</Button>
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

            <div className="p-6 px-10 border-t border-stone-100 flex justify-between items-center bg-white/90 backdrop-blur-md">
              <Button
                type="button"
                variant="ghost"
                onClick={handlePrev}
                disabled={currentStep === 0}
                className={cn("rounded-xl font-bold text-stone-600 hover:text-stone-900", currentStep === 0 && "opacity-0 invisible")}
              >
                ← 上一步
              </Button>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="rounded-xl font-bold text-stone-600 border-stone-200 hover:bg-stone-50"
                >
                  取消
                </Button>
                {currentStep < activeSteps.length - 1 ? (
                  <Button
                    type="button"
                    onClick={handleNext}
                    disabled={!stepStatus[currentStep]}
                    className="bg-stone-950 hover:bg-stone-800 text-white font-bold rounded-xl px-6 shadow-md shadow-stone-950/10"
                  >
                    下一步 →
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleFinalSubmit(form.getValues())}
                    disabled={loading || !stepStatus[currentStep]}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-8 shadow-md shadow-emerald-600/20"
                  >
                    {loading ? '儲存中...' : '確認建立合約'}
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
