import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
// Handle default export mismatch in some build environments (Vite/ESM)
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, ChevronLeft, User, FileText, Activity, ShieldCheck } from 'lucide-react'
import { collection, getDocs } from 'firebase/firestore'
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

interface CustomerFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CombinedCustomerContractValues) => Promise<void>
  initialData?: Partial<CombinedCustomerContractValues>
  isEditMode?: boolean
  customers?: Customer[]
}

const STEPS = [
  { id: 'basic', title: '基本資料', icon: User, fields: ['name', 'phone', 'idNumber', 'dateOfBirth', 'emergencyContact.name', 'emergencyContact.relation', 'emergencyContact.phone'] },
  { id: 'medical', title: '健康狀態', icon: Activity, fields: ['medicalHistory.chronicConditions', 'medicalHistory.injuries'] },
  { id: 'contract', title: '合約設定', icon: FileText, fields: ['contract.totalSessions', 'contract.totalAmount', 'contract.startDate', 'contract.endDate'] },
  { id: 'signature', title: '簽署確認', icon: ShieldCheck, fields: [] },
]

export function CustomerFormModal({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isEditMode = false,
  customers = [],
}: CustomerFormModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const sigCanvas = useRef<SignatureCanvas>(null)
  const secondarySigCanvas = useRef<SignatureCanvas>(null)
  const [trainers, setTrainers] = useState<any[]>([])
  const [isOneToTwo, setIsOneToTwo] = useState(true)

  const defaultValues = useMemo(() => ({
    name: '',
    idNumber: '',
    phone: '',
    email: '',
    dateOfBirth: new Date(),
    historicalSessions: 0,
    emergencyContact: { name: '', relation: '', phone: '' },
    sharedContractCustomerId: null,
    medicalHistory: { chronicConditions: [], injuries: [], notes: '' },
    partnerMode: 'none' as const,
    partnerId: null,
    partnerCustomerData: null,
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
          dueDate: new Date(),
          paidDate: new Date(),
          status: 'paid' as const,
        }
      ],
      startDate: new Date(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
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

  useEffect(() => {
    const fetchTrainers = async () => {
      try {
        const snap = await getDocs(collection(db, 'trainers'))
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setTrainers(list)
        if (list.length > 0 && !form.getValues('contract.trainerId')) {
          form.setValue('contract.trainerId', list[0].id)
        }
      } catch (err) {
        console.error('Error fetching trainers:', err)
      }
    }
    if (open) {
      fetchTrainers()
    }
  }, [open, form])

  useEffect(() => {
    if (open) {
      if (initialData) {
        // Format dates to YYYY-MM-DD for HTML date inputs
        const formattedData = {
          ...initialData,
          dateOfBirth: initialData.dateOfBirth instanceof Date 
            ? initialData.dateOfBirth.toISOString().split('T')[0] 
            : initialData.dateOfBirth,
          contract: initialData.contract ? {
            ...initialData.contract,
            startDate: initialData.contract.startDate instanceof Date 
              ? initialData.contract.startDate.toISOString().split('T')[0] 
              : initialData.contract.startDate,
            endDate: initialData.contract.endDate instanceof Date 
              ? initialData.contract.endDate.toISOString().split('T')[0] 
              : initialData.contract.endDate,
            trainerId: initialData.contract.trainerId || (trainers[0]?.id || ''),
            secondaryTrainerId: initialData.contract.secondaryTrainerId || null,
          } : undefined
        }
        form.reset(formattedData as any)
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
  }, [open, initialData, form, trainers, defaultValues])

  const watchedValues = form.watch()

  const activeSteps = useMemo(() => {
    if (isEditMode) return STEPS.slice(0, 2)
    
    const steps = STEPS.map(step => {
      if (step.id === 'contract') {
        const fields = [...step.fields]
        if (watchedValues.partnerMode === 'existing') {
          fields.push('partnerId')
        }
        return { ...step, fields }
      }
      return step
    })

    if (watchedValues.partnerMode === 'new') {
      steps.splice(3, 0, 
        { 
          id: 'partner_basic', 
          title: '共享學員基本資料', 
          icon: User, 
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
          icon: Activity, 
          fields: [
            'partnerCustomerData.medicalHistory.chronicConditions', 
            'partnerCustomerData.medicalHistory.injuries'
          ] 
        }
      )
    }
    return steps
  }, [isEditMode, watchedValues.partnerMode])

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
    if (count < 2 || count > 6) return;
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
        const isDual = watchedValues.contract?.contractType === 'dual' || watchedValues.partnerMode !== 'none'
        if (isDual) {
          return !!watchedValues.contract?.signatureDataUrl && !!watchedValues.contract?.secondarySignatureDataUrl
        }
        return !!watchedValues.contract?.signatureDataUrl
      }

      if (step.id === 'contract') {
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
      
      const stepFields = step.fields as any[]
      const isComplete = stepFields.every(field => {
        const value = field.split('.').reduce((obj: any, key: any) => obj?.[key], watchedValues)
        if (Array.isArray(value)) return value.length > 0
        if (typeof value === 'number') return value >= 0 // Historical sessions can be 0
        return value !== undefined && value !== '' && value !== null
      })
      return isComplete
    })
  }, [watchedValues, activeSteps])

  const canGoNext = stepStatus[currentStep]

  const handleNext = async () => {
    const fieldsToValidate = activeSteps[currentStep].fields as any[]
    const isValid = await form.trigger(fieldsToValidate)
    
    if (isValid && currentStep < activeSteps.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }

  const handleSessionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sessions = Number(e.target.value)
    const totalAmount = form.getValues('contract.totalAmount') || 0
    form.setValue('contract.totalSessions', sessions)
    form.setValue('contract.remainingSessions', sessions)
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
    // Validate all active fields first
    const allActiveFields = activeSteps.flatMap(s => s.fields) as any[]
    const isValid = await form.trigger(allActiveFields)
    if (!isValid) {
      alert('請確認所有步驟欄位填寫正確。')
      return
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
          data.contract!.signatureDataUrl = rawCanvas.toDataURL('image/png')
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden bg-white rounded-2xl border-none shadow-2xl">
        <div className="sr-only">
          <DialogTitle>{isEditMode ? '編輯客戶資料' : '建立新客戶'}</DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? '更新客戶的基本聯絡資訊與健康狀態。' 
              : '請按照步驟填寫客戶資料、健康狀態、合約設定並完成簽名。'}
          </DialogDescription>
        </div>
        <div className="flex h-[80vh] min-h-[600px]">
          {/* Sidebar Checklist */}
          <div className="w-72 bg-stone-50 border-r border-stone-200 p-8 flex flex-col">
            <div className="mb-10">
              <h3 className="text-stone-900 font-bold text-lg">{isEditMode ? '編輯客戶' : '建立新客戶'}</h3>
              <p className="text-stone-500 text-xs mt-1">{isEditMode ? '更新現有檔案' : '請完成以下步驟'}</p>
            </div>

            <nav className="flex-1 space-y-4">
              {activeSteps.map((step, idx) => {
                const Icon = step.icon
                const isActive = currentStep === idx
                const isCompleted = stepStatus[idx]
                
                return (
                  <div key={step.id} className="relative">
                    <button
                      type="button"
                      disabled={idx > 0 && !stepStatus[idx-1] && idx > currentStep}
                      onClick={() => setCurrentStep(idx)}
                      className={cn(
                        "flex items-center gap-4 w-full text-left transition-all duration-300 p-2 rounded-xl",
                        isActive ? "bg-white shadow-sm" : "hover:bg-stone-100/50"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 shrink-0",
                        isCompleted ? "bg-brand-500 text-white" : 
                        isActive ? "bg-stone-950 text-white shadow-lg shadow-stone-200" : 
                        "bg-stone-200 text-stone-500"
                      )}>
                        {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                      </div>
                      <div className={cn("transition-all duration-300", !isActive && !isCompleted && "opacity-50")}>
                        <p className={cn(
                          "text-[10px] font-bold tracking-tight uppercase",
                          isActive ? "text-stone-950" : "text-stone-500"
                        )}>Step {idx + 1}</p>
                        <p className={cn(
                          "text-sm font-bold",
                          isActive ? "text-stone-950" : "text-stone-400"
                        )}>{step.title}</p>
                      </div>
                    </button>
                  </div>
                )
              })}
            </nav>
            
            <div className="pt-6 border-t border-stone-200">
              <div className="bg-brand-50 rounded-xl p-4">
                <p className="text-[10px] font-bold text-brand-600 uppercase mb-1">整體進度</p>
                <div className="h-1.5 w-full bg-brand-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(stepStatus.filter(s => s).length / activeSteps.length) * 100}%` }}
                    className="h-full bg-brand-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {activeSteps[currentStep]?.id === 'basic' && (
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">基本資料</h2>
                        <p className="text-stone-500 text-sm">輸入客戶的聯絡方式與緊急聯繫人資訊。</p>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-stone-700">姓名 *</Label>
                          <Input {...form.register('name')} placeholder="例如：王小明" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                          {form.formState.errors.name && <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">身分證字號 *</Label>
                          <Input {...form.register('idNumber')} placeholder="A123456789" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">電話 *</Label>
                          <Input {...form.register('phone')} placeholder="0912-345-678" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">Email</Label>
                          <Input type="email" {...form.register('email')} placeholder="example@mail.com" className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">出生年月日 *</Label>
                          <Input type="date" {...form.register('dateOfBirth', { valueAsDate: true })} className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">歷史已上堂數</Label>
                          <Input type="number" {...form.register('historicalSessions')} className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
                        </div>
                      </div>
                      <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                          緊急聯絡人資訊
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-stone-500">姓名 *</Label>
                            <Input {...form.register('emergencyContact.name')} className="h-9 text-sm" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-stone-500">關係 *</Label>
                            <Input {...form.register('emergencyContact.relation')} className="h-9 text-sm" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-stone-500">電話 *</Label>
                            <Input {...form.register('emergencyContact.phone')} className="h-9 text-sm" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'medical' && (
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">健康狀態</h2>
                        <p className="text-stone-500 text-sm">了解客戶的身體狀況以進行更安全的課程設計。</p>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="text-stone-700 font-bold block mb-4">慢性病史 (可複選)</Label>
                          <div className="grid grid-cols-3 gap-3">
                            {['無狀況', '高血壓', '心臟病', '糖尿病', '氣喘', '癲癇', '骨質疏鬆', '自體免疫', '癌症', '其他'].map((condition) => (
                              <label key={condition} className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                                (form.watch('medicalHistory.chronicConditions') || []).includes(condition) 
                                  ? "bg-brand-50 border-brand-200 text-brand-700" 
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
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
                                        // If "無狀況" is checked, clear everything else
                                        form.setValue('medicalHistory.chronicConditions', ['無狀況'])
                                      } else if (val !== '無狀況' && checked) {
                                        // If any other disease is checked, remove "無狀況" from the array
                                        form.setValue('medicalHistory.chronicConditions', current.filter(x => x !== '無狀況'))
                                      }
                                    }
                                  })}
                                />
                                <div className={cn(
                                  "w-4 h-4 rounded border flex items-center justify-center",
                                  (form.watch('medicalHistory.chronicConditions') || []).includes(condition) 
                                    ? "bg-brand-500 border-brand-500" 
                                    : "border-stone-300"
                                  )}>
                                  {(form.watch('medicalHistory.chronicConditions') || []).includes(condition) && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
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
                                (form.watch('medicalHistory.injuries') || []).includes(injury) 
                                  ? "bg-stone-900 border-stone-900 text-white" 
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
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
                                        // If "無狀況" is checked, clear everything else
                                        form.setValue('medicalHistory.injuries', ['無狀況'])
                                      } else if (val !== '無狀況' && checked) {
                                        // If any other injury is checked, remove "無狀況" from the array
                                        form.setValue('medicalHistory.injuries', current.filter(x => x !== '無狀況'))
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
                            {...form.register('medicalHistory.notes')} 
                            className="w-full h-32 p-4 rounded-2xl border border-stone-200 bg-stone-50 focus:bg-white focus:ring-2 focus:ring-brand-500/20 transition-all text-sm outline-none"
                            placeholder="例如：右膝前十字韌帶曾開刀..." 
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSteps[currentStep]?.id === 'contract' && (
                    <div className="space-y-8">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">合約設定</h2>
                        <p className="text-stone-500 text-sm">設定合約堂數、單價以及生效日期。</p>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="col-span-2 space-y-2">
                          <Label className="text-stone-700 font-bold block">合約模式 *</Label>
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('contract.contractType', 'single')
                                form.setValue('partnerMode', 'none')
                                form.setValue('partnerId', null)
                                form.setValue('partnerCustomerData', null)
                              }}
                              className={cn(
                                "flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2",
                                form.watch('contract.contractType') !== 'dual'
                                  ? "bg-stone-900 border-stone-900 text-white shadow-lg shadow-stone-200"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                              )}
                            >
                              👤 單人合約
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('contract.contractType', 'dual')
                                form.setValue('partnerMode', 'existing')
                              }}
                              className={cn(
                                "flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2",
                                form.watch('contract.contractType') === 'dual'
                                  ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-100"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                              )}
                            >
                              👥 雙人共享合約
                            </button>
                          </div>
                        </div>

                        {form.watch('contract.contractType') === 'dual' && (
                          <div className="col-span-2 p-6 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Label className="text-purple-950 font-bold block text-sm">👥 共享學員綁定方式 *</Label>
                            <div className="flex gap-4">
                              <button
                                type="button"
                                onClick={() => {
                                  form.setValue('partnerMode', 'existing')
                                  form.setValue('partnerCustomerData', null)
                                }}
                                className={cn(
                                  "flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all",
                                  form.watch('partnerMode') === 'existing'
                                    ? "bg-purple-600 border-purple-600 text-white"
                                    : "bg-white border-stone-200 text-stone-600"
                                )}
                              >
                                🔗 連結系統現有客戶
                              </button>
                              <button
                                type="button"
                                onClick={() => {
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
                                }}
                                className={cn(
                                  "flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all",
                                  form.watch('partnerMode') === 'new'
                                    ? "bg-purple-600 border-purple-600 text-white"
                                    : "bg-white border-stone-200 text-stone-600"
                                )}
                              >
                                ➕ 新增全新客戶
                              </button>
                            </div>

                            {form.watch('partnerMode') === 'existing' && (
                              <div className="space-y-2 pt-2">
                                <Label className="text-xs text-purple-900 font-medium">選擇現有學員 *</Label>
                                <select
                                  value={form.watch('partnerId') || ''}
                                  onChange={(e) => form.setValue('partnerId', e.target.value || null)}
                                  className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                >
                                  <option value="">-- 請選擇學員 --</option>
                                  {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.phone})
                                    </option>
                                  ))}
                                </select>
                                {form.watch('partnerId') && (
                                  <p className="text-[10px] text-purple-500 font-bold">
                                    提示：此合約將會由您當前建立的客戶與 {customers.find(c => c.id === form.watch('partnerId'))?.name} 共同持有一份合約。
                                  </p>
                                )}
                              </div>
                            )}

                            {form.watch('partnerMode') === 'new' && (
                              <div className="pt-2">
                                <div className="p-3 bg-purple-100/50 text-purple-700 rounded-lg text-xs font-bold">
                                  ✨ 您已選擇為此合約新增全新客戶。下一步我們將會引導您填寫第二位學員的基本資料與健康狀態。
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {/* 課程教練分配 */}
                        <div className="space-y-4 border-t border-stone-100 pt-6 col-span-2">
                          <div className="space-y-1">
                            <Label className="text-stone-700 font-bold block text-xs">分配課程教練 *</Label>
                            <p className="text-[10px] text-stone-400">設定指導本合約學員的教練分配</p>
                          </div>

                          {watchedValues.contract?.contractType === 'single' ? (
                            <div className="space-y-2 max-w-md">
                              <Label className="text-xs text-stone-500 font-medium">授課教練</Label>
                              <select
                                value={form.watch('contract.trainerId') || ''}
                                onChange={(e) => {
                                  form.setValue('contract.trainerId', e.target.value)
                                  form.setValue('contract.secondaryTrainerId', null)
                                }}
                                className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                              >
                                <option value="">-- 請選擇教練 --</option>
                                {trainers.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </select>
                              {form.formState.errors.contract?.trainerId && (
                                <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.trainerId.message}</p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-4 bg-stone-50 p-4.5 rounded-2xl border border-stone-200/50">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="isOneToTwoForm"
                                  checked={isOneToTwo}
                                  onChange={(e) => {
                                    const checked = e.target.checked
                                    setIsOneToTwo(checked)
                                    if (checked) {
                                      form.setValue('contract.secondaryTrainerId', form.getValues('contract.trainerId'))
                                    } else {
                                      form.setValue('contract.secondaryTrainerId', trainers[0]?.id || '')
                                    }
                                  }}
                                  className="rounded text-stone-900 focus:ring-stone-500 w-4 h-4"
                                />
                                <label htmlFor="isOneToTwoForm" className="text-xs font-bold text-stone-700 select-none cursor-pointer">
                                  👥 1對2 同時間上課（共用同一位教練）
                                </label>
                              </div>

                              {isOneToTwo ? (
                                <div className="space-y-2 max-w-md pt-1">
                                  <Label className="text-xs text-stone-500 font-medium">共享授課教練</Label>
                                  <select
                                    value={form.watch('contract.trainerId') || ''}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      form.setValue('contract.trainerId', val)
                                      form.setValue('contract.secondaryTrainerId', val)
                                    }}
                                    className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                                  >
                                    <option value="">-- 請選擇教練 --</option>
                                    {trainers.map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                  {form.formState.errors.contract?.trainerId && (
                                    <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.trainerId.message}</p>
                                  )}
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-4 pt-1">
                                  <div className="space-y-2">
                                    <Label className="text-xs text-stone-500 font-medium">
                                      學員 A ({watchedValues.name || '主學員'}) 的教練
                                    </Label>
                                    <select
                                      value={form.watch('contract.trainerId') || ''}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        form.setValue('contract.trainerId', val)
                                      }}
                                      className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                                    >
                                      <option value="">-- 請選擇教練 --</option>
                                      {trainers.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                    {form.formState.errors.contract?.trainerId && (
                                      <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.trainerId.message}</p>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs text-stone-500 font-medium">
                                      學員 B ({watchedValues.partnerMode === 'existing' ? (customers.find(c => c.id === watchedValues.partnerId)?.name || '共享學員') : (watchedValues.partnerCustomerData?.name || '共享學員')}) 的教練
                                    </Label>
                                    <select
                                      value={form.watch('contract.secondaryTrainerId') || ''}
                                      onChange={(e) => form.setValue('contract.secondaryTrainerId', e.target.value)}
                                      className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                                    >
                                      <option value="">-- 請選擇教練 --</option>
                                      {trainers.map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                    {form.formState.errors.contract?.secondaryTrainerId && (
                                      <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.secondaryTrainerId.message}</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-stone-700">合約總堂數 *</Label>
                          <Input type="number" {...form.register('contract.totalSessions')} onChange={handleSessionsChange} className="bg-stone-50 border-stone-200" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">合約總金額 (Total Lesson Fee) *</Label>
                          <Input type="number" {...form.register('contract.totalAmount')} onChange={handleTotalAmountChange} className="bg-stone-50 border-stone-200" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">已付金額</Label>
                          <Input type="number" {...form.register('contract.paidAmount')} className="bg-stone-50 border-stone-200" readOnly={form.watch('contract.paymentType') === 'installments'} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">合約開始日 *</Label>
                          <Input type="date" {...form.register('contract.startDate', { valueAsDate: true })} className="bg-stone-50 border-stone-200" />
                          {form.formState.errors.contract?.startDate && (
                            <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.startDate.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">合約結束日 *</Label>
                          <Input type="date" {...form.register('contract.endDate', { valueAsDate: true })} className="bg-stone-50 border-stone-200" />
                          {form.formState.errors.contract?.endDate && (
                            <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.contract.endDate.message}</p>
                          )}
                        </div>

                        {/* 付款方式與分期設定 */}
                        <div className="space-y-4 border-t border-stone-100 pt-6 col-span-2">
                          <Label className="text-stone-700 font-bold block text-xs">付款狀態 / 方式 *</Label>
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('contract.paymentType', 'single');
                                syncInstallments('single', 2, form.getValues('contract.totalAmount') || 0, form.getValues('contract.startDate') || new Date());
                              }}
                              className={cn(
                                "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-center gap-2",
                                form.watch('contract.paymentType') !== 'installments'
                                  ? "bg-stone-900 border-stone-900 text-white shadow-lg"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                              )}
                            >
                              💵 一次付清 (直接付清)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('contract.paymentType', 'installments');
                                syncInstallments('installments', form.getValues('contract.installmentCount') || 2, form.getValues('contract.totalAmount') || 0, form.getValues('contract.startDate') || new Date());
                              }}
                              className={cn(
                                "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-center gap-2",
                                form.watch('contract.paymentType') === 'installments'
                                  ? "bg-brand-500 border-brand-500 text-white shadow-lg"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                              )}
                            >
                              💳 分期付款 (二到六期)
                            </button>
                          </div>

                          {form.watch('contract.paymentType') === 'installments' && (
                            <div className="p-5 bg-stone-50 border border-stone-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="flex justify-between items-center">
                                <Label className="text-stone-700 font-bold block text-xs">選擇分期期數 *</Label>
                                <select
                                  value={form.watch('contract.installmentCount') || 2}
                                  onChange={(e) => {
                                    const count = Number(e.target.value);
                                    form.setValue('contract.installmentCount', count);
                                    syncInstallments('installments', count, form.getValues('contract.totalAmount') || 0, form.getValues('contract.startDate') || new Date());
                                  }}
                                  className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold focus:outline-none"
                                >
                                  {[2, 3, 4, 5, 6].map(num => (
                                    <option key={num} value={num}>{num} 期</option>
                                  ))}
                                </select>
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
                                            
                                            // Update contract paidAmount: sum of all installments with status === 'paid'
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

                              {/* 防呆錯誤提示資訊 */}
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
                                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[11px] font-bold space-y-1 border border-red-100 col-span-12">
                                      {isDiff && <div>⚠️ 分期繳款總額 (NT$ {sum.toLocaleString()}) 與合約總金額 (NT$ {total.toLocaleString()}) 不符！</div>}
                                      {isDateError && <div>⚠️ 繳款日期防呆：前一期繳款日期不能晚於下一期！</div>}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-6 p-6 bg-brand-50 rounded-2xl border border-brand-100 flex items-center justify-between">
                        <div>
                          <Label className="text-brand-600 text-xs font-bold uppercase mb-1">單堂平均價格</Label>
                          <div className="text-2xl font-black text-brand-950">
                            NT$ {(form.watch('contract.pricePerSession') || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                        <div className="text-right text-stone-400 text-xs">
                          根據總金額與堂數自動計算
                        </div>
                      </div>
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
                          <Input type="date" {...form.register('partnerCustomerData.dateOfBirth', { valueAsDate: true })} className="bg-stone-50 border-stone-200 focus:bg-white transition-all" />
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

                  {activeSteps[currentStep]?.id === 'signature' && (
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <h2 className="text-2xl font-bold text-stone-900">簽署確認</h2>
                        <p className="text-stone-500 text-sm">請閱讀條款並簽名確認。</p>
                      </div>

                      <div className="space-y-4">
                        {/* Summary Card */}
                        <div className={cn(
                          "rounded-3xl p-6 text-white space-y-4 shadow-xl transition-colors duration-500",
                          form.watch('contract.contractType') === 'dual' ? "bg-purple-950" : "bg-stone-900"
                        )}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">客戶姓名</p>
                              <h3 className="text-xl font-bold">
                                {form.watch('name') || '未填寫'}
                                {form.watch('contract.contractType') === 'dual' && (
                                  <>
                                    {' ＆ '}
                                    {form.watch('partnerMode') === 'existing'
                                      ? (customers.find(c => c.id === form.watch('partnerId'))?.name || '已選學員')
                                      : (form.watch('partnerCustomerData.name') || '新學員')}
                                  </>
                                )}
                              </h3>
                            </div>
                            <div className="text-right">
                              <p className="text-white/60 text-[10px] uppercase font-bold tracking-widest">合約總金額</p>
                              <p className="text-xl font-bold text-brand-400">NT$ {form.watch('contract.totalAmount')?.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-white/10">
                            <div>
                              <p className="text-white/40 text-[10px] uppercase font-bold">聯絡電話</p>
                              <p>{form.watch('phone') || '-'}</p>
                            </div>
                            <div>
                              <p className="text-white/40 text-[10px] uppercase font-bold">合約堂數</p>
                              <p>{form.watch('contract.totalSessions')} 堂</p>
                            </div>
                          </div>
                        </div>

                        {/* Contract Terms */}
                        <div className="space-y-2">
                          <Label className="text-stone-700 font-bold text-sm">合約預覽與條款</Label>
                          {(() => {
                            const isDual = form.watch('contract.contractType') === 'dual'
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
                                const partnerObj = customers.find(c => c.id === form.watch('partnerId'))
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
                            const coachNames = isDual
                              ? (coachB && coachB !== coachA ? `學員 A: ${coachA} / 學員 B: ${coachB}` : `${coachA} (同教練)`)
                              : coachA

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

                            return (
                              <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-stone-200 bg-stone-100 p-4 space-y-6">
                                <div className="bg-white text-stone-900 border border-stone-150 rounded-2xl p-6 space-y-5 font-serif leading-relaxed text-xs shadow-sm">
                                  {/* Header */}
                                  <div className="text-center space-y-1.5 border-b-2 border-stone-800 pb-3">
                                    <h1 className="text-base font-black text-stone-900 tracking-tight">R27 Fitness 健身教練課程契約書</h1>
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
                                      {isDual && <span className="text-[9px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-100">👥 雙人共享合約模式</span>}
                                    </h3>

                                    {/* Primary Customer */}
                                    <div className="space-y-1.5 bg-stone-50/60 p-2.5 rounded-xl border border-stone-150">
                                      <div className="font-bold text-stone-800 border-b border-stone-200 pb-0.5 text-[9px]">
                                        <span>會員姓名（簡稱甲方）{isDual && ' - 學員 A'}</span>
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

                                    {/* Partner Customer */}
                                    {isDual && partnerInfo && (
                                      <div className="space-y-1.5 bg-purple-50/30 p-2.5 rounded-xl border border-purple-100/60">
                                        <div className="font-bold text-purple-900 border-b border-purple-200 pb-0.5 text-[9px]">
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
                                      <div className="col-span-6">課程名稱：<span className="font-bold text-stone-900">一對一私人教練</span></div>
                                      <div className="col-span-6">教練比例：<span className="font-bold text-stone-900">1位教練對 {isDual ? '2' : '1'} 位學員</span></div>
                                      <div className="col-span-12">指定教練：<span className="font-bold text-stone-900 bg-stone-50 px-2 py-0.5 rounded border border-stone-200">{coachNames}</span></div>
                                      <div className="col-span-4">購買堂數：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 underline">{totalSessions}</span> 堂</div>
                                      <div className="col-span-4">契約總金額：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 underline">NT$ {totalAmount.toLocaleString()}</span> 元</div>
                                      <div className="col-span-4">每堂單價：<span className="font-bold text-stone-900 border-b border-stone-200 px-1 underline">NT$ {pricePerSession.toLocaleString()}</span> 元</div>
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
                                    <h4 className="font-bold text-stone-900 text-center text-sm underline decoration-brand-500 underline-offset-4">R27 Fitness 健身教練服務定型化契約條款</h4>
                                    
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
                                      <p className="mt-1 pl-1 text-[10px] text-amber-700 font-bold">
                                        註：修正：因傷病暫停超過六個月，經醫師證明不能運動者，致需終止契約，甲方得依規定辦理退費，乙方不收取手續費。
                                      </p>
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
                            我已閱讀並同意上述「R27 Fitness 健身教練課程契約書」
                          </label>
                        </div>

                        {/* Signature Area */}
                        <div className={cn(
                          "grid gap-6 transition-all duration-500",
                          form.watch('contract.contractType') === 'dual' ? "grid-cols-2" : "grid-cols-1",
                          !form.watch('contract.isAgreed') ? "opacity-30 pointer-events-none grayscale" : "opacity-100"
                        )}>
                          {/* Signature A */}
                          <div className="relative">
                            <Label className="text-stone-700 font-bold mb-2 block">
                              {form.watch('contract.contractType') === 'dual' ? '甲方學員 A 簽名 *' : '學員數位簽名 *'}
                            </Label>
                            <div className="border-2 border-dashed border-stone-300 rounded-3xl p-2 bg-white shadow-inner relative min-h-[200px]">
                              {form.watch('contract.signatureDataUrl') && form.watch('contract.signatureDataUrl') !== 'signed' && (
                                <div className="absolute inset-2 z-10 bg-white rounded-2xl flex items-center justify-center">
                                  <img 
                                    src={form.watch('contract.signatureDataUrl')!} 
                                    alt="Signature A" 
                                    className="max-h-full max-w-full object-contain"
                                  />
                                </div>
                              )}
                              <SignatureCanvas
                                ref={sigCanvas}
                                onEnd={() => form.setValue('contract.signatureDataUrl', 'signed')}
                                canvasProps={{ className: 'w-full h-48 rounded-2xl bg-white cursor-crosshair' }}
                              />
                            </div>
                            <div className="absolute right-6 top-10 z-20 flex gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => {
                                sigCanvas.current?.clear()
                                form.setValue('contract.signatureDataUrl', null)
                              }} className="h-8 text-xs text-stone-400 hover:text-red-500 bg-white/80 backdrop-blur-sm">
                                清除
                              </Button>
                            </div>
                          </div>

                          {/* Signature B */}
                          {form.watch('contract.contractType') === 'dual' && (
                            <div className="relative">
                              <Label className="text-purple-950 font-bold mb-2 block">甲方學員 B 簽名 *</Label>
                              <div className="border-2 border-dashed border-purple-200 rounded-3xl p-2 bg-white shadow-inner relative min-h-[200px]">
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
                                }} className="h-8 text-xs text-purple-400 hover:text-red-500 bg-white/80 backdrop-blur-sm">
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

            {/* Sticky Footer Navigation */}
            <div className="p-8 border-t border-stone-100 flex items-center justify-between bg-white/80 backdrop-blur-md">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handlePrev}
                disabled={currentStep === 0}
                className={cn("gap-2", currentStep === 0 && "opacity-0")}
              >
                <ChevronLeft className="w-4 h-4" />
                上一步
              </Button>

              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                >
                  取消
                </Button>
                
                {currentStep < activeSteps.length - 1 ? (
                  <Button 
                    type="button" 
                    onClick={handleNext}
                    disabled={!canGoNext}
                    className="gap-2 bg-stone-950 hover:bg-stone-800 transition-all px-8"
                  >
                    下一步
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button 
                    type="button" 
                    onClick={() => handleFinalSubmit(form.getValues())}
                    disabled={loading || !canGoNext}
                    className="gap-2 bg-brand-500 hover:bg-brand-600 transition-all px-8 shadow-lg shadow-brand-500/20"
                  >
                    {loading ? '儲存中...' : isEditMode ? '儲存修改' : '完成並建立客戶'}
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
