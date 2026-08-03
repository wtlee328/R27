import { useState, useEffect, useRef, useMemo } from 'react'
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
import { useAuthStore } from '@/stores/authStore'
import { useTrainerProfileStore } from '@/stores/trainerProfileStore'
import type { LessonRecord } from '../../types'
import {
  RiUserLine,
  RiUserSearchLine,
  RiFileTextLine,
  RiUserStarLine,
  RiTeamLine,
  RiCalendarLine,
  RiTimeLine,
  RiStickyNoteLine,
  RiCheckLine,
  RiCloseLine,
  RiLoader4Line,
  RiPhoneLine,
  RiContractLine,
  RiRefreshLine,
  RiAlertLine,
} from '@remixicon/react'
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

  const { user } = useAuthStore()
  const { selectedTrainerId: activeTrainerId } = useTrainerProfileStore()
  const effectiveTrainerId = trainerId || activeTrainerId || (user?.role === 'trainer' ? user?.trainerId : null) || ''

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
  const orderedMatchingCustomers = useMemo(() => {
    if (!effectiveTrainerId) {
      return matchingCustomers.map(c => ({ ...c, isSubstitute: false }))
    }
    const own = matchingCustomers
      .filter(c => c.trainerId === effectiveTrainerId)
      .map(c => ({ ...c, isSubstitute: false }))
    const others = matchingCustomers
      .filter(c => c.trainerId !== effectiveTrainerId)
      .map(c => ({ ...c, isSubstitute: true }))
    return [...own, ...others]
  }, [matchingCustomers, effectiveTrainerId])

  const getTodayString = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const form = useForm<LessonRecordFormValues>({
    resolver: zodResolver(lessonRecordFormSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      contractId: '',
      trainerId: effectiveTrainerId,
      sessionDate: getTodayString() as any,
      sessionAmount: 1,
      notes: '',
      attendingCustomerIds: [],
    },
  })

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      const d = initialData.sessionDate ? initialData.sessionDate.toDate() : new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`

      form.reset({
        customerId: initialData.customerId,
        customerName: initialData.customerName,
        contractId: initialData.contractId,
        trainerId: initialData.trainerId || effectiveTrainerId,
        sessionDate: dateStr as any,
        sessionAmount: initialData.sessionAmount || 1,
        notes: initialData.notes || '',
        attendingCustomerIds: initialData.attendingCustomerIds || [initialData.customerId],
      })
      setSearchTerm(initialData.customerName || '')
    } else {
      form.reset({
        customerId: '',
        customerName: '',
        contractId: '',
        trainerId: effectiveTrainerId,
        sessionDate: getTodayString() as any,
        sessionAmount: 1,
        notes: '',
        attendingCustomerIds: [],
      })
      setSearchTerm('')
    }
  }, [initialData, form, effectiveTrainerId])

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
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [selectedCustomerId, customers])

  const selectedContractId = form.watch('contractId')
  const selectedContract = contracts.find(c => c.id === selectedContractId)

  // Per-student contract selection map for multi/group contracts
  const [studentContractSelections, setStudentContractSelections] = useState<Record<string, string>>({})

  // All customers associated with the primary selected contract
  const groupCustomers = useMemo(() => {
    if (!selectedContract) return []
    const ids = selectedContract.customerIds && selectedContract.customerIds.length > 0
      ? selectedContract.customerIds
      : [selectedCustomerId, selectedContract.sharedWithCustomerId, selectedContract.partnerId].filter((id): id is string => !!id)
    const uniqueIds = Array.from(new Set(ids))
    return uniqueIds.map(id => customers.find(c => c.id === id)).filter(Boolean) as typeof customers
  }, [selectedContract, selectedCustomerId, customers])

  // Automatically select initial attendees and FIFO contracts when primary contract changes
  useEffect(() => {
    if (selectedContract) {
      const isMulti = selectedContract.contractType === 'dual' || selectedContract.contractType === 'group' || (selectedContract.customerIds && selectedContract.customerIds.length > 1)
      if (isMulti && groupCustomers.length > 0) {
        // Default check all group members as attending
        const allMemberIds = groupCustomers.map(c => c.id)
        form.setValue('attendingCustomerIds', allMemberIds)

        // FIFO contract auto selection for each member
        const initialSelections: Record<string, string> = {}
        groupCustomers.forEach(m => {
          const memberContracts = contracts.filter(c => {
            const isInIds = Array.isArray(c.customerIds) && c.customerIds.includes(m.id)
            const isCust = c.customerId === m.id || c.primaryCustomerId === m.id || c.sharedWithCustomerId === m.id || c.partnerId === m.id
            if (!isInIds && !isCust) return false
            if (c.contractType === 'group' && c.groupMemberQuotas) {
              return (c.groupMemberQuotas[m.id]?.remainingSessions || 0) > 0
            }
            return c.remainingSessions > 0
          }).sort((a, b) => {
            const tA = a.createdAt?.seconds || 0
            const tB = b.createdAt?.seconds || 0
            return tA - tB // FIFO: oldest first
          })

          if (memberContracts.some(c => c.id === selectedContract.id)) {
            initialSelections[m.id] = selectedContract.id
          } else if (memberContracts.length > 0) {
            initialSelections[m.id] = memberContracts[0].id
          } else {
            initialSelections[m.id] = selectedContract.id
          }
        })
        setStudentContractSelections(initialSelections)
      } else {
        form.setValue('attendingCustomerIds', [selectedCustomerId])
        setStudentContractSelections({ [selectedCustomerId]: selectedContract.id })
      }
    }
  }, [selectedContract, groupCustomers, selectedCustomerId, contracts, form])

  const isDualContract = selectedContract?.contractType === 'dual'
  const isSharedContract = selectedContract?.contractType === 'shared'
  const isGroupContract = selectedContract?.contractType === 'group'

  const isMultiContract = Boolean(selectedContract && (
    isDualContract ||
    isGroupContract
  ))

  // Automatically select initial attendees and FIFO contracts when primary contract changes
  useEffect(() => {
    if (selectedContract) {
      if (isDualContract) {
        // Dual contract: Both students must attend together, fixed 1 session
        const allMemberIds = groupCustomers.map(c => c.id)
        form.setValue('attendingCustomerIds', allMemberIds)
        form.setValue('sessionAmount', 1)
        const initialSelections: Record<string, string> = {}
        allMemberIds.forEach(id => { initialSelections[id] = selectedContract.id })
        setStudentContractSelections(initialSelections)
      } else if (isSharedContract) {
        // Shared contract: Default select primary customer, 1 session
        form.setValue('attendingCustomerIds', [selectedCustomerId])
        form.setValue('sessionAmount', 1)
        const initialSelections: Record<string, string> = {}
        groupCustomers.forEach(m => { initialSelections[m.id] = selectedContract.id })
        setStudentContractSelections(initialSelections)
      } else if (isGroupContract && groupCustomers.length > 0) {
        // Group contract: Default check all members
        const allMemberIds = groupCustomers.map(c => c.id)
        form.setValue('attendingCustomerIds', allMemberIds)

        const initialSelections: Record<string, string> = {}
        groupCustomers.forEach(m => {
          const memberContracts = contracts.filter(c => {
            const isInIds = Array.isArray(c.customerIds) && c.customerIds.includes(m.id)
            const isCust = c.customerId === m.id || c.primaryCustomerId === m.id || c.sharedWithCustomerId === m.id || c.partnerId === m.id
            if (!isInIds && !isCust) return false
            if (c.contractType === 'group' && c.groupMemberQuotas) {
              return (c.groupMemberQuotas[m.id]?.remainingSessions || 0) > 0
            }
            return c.remainingSessions > 0
          }).sort((a, b) => {
            const tA = a.createdAt?.seconds || 0
            const tB = b.createdAt?.seconds || 0
            return tA - tB // FIFO
          })

          if (memberContracts.some(c => c.id === selectedContract.id)) {
            initialSelections[m.id] = selectedContract.id
          } else if (memberContracts.length > 0) {
            initialSelections[m.id] = memberContracts[0].id
          } else {
            initialSelections[m.id] = selectedContract.id
          }
        })
        setStudentContractSelections(initialSelections)
      } else {
        form.setValue('attendingCustomerIds', [selectedCustomerId])
        setStudentContractSelections({ [selectedCustomerId]: selectedContract.id })
      }
    }
  }, [selectedContract, groupCustomers, selectedCustomerId, contracts, form, isDualContract, isSharedContract, isGroupContract])

  const watchedCustomerId = form.watch('customerId')
  const watchedContractId = form.watch('contractId')
  const watchedTrainerId = form.watch('trainerId') || (trainerId || '')
  const watchedSessionDate = form.watch('sessionDate')
  const watchedSessionAmount = form.watch('sessionAmount')
  const watchedAttendingIds = form.watch('attendingCustomerIds') || []

  // Dynamically adjust sessionAmount based on contract type
  useEffect(() => {
    if (!initialData && selectedContract) {
      if (isDualContract) {
        form.setValue('sessionAmount', 1)
      } else if (isGroupContract && watchedAttendingIds.length > 0) {
        form.setValue('sessionAmount', watchedAttendingIds.length)
      }
    }
  }, [watchedAttendingIds.length, initialData, form, selectedContract, isDualContract, isGroupContract])

  // Pre-select contract trainer when a contract is selected (only for new records)
  useEffect(() => {
    if (!initialData && selectedContract) {
      if (effectiveTrainerId) {
        form.setValue('trainerId', effectiveTrainerId)
      } else {
        form.setValue('trainerId', selectedContract.trainerId || '')
      }
    }
  }, [selectedContract, initialData, form, effectiveTrainerId])

  // Validation & Safeguard Check (防呆機制)
  const validationError = useMemo(() => {
    // 1. Required fields check
    if (!watchedCustomerId) {
      return '請先選擇學員'
    }
    if (contracts.length === 0) {
      return '該學員無進行中合約，無法進行銷課'
    }
    if (!watchedContractId) {
      return '請選擇合約'
    }
    if (!watchedTrainerId) {
      return '請選擇授課教練'
    }
    if (!watchedSessionDate) {
      return '請選擇上課日期'
    }
    if (!isDualContract && (watchedSessionAmount === undefined || watchedSessionAmount === null || Number(watchedSessionAmount) < 1 || isNaN(Number(watchedSessionAmount)))) {
      return '消耗堂數必須至少為 1 堂'
    }

    // 2. Attendance vs sessionAmount rule check per contract type
    if (isDualContract) {
      if (watchedAttendingIds.length < 2) {
        return '雙人合約必須由 2 位學員同時出席'
      }
    } else if (isSharedContract) {
      if (watchedAttendingIds.length === 0) {
        return '共享合約請至少勾選一位實際出席學員'
      }
    } else if (isGroupContract) {
      if (watchedAttendingIds.length === 0) {
        return '團體合約請至少勾選一位實際出席學員'
      }
      if (Number(watchedSessionAmount) !== watchedAttendingIds.length) {
        return `銷課堂數 (${watchedSessionAmount} 堂) 與實際出席人數 (${watchedAttendingIds.length} 人) 不符`
      }
    }

    // 3. Quota sufficiency check for each attendee
    const targetCustomerIds = isMultiContract ? watchedAttendingIds : [watchedCustomerId]
    for (const custId of targetCustomerIds) {
      const chosenContractId = studentContractSelections[custId] || watchedContractId
      const con = contracts.find(c => c.id === chosenContractId)
      const custName = groupCustomers.find(c => c.id === custId)?.name || customers.find(c => c.id === custId)?.name || '學員'
      if (!con) {
        return `找不到學員 ${custName} 的扣抵合約`
      }
      if (con.contractType === 'group' && con.groupMemberQuotas && con.groupMemberQuotas[custId]) {
        const memberQuota = con.groupMemberQuotas[custId].remainingSessions || 0
        if (memberQuota < 1) {
          return `學員 ${custName} 的個人剩餘堂數不足 (現有 ${memberQuota} 堂)`
        }
      } else if (con.remainingSessions < (isDualContract ? 1 : Number(watchedSessionAmount || 1))) {
        return `合約 (剩餘 ${con.remainingSessions} 堂) 堂數不足`
      }
    }

    return null
  }, [
    watchedCustomerId,
    watchedContractId,
    watchedTrainerId,
    watchedSessionDate,
    watchedSessionAmount,
    watchedAttendingIds,
    isDualContract,
    isSharedContract,
    isGroupContract,
    isMultiContract,
    studentContractSelections,
    contracts,
    groupCustomers,
    customers,
  ])

  const isValid = validationError === null

  const handleSubmit = async (data: LessonRecordFormValues) => {
    if (validationError) {
      return
    }

    const isMulti = isMultiContract

    let attendees = data.attendingCustomerIds || []
    if (isMulti) {
      if (attendees.length === 0) {
        form.setError('attendingCustomerIds', { type: 'manual', message: '請至少選擇一位實際出席學員' })
        return
      }
    } else {
      attendees = [data.customerId]
      data.attendingCustomerIds = attendees
    }

    // Build per-student deductions
    const deductions = attendees.map(studentId => {
      const cust = customers.find(c => c.id === studentId)
      const chosenContractId = studentContractSelections[studentId] || data.contractId
      return {
        customerId: studentId,
        customerName: cust?.name || '',
        contractId: chosenContractId,
        sessionAmount: Number(data.sessionAmount) || 1,
      }
    })

    data.deductions = deductions

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
      <DialogContent className="max-w-md max-h-[90vh] p-0 flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 shadow-2xl bg-white">

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/15 to-orange-600/5 border border-orange-200/60 flex items-center justify-center shrink-0">
              <RiTimeLine className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <DialogTitle className="text-[15px] font-bold text-stone-900 leading-tight">
                {initialData ? '編輯銷課紀錄' : '新增銷課紀錄'}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-stone-400 mt-0.5 font-medium">
                {initialData ? '修改課程紀錄資訊' : '選擇學員、合約與上課資訊以完成銷課'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* ── 學員搜尋 ── */}
            <div className="space-y-1.5 relative" ref={containerRef}>
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                <RiUserSearchLine className="w-3.5 h-3.5" />
                學員
              </Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="輸入姓名或電話搜尋..."
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
                  className={cn(
                    'w-full text-sm pr-10 h-10 rounded-xl transition-all',
                    selectedCustomerId
                      ? 'border-orange-300 bg-orange-50/40 focus:border-orange-400 focus:ring-orange-200/50'
                      : 'border-stone-200 bg-stone-50 focus:bg-white'
                  )}
                />
                {selectedCustomerId ? (
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-stone-200/80 hover:bg-stone-300 text-stone-500 hover:text-stone-700 transition-all"
                  >
                    <RiCloseLine className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <RiUserLine className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 pointer-events-none" />
                )}
              </div>

              {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-52 overflow-y-auto divide-y divide-stone-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {orderedMatchingCustomers.length === 0 ? (
                    <div className="px-4 py-6 text-xs text-stone-400 text-center flex flex-col items-center gap-2">
                      <RiUserSearchLine className="w-6 h-6 text-stone-200" />
                      <span>找不到符合的學員</span>
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
                            form.setValue('contractId', '')
                            form.setValue('attendingCustomerIds', [c.id])
                            setSearchTerm(c.name)
                            setIsOpen(false)
                          }}
                          className={cn(
                            'w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center justify-between gap-3',
                            isSelected ? 'bg-orange-50' : 'hover:bg-stone-50'
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn(
                              'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black',
                              isSelected ? 'bg-orange-500 text-white' : 'bg-stone-100 text-stone-500'
                            )}>
                              {c.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-stone-900 flex items-center gap-1.5 text-xs">
                                {c.name}
                                {c.isSubstitute && (
                                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                    代課
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-stone-400 flex items-center gap-1 mt-0.5">
                                <RiPhoneLine className="w-3 h-3" />
                                {c.phone || '無電話'}
                              </div>
                            </div>
                          </div>
                          {isSelected && <RiCheckLine className="w-4 h-4 text-orange-500 shrink-0" />}
                        </button>
                      )
                    })
                  )}
                </div>
              )}
              {form.formState.errors.customerId && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.customerId.message}</p>
              )}
            </div>

            {/* ── 合約選擇 ── */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                <RiFileTextLine className="w-3.5 h-3.5" />
                合約
              </Label>
              <div className="relative">
                <select
                  className={cn(
                    'w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 transition-all appearance-none cursor-pointer font-medium',
                    (!selectedCustomerId || contracts.length === 0)
                      ? 'opacity-50 cursor-not-allowed bg-stone-100 text-stone-400 border-stone-200'
                      : selectedContractId
                        ? 'bg-orange-50/40 border-orange-300 text-stone-800 focus:ring-orange-200/50 focus:border-orange-400'
                        : 'bg-stone-50 border-stone-200 text-stone-800 focus:ring-orange-200/50 focus:border-orange-400'
                  )}
                  {...form.register('contractId', {
                    onChange: (e) => {
                      const conId = e.target.value
                      const con = contracts.find(c => c.id === conId)
                      if (con) {
                        const ids = con.customerIds && con.customerIds.length > 0
                          ? con.customerIds
                          : [selectedCustomerId, con.sharedWithCustomerId, con.partnerId].filter((id): id is string => !!id)
                        form.setValue('attendingCustomerIds', Array.from(new Set(ids)))
                      }
                    }
                  })}
                  disabled={!selectedCustomerId || contracts.length === 0}
                >
                  {!selectedCustomerId ? (
                    <option value="" disabled>請先選擇學員</option>
                  ) : contracts.length === 0 ? (
                    <option value="" disabled>無進行中合約</option>
                  ) : (
                    <option value="" disabled>請選擇合約</option>
                  )}
                  {contracts.map((c) => {
                    const isGroup = c.contractType === 'group' || !!c.groupMemberQuotas
                    const isShared = c.contractType === 'shared'
                    const isDual = !isGroup && !isShared && (c.contractType === 'dual' || (!!c.sharedWithCustomerId && c.contractType !== 'group'))
                    const typeLabel = isGroup ? '團體' : isShared ? '共享' : isDual ? '雙人' : '單人'
                    return (
                      <option key={c.id} value={c.id}>
                        [{typeLabel}] {(c as any).contractNo || c.id.substring(0, 8)} — 剩 {c.remainingSessions} 堂
                      </option>
                    )
                  })}
                </select>
                <RiContractLine className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 pointer-events-none" />
              </div>
              {form.formState.errors.contractId && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.contractId.message}</p>
              )}
            </div>

            {/* ── 授課教練 ── */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                <RiUserStarLine className="w-3.5 h-3.5" />
                授課教練
              </Label>
              {trainerId ? (
                <>
                  <div className="h-10 rounded-xl border border-stone-200 bg-stone-50 px-3 flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                      <RiUserStarLine className="w-3 h-3 text-orange-500" />
                    </div>
                    <span className="text-sm text-stone-800 font-semibold flex-1 truncate">
                      {trainers.find(t => t.id === trainerId)?.name || '教練'}
                    </span>
                    <span className="text-[10px] text-stone-400 bg-white border border-stone-200 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                      已固定
                    </span>
                  </div>
                  <input type="hidden" {...form.register('trainerId')} value={trainerId} />
                </>
              ) : (
                <div className="relative">
                  <select
                    className={cn(
                      'w-full h-10 rounded-xl border border-stone-200 px-3 text-sm bg-stone-50 text-stone-800 focus:outline-none focus:ring-2 focus:ring-orange-400/30 focus:border-orange-400 transition-all appearance-none cursor-pointer font-medium',
                      !selectedCustomerId && 'opacity-50 cursor-not-allowed'
                    )}
                    {...form.register('trainerId')}
                    disabled={!selectedCustomerId}
                  >
                    <option value="" disabled>請選擇授課教練</option>
                    {trainers.map((t) => {
                      const isContractTrainer = selectedContract && (
                        selectedContract.trainerId === t.id ||
                        (selectedContract as any).secondaryTrainerId === t.id
                      )
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name}{!isContractTrainer && selectedContract ? ' (代課)' : ''}
                        </option>
                      )
                    })}
                  </select>
                  <RiUserStarLine className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 pointer-events-none" />
                </div>
              )}
              {form.formState.errors.trainerId && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.trainerId.message}</p>
              )}
            </div>

            {/* ── 出席管理（雙人 / 共享 / 團體合約）── */}
            {isMultiContract && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                    <RiTeamLine className="w-3.5 h-3.5" />
                    {selectedContract?.contractType === 'group' ? '團體成員出席' : selectedContract?.contractType === 'shared' ? '共享成員出席' : '雙人成員出席 (固定同堂)'}
                  </Label>
                  <span className="text-[10px] text-stone-400 font-medium">
                    {isDualContract ? '雙人合約固定兩人同時出席' : '未勾選代表缺席'}
                  </span>
                </div>

                <div className="rounded-xl border border-stone-100 overflow-hidden bg-stone-50/40 divide-y divide-stone-100/80">
                  {groupCustomers.map((member, idx) => {
                    const isAttending = (form.watch('attendingCustomerIds') || []).includes(member.id)
                    const memberContracts = contracts.filter(c => {
                      const isInIds = Array.isArray(c.customerIds) && c.customerIds.includes(member.id)
                      const isCust = c.customerId === member.id || c.primaryCustomerId === member.id || c.sharedWithCustomerId === member.id || c.partnerId === member.id
                      return isInIds || isCust
                    })
                    const currentSelectedContractId = studentContractSelections[member.id] || selectedContract?.id || ''

                    return (
                      <div
                        key={member.id}
                        className={cn(
                          'transition-colors duration-150',
                          isAttending ? 'bg-white' : 'bg-stone-50/60'
                        )}
                      >
                        <label className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isDualContract ? true : isAttending}
                            disabled={isDualContract}
                            className="w-4 h-4 rounded border-stone-300 accent-orange-500 cursor-pointer shrink-0 disabled:opacity-80"
                            onChange={(e) => {
                              if (isDualContract) return
                              const current = form.getValues('attendingCustomerIds') || []
                              if (e.target.checked) {
                                form.setValue('attendingCustomerIds', [...current, member.id])
                              } else {
                                form.setValue('attendingCustomerIds', current.filter(id => id !== member.id))
                              }
                            }}
                          />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-colors',
                              isAttending || isDualContract ? 'bg-orange-100 text-orange-700' : 'bg-stone-200 text-stone-400'
                            )}>
                              {member.name.charAt(0)}
                            </div>
                            <span className={cn(
                              'text-xs font-semibold truncate transition-colors',
                              isAttending || isDualContract ? 'text-stone-800' : 'text-stone-400'
                            )}>
                              {member.name}
                            </span>
                            {idx === 0 && (
                              <span className="text-[9px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full shrink-0">主學員</span>
                            )}
                            {(() => {
                              const assignedTrainerId = selectedContract?.studentTrainers?.[member.id] || member.trainerId
                              const trainerObj = trainers.find(t => t.id === assignedTrainerId)
                              if (trainerObj) {
                                return (
                                  <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded-full shrink-0">
                                    教練: {trainerObj.name}
                                  </span>
                                )
                              }
                              return null
                            })()}
                          </div>
                          <span className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 transition-all border',
                            isAttending || isDualContract
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : 'bg-stone-100 text-stone-400 border-transparent'
                          )}>
                            {isAttending || isDualContract ? '出席' : '缺席'}
                          </span>
                        </label>

                        {isAttending && !isDualContract && (
                          <div className="px-4 pb-3 flex items-center gap-2">
                            <div className="w-4 shrink-0" />
                            <RiContractLine className="w-3.5 h-3.5 text-stone-300 shrink-0" />
                            <select
                              className="flex-1 border border-stone-200 rounded-lg px-2.5 py-1.5 text-[11px] bg-stone-50 text-stone-700 focus:outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 appearance-none cursor-pointer"
                              value={currentSelectedContractId}
                              onChange={(e) => {
                                setStudentContractSelections(prev => ({
                                  ...prev,
                                  [member.id]: e.target.value
                                }))
                              }}
                            >
                              {memberContracts.map(mc => {
                                const isGroup = mc.contractType === 'group' && mc.groupMemberQuotas && mc.groupMemberQuotas[member.id]
                                const remText = isGroup
                                  ? `個人剩 ${mc.groupMemberQuotas![member.id].remainingSessions} 堂`
                                  : `剩 ${mc.remainingSessions} 堂`
                                const typeLabel = mc.contractType === 'group' ? '團體' : mc.contractType === 'shared' ? '共享' : mc.contractType === 'dual' ? '雙人' : '單人'
                                return (
                                  <option key={mc.id} value={mc.id}>
                                    [{typeLabel}] {(mc as any).contractNo || mc.id.substring(0, 8)} ({remText})
                                  </option>
                                )
                              })}
                            </select>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {form.formState.errors.attendingCustomerIds && (
                  <p className="text-red-500 text-xs">{form.formState.errors.attendingCustomerIds.message}</p>
                )}
              </div>
            )}

            {/* ── 日期 & 堂數 ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                  <RiCalendarLine className="w-3.5 h-3.5" />
                  上課日期
                </Label>
                <Input
                  type="date"
                  {...form.register('sessionDate')}
                  className="h-10 rounded-xl border-stone-200 bg-stone-50 focus:bg-white text-sm"
                />
                {form.formState.errors.sessionDate && (
                  <p className="text-red-500 text-xs">{form.formState.errors.sessionDate.message as string}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                  <RiRefreshLine className="w-3.5 h-3.5" />
                  消耗堂數
                </Label>
                <div className="relative">
                  {isDualContract ? (
                    <Input
                      type="number"
                      value={1}
                      disabled
                      className="h-10 rounded-xl border-stone-200 bg-stone-100 text-stone-600 text-sm pr-12 font-bold cursor-not-allowed"
                    />
                  ) : (
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      {...form.register('sessionAmount', { valueAsNumber: true })}
                      className="h-10 rounded-xl border-stone-200 bg-stone-50 focus:bg-white text-sm pr-8 font-medium"
                    />
                  )}
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-400 pointer-events-none font-medium">
                    {isDualContract ? '堂 (固定)' : '堂'}
                  </span>
                </div>
                {form.formState.errors.sessionAmount && (
                  <p className="text-red-500 text-xs">{form.formState.errors.sessionAmount.message as string}</p>
                )}
              </div>
            </div>

            {/* ── 備註 ── */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                <RiStickyNoteLine className="w-3.5 h-3.5" />
                備註
              </Label>
              <Input
                {...form.register('notes')}
                placeholder="課程重點、進展說明..."
                className="h-10 rounded-xl border-stone-200 bg-stone-50 focus:bg-white text-sm"
              />
            </div>

            {/* ── 防呆提示 ── */}
            {validationError && watchedCustomerId && (
              <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 text-xs flex items-start gap-2.5 animate-in fade-in duration-200">
                <RiAlertLine className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{validationError}</span>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-stone-100 bg-stone-50/50 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 font-semibold text-sm px-4"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={!isValid || loading}
              className={cn(
                "rounded-xl font-bold px-7 text-sm transition-all duration-200 flex items-center gap-2",
                isValid && !loading
                  ? "bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white shadow-sm shadow-orange-200/80"
                  : "bg-stone-100 text-stone-400 border border-stone-200 shadow-none cursor-not-allowed"
              )}
            >
              {loading ? (
                <>
                  <RiLoader4Line className="w-4 h-4 animate-spin" />
                  儲存中...
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <RiCheckLine className="w-4 h-4" />
                  確認銷課
                </span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
