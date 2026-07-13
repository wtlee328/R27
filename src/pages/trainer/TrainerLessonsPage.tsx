import { useState, useMemo, useEffect } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Calendar, User, BookOpen, Clock, AlertCircle, Plus, Search, Check, ChevronRight } from 'lucide-react'
import { useLessonRecords } from '@/hooks/useLessonRecords'
import { useCustomers } from '@/hooks/useCustomers'
import { useContracts } from '@/hooks/useContracts'
import { useTrainers } from '@/hooks/useTrainers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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

  // Search states
  const [customerSearch, setCustomerSearch] = useState('')

  // Fetch contracts for the selected customer
  const { contracts, loading: contractsLoading } = useContracts(selectedCustomerId)

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId)
  }, [customers, selectedCustomerId])

  const selectedContract = useMemo(() => {
    return contracts.find(c => c.id === selectedContractId)
  }, [contracts, selectedContractId])

  // Filter customers by search term
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return []
    const term = customerSearch.toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.phone && c.phone.includes(term))
    )
  }, [customers, customerSearch])

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900">教練銷課</h1>
          <p className="text-stone-500 text-sm mt-1">快速為學員紀錄上課堂數</p>
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
              <div className="space-y-2">
                <Label className="text-stone-700 font-bold text-sm">搜尋學員 *</Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="請輸入學員姓名或電話..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="h-11 pl-10 bg-white border-stone-200 rounded-xl focus:border-brand-400 focus:ring-brand-400/20 text-sm"
                    autoFocus
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                </div>
              </div>

              {/* Search Results — desktop grid */}
              <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((cust) => (
                    <button
                      key={cust.id}
                      onClick={() => handleSelectCustomer(cust)}
                      className="flex items-center justify-between p-4 bg-stone-50 border border-stone-200 rounded-xl hover:bg-brand-50/30 hover:border-brand-300 transition-colors text-left cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-stone-800 text-sm">{cust.name}</div>
                        <div className="text-xs text-stone-500 mt-0.5">{cust.phone || '無電話資料'}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-stone-400" />
                    </button>
                  ))
                ) : customerSearch.trim() ? (
                  <div className="col-span-2 text-center py-12 text-stone-400 text-sm">
                    找不到符合「{customerSearch}」的學員
                  </div>
                ) : (
                  <div className="col-span-2 text-center py-12 text-stone-400 text-sm">
                    請輸入關鍵字搜尋學員
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
              <p className="text-stone-500 text-sm mt-0.5">顯示本場館近期已扣堂之銷課紀錄</p>
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

                  return (
                    <div key={record.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_80px] gap-4 px-6 py-4 hover:bg-stone-50 transition-colors items-center">
                      <span className="font-semibold text-stone-800 text-sm truncate">{attendingNames}</span>
                      <span className="text-xs bg-stone-100 text-stone-600 font-semibold px-2 py-1 rounded-lg inline-block w-fit">{trainerName}</span>
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
