import { useState, useMemo, useEffect } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Calendar, User, BookOpen, Clock, AlertCircle, Plus, Search, Check, ChevronRight, RefreshCw } from 'lucide-react'
import { RiCalendarCheckLine } from '@remixicon/react'
import { useLessonRecords } from '@/hooks/useLessonRecords'
import { useCustomers } from '@/hooks/useCustomers'
import { useContracts } from '@/hooks/useContracts'
import { useTrainers } from '@/hooks/useTrainers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { Customer, Contract } from '@/types'

export default function TrainerLessonsPage() {
  const { records, loading: recordsLoading, createRecord } = useLessonRecords()
  const { customers, loading: customersLoading } = useCustomers()
  const { trainers, loading: trainersLoading } = useTrainers()

  const [isRecording, setIsRecording] = useState(false)
  const [step, setStep] = useState(1) // 1: Select Customer, 2: Select Contract & Trainer & Details

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
  // Fetch all venue contracts for contract-student prioritization & substitute filtering
  const { contracts: venueContracts } = useContracts()

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

  // Customer IDs for a specific substituted trainer
  const substitutedTrainerCustomerIds = useMemo(() => {
    if (!selectedSubstitutedTrainerId) return new Set<string>()
    const set = new Set<string>()
    venueContracts.forEach((c) => {
      if (
        (c.trainerId === selectedSubstitutedTrainerId || c.secondaryTrainerId === selectedSubstitutedTrainerId) &&
        c.remainingSessions > 0
      ) {
        if (c.customerId) set.add(c.customerId)
        if (c.customerIds && Array.isArray(c.customerIds)) {
          c.customerIds.forEach((id) => set.add(id))
        }
        if (c.sharedWithCustomerId) set.add(c.sharedWithCustomerId)
      }
    })
    return set
  }, [venueContracts, selectedSubstitutedTrainerId])

  // Filter and sort customers (Contract students prioritized!)
  const filteredAndSortedCustomers = useMemo(() => {
    let list = customers

    // Substitute mode: filter strictly by selected substituted trainer's contract students
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
  }, [customers, entryMode, selectedSubstitutedTrainerId, substitutedTrainerCustomerIds, customerSearch, customerContractMap])

  // Handle customer selection
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id)
    setSelectedContractId('')
    setAttendingCustomerIds([customer.id])
    setStep(2)
  }

  // Pre-select contract/trainer when contracts load
  useEffect(() => {
    if (contracts.length > 0) {
      // Find the first contract with remaining sessions
      const activeContract = contracts.find(c => c.remainingSessions > 0) || contracts[0]
      setSelectedContractId(activeContract.id)
      setSelectedTrainerId(activeContract.trainerId || '')
    }
  }, [contracts])

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
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-5 h-10 cursor-pointer font-bold"
          >
            <Plus className="h-4 w-4" />
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
              className="text-stone-500 hover:text-stone-800 text-sm font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              ← 返回列表
            </button>
            <span className="text-sm text-stone-400 font-medium bg-stone-100 px-3 py-1 rounded-full">步驟 {step} / 2</span>
          </div>

          {step === 1 ? (
            /* ---- Step 1: Select Customer ---- */
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5">
              {/* Mode Tabs */}
              <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200">
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('regular')
                    setSelectedSubstitutedTrainerId('')
                  }}
                  className={cn(
                    "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    entryMode === 'regular'
                      ? "bg-white text-stone-900 shadow-xs"
                      : "text-stone-500 hover:text-stone-800"
                  )}
                >
                  <User className="w-3.5 h-3.5 text-orange-500" />
                  一般銷課 (同場館學員)
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('substitute')}
                  className={cn(
                    "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    entryMode === 'substitute'
                      ? "bg-white text-amber-700 shadow-xs"
                      : "text-stone-500 hover:text-stone-800"
                  )}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                  代課銷課 (選擇代課教練)
                </button>
              </div>

              {/* Substitute Mode: Select Substituted Trainer First */}
              {entryMode === 'substitute' && (
                <div className="space-y-2 p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                  <Label className="text-amber-900 font-bold text-xs flex items-center gap-1.5">
                    <span>選擇被代課的教練 *</span>
                  </Label>
                  <select
                    value={selectedSubstitutedTrainerId}
                    onChange={(e) => setSelectedSubstitutedTrainerId(e.target.value)}
                    className="w-full bg-white border border-amber-300 text-stone-900 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="">-- 請先選擇被代課的教練名稱 --</option>
                    {trainers.map((t) => (
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
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
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
                  <div className="text-center py-10 text-stone-400 text-xs bg-stone-50 rounded-xl border border-dashed border-stone-200">
                    👈 請先在上方選擇「被代課的教練」，系統將自動列出該教練之合約學員
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
                            <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
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
                      const typeLabel = contract.contractType === 'dual' ? '雙人課' : '一對一'
                      return (
                        <button
                          key={contract.id}
                          type="button"
                          onClick={() => {
                            setSelectedContractId(contract.id)
                            setAttendingCustomerIds([selectedCustomerId])
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
                          {isSelected && <Check className="h-4 w-4 text-brand-500 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>該學員沒有可用的有效合約，請聯絡管理員新增合約。</span>
                  </div>
                )}
              </div>

              {/* Dual Contract Attendees */}
              {selectedContract && (selectedContract.contractType === 'dual' || partners.length > 0) && (
                <div className="space-y-2">
                  <Label className="text-stone-700 font-bold text-xs">上課學員 (多選) *</Label>
                  <div className="space-y-1.5">
                    {/* Primary Attending Customer */}
                    <label className="flex items-center gap-2.5 p-2.5 bg-stone-50 rounded-xl border border-stone-200 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attendingCustomerIds.includes(selectedCustomerId)}
                        disabled
                        className="rounded border-stone-300 text-brand-500 focus:ring-brand-500"
                      />
                      <span>{selectedCustomer?.name} (主學員)</span>
                    </label>
                    {/* Partners */}
                    {partners.map(partner => {
                      const isAttending = attendingCustomerIds.includes(partner.id)
                      return (
                        <label
                          key={partner.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                            isAttending
                              ? 'bg-brand-50/20 border-brand-200 text-brand-900'
                              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isAttending}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setAttendingCustomerIds([...attendingCustomerIds, partner.id])
                              } else {
                                setAttendingCustomerIds(attendingCustomerIds.filter(id => id !== partner.id))
                              }
                            }}
                            className="rounded border-stone-300 text-brand-500 focus:ring-brand-500 cursor-pointer"
                          />
                          <span>{partner.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Select Trainer */}
              <div className="space-y-1.5">
                <Label htmlFor="trainer" className="text-stone-700 font-bold text-xs">上課教練 (您是哪位教練) *</Label>
                {trainersLoading ? (
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
                    <span className="font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[10px] shrink-0">代課提示</span>
                    <span>目前選擇之教練與原合約教練（{contractPrimaryTrainer?.name || '主合約教練'}）不同，將自動建立為「代課紀錄」。</span>
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
                  <AlertCircle className="h-4.5 w-4.5 shrink-0" />
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
                  className="flex-1 h-11 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold cursor-pointer"
                  disabled={submitting || !selectedContractId || !selectedTrainerId}
                >
                  {submitting ? '儲存中...' : '確認銷課'}
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
                <Clock className="h-5 w-5 text-brand-500" />
                最近銷課紀錄
              </h2>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-4 px-6 py-3 bg-stone-50 border-b border-stone-100 text-xs font-bold text-stone-500 uppercase tracking-wide">
              <span>學員</span>
              <span>教練</span>
              <span>日期</span>
              <span>備註</span>
              <span className="text-right">扣堂數</span>
            </div>

            {recordsLoading ? (
              <div className="p-10 text-center text-stone-400 text-sm animate-pulse">載入中...</div>
            ) : records.length > 0 ? (
              <div className="divide-y divide-stone-100">
                {records.slice(0, 20).map((record) => {
                  const trainerName = trainers.find(t => t.id === record.trainerId)?.name || '未指定教練'
                  const attendingNames = record.attendingCustomerNames && record.attendingCustomerNames.length > 0
                    ? record.attendingCustomerNames.join('、')
                    : record.customerName
                  const isSubstituteRecord = record.contractTrainerId && record.contractTrainerId !== record.trainerId

                  return (
                    <div key={record.id} className="grid grid-cols-[2fr_1.2fr_1fr_1fr_80px] gap-4 px-6 py-4 hover:bg-stone-50 transition-colors items-center">
                      <span className="font-semibold text-stone-800 text-sm truncate">{attendingNames}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs bg-stone-100 text-stone-600 font-semibold px-2 py-1 rounded-lg inline-block w-fit">{trainerName}</span>
                        {isSubstituteRecord && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 rounded px-1.5 py-0.5">
                            代課
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-stone-500 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" />
                        {formatRecordDate(record.sessionDate)}
                      </span>
                      <span className="text-xs text-stone-400 italic truncate">{record.notes || '—'}</span>
                      <span className="text-right font-black text-brand-600 text-base">-{record.sessionAmount}<span className="text-xs font-semibold text-stone-400 ml-0.5">堂</span></span>
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
        </div>
      )}
    </div>
  )
}
