import { useState, useRef, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
// Handle default export mismatch in some build environments (Vite/ESM)
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, ChevronLeft, User, FileText, Activity, ShieldCheck } from 'lucide-react'
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
  { id: 'contract', title: '合約設定', icon: FileText, fields: ['contract.totalSessions', 'contract.pricePerSession', 'contract.startDate', 'contract.endDate'] },
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
      totalSessions: 0,
      remainingSessions: 0,
      pricePerSession: 0,
      totalAmount: 0,
      paidAmount: 0,
      installments: [],
      startDate: new Date(),
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      status: 'active' as const,
      signatureDataUrl: null,
      secondarySignatureDataUrl: null,
      contractType: 'single' as const,
      isAgreed: false,
    },
  }), [])

  const form = useForm<CombinedCustomerContractValues>({
    resolver: zodResolver(combinedCustomerContractSchema),
    mode: 'onChange',
    defaultValues: defaultValues as any,
  })

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
          } : undefined
        }
        form.reset(formattedData as any)
      } else {
        form.reset(defaultValues as any)
      }
      setCurrentStep(0)
    }
  }, [open, initialData, form])

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

  const stepStatus = useMemo(() => {
    return activeSteps.map((step) => {
      if (step.id === 'signature') {
        const isDual = watchedValues.contract?.contractType === 'dual' || watchedValues.partnerMode !== 'none'
        if (isDual) {
          return !!watchedValues.contract?.signatureDataUrl && !!watchedValues.contract?.secondarySignatureDataUrl
        }
        return !!watchedValues.contract?.signatureDataUrl
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
    const price = form.getValues('contract.pricePerSession') || 0
    form.setValue('contract.totalSessions', sessions)
    form.setValue('contract.remainingSessions', sessions)
    form.setValue('contract.totalAmount', sessions * price)
  }

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = Number(e.target.value)
    const sessions = form.getValues('contract.totalSessions') || 0
    form.setValue('contract.pricePerSession', price)
    form.setValue('contract.totalAmount', sessions * price)
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

                        <div className="space-y-2">
                          <Label className="text-stone-700">合約總堂數 *</Label>
                          <Input type="number" {...form.register('contract.totalSessions')} onChange={handleSessionsChange} className="bg-stone-50 border-stone-200" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">單堂價格 *</Label>
                          <Input type="number" {...form.register('contract.pricePerSession')} onChange={handlePriceChange} className="bg-stone-50 border-stone-200" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">已付金額</Label>
                          <Input type="number" {...form.register('contract.paidAmount')} className="bg-stone-50 border-stone-200" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">合約開始日 *</Label>
                          <Input type="date" {...form.register('contract.startDate', { valueAsDate: true })} className="bg-stone-50 border-stone-200" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-stone-700">合約結束日 *</Label>
                          <Input type="date" {...form.register('contract.endDate', { valueAsDate: true })} className="bg-stone-50 border-stone-200" />
                        </div>
                      </div>
                      
                      <div className="mt-6 p-6 bg-brand-50 rounded-2xl border border-brand-100 flex items-center justify-between">
                        <div>
                          <Label className="text-brand-600 text-xs font-bold uppercase mb-1">合約總金額</Label>
                          <div className="text-2xl font-black text-brand-950">NT$ {form.watch('contract.totalAmount')?.toLocaleString()}</div>
                        </div>
                        <div className="text-right text-stone-400 text-xs">
                          根據堂數與單價自動計算
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
                          <Label className="text-stone-700 font-bold text-sm">合約條款</Label>
                          <div className="h-48 overflow-y-auto rounded-2xl border border-stone-200 bg-stone-50 p-6 text-xs text-stone-600 leading-relaxed space-y-4 font-serif">
                            <h4 className="font-bold text-stone-900 text-center text-sm underline decoration-brand-500 underline-offset-4">R27 Fitness 健身教練服務定型化化契約條款</h4>
                            
                            <section className="space-y-1 bg-white p-4 rounded-xl border border-stone-100 shadow-sm">
                              <p className="font-bold text-stone-800">R27健身站（簡稱乙方）：</p>
                              <p>公司名稱：紅二七健身有限公司 (R27 Fitness Station)</p>
                              <p>負責人：郭沛霖 | 電話：0905396658</p>
                              <p>履約地址：新北市淡水區中正東路二段68號</p>
                              <p>公共意外責任險：已投保（效期：114/11/21-115/11/21）</p>
                            </section>

                            <div className="space-y-4 px-2">
                              <p><span className="font-bold text-stone-900">第一條（服務內容與異動通知）</span><br/>1. 乙方應依約定提供健身指導服務。2. 乙方所提供服務內容與時間如有異動，應於 24小時前 通知甲方。3. 通知方式：依甲方留存之電話、LINE 或電子郵件通知。4. 若乙方未依約定時間通知，甲方得請求於 7 日內提供同意之補課方案。</p>
                              
                              <p><span className="font-bold text-stone-900">第二條（預約與請假規則）</span><br/>1. 預約制：需事先預約。2. 請假時限：應於課程開始前 24 小時 通知乙方。3. 未依約請假：乙方未依前項約定時間方式通知，在限期3日內提供甲方同意之補課方案。</p>
                              
                              <p><span className="font-bold text-stone-900">第三條（課程暫停/請假機制）</span><br/>甲方若有下列事由（出國逾一個月、傷病、懷孕育嬰、服兵役、職務異動遷居等），提出證明後，乙方應於七個工作日內辦理暫停。註：因傷病暫停超過六個月經醫師證明不能運動者，致需終止契約，甲方得依規定辦理退費，乙方不收取手續費。</p>
                              
                              <p><span className="font-bold text-stone-900">第四條（退費規定與計算公式）</span><br/>1. 購買後七日內（未上課）：全額退還。2. 購買後七日以上（或已上課）：退費金額 ＝ 實繳總金額 － （已使用堂數 × 每堂價）。每堂單價定義：契約總金額 ÷（購買堂數 ＋ 贈送堂數）。3. 手續費（違約金）：應退金額 × 20%（最高以新臺幣 9,000 元為上限）。</p>
                              
                              <p><span className="font-bold text-stone-900">第五條（不可歸責於消費者之終止與效果）</span><br/>若因指定教練離職、乙方變更履約地點、暫停營業等事由終止契約，乙方應按比例退費，且不得收取手續費或違約金。</p>
                              
                              <p><span className="font-bold text-stone-900">第六條（不可歸責雙方事由之終止與效果）</span><br/>因天災、戰亂等不可抗力事由致難以完成契約時，任何一方得終止，乙方應依未服務之堂數退還餘額，不收手續費。</p>
                              
                              <p><span className="font-bold text-stone-900">第九條（終止契約之通知及退款方式）</span><br/>甲方得以書面或LINE/電子郵件通知終止。乙方應於通知後 15 個工作日內退款。</p>
                              
                              <p><span className="font-bold text-stone-900">第十二條（爭議處理與管轄法院）</span><br/>本契約涉訟時，雙方同意以臺灣士林地方法院為第一審管轄法院。</p>
                            </div>
                          </div>
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
                            我已閱讀並同意上述「健身教練服務定型化契約條款」
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
