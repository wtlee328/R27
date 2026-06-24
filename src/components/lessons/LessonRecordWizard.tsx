import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { lessonRecordFormSchema, type LessonRecordFormValues } from '../../lib/validators'
import { useCustomers } from '../../hooks/useCustomers'
import { useContracts } from '../../hooks/useContracts'
import { useTrainers } from '../../hooks/useTrainers'
import type { LessonRecord } from '../../types'

import { cn } from '@/lib/utils'

interface LessonRecordWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: LessonRecordFormValues) => Promise<void>
  initialData?: LessonRecord | null
  trainerId?: string
}

export function LessonRecordWizard({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  trainerId,
}: LessonRecordWizardProps) {
  const [loading, setLoading] = useState(false)
  const { customers } = useCustomers()
  const { trainers } = useTrainers()

  // Show all accessible customers — the Firestore layer already scopes by role.
  // Don't filter by trainerId here: substitute trainers need to see other trainers' students.
  const filteredCustomers = customers

  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const matchingCustomers = filteredCustomers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').includes(searchTerm)
  )

  // Prioritize trainer's own customers at the top of the list, label other trainers' customers as substitute ("代課")
  const orderedMatchingCustomers = React.useMemo(() => {
    if (!trainerId) {
      return matchingCustomers.map(c => ({ ...c, isSubstitute: false }))
    }
    const own = matchingCustomers
      .filter(c => c.trainerId === trainerId)
      .map(c => ({ ...c, isSubstitute: false }))
    const others = matchingCustomers
      .filter(c => c.trainerId !== trainerId)
      .map(c => ({ ...c, isSubstitute: true }))
    return [...own, ...others]
  }, [matchingCustomers, trainerId])
  
  const form = useForm<LessonRecordFormValues>({
    resolver: zodResolver(lessonRecordFormSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      contractId: '',
      trainerId: trainerId || '',
      sessionDate: new Date(),
      sessionAmount: 1,
      notes: '',
      attendingCustomerIds: [],
    },
  })

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      form.reset({
        customerId: initialData.customerId,
        customerName: initialData.customerName,
        contractId: initialData.contractId,
        trainerId: initialData.trainerId || trainerId || '',
        sessionDate: initialData.sessionDate.toDate(),
        sessionAmount: initialData.sessionAmount,
        notes: initialData.notes || '',
        attendingCustomerIds: initialData.attendingCustomerIds || [initialData.customerId],
      })
      setSearchTerm(initialData.customerName || '')
    } else {
      form.reset({
        customerId: '',
        customerName: '',
        contractId: '',
        trainerId: trainerId || '',
        sessionDate: new Date(),
        sessionAmount: 1,
        notes: '',
        attendingCustomerIds: [],
      })
      setSearchTerm('')
    }
  }, [initialData, form, trainerId])

  const selectedCustomerId = form.watch('customerId')
  const { contracts } = useContracts(selectedCustomerId)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        const selectedCust = customers.find(c => c.id === selectedCustomerId)
        setSearchTerm(selectedCust ? selectedCust.name : '')
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [selectedCustomerId, customers])
  const selectedContractId = form.watch('contractId')
  const selectedContract = contracts.find(c => c.id === selectedContractId)

  // Pre-select contract trainer when a contract is selected (only for new records)
  useEffect(() => {
    if (!initialData && selectedContract) {
      if (trainerId) {
        form.setValue('trainerId', trainerId)
      } else {
        form.setValue('trainerId', selectedContract.trainerId || '')
      }
    }
  }, [selectedContract, initialData, form, trainerId])

  const partnerId = selectedContract?.customerIds && selectedContract.customerIds.length > 1
    ? selectedContract.customerIds.find(id => id !== selectedCustomerId)
    : selectedContract?.sharedWithCustomerId
  const partner = partnerId ? customers.find(c => c.id === partnerId) : null

  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value
    const cust = customers.find((c) => c.id === custId)
    form.setValue('customerId', custId)
    form.setValue('customerName', cust?.name || '')
    form.setValue('contractId', '') // reset contract
    form.setValue('attendingCustomerIds', [custId])
  }

  const handleSubmit = async (data: LessonRecordFormValues) => {
    // If it's a dual contract, make sure attendingCustomerIds has at least one item
    if (selectedContract && (selectedContract.contractType === 'dual' || !!selectedContract.sharedWithCustomerId)) {
      const attendees = data.attendingCustomerIds || []
      if (attendees.length === 0) {
        form.setError('attendingCustomerIds', { type: 'manual', message: '請至少選擇一位上課學員' })
        return
      }
    } else {
      data.attendingCustomerIds = [data.customerId]
    }

    setLoading(true)
    try {
      await onSubmit(data)
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? '編輯銷課紀錄' : '新增銷課紀錄'}</DialogTitle>
          <DialogDescription>請選擇客戶、合約，並輸入銷課堂數。</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2 relative" ref={containerRef}>
            <Label>客戶 *</Label>
            <div className="relative">
              <Input
                type="text"
                placeholder="請輸入客戶名稱或電話搜尋..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setIsOpen(true)
                  if (!e.target.value) {
                    form.setValue('customerId', '')
                    form.setValue('customerName', '')
                    form.setValue('contractId', '')
                    form.setValue('attendingCustomerIds', [])
                  }
                }}
                onFocus={() => setIsOpen(true)}
                className="w-full text-sm pr-12 animate-in fade-in duration-300"
              />
              {selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('')
                    form.setValue('customerId', '')
                    form.setValue('customerName', '')
                    form.setValue('contractId', '')
                    form.setValue('attendingCustomerIds', [])
                    setIsOpen(true)
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-bold"
                >
                  清除
                </button>
              )}
            </div>

            {isOpen && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-stone-100 animate-in fade-in duration-200">
                {orderedMatchingCustomers.length === 0 ? (
                  <div className="p-3 text-xs text-stone-500 text-center">
                    找不到符合的客戶
                  </div>
                ) : (
                  orderedMatchingCustomers.map((c) => {
                    const isSelected = c.id === selectedCustomerId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          form.setValue('customerId', c.id)
                          form.setValue('customerName', c.name)
                          form.setValue('contractId', '') // reset contract
                          form.setValue('attendingCustomerIds', [c.id])
                          setSearchTerm(c.name)
                          setIsOpen(false)
                        }}
                        className={cn(
                          "w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-stone-50 flex flex-col gap-0.5",
                          isSelected ? "bg-brand-50 hover:bg-brand-100" : ""
                        )}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-stone-900">
                            {c.name}
                            {c.isSubstitute && (
                              <span className="ml-2 text-[9px] font-extrabold text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded">
                                代課
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="text-stone-500 text-[10px]">{c.phone || '無電話資訊'}</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
            {form.formState.errors.customerId && (
              <p className="text-red-500 text-xs">{form.formState.errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>合約 *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              {...form.register('contractId', {
                onChange: (e) => {
                  const conId = e.target.value
                  const con = contracts.find(c => c.id === conId)
                  if (con && (con.contractType === 'dual' || !!con.sharedWithCustomerId)) {
                    const pId = con.customerIds && con.customerIds.length > 1
                      ? con.customerIds.find(id => id !== selectedCustomerId)
                      : con.sharedWithCustomerId
                    form.setValue('attendingCustomerIds', [selectedCustomerId, pId].filter((id): id is string => !!id))
                  } else {
                    form.setValue('attendingCustomerIds', [selectedCustomerId])
                  }
                }
              })}
              disabled={!selectedCustomerId}
            >
              <option value="" disabled>請選擇合約</option>
              {contracts.length === 0 && selectedCustomerId && (
                 <option value="temp_contract_01">預設合約 (開發中佔位)</option>
              )}
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c as any).contractNo || c.id.substring(0, 8)} (剩餘: {c.remainingSessions} 堂)
                </option>
              ))}
            </select>
            {form.formState.errors.contractId && (
              <p className="text-red-500 text-xs">{form.formState.errors.contractId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>授課教練 *</Label>
            {trainerId ? (
              <>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-stone-50 text-stone-550 border-stone-200 cursor-not-allowed select-none"
                  value={trainerId}
                  disabled
                >
                  {trainers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input type="hidden" {...form.register('trainerId')} value={trainerId} />
              </>
            ) : (
              <select
                className="w-full border rounded-md px-3 py-2 text-sm animate-in fade-in duration-300"
                {...form.register('trainerId')}
                disabled={!selectedCustomerId}
              >
                <option value="" disabled>請選擇授課教練</option>
                {trainers.map((t) => {
                  const isContractTrainer = selectedContract && (
                    selectedContract.trainerId === t.id ||
                    (selectedContract as any).secondaryTrainerId === t.id
                  )
                  const isSubstitute = selectedContract && !isContractTrainer
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} {isSubstitute ? ' (代課教練)' : ' (合約教練)'}
                    </option>
                  )
                })}
              </select>
            )}
            {form.formState.errors.trainerId && (
              <p className="text-red-500 text-xs">{form.formState.errors.trainerId.message}</p>
            )}
          </div>

          {selectedContract && (selectedContract.contractType === 'dual' || !!selectedContract.sharedWithCustomerId) && (
            <div className="space-y-2 p-4 bg-purple-50/50 border border-purple-100 rounded-xl animate-in fade-in duration-300">
              <Label className="text-purple-950 font-bold block text-xs">👥 雙人合約上課學員 (可多選) *</Label>
              <div className="flex gap-4">
                <label className={cn(
                  "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                  (form.watch('attendingCustomerIds') || []).includes(selectedCustomerId)
                    ? "bg-purple-600 border-purple-600 text-white"
                    : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                )}>
                  <input
                    type="checkbox"
                    checked={(form.watch('attendingCustomerIds') || []).includes(selectedCustomerId)}
                    className="hidden"
                    onChange={(e) => {
                      const current = form.getValues('attendingCustomerIds') || []
                      if (e.target.checked) {
                        form.setValue('attendingCustomerIds', [...current, selectedCustomerId])
                      } else {
                        form.setValue('attendingCustomerIds', current.filter(id => id !== selectedCustomerId))
                      }
                    }}
                  />
                  👤 {customers.find(c => c.id === selectedCustomerId)?.name || '學員 A'}
                </label>

                {partner && (
                  <label className={cn(
                    "flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer",
                    (form.watch('attendingCustomerIds') || []).includes(partner.id)
                      ? "bg-purple-600 border-purple-600 text-white"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                  )}>
                    <input
                      type="checkbox"
                      checked={(form.watch('attendingCustomerIds') || []).includes(partner.id)}
                      className="hidden"
                      onChange={(e) => {
                        const current = form.getValues('attendingCustomerIds') || []
                        if (e.target.checked) {
                          form.setValue('attendingCustomerIds', [...current, partner.id])
                        } else {
                          form.setValue('attendingCustomerIds', current.filter(id => id !== partner.id))
                        }
                      }}
                    />
                    👤 {partner.name || '學員 B'}
                  </label>
                )}
              </div>
              {form.formState.errors.attendingCustomerIds && (
                <p className="text-red-500 text-xs">{form.formState.errors.attendingCustomerIds.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>上課日期 *</Label>
              <Input type="date" {...form.register('sessionDate', { valueAsDate: true })} />
            </div>
            <div className="space-y-2">
              <Label>消耗堂數 *</Label>
              <Input type="number" step="0.5" {...form.register('sessionAmount')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>備註</Label>
            <Input {...form.register('notes')} placeholder="例如：上半身訓練、深蹲進步..." />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '儲存中...' : '確認銷課'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
