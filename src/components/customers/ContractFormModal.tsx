import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import SignatureCanvasComponent from 'react-signature-canvas'
const SignatureCanvas: any = (SignatureCanvasComponent as any).default || SignatureCanvasComponent
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, ChevronLeft, FileText, ShieldCheck, User } from 'lucide-react'
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
  { id: 'contract', title: '合約設定', icon: FileText, fields: ['totalSessions', 'pricePerSession', 'startDate', 'endDate'] },
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

  const stepStatus = [
    watchedValues.totalSessions > 0 &&
    watchedValues.pricePerSession > 0 &&
    !!watchedValues.startDate &&
    !!watchedValues.endDate &&
    (watchedValues.contractType !== 'dual' || !!watchedValues.sharedWithCustomerId),
    
    !!watchedValues.signatureDataUrl &&
    (watchedValues.contractType !== 'dual' || !!watchedValues.secondarySignatureDataUrl) &&
    watchedValues.isAgreed
  ]

  const handleNext = async () => {
    const fieldsToValidate = STEPS[currentStep].fields as any[]
    const isValid = await form.trigger(fieldsToValidate)
    if (isValid && currentStep < STEPS.length - 1) setCurrentStep(prev => prev + 1)
  }

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1)
  }

  const handleSessionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sessions = Number(e.target.value)
    const price = form.getValues('pricePerSession') || 0
    form.setValue('totalSessions', sessions)
    form.setValue('remainingSessions', sessions)
    form.setValue('totalAmount', sessions * price)
  }

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const price = Number(e.target.value)
    const sessions = form.getValues('totalSessions') || 0
    form.setValue('pricePerSession', price)
    form.setValue('totalAmount', sessions * price)
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
        <div className="flex h-[75vh] min-h-[550px]">
          {/* Sidebar */}
          <div className="w-64 bg-stone-50 border-r border-stone-200 p-8 flex flex-col">
            <div className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold">
                  {customer.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-stone-900 font-bold text-sm">合約續約</h3>
                  <p className="text-stone-500 text-[10px]">{customer.name}</p>
                </div>
              </div>
            </div>

            <nav className="space-y-4">
              {STEPS.map((step, idx) => {
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

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {currentStep === 0 && (
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
                        <div className="p-5 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <Label className="text-purple-950 font-bold block text-xs">選擇共享學員 *</Label>
                          <select
                            value={form.watch('sharedWithCustomerId') || ''}
                            onChange={(e) => form.setValue('sharedWithCustomerId', e.target.value || null)}
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

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label>合約總堂數 *</Label>
                          <Input type="number" {...form.register('totalSessions')} onChange={handleSessionsChange} />
                        </div>
                        <div className="space-y-2">
                          <Label>單堂價格 *</Label>
                          <Input type="number" {...form.register('pricePerSession')} onChange={handlePriceChange} />
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
                          <p className="text-[10px] font-bold text-brand-600 uppercase">預估總金額</p>
                          <p className="text-2xl font-black text-brand-950">NT$ {form.watch('totalAmount').toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentStep === 1 && (
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
                {currentStep < STEPS.length - 1 ? (
                  <Button onClick={handleNext} disabled={!stepStatus[0]} className="bg-stone-950">下一步</Button>
                ) : (
                  <Button onClick={() => handleFinalSubmit(form.getValues())} disabled={loading || !stepStatus[1]} className="bg-brand-500">
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
