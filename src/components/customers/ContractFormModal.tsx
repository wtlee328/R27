import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, FileText, ShieldCheck, User, Activity } from 'lucide-react'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
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
import type { Customer, Contract } from '../../types'
import { useCenterStore } from '@/stores/centerStore'

interface ContractFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: ContractFormValues) => Promise<void>
  customer: Customer | null
  customers: Customer[]
}

const STEPS = [
  { id: 'contract', title: '合約設定', icon: FileText, fields: ['totalSessions', 'totalAmount', 'startDate', 'endDate'] },
  { id: 'signature', title: '簽署確認', icon: ShieldCheck, fields: [] },
]

export function ContractFormModal({
  open,
  onOpenChange,
  onSubmit,
  customer,
  customers,
}: ContractFormModalProps) {
  const { centerId } = useCenterStore()
  const brandName = centerId === 'coffit' ? 'Coffit' : 'R27 Fitness'

  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const sigCanvas = useRef<SignatureCanvas>(null)
  const secondarySigCanvas = useRef<SignatureCanvas>(null)
  const [trainers, setTrainers] = useState<any[]>([])
  const [isOneToTwo, setIsOneToTwo] = useState(true)

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
    },
  })

  useEffect(() => {
    const fetchTrainers = async () => {
      try {
        const snap = await getDocs(collection(db, 'trainers'))
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setTrainers(list)
        if (list.length > 0 && !form.getValues('trainerId')) {
          form.setValue('trainerId', list[0].id)
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
    if (open && customer) {
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
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
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

  const watchedValues = form.watch()

  const activeSteps = useMemo(() => {
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
  }, [watchedValues.partnerMode])

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
        const hasBasicData = watchedValues.totalSessions > 0 &&
               watchedValues.pricePerSession > 0 &&
               !!watchedValues.startDate &&
               !!watchedValues.endDate &&
               (watchedValues.contractType !== 'dual' || watchedValues.partnerMode !== 'none') &&
               (watchedValues.partnerMode !== 'existing' || !!watchedValues.sharedWithCustomerId);

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
        return true
      }
      if (step.id === 'signature') {
        const isDual = watchedValues.contractType === 'dual'
        return !!watchedValues.signatureDataUrl &&
               (!isDual || !!watchedValues.secondarySignatureDataUrl) &&
               watchedValues.isAgreed
      }
      return false
    })
  }, [activeSteps, watchedValues])

  const handleNext = async () => {
    const fieldsToValidate = activeSteps[currentStep].fields as any[]
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
    form.setValue('remainingSessions', sessions)
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
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-white rounded-2xl border-none shadow-2xl">
        <div className="sr-only">
          <DialogTitle>合約續約/新增</DialogTitle>
          <DialogDescription>為現有客戶 {customer.name} 建立新合約。</DialogDescription>
        </div>
        <div className="flex h-[80vh] min-h-[600px]">
          {/* Sidebar */}
          <div className="w-64 bg-stone-50 border-r border-stone-200 p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-10">
                <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold">
                  {customer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-stone-900 font-bold text-sm">合約續約</h3>
                  <p className="text-stone-500 text-[10px]">{customer.name}</p>
                </div>
              </div>

              <nav className="space-y-4">
                {activeSteps.map((step, idx) => {
                  const isActive = currentStep === idx
                  const isCompleted = stepStatus[idx]
                  return (
                    <button
                      key={step.id}
                      disabled={idx > currentStep && !stepStatus[currentStep]}
                      onClick={() => setCurrentStep(idx)}
                      className={cn(
                        "flex items-center gap-3 w-full text-left p-2 rounded-xl transition-all",
                        isActive ? "bg-white shadow-sm" : "opacity-50"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        isCompleted ? "bg-brand-500 text-white" : isActive ? "bg-stone-900 text-white" : "bg-stone-200"
                      )}>
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <step.icon className="w-4 h-4" />}
                      </div>
                      <span className="text-xs font-bold text-stone-900">{step.title}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="flex-1 overflow-y-auto p-12">
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
                              form.setValue('contractType', 'single')
                              form.setValue('sharedWithCustomerId', null)
                              form.setValue('partnerMode', 'none')
                              form.setValue('partnerId', null)
                              form.setValue('partnerCustomerData', null)
                            }}
                            className={cn(
                              "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-center gap-2",
                              form.watch('contractType') !== 'dual'
                                ? "bg-stone-900 border-stone-900 text-white shadow-lg"
                                : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                            )}
                          >
                            👤 單人合約
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              form.setValue('contractType', 'dual')
                              form.setValue('partnerMode', 'existing')
                            }}
                            className={cn(
                              "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-center gap-2",
                              form.watch('contractType') === 'dual'
                                ? "bg-purple-600 border-purple-600 text-white shadow-lg"
                                : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                            )}
                          >
                            👥 雙人共享合約
                          </button>
                        </div>
                      </div>

                      {form.watch('contractType') === 'dual' && (
                        <div className="p-5 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <Label className="text-purple-950 font-bold block text-xs">👥 共享學員綁定方式 *</Label>
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
                                form.setValue('sharedWithCustomerId', null)
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
                                value={form.watch('sharedWithCustomerId') || ''}
                                onChange={(e) => {
                                  const val = e.target.value || null
                                  form.setValue('sharedWithCustomerId', val)
                                  form.setValue('partnerId', val)
                                }}
                                className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                              >
                                <option value="">-- 請選擇學員 --</option>
                                {customers.filter(c => c.id !== customer.id).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ({c.phone})
                                  </option>
                                ))}
                              </select>
                              {form.watch('sharedWithCustomerId') && (
                                <p className="text-[10px] text-purple-500 font-bold">
                                  提示：此續約將會由當前學員與 {customers.find(c => c.id === form.watch('sharedWithCustomerId'))?.name} 共同持有一份合約。
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
                      <div className="space-y-4 border-t border-stone-100 pt-6">
                        <div className="space-y-1">
                          <Label className="text-stone-700 font-bold block text-xs">分配課程教練 *</Label>
                          <p className="text-[10px] text-stone-400">設定指導本合約學員的教練分配</p>
                        </div>

                        {watchedValues.contractType === 'single' ? (
                          <div className="space-y-2 max-w-md">
                            <Label className="text-xs text-stone-500 font-medium">授課教練</Label>
                            <select
                              value={form.watch('trainerId') || ''}
                              onChange={(e) => {
                                form.setValue('trainerId', e.target.value)
                                form.setValue('secondaryTrainerId', null)
                              }}
                              className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                            >
                              <option value="">-- 請選擇教練 --</option>
                              {trainers.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            {form.formState.errors.trainerId && (
                              <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.trainerId.message}</p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4 bg-stone-50 p-4.5 rounded-2xl border border-stone-200/50">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="isOneToTwo"
                                checked={isOneToTwo}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  setIsOneToTwo(checked)
                                  if (checked) {
                                    form.setValue('secondaryTrainerId', form.getValues('trainerId'))
                                  } else {
                                    form.setValue('secondaryTrainerId', trainers[0]?.id || '')
                                  }
                                }}
                                className="rounded text-stone-900 focus:ring-stone-500 w-4 h-4"
                              />
                              <label htmlFor="isOneToTwo" className="text-xs font-bold text-stone-700 select-none cursor-pointer">
                                👥 1對2 同時間上課（共用同一位教練）
                              </label>
                            </div>

                            {isOneToTwo ? (
                              <div className="space-y-2 max-w-md pt-1">
                                <Label className="text-xs text-stone-500 font-medium">共享授課教練</Label>
                                <select
                                  value={form.watch('trainerId') || ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    form.setValue('trainerId', val)
                                    form.setValue('secondaryTrainerId', val)
                                  }}
                                  className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                                >
                                  <option value="">-- 請選擇教練 --</option>
                                  {trainers.map((t) => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                  ))}
                                </select>
                                {form.formState.errors.trainerId && (
                                  <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.trainerId.message}</p>
                                )}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-4 pt-1">
                                <div className="space-y-2">
                                  <Label className="text-xs text-stone-500 font-medium">
                                    學員 A ({customer?.name || '主學員'}) 的教練
                                  </Label>
                                  <select
                                    value={form.watch('trainerId') || ''}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      form.setValue('trainerId', val)
                                    }}
                                    className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                                  >
                                    <option value="">-- 請選擇教練 --</option>
                                    {trainers.map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                  {form.formState.errors.trainerId && (
                                    <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.trainerId.message}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-xs text-stone-500 font-medium">
                                    學員 B ({watchedValues.partnerMode === 'existing' ? (customers.find(c => c.id === watchedValues.partnerId)?.name || '共享學員') : (watchedValues.partnerCustomerData?.name || '共享學員')}) 的教練
                                  </Label>
                                  <select
                                    value={form.watch('secondaryTrainerId') || ''}
                                    onChange={(e) => form.setValue('secondaryTrainerId', e.target.value)}
                                    className="w-full h-10 rounded-xl border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/20"
                                  >
                                    <option value="">-- 請選擇教練 --</option>
                                    {trainers.map((t) => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                  {form.formState.errors.secondaryTrainerId && (
                                    <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.secondaryTrainerId.message}</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label>合約總堂數 *</Label>
                          <Input type="number" {...form.register('totalSessions')} onChange={handleSessionsChange} />
                        </div>
                        <div className="space-y-2">
                          <Label>合約總金額 (Total Lesson Fee) *</Label>
                          <Input type="number" {...form.register('totalAmount')} onChange={handleTotalAmountChange} />
                        </div>
                        <div className="space-y-2">
                          <Label>合約開始日 *</Label>
                          <Input type="date" {...form.register('startDate', { valueAsDate: true })} />
                          {form.formState.errors.startDate && (
                            <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.startDate.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>合約結束日 *</Label>
                          <Input type="date" {...form.register('endDate', { valueAsDate: true })} />
                          {form.formState.errors.endDate && (
                            <p className="text-red-500 text-[10px] font-medium">{form.formState.errors.endDate.message}</p>
                          )}
                        </div>
                      </div>

                      {/* 付款方式與分期設定 */}
                      <div className="space-y-4 border-t border-stone-100 pt-6">
                        <div className="space-y-2">
                          <Label className="text-stone-700 font-bold block text-xs">付款狀態 / 方式 *</Label>
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('paymentType', 'single');
                                syncInstallments('single', 2, form.getValues('totalAmount') || 0, form.getValues('startDate') || new Date());
                              }}
                              className={cn(
                                "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-center gap-2",
                                form.watch('paymentType') !== 'installments'
                                  ? "bg-stone-900 border-stone-900 text-white shadow-lg"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                              )}
                            >
                              💵 一次付清 (直接付清)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                form.setValue('paymentType', 'installments');
                                syncInstallments('installments', form.getValues('installmentCount') || 2, form.getValues('totalAmount') || 0, form.getValues('startDate') || new Date());
                              }}
                              className={cn(
                                "flex-1 py-2.5 px-4 rounded-xl border-2 font-bold text-xs transition-all flex items-center justify-center gap-2",
                                form.watch('paymentType') === 'installments'
                                  ? "bg-brand-500 border-brand-500 text-white shadow-lg"
                                  : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                              )}
                            >
                              💳 分期付款 (二到十六期)
                            </button>
                          </div>
                        </div>

                        {form.watch('paymentType') === 'installments' && (
                          <div className="p-5 bg-stone-50 border border-stone-100 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex justify-between items-center">
                              <Label className="text-stone-700 font-bold block text-xs">選擇分期期數 *</Label>
                              <select
                                value={form.watch('installmentCount') || 2}
                                onChange={(e) => {
                                  const count = Number(e.target.value);
                                  form.setValue('installmentCount', count);
                                  syncInstallments('installments', count, form.getValues('totalAmount') || 0, form.getValues('startDate') || new Date());
                                }}
                                className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold focus:outline-none"
                              >
                                {Array.from({ length: 15 }, (_, i) => i + 2).map(num => (
                                  <option key={num} value={num}>{num} 期</option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-3">
                              {form.watch('installments')?.map((inst, idx) => {
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
                                          const updated = [...(form.getValues('installments') || [])];
                                          updated[idx] = { ...updated[idx], amount: val };
                                          form.setValue('installments', updated);
                                          
                                          // Update contract paidAmount: sum of all installments with status === 'paid'
                                          const paidSum = updated.reduce((sum, item) => item.status === 'paid' ? sum + item.amount : sum, 0);
                                          form.setValue('paidAmount', paidSum);
                                        }}
                                        className="h-8 text-xs font-bold"
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
                                          const updated = [...(form.getValues('installments') || [])];
                                          updated[idx] = { ...updated[idx], dueDate: dateVal };
                                          form.setValue('installments', updated);
                                        }}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* 防呆錯誤提示資訊 */}
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

                      <div className="bg-brand-50 p-6 rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-bold text-brand-600 uppercase">單堂平均價格</p>
                          <p className="text-2xl font-black text-brand-950">
                            NT$ {(form.watch('pricePerSession') || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                          </p>
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

                  {activeSteps[currentStep]?.id === 'signature' && (
                    <div className="space-y-6">
                      <h2 className="text-2xl font-bold text-stone-900">簽署確認</h2>
                      <div className="space-y-4">
                        {/* Contract Terms Box */}
                        <div className="space-y-2">
                          <Label className="text-stone-700 font-bold text-sm">合約預覽與條款</Label>
                          {(() => {
                            const isDual = form.watch('contractType') === 'dual'
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

                            const coachA = trainers.find(t => t.id === form.watch('trainerId'))?.name || '未指定'
                            const coachB = trainers.find(t => t.id === form.watch('secondaryTrainerId'))?.name
                            const coachNames = isDual
                              ? (coachB && coachB !== coachA ? `學員 A: ${coachA} / 學員 B: ${coachB}` : `${coachA} (同教練)`)
                              : coachA

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
                                <div className="bg-white text-stone-900 border border-stone-150 rounded-2xl p-6 space-y-5 font-serif leading-relaxed text-xs shadow-sm">
                                  {/* Header */}
                                  <div className="text-center space-y-1.5 border-b-2 border-stone-800 pb-3">
                                    <h1 className="text-base font-black text-stone-900 tracking-tight">{brandName} 健身教練課程契約書</h1>
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
                                    <h4 className="font-bold text-stone-900 text-center text-sm underline decoration-brand-500 underline-offset-4">{brandName} 健身教練服務定型化契約條款</h4>
                                    
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
                          <label htmlFor="agree-renewal" className="text-sm font-medium text-stone-700 cursor-pointer">同意並簽署上述「{brandName} 健身教練課程契約書」</label>
                        </div>

                        <div className={cn(
                          "grid gap-6 transition-all duration-500",
                          form.watch('contractType') === 'dual' ? "grid-cols-2" : "grid-cols-1",
                          !form.watch('isAgreed') && "opacity-30 pointer-events-none grayscale"
                        )}>
                          {/* Signature A */}
                          <div className="relative">
                            <Label className="font-bold text-stone-700 block mb-2">
                              {form.watch('contractType') === 'dual' ? '甲方學員 A 簽名 *' : '學員數位簽名 *'}
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
                              <Label className="font-bold text-purple-950 block mb-2">甲方學員 B 簽名 *</Label>
                              <div className="border-2 border-dashed border-purple-200 rounded-3xl bg-white p-2 relative h-48">
                                <SignatureCanvas
                                  ref={secondarySigCanvas}
                                  onEnd={() => form.setValue('secondarySignatureDataUrl', 'signed')}
                                  canvasProps={{ className: 'w-full h-full cursor-crosshair' }}
                                />
                                <Button variant="ghost" size="sm" className="absolute top-4 right-4 text-purple-400" onClick={() => {
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

            <div className="p-8 border-t border-stone-100 flex justify-between bg-white/80 backdrop-blur-md">
              <Button variant="ghost" onClick={handlePrev} disabled={currentStep === 0} className={cn(currentStep === 0 && "opacity-0")}>上一步</Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                {currentStep < activeSteps.length - 1 ? (
                  <Button onClick={handleNext} disabled={!stepStatus[currentStep]} className="bg-stone-950">下一步</Button>
                ) : (
                  <Button onClick={() => handleFinalSubmit(form.getValues())} disabled={loading || !stepStatus[currentStep]} className="bg-brand-500">
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
