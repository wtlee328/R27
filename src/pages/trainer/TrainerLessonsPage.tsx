import { useState, useMemo, useEffect, useRef } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import {
  RiCalendarCheckLine,
  RiAddLine,
  RiArrowLeftLine,
  RiUser3Line,
  RiRefreshLine,
  RiSearchLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiAlertLine,
  RiTimeLine,
  RiCloseLine,
  RiUserSharedLine,
  RiFileTextLine,
  RiUserLine,
  RiCalendarLine,
  RiInformationLine,
  RiLoader4Line,
  RiLockLine,
} from '@remixicon/react'
import type { LessonRecord } from '@/types'
import { useLessonRecords } from '@/hooks/useLessonRecords'
import { useCustomers } from '@/hooks/useCustomers'
import { useContracts } from '@/hooks/useContracts'
import { useTrainers } from '@/hooks/useTrainers'
import { useAuthStore } from '@/stores/authStore'
import { useTrainerProfileStore } from '@/stores/trainerProfileStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { Customer, Contract } from '@/types'
// LessonRecord already imported above

export default function TrainerLessonsPage() {
  const { user } = useAuthStore()
  const { selectedTrainerId: activeTrainerId } = useTrainerProfileStore()
  const currentTrainerId = activeTrainerId || (user?.role === 'trainer' ? user?.trainerId : null)

  const { records, loading: recordsLoading, createRecord } = useLessonRecords()
  const { customers, contracts: venueContracts, loading: customersLoading } = useCustomers()
  const { trainers, loading: trainersLoading } = useTrainers()

  const [isRecording, setIsRecording] = useState(false)
  // Selected record for slide-in detail panel
  const [selectedRecord, setSelectedRecord] = useState<LessonRecord | null>(null)
  const [isPanelVisible, setIsPanelVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(1) // 1: Select Customer, 2: Select Contract & Trainer & Details

  // Filter records for current trainer
  const myRecords = useMemo(() => {
    if (!currentTrainerId) return records
    return records.filter(r => r.trainerId === currentTrainerId || r.contractTrainerId === currentTrainerId)
  }, [records, currentTrainerId])

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedContractId, setSelectedContractId] = useState('')
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [sessionAmount, setSessionAmount] = useState(1)
  const [sessionDate, setSessionDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [attendingCustomerIds, setAttendingCustomerIds] = useState<string[]>([])

  // Mode and Search states
  const [entryMode, setEntryMode] = useState<'regular' | 'substitute'>('regular')
  const [selectedSubstitutedTrainerId, setSelectedSubstitutedTrainerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')

  // Fetch contracts for the selected customer
  const { contracts, loading: contractsLoading } = useContracts(selectedCustomerId)

  const currentTrainerName = useMemo(() => {
    if (!currentTrainerId) return ''
    return trainers.find(t => t.id === currentTrainerId)?.name || user?.displayName || user?.email || '當前教練'
  }, [trainers, currentTrainerId, user])

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId)
  }, [customers, selectedCustomerId])

  const selectedContract = useMemo(() => {
    return contracts.find(c => c.id === selectedContractId)
  }, [contracts, selectedContractId])

  const contractPrimaryTrainer = useMemo(() => {
    if (!selectedContract) return null
    return trainers.find(t => t.id === selectedContract.trainerId)
  }, [selectedContract, trainers])

  const isSubstituteTeaching = useMemo(() => {
    if (!selectedContract || !selectedTrainerId) return false
    const primaryId = selectedContract.trainerId
    const secondaryId = selectedContract.secondaryTrainerId
    return selectedTrainerId !== primaryId && selectedTrainerId !== secondaryId
  }, [selectedContract, selectedTrainerId])

  // Active contract summary for each customer
  const customerContractMap = useMemo(() => {
    const map = new Map<string, { activeCount: number; remainingTotal: number }>()
    venueContracts.forEach((c) => {
      if (c.remainingSessions > 0) {
        const cIds = new Set<string>()
        if (c.customerId) cIds.add(c.customerId)
        if (c.customerIds && Array.isArray(c.customerIds)) {
          c.customerIds.forEach((id) => cIds.add(id))
        }
        if (c.sharedWithCustomerId) cIds.add(c.sharedWithCustomerId)

        cIds.forEach((cid) => {
          const prev = map.get(cid) || { activeCount: 0, remainingTotal: 0 }
          map.set(cid, {
            activeCount: prev.activeCount + 1,
            remainingTotal: prev.remainingTotal + c.remainingSessions,
          })
        })
      }
    })
    return map
  }, [venueContracts])

  // Filter customers that belong to current trainer for regular mode
  const myCustomers = useMemo(() => {
    if (!currentTrainerId) return customers
    return customers.filter(cust => {
      // 1. Primary assigned trainer is current trainer
      if (cust.trainerId === currentTrainerId) return true
      // 2. Or has a contract where current trainer is primary, secondary, or designated in studentTrainers
      return venueContracts.some(con =>
        (con.customerId === cust.id || con.sharedWithCustomerId === cust.id || (con.customerIds && con.customerIds.includes(cust.id))) &&
        (con.trainerId === currentTrainerId || con.secondaryTrainerId === currentTrainerId || (con.studentTrainers && con.studentTrainers[cust.id] === currentTrainerId))
      )
    })
  }, [customers, venueContracts, currentTrainerId])

  // Customer IDs for a specific substituted trainer
  const substitutedTrainerCustomerIds = useMemo(() => {
    if (!selectedSubstitutedTrainerId) return new Set<string>()
    const set = new Set<string>()
    venueContracts.forEach((c) => {
      const isSubscribedTrainer = c.trainerId === selectedSubstitutedTrainerId ||
        c.secondaryTrainerId === selectedSubstitutedTrainerId ||
        (c.studentTrainers && Object.values(c.studentTrainers).includes(selectedSubstitutedTrainerId))

      if (isSubscribedTrainer && c.remainingSessions > 0) {
        if (c.customerId) set.add(c.customerId)
        if (c.customerIds && Array.isArray(c.customerIds)) {
          c.customerIds.forEach((id) => set.add(id))
        }
        if (c.sharedWithCustomerId) set.add(c.sharedWithCustomerId)
      }
    })
    // Also include customers assigned to this trainer who have active remaining contracts
    customers.forEach((c) => {
      if (c.trainerId === selectedSubstitutedTrainerId) {
        const info = customerContractMap.get(c.id)
        if (info && info.remainingTotal > 0) {
          set.add(c.id)
        }
      }
    })
    return set
  }, [venueContracts, customers, selectedSubstitutedTrainerId, customerContractMap])

  // Filter and sort customers (Contract students prioritized!)
  const filteredAndSortedCustomers = useMemo(() => {
    // 1. Regular mode: only show current trainer's students (myCustomers)
    // 2. Substitute mode: filter strictly by selected substituted trainer's contract students
    let list = entryMode === 'substitute' ? customers : myCustomers

    if (entryMode === 'substitute') {
      if (!selectedSubstitutedTrainerId) return []
      list = list.filter((c) => substitutedTrainerCustomerIds.has(c.id))
    }

    // Filter by search keyword
    if (customerSearch.trim()) {
      const term = customerSearch.toLowerCase()
      list = list.filter(
        (c) => c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term))
      )
    }

    // Sort: Customers with active remaining contracts prioritized first
    return [...list].sort((a, b) => {
      const infoA = customerContractMap.get(a.id)
      const infoB = customerContractMap.get(b.id)
      const hasContractA = infoA && infoA.remainingTotal > 0 ? 1 : 0
      const hasContractB = infoB && infoB.remainingTotal > 0 ? 1 : 0

      if (hasContractA !== hasContractB) {
        return hasContractB - hasContractA // Active contract students first!
      }
      return a.name.localeCompare(b.name, 'zh-Hant')
    })
  }, [customers, myCustomers, entryMode, selectedSubstitutedTrainerId, substitutedTrainerCustomerIds, customerSearch, customerContractMap])

  // Handle customer selection
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id)
    setSelectedContractId('')
    setAttendingCustomerIds([customer.id])
    if (currentTrainerId) {
      setSelectedTrainerId(currentTrainerId)
    }
    setStep(2)
  }

  // Ensure selectedTrainerId is defaulted to logged-in coach when entering recording mode or when currentTrainerId changes
  useEffect(() => {
    if (currentTrainerId) {
      setSelectedTrainerId(currentTrainerId)
    }
  }, [currentTrainerId, isRecording])

  // Pre-select contract/trainer when contracts load
  useEffect(() => {
    if (contracts.length > 0) {
      // Find the first contract with remaining sessions
      const activeContract = contracts.find(c => c.remainingSessions > 0) || contracts[0]
      setSelectedContractId(activeContract.id)
      if (currentTrainerId) {
        setSelectedTrainerId(currentTrainerId)
      } else if (activeContract.trainerId) {
        setSelectedTrainerId(activeContract.trainerId)
      }
    } else if (currentTrainerId) {
      setSelectedTrainerId(currentTrainerId)
    }
  }, [contracts, currentTrainerId])

  const handleBack = () => {
    if (step === 2) {
      setStep(1)
      setSelectedCustomerId('')
      setSelectedContractId('')
      setAttendingCustomerIds([])
    } else {
      setIsRecording(false)
    }
  }

  const handleCancel = () => {
    setIsRecording(false)
    setStep(1)
    setSelectedCustomerId('')
    setSelectedContractId('')
    setAttendingCustomerIds([])
    setSessionAmount(1)
    setSessionDate(format(new Date(), 'yyyy-MM-dd'))
    setNotes('')
    setCustomerSearch('')
    setEntryMode('regular')
    setSelectedSubstitutedTrainerId('')
    if (currentTrainerId) {
      setSelectedTrainerId(currentTrainerId)
    }
  }

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!selectedCustomerId || !selectedContractId || !selectedTrainerId) {
      setSubmitError('請填寫所有必填欄位')
      return
    }

    if (selectedContract && selectedContract.remainingSessions < sessionAmount) {
      setSubmitError(`合約剩餘堂數不足（剩餘 ${selectedContract.remainingSessions} 堂）`)
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      await createRecord({
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        contractId: selectedContractId,
        trainerId: selectedTrainerId,
        sessionDate: (() => {
          const [y, m, d] = sessionDate.split('-').map(Number)
          return new Date(y, m - 1, d)
        })(),
        sessionAmount,
        notes,
        attendingCustomerIds,
      })
      handleCancel()
    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || '新增銷課紀錄失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // Dual contract partners
  const partners = useMemo(() => {
    if (!selectedContract) return []
    const ids = selectedContract.customerIds || []
    return customers.filter(c => ids.includes(c.id) && c.id !== selectedCustomerId)
  }, [selectedContract, customers, selectedCustomerId])

  const formatRecordDate = (timestamp: any) => {
    if (!timestamp) return ''
    const date = timestamp.toDate()
    if (isToday(date)) {
      return `今天 ${format(date, 'HH:mm')}`
    }
    if (isYesterday(date)) {
      return `昨天 ${format(date, 'HH:mm')}`
    }
    return format(date, 'yyyy/MM/dd HH:mm')
  }

  return (
    <div className="space-y-6">
      {/* ---- Header Section ---- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiCalendarCheckLine className="w-6 h-6 text-orange-500" />
            銷課紀錄
          </h1>
        </div>
        {!isRecording && (
          <Button
            onClick={() => setIsRecording(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-5 h-10 cursor-pointer font-bold transition-all"
          >
            <RiAddLine className="h-4 w-4" />
            新增銷課紀錄
          </Button>
        )}
      </div>

      {isRecording ? (
        /* ---- Recording Mode ---- */
        <div className="space-y-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-1">
            <button
              onClick={handleBack}
              className="text-stone-500 hover:text-stone-800 text-sm font-bold flex items-center gap-1 cursor-pointer transition-colors px-2 py-1 rounded-lg hover:bg-stone-100"
            >
              <RiArrowLeftLine className="w-4 h-4" />
              <span>返回列表</span>
            </button>
            <span className="text-xs text-stone-500 font-extrabold bg-stone-100 px-3 py-1 rounded-full border border-stone-200/60">
              步驟 {step} / 2
            </span>
          </div>

          {step === 1 ? (
            /* ---- Step 1: Select Customer ---- */
            <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-sm space-y-5">
              {/* Mode Tabs */}
              <div className="flex rounded-xl bg-stone-100/90 p-1 border border-stone-200/60">
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('regular')
                    setSelectedSubstitutedTrainerId('')
                  }}
                  className={cn(
                    "flex-1 py-2.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    entryMode === 'regular'
                      ? "bg-white text-stone-900 shadow-xs border border-stone-200/40"
                      : "text-stone-500 hover:text-stone-800"
                  )}
                >
                  <RiUser3Line className="w-4 h-4 text-orange-500" />
                  一般銷課 (我的學員)
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('substitute')}
                  className={cn(
                    "flex-1 py-2.5 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    entryMode === 'substitute'
                      ? "bg-white text-amber-700 shadow-xs border border-amber-200/40"
                      : "text-stone-500 hover:text-stone-800"
                  )}
                >
                  <RiUserSharedLine className="w-4 h-4 text-amber-500" />
                  代課銷課 (選擇代課教練)
                </button>
              </div>

              {/* Substitute Mode: Select Substituted Trainer First */}
              {entryMode === 'substitute' && (
                <div className="space-y-2 p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
                  <Label className="text-amber-900 font-bold text-xs flex items-center gap-1.5">
                    <RiUserSharedLine className="w-4 h-4 text-amber-600" />
                    <span>選擇被代課的教練 *</span>
                  </Label>
                  <select
                    value={selectedSubstitutedTrainerId}
                    onChange={(e) => setSelectedSubstitutedTrainerId(e.target.value)}
                    className="w-full bg-white border border-amber-300 text-stone-900 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="">-- 請先選擇被代課的教練名稱 --</option>
                    {trainers.filter((t) => t.id !== currentTrainerId).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search Input */}
              <div className="space-y-2">
                <Label className="text-stone-700 font-bold text-xs">搜尋學員</Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={
                      entryMode === 'substitute'
                        ? "搜尋該教練的合約學員姓名或電話..."
                        : "請輸入學員姓名或電話，或從下方列表選擇..."
                    }
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="h-10 pl-10 bg-white border-stone-200 rounded-xl focus:border-brand-400 focus:ring-brand-400/20 text-xs"
                    autoFocus
                  />
                  <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                </div>
              </div>

              {/* Search Results / Customer List Display */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-stone-500 px-1">
                  <span>
                    {entryMode === 'substitute'
                      ? selectedSubstitutedTrainerId
                        ? `${trainers.find(t => t.id === selectedSubstitutedTrainerId)?.name || '該教練'} 的合約學員名單`
                        : '請先選擇被代課教練'
                      : customerSearch.trim() ? '搜尋結果' : '學員列表 (合約學員優先)'}
                  </span>
                  <span className="text-[11px] text-stone-400 font-normal">
                    共 {filteredAndSortedCustomers.length} 位學員
                  </span>
                </div>

                {entryMode === 'substitute' && !selectedSubstitutedTrainerId ? (
                  <div className="text-center py-10 text-stone-400 text-xs bg-stone-50/80 rounded-2xl border border-dashed border-stone-200/90 flex flex-col items-center justify-center gap-2">
                    <RiUserSharedLine className="w-6 h-6 text-amber-500/80" />
                    <span>請先在上方選擇「被代課的教練」，系統將自動列出該教練之合約學員</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {filteredAndSortedCustomers.length > 0 ? (
                      filteredAndSortedCustomers.map((cust) => {
                        const contractInfo = customerContractMap.get(cust.id)
                        const hasActiveContract = contractInfo && contractInfo.remainingTotal > 0

                        return (
                          <button
                            key={cust.id}
                            onClick={() => handleSelectCustomer(cust)}
                            className={cn(
                              "flex items-center justify-between p-3.5 rounded-xl border transition-all text-left cursor-pointer group",
                              hasActiveContract
                                ? "bg-white border-orange-200/90 hover:bg-orange-50/60 hover:border-orange-400 shadow-2xs"
                                : "bg-stone-50/80 border-stone-200/80 hover:bg-stone-100"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  "w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center shrink-0 transition-colors",
                                  hasActiveContract
                                    ? "bg-orange-100 text-orange-700 group-hover:bg-orange-500 group-hover:text-white"
                                    : "bg-stone-200/60 text-stone-600"
                                )}
                              >
                                {cust.name.slice(0, 1)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-stone-800 text-sm group-hover:text-stone-950 transition-colors truncate">
                                    {cust.name}
                                  </span>
                                  {hasActiveContract && (
                                    <span className="text-[10px] font-extrabold text-orange-700 bg-orange-100/80 border border-orange-200/80 rounded px-1.5 py-0.2 shrink-0">
                                      剩餘 {contractInfo.remainingTotal} 堂
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-stone-400 font-mono mt-0.5 truncate">
                                  {cust.phone || '無電話資料'}
                                </div>
                              </div>
                            </div>
                            <RiArrowRightSLine className="h-4 w-4 text-stone-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                          </button>
                        )
                      })
                    ) : (
                      <div className="col-span-1 sm:col-span-2 text-center py-12 text-stone-400 text-sm bg-stone-50 rounded-xl">
                        {entryMode === 'substitute'
                          ? '該教練目前無進行中之合約學員'
                          : `找不到符合「${customerSearch}」的學員`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ---- Step 2: Form Details ---- */
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <span className="text-[10px] text-stone-400 font-semibold block uppercase tracking-wider">目前學員</span>
                <span className="text-base font-bold text-stone-800 mt-0.5 block">{selectedCustomer?.name}</span>
              </div>

              {/* Select Contract */}
              <div className="space-y-2">
                <Label className="text-stone-700 font-bold text-xs">選擇合約 *</Label>
                {contractsLoading ? (
                  <div className="text-xs text-stone-400 animate-pulse">載入合約中...</div>
                ) : contracts.length > 0 ? (
                  <div className="space-y-2">
                    {contracts.map((contract) => {
                      const isSelected = selectedContractId === contract.id
                      const typeLabel = contract.contractType === 'group' ? '團體' : contract.contractType === 'shared' ? '共享' : contract.contractType === 'dual' ? '雙人' : '單人'
                      return (
                        <button
                          key={contract.id}
                          type="button"
                          onClick={() => {
                            setSelectedContractId(contract.id)
                            if (contract.contractType === 'dual') {
                              const allIds = Array.isArray(contract.customerIds) && contract.customerIds.length > 0
                                ? contract.customerIds
                                : [contract.customerId, contract.sharedWithCustomerId].filter(Boolean) as string[]
                              setAttendingCustomerIds(allIds)
                              setSessionAmount(1)
                            } else {
                              setAttendingCustomerIds([selectedCustomerId])
                              setSessionAmount(1)
                            }
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-brand-500 bg-brand-50/30'
                              : 'border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <div>
                            <div className="font-semibold text-xs text-stone-800">
                              {contract.contractNo || '未命名合約'} ({typeLabel})
                            </div>
                            <div className="text-[10px] text-stone-500 mt-1">
                              剩餘堂數: <span className="font-bold text-brand-600">{contract.remainingSessions}</span> / {contract.totalSessions} 堂
                            </div>
                          </div>
                          {isSelected && <RiCheckLine className="h-4 w-4 text-brand-500 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                    <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>該學員沒有可用的有效合約，請聯絡管理員新增合約。</span>
                  </div>
                )}
              </div>

              {/* Dual / Shared / Group Contract Attendees */}
              {selectedContract && (selectedContract.contractType === 'dual' || selectedContract.contractType === 'shared' || selectedContract.contractType === 'group' || partners.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-stone-700 font-bold text-xs">
                      {selectedContract.contractType === 'group' ? '團體成員出席' : selectedContract.contractType === 'shared' ? '共享成員出席' : '雙人成員出席 (固定同堂)'} *
                    </Label>
                    {selectedContract.contractType === 'dual' && (
                      <span className="text-[10px] text-stone-400 font-medium">雙人合約固定兩人同時出席</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {/* Primary Attending Customer */}
                    <label className="flex items-center gap-2.5 p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedContract.contractType === 'dual' ? true : attendingCustomerIds.includes(selectedCustomerId)}
                        disabled={selectedContract.contractType === 'dual'}
                        className="rounded border-stone-300 text-brand-500 focus:ring-brand-500 disabled:opacity-80"
                      />
                      <span>{selectedCustomer?.name} (主學員)</span>
                    </label>
                    {/* Partners */}
                    {partners.map(partner => {
                      const isAttending = attendingCustomerIds.includes(partner.id)
                      const isDual = selectedContract.contractType === 'dual'
                      return (
                        <label
                          key={partner.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                            isAttending || isDual
                              ? 'bg-brand-50/20 border-brand-200 text-brand-900'
                              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDual ? true : isAttending}
                            disabled={isDual}
                            onChange={(e) => {
                              if (isDual) return
                              if (e.target.checked) {
                                setAttendingCustomerIds([...attendingCustomerIds, partner.id])
                              } else {
                                setAttendingCustomerIds(attendingCustomerIds.filter(id => id !== partner.id))
                              }
                            }}
                            className="rounded border-stone-300 text-brand-500 focus:ring-brand-500 cursor-pointer disabled:opacity-80"
                          />
                          <span>{partner.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Trainer Display / Select */}
              <div className="space-y-1.5">
                <Label className="text-stone-700 font-bold text-xs">授課教練 *</Label>
                {currentTrainerId ? (
                  <div className="w-full bg-stone-50 border border-stone-200/90 text-stone-900 px-3.5 py-2.5 rounded-xl text-sm font-bold shadow-2xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RiUser3Line className="w-4 h-4 text-orange-500" />
                      <span>{currentTrainerName}</span>
                    </div>
                    <span className="text-[11px] text-stone-400 font-normal bg-white border border-stone-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <RiLockLine className="w-3 h-3 text-stone-400" />
                      登入教練
                    </span>
                  </div>
                ) : trainersLoading ? (
                  <div className="text-xs text-stone-400">載入教練名單中...</div>
                ) : (
                  <select
                    id="trainer"
                    value={selectedTrainerId}
                    onChange={(e) => setSelectedTrainerId(e.target.value)}
                    required
                    className="w-full bg-white border border-stone-200 text-stone-900 px-3.5 py-2.5 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer font-medium"
                  >
                    <option value="">-- 請選擇教練名稱 --</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                {isSubstituteTeaching && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl p-3 flex items-center gap-2 mt-2">
                    <RiInformationLine className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>目前授課教練為（{currentTrainerName}），與合約原教練（{contractPrimaryTrainer?.name || '主合約教練'}）不同，將自動建立為「代課紀錄」。</span>
                  </div>
                )}
              </div>

              {/* Date, Amount & Notes — desktop two-column */}
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="sessionDate" className="text-stone-700 font-bold text-xs">上課日期 *</Label>
                  <Input
                    id="sessionDate"
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    required
                    className="h-11 bg-white border-stone-200 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sessionAmount" className="text-stone-700 font-bold text-xs">扣堂數 *</Label>
                  {selectedContract?.contractType === 'dual' ? (
                    <Input
                      id="sessionAmount"
                      type="number"
                      value={1}
                      disabled
                      className="h-11 bg-stone-100 border-stone-200 rounded-xl text-stone-600 font-bold cursor-not-allowed"
                    />
                  ) : (
                    <Input
                      id="sessionAmount"
                      type="number"
                      min="1"
                      max={selectedContract ? selectedContract.remainingSessions : 100}
                      value={sessionAmount}
                      onChange={(e) => setSessionAmount(Math.max(1, parseInt(e.target.value) || 1))}
                      required
                      className="h-11 bg-white border-stone-200 rounded-xl"
                    />
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-stone-700 font-bold text-xs">課程備註</Label>
                <Textarea
                  id="notes"
                  placeholder="可在此輸入課程筆記、學員身體狀況等..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-white border-stone-200 rounded-xl min-h-[100px]"
                />
              </div>

              {submitError && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                  <RiAlertLine className="h-4.5 w-4.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  className="flex-1 h-11 border-stone-200 rounded-xl text-stone-600 text-sm font-bold cursor-pointer"
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  className="flex-1 h-11 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5"
                  disabled={submitting || !selectedContractId || !selectedTrainerId}
                >
                  {submitting ? (
                    <>
                      <RiLoader4Line className="h-4 w-4 animate-spin" />
                      <span>儲存中...</span>
                    </>
                  ) : (
                    '確認銷課'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ---- History/List Mode ---- */
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <RiTimeLine className="h-5 w-5 text-brand-500" />
                最近銷課紀錄
              </h2>
            </div>
          </div>

          {/* Lesson Records List */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 px-6 py-3 bg-stone-50 border-b border-stone-100 text-xs font-bold text-stone-500 uppercase tracking-wide">
              <span>學員</span>
              <span>教練</span>
              <span>日期</span>
              <span className="text-right">扣堂數</span>
            </div>

            {recordsLoading ? (
              <div className="p-10 text-center text-stone-400 text-sm animate-pulse">載入中...</div>
            ) : myRecords.length > 0 ? (
              <div className="divide-y divide-stone-100">
                {myRecords.slice(0, 50).map((record) => {
                  const trainerName = trainers.find(t => t.id === record.trainerId)?.name || '未指定教練'
                  const attendingNames = record.attendingCustomerNames && record.attendingCustomerNames.length > 0
                    ? record.attendingCustomerNames.join('、')
                    : record.customerName
                  const isSubstituteRecord = record.contractTrainerId && record.contractTrainerId !== record.trainerId
                  const isSelected = selectedRecord?.id === record.id

                  return (
                    <div
                      key={record.id}
                      onClick={() => {
                        if (isSelected) {
                          setIsPanelVisible(false)
                          setTimeout(() => setSelectedRecord(null), 300)
                        } else {
                          setSelectedRecord(record)
                          setIsPanelVisible(false)
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => setIsPanelVisible(true))
                          })
                        }
                      }}
                      className={cn(
                        "grid grid-cols-[2fr_1.2fr_1fr_80px] gap-4 px-6 py-4 transition-all cursor-pointer items-center group",
                        isSelected
                          ? "bg-brand-50/60 border-l-2 border-brand-500"
                          : "hover:bg-stone-50 border-l-2 border-transparent"
                      )}
                    >
                      <span className={cn(
                        "font-semibold text-sm truncate transition-colors",
                        isSelected ? "text-brand-700" : "text-stone-800 group-hover:text-stone-900"
                      )}>{attendingNames}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs bg-stone-100 text-stone-600 font-semibold px-2 py-1 rounded-lg inline-block w-fit">{trainerName}</span>
                        {isSubstituteRecord && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 rounded px-1.5 py-0.5">
                            代課
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-stone-500 flex items-center gap-1.5">
                        <RiCalendarLine className="h-3.5 w-3.5 text-stone-400" />
                        {formatRecordDate(record.sessionDate)}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        <span className={cn(
                          "font-black text-base transition-colors",
                          isSelected ? "text-brand-600" : "text-brand-600"
                        )}>-{record.sessionAmount}<span className="text-xs font-semibold text-stone-400 ml-0.5">堂</span></span>
                        <RiArrowRightSLine className={cn(
                          "h-4 w-4 text-stone-300 transition-all duration-200",
                          isSelected ? "rotate-90 text-brand-500" : "group-hover:translate-x-0.5"
                        )} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-stone-400 text-sm">
                尚無銷課紀錄
              </div>
            )}
          </div>

          {/* Slide-in Detail Panel */}
          {selectedRecord && (() => {
            const r = selectedRecord
            const trainerName = trainers.find(t => t.id === r.trainerId)?.name || '未指定教練'
            const attendingNames = r.attendingCustomerNames && r.attendingCustomerNames.length > 0
              ? r.attendingCustomerNames.join('、')
              : r.customerName
            const isSubstituteRecord = r.contractTrainerId && r.contractTrainerId !== r.trainerId
            const contractTrainerName = r.contractTrainerId
              ? trainers.find(t => t.id === r.contractTrainerId)?.name
              : null

            return (
              <div
                ref={panelRef}
                style={{
                  transform: isPanelVisible ? 'translateX(0)' : 'translateX(100%)',
                  opacity: isPanelVisible ? 1 : 0,
                  transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease',
                }}
                className="fixed top-0 right-0 h-full w-full sm:w-[380px] bg-white border-l border-stone-200 shadow-2xl z-50 flex flex-col"
              >
                {/* Panel Header */}
                <div className="px-6 py-5 border-b border-stone-100 bg-stone-50 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">銷課紀錄細項</p>
                    <h3 className="text-lg font-bold text-stone-900 leading-tight">{attendingNames}</h3>
                    {isSubstituteRecord && (
                      <span className="inline-flex items-center mt-1.5 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                        代課紀錄
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPanelVisible(false)
                      setTimeout(() => setSelectedRecord(null), 300)
                    }}
                    className="p-2 rounded-xl text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors shrink-0 mt-0.5"
                  >
                    <RiCloseLine className="h-4 w-4" />
                  </button>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Sessions Badge */}
                  <div className="flex items-center justify-center">
                    <div className="bg-brand-50 border border-brand-100 rounded-2xl px-8 py-4 text-center">
                      <p className="text-[10px] font-black text-brand-400 uppercase tracking-widest mb-1">扣堂數</p>
                      <p className="text-4xl font-black text-brand-600 tabular-nums">-{r.sessionAmount}</p>
                      <p className="text-xs text-brand-400 font-bold mt-1">堂</p>
                    </div>
                  </div>

                  {/* Detail Rows */}
                  <div className="bg-stone-50 rounded-2xl border border-stone-100 divide-y divide-stone-100 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-xs font-bold text-stone-400">上課日期</span>
                      <span className="text-sm font-bold text-stone-800 tabular-nums">
                        {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy/MM/dd') : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-xs font-bold text-stone-400">上課時間</span>
                      <span className="text-sm font-bold text-stone-800 tabular-nums">
                        {r.sessionDate ? format(r.sessionDate.toDate(), 'HH:mm') : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-xs font-bold text-stone-400">授課教練</span>
                      <span className="text-sm font-bold text-stone-800">{trainerName}</span>
                    </div>
                    {isSubstituteRecord && contractTrainerName && (
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-xs font-bold text-stone-400">原合約教練</span>
                        <span className="text-sm font-bold text-amber-700">{contractTrainerName}</span>
                      </div>
                    )}
                    {r.contractId && (
                      <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-xs font-bold text-stone-400">合約 ID</span>
                        <span className="text-xs font-mono text-stone-500 max-w-[160px] truncate">{r.contractId}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {r.notes && (
                    <div>
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">課程備註</p>
                      <div className="bg-stone-50 rounded-xl border border-stone-100 px-4 py-3.5">
                        <p className="text-sm text-stone-700 leading-relaxed">{r.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Attending Customers (for dual contracts) */}
                  {r.attendingCustomerNames && r.attendingCustomerNames.length > 1 && (
                    <div>
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">出席學員</p>
                      <div className="flex flex-wrap gap-2">
                        {r.attendingCustomerNames.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 bg-stone-100 text-stone-700 font-bold text-xs px-3 py-1.5 rounded-full">
                            <RiUserLine className="h-3 w-3" />
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Backdrop for detail panel */}
          {selectedRecord && (
            <div
              onClick={() => {
                setIsPanelVisible(false)
                setTimeout(() => setSelectedRecord(null), 300)
              }}
              style={{
                opacity: isPanelVisible ? 1 : 0,
                transition: 'opacity 0.3s ease',
                pointerEvents: isPanelVisible ? 'auto' : 'none',
              }}
              className="fixed inset-0 bg-black/20 z-40"
            />
          )}
        </div>
      )}
    </div>
  )
}
