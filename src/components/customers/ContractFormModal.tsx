import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, ChevronLeft, FileText, ShieldCheck, User, Activity } from 'lucide-react'
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
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const sigCanvas = useRef<SignatureCanvas>(null)
  const secondarySigCanvas = useRef<SignatureCanvas>(null)

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      customerId: customer?.id || '',
      sharedWithCustomerId: null,
      totalSessions: 0,
      remainingSessions: 0,
      pricePerSession: 0,
      totalAmount: 0,
      paidAmount: 0,
      installments: [],
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
    },
  })

  useEffect(() => {
    if (open && customer) {
      form.reset({
        customerId: customer.id,
        sharedWithCustomerId: null,
        totalSessions: 0,
        remainingSessions: 0,
        pricePerSession: 0,
        totalAmount: 0,
        paidAmount: 0,
        installments: [],
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
      })
      setCurrentStep(0)

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
  }, [open, customer, form])

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

  const stepStatus = useMemo(() => {
    return activeSteps.map((step) => {
      if (step.id === 'contract') {
        return watchedValues.totalSessions > 0 &&
               watchedValues.pricePerSession > 0 &&
               !!watchedValues.startDate &&
               !!watchedValues.endDate &&
               (watchedValues.contractType !== 'dual' || watchedValues.partnerMode !== 'none') &&
               (watchedValues.partnerMode !== 'existing' || !!watchedValues.sharedWithCustomerId)
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
                        </div>
                        <div className="space-y-2">
                          <Label>合約結束日 *</Label>
                          <Input type="date" {...form.register('endDate', { valueAsDate: true })} />
                        </div>
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
                        <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex items-center gap-3">
                          <input 
                            type="checkbox" 
                            id="agree-renewal"
                            checked={form.watch('isAgreed')}
                            onChange={e => form.setValue('isAgreed', e.target.checked)}
                            className="w-5 h-5 rounded accent-brand-500"
                          />
                          <label htmlFor="agree-renewal" className="text-sm font-medium text-stone-700">同意 R27 Fitness 健身教練服務契約條款</label>
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
