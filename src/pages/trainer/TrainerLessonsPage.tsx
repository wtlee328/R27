import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
  RiArrowUpDownLine,
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

  // Filter records for current trainer (only actual teaching trainer)
  const myRecords = useMemo(() => {
    if (!currentTrainerId) return records
    return records.filter(r => r.trainerId === currentTrainerId)
  }, [records, currentTrainerId])

  // Date filtering state for top metrics (Default: current year & current month)
  const [metricsYear, setMetricsYear] = useState(() => new Date().getFullYear())
  const [metricsMonth, setMetricsMonth] = useState(() => new Date().getMonth() + 1)

  // 1. Monthly total used sessions for current trainer in metricsYear & metricsMonth
  const monthlyLessonsCount = useMemo(() => {
    return myRecords.reduce((sum, r) => {
      const dateVal = r.sessionDate || (r as any).date
      if (!dateVal) return sum
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal)
      if (d.getFullYear() === metricsYear && (d.getMonth() + 1) === metricsMonth) {
        return sum + Number(r.sessionAmount || 1)
      }
      return sum
    }, 0)
  }, [myRecords, metricsYear, metricsMonth])

  // 2. Yearly total used sessions for current trainer in metricsYear
  const yearlyLessonsCount = useMemo(() => {
    return myRecords.reduce((sum, r) => {
      const dateVal = r.sessionDate || (r as any).date
      if (!dateVal) return sum
      const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal)
      if (d.getFullYear() === metricsYear) {
        return sum + Number(r.sessionAmount || 1)
      }
      return sum
    }, 0)
  }, [myRecords, metricsYear])

  // 3. Total remaining sessions across trainer's assigned customer contracts
  const totalRemainingLessonsCount = useMemo(() => {
    if (!currentTrainerId) return 0
    const myStudentIds = customers.filter(c => c.trainerId === currentTrainerId).map(c => c.id)
    const myContracts = venueContracts.filter(c => 
      myStudentIds.includes(c.customerId) || 
      myStudentIds.includes(c.primaryCustomerId) ||
      c.trainerId === currentTrainerId
    )
    return myContracts.reduce((sum, c) => {
      if (c.status === 'cancelled' || c.status === 'completed' || c.status === 'expired') return sum
      return sum + Number(c.remainingSessions || 0)
    }, 0)
  }, [customers, venueContracts, currentTrainerId])

  // Contract type filter state (all, single, dual, shared, group)
  const [contractTypeFilter, setContractTypeFilter] = useState<'all' | 'single' | 'dual' | 'shared' | 'group'>('all')

  // Sorting states for lesson records (Date, Student Name)
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Helper to determine contract type for a record
  const getRecordContractType = useCallback((r: LessonRecord) => {
    const contract = venueContracts.find(c => c.id === r.contractId)
    if (contract) {
      if (contract.contractType) return contract.contractType
      if (contract.groupMemberQuotas || contract.contractType === 'group') return 'group'
      if (contract.contractType === 'shared' || (Array.isArray(contract.customerIds) && contract.customerIds.length >= 3)) return 'shared'
      if (contract.contractType === 'dual' || !!contract.sharedWithCustomerId) return 'dual'
      return 'single'
    }
    const count = r.attendingCustomerIds?.length || 1
    if (count > 2) return 'group'
    if (count === 2) return 'dual'
    return 'single'
  }, [venueContracts])

  // Filter records by contract type
  const filteredRecords = useMemo(() => {
    return myRecords.filter(r => {
      if (contractTypeFilter === 'all') return true
      const cType = getRecordContractType(r)
      return cType === contractTypeFilter
    })
  }, [myRecords, contractTypeFilter, getRecordContractType])

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = a.sessionDate
          ? ((a.sessionDate as any).toMillis ? (a.sessionDate as any).toMillis() : new Date(a.sessionDate as any).getTime())
          : 0
        const timeB = b.sessionDate
          ? ((b.sessionDate as any).toMillis ? (b.sessionDate as any).toMillis() : new Date(b.sessionDate as any).getTime())
          : 0
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB
      } else {
        const nameA = a.attendingCustomerNames && a.attendingCustomerNames.length > 0
          ? a.attendingCustomerNames.join('、')
          : (a.customerName || '')
        const nameB = b.attendingCustomerNames && b.attendingCustomerNames.length > 0
          ? b.attendingCustomerNames.join('、')
          : (b.customerName || '')
        const cmp = nameA.localeCompare(nameB, 'zh-Hant')
        return sortOrder === 'desc' ? -cmp : cmp
      }
    })
  }, [filteredRecords, sortBy, sortOrder])

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

    const isDual = selectedContract?.contractType === 'dual'
    const isGroup = selectedContract?.contractType === 'group' || !!selectedContract?.groupMemberQuotas
    const isShared = selectedContract?.contractType === 'shared'

    let attendees = attendingCustomerIds
    if (isDual) {
      const dualPartners = Array.isArray(selectedContract?.customerIds) && selectedContract!.customerIds.length > 0
        ? selectedContract!.customerIds
        : [selectedContract!.customerId, selectedContract!.sharedWithCustomerId].filter(Boolean) as string[]
      attendees = dualPartners
      if (attendees.length < 2) {
        setSubmitError('雙人合約必須由 2 位學員同時出席')
        return
      }
    } else if (isGroup) {
      if (attendees.length === 0) {
        setSubmitError('團體合約請至少勾選一位實際出席學員')
        return
      }
    } else {
      // Single and Shared contract: 1-on-1 for the selected customer!
      attendees = [selectedCustomerId]
    }

    const perStudentSessionAmount = isDual ? 1 : (Number(sessionAmount) || 1)

    // Build per-student deductions
    const deductions = attendees.map(studentId => {
      const cust = customers.find(c => c.id === studentId)
      return {
        customerId: studentId,
        customerName: cust?.name || '',
        contractId: selectedContractId,
        sessionAmount: perStudentSessionAmount,
      }
    })

    const totalRecordSessionAmount = isDual
      ? 1
      : isGroup
      ? perStudentSessionAmount * attendees.length
      : perStudentSessionAmount

    if (selectedContract) {
      if (isGroup && selectedContract.groupMemberQuotas) {
        for (const studentId of attendees) {
          const cust = customers.find(c => c.id === studentId)
          const q = selectedContract.groupMemberQuotas[studentId]
          if (q && q.remainingSessions < perStudentSessionAmount) {
            setSubmitError(`學員 ${cust?.name || ''} 的個人剩餘堂數不足（現有 ${q.remainingSessions} 堂）`)
            return
          }
        }
      } else if (selectedContract.remainingSessions < totalRecordSessionAmount) {
        setSubmitError(`合約剩餘堂數不足（剩餘 ${selectedContract.remainingSessions} 堂，需要 ${totalRecordSessionAmount} 堂）`)
        return
      }
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
        sessionAmount: totalRecordSessionAmount,
        notes,
        attendingCustomerIds: attendees,
        deductions,
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
  const dualPartners = useMemo(() => {
    if (!selectedContract || selectedContract.contractType !== 'dual') return []
    const ids = Array.isArray(selectedContract.customerIds) && selectedContract.customerIds.length > 0
      ? selectedContract.customerIds
      : [selectedContract.customerId, selectedContract.sharedWithCustomerId].filter(Boolean) as string[]
    return customers.filter(c => ids.includes(c.id))
  }, [selectedContract, customers])

  // Group contract members
  const groupMembers = useMemo(() => {
    if (!selectedContract || (selectedContract.contractType !== 'group' && !selectedContract.groupMemberQuotas)) return []
    if (selectedContract.groupMemberQuotas) {
      const memberIds = Object.keys(selectedContract.groupMemberQuotas)
      return customers.filter(c => memberIds.includes(c.id))
    }
    const ids = selectedContract.customerIds || []
    return customers.filter(c => ids.includes(c.id))
  }, [selectedContract, customers])

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
    <div className="space-y-6 pb-28">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiCalendarCheckLine className="w-6 h-6 text-orange-500" />
            銷課紀錄
          </h1>
          <p className="text-xs text-stone-400 font-medium mt-0.5">{currentTrainerName} 的銷課記錄</p>
        </div>
        <button
          onClick={() => setIsRecording(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-2xl shadow-md shadow-orange-200 text-sm px-5 h-11 cursor-pointer font-bold transition-all duration-200"
        >
          <RiAddLine className="h-4 w-4" />
          新增銷課
        </button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">數據總覽</span>
          <div className="flex items-center gap-2">
            <select
              value={metricsYear}
              onChange={(e) => setMetricsYear(Number(e.target.value))}
              className="h-7 rounded-lg border border-stone-200 bg-stone-50 px-2 text-xs font-bold text-stone-700 focus:outline-none cursor-pointer"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>
            <select
              value={metricsMonth}
              onChange={(e) => setMetricsMonth(Number(e.target.value))}
              className="h-7 rounded-lg border border-stone-200 bg-stone-50 px-2 text-xs font-bold text-stone-700 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m} 月</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">本月堂數</p>
            <p className="text-3xl font-black text-stone-900 font-mono mt-1 tabular-nums">
              {monthlyLessonsCount}
              <span className="text-xs font-semibold text-stone-400 ml-1">堂</span>
            </p>
          </div>
          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">年度累計</p>
            <p className="text-3xl font-black text-stone-900 font-mono mt-1 tabular-nums">
              {yearlyLessonsCount}
              <span className="text-xs font-semibold text-stone-400 ml-1">堂</span>
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 shadow-xs">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">剩餘堂數</p>
            <p className="text-3xl font-black text-emerald-600 font-mono mt-1 tabular-nums">
              {totalRemainingLessonsCount}
              <span className="text-xs font-semibold text-emerald-400 ml-1">堂</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Records List ── */}
      <div className="space-y-3">
        {/* List Header with filters */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">
            銷課紀錄 ({sortedRecords.length})
          </span>
          <div className="flex items-center gap-2">
            <select
              value={contractTypeFilter}
              onChange={(e) => setContractTypeFilter(e.target.value as any)}
              className="h-7 rounded-lg border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-700 focus:outline-none cursor-pointer"
            >
              <option value="all">全部類型</option>
              <option value="single">單人</option>
              <option value="dual">雙人</option>
              <option value="shared">共享</option>
              <option value="group">團體</option>
            </select>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-') as ['date' | 'name', 'asc' | 'desc']
                setSortBy(field)
                setSortOrder(order)
              }}
              className="h-7 rounded-lg border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-700 focus:outline-none cursor-pointer"
            >
              <option value="date-desc">最新在前</option>
              <option value="date-asc">最舊在前</option>
              <option value="name-asc">學員 A→Z</option>
              <option value="name-desc">學員 Z→A</option>
            </select>
          </div>
        </div>

        {/* Cards */}
        {recordsLoading ? (
          <div className="py-16 text-center text-stone-400 text-sm animate-pulse">載入中...</div>
        ) : sortedRecords.length > 0 ? (
          <div className="space-y-2">
            {sortedRecords.slice(0, 50).map((record) => {
              const trainerName = trainers.find(t => t.id === record.trainerId)?.name || '—'
              const attendingNames = record.attendingCustomerNames && record.attendingCustomerNames.length > 0
                ? record.attendingCustomerNames.join('、')
                : record.customerName
              const isSubstituteRecord = record.contractTrainerId && record.contractTrainerId !== record.trainerId
              const isSelected = selectedRecord?.id === record.id

              const cType = getRecordContractType(record)
              const badgeMap = {
                group:  { label: '團體', cls: 'bg-emerald-100 text-emerald-700' },
                shared: { label: '共享', cls: 'bg-amber-100 text-amber-700' },
                dual:   { label: '雙人', cls: 'bg-purple-100 text-purple-700' },
                single: { label: '單人', cls: 'bg-blue-100 text-blue-700' },
              }
              const badge = badgeMap[cType as keyof typeof badgeMap] || badgeMap.single

              const targetCustId = record.customerId || (record.attendingCustomerIds && record.attendingCustomerIds[0])
              const cumSessions = (records || []).filter(l =>
                (l.customerId === targetCustId || (l.attendingCustomerIds && l.attendingCustomerIds.includes(targetCustId)))
              ).reduce((sum, l) => {
                const attendeeCount = Array.isArray(l.attendingCustomerIds) && l.attendingCustomerIds.length > 0 ? l.attendingCustomerIds.length : 1
                if (Array.isArray(l.deductions) && l.deductions.length > 0) {
                  const custDed = l.deductions.find((d: any) => d.customerId === targetCustId)
                  if (custDed) {
                    const amt = typeof custDed.sessionAmount === 'number' ? custDed.sessionAmount : (typeof custDed.amount === 'number' ? custDed.amount : 0)
                    if (amt > 0) {
                      if (attendeeCount > 1 && amt === l.sessionAmount && l.sessionAmount > 1) {
                        return sum + Math.max(1, Math.round(l.sessionAmount / attendeeCount))
                      }
                      return sum + amt
                    }
                  }
                }
                if (attendeeCount > 1 && typeof l.sessionAmount === 'number' && l.sessionAmount > 1) {
                  return sum + Math.max(1, Math.round(l.sessionAmount / attendeeCount))
                }
                return sum + Number(l.sessionAmount || 1)
              }, 0)

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
                    "bg-white rounded-2xl border p-4 cursor-pointer transition-all duration-200 active:scale-[0.99]",
                    isSelected
                      ? "border-orange-300 shadow-md shadow-orange-100 ring-1 ring-orange-300/50"
                      : "border-stone-100 shadow-xs hover:border-stone-200 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center shrink-0">
                        <span className="text-sm font-black text-orange-600">
                          {(attendingNames || '—').charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-stone-900 text-sm truncate">{attendingNames}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {isSubstituteRecord && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">代課</span>
                          )}
                          <span className="text-[10px] text-stone-400 font-medium">{trainerName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-lg font-black text-orange-500 tabular-nums leading-none">
                        -{record.sessionAmount}
                        <span className="text-xs font-semibold text-stone-400 ml-0.5">堂</span>
                      </span>
                      <span className="text-[10px] text-stone-400 mt-1">{formatRecordDate(record.sessionDate)}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-stone-50 flex items-center justify-between">
                    <span className="text-[11px] text-stone-400">累計已銷</span>
                    <span className="text-xs font-bold text-stone-600 font-mono">{cumSessions} 堂</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center mx-auto mb-4">
              <RiCalendarCheckLine className="w-7 h-7 text-stone-300" />
            </div>
            <p className="text-sm font-semibold text-stone-400">尚無銷課紀錄</p>
            <p className="text-xs text-stone-300 mt-1">點擊右上角「新增銷課」開始記錄</p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          Lesson Recording Drawer (Bottom Sheet)
      ═══════════════════════════════════════════ */}
      {/* Backdrop */}
      <div
        onClick={handleCancel}
        style={{
          opacity: isRecording ? 1 : 0,
          pointerEvents: isRecording ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
      />

      {/* Drawer */}
      <div
        style={{
          transform: isRecording ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh]"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-stone-200 rounded-full" />
        </div>

        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={handleBack}
                className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <RiArrowLeftLine className="w-4 h-4 text-stone-600" />
              </button>
            )}
            <div>
              <h2 className="text-base font-black text-stone-900">
                {step === 1 ? '選擇學員' : `確認銷課 · ${selectedCustomer?.name}`}
              </h2>
              <p className="text-[11px] text-stone-400 font-medium mt-0.5">
                {step === 1 ? '步驟 1 / 2' : '步驟 2 / 2'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <RiCloseLine className="w-4 h-4 text-stone-600" />
          </button>
        </div>

        {/* Step Progress */}
        <div className="flex gap-1.5 px-5 py-2 shrink-0">
          <div className="h-1 flex-1 rounded-full bg-orange-500 transition-all" />
          <div className={cn("h-1 flex-1 rounded-full transition-all duration-300", step === 2 ? "bg-orange-500" : "bg-stone-200")} />
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 ? (
            /* ═══ Step 1: Select Customer ═══ */
            <div className="px-5 pt-4 pb-6 space-y-4">

              {/* Mode Tabs */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEntryMode('regular')
                    setSelectedSubstitutedTrainerId('')
                  }}
                  className={cn(
                    "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border",
                    entryMode === 'regular'
                      ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                      : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                  )}
                >
                  <RiUser3Line className="w-3.5 h-3.5" />
                  一般銷課
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('substitute')}
                  className={cn(
                    "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border",
                    entryMode === 'substitute'
                      ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                      : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                  )}
                >
                  <RiUserSharedLine className="w-3.5 h-3.5" />
                  代課銷課
                </button>
              </div>

              {/* Substitute trainer selector */}
              {entryMode === 'substitute' && (
                <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl space-y-2">
                  <Label className="text-amber-800 font-bold text-xs flex items-center gap-1.5">
                    <RiUserSharedLine className="w-3.5 h-3.5" />
                    選擇被代課的教練
                  </Label>
                  <select
                    value={selectedSubstitutedTrainerId}
                    onChange={(e) => setSelectedSubstitutedTrainerId(e.target.value)}
                    className="w-full bg-white border border-amber-300 text-stone-900 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="">— 請選擇被代課的教練 —</option>
                    {trainers.filter((t) => t.id !== currentTrainerId).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜尋學員姓名或電話..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 text-sm placeholder:text-stone-400"
                  autoFocus
                />
                <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                {customerSearch && (
                  <button
                    onClick={() => setCustomerSearch('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    <RiCloseLine className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Customer List */}
              {entryMode === 'substitute' && !selectedSubstitutedTrainerId ? (
                <div className="py-12 text-center text-stone-400 text-xs space-y-2">
                  <RiUserSharedLine className="w-8 h-8 text-amber-400 mx-auto" />
                  <p>請先選擇「被代課的教練」</p>
                </div>
              ) : filteredAndSortedCustomers.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] text-stone-400 font-semibold">
                      {entryMode === 'substitute' && selectedSubstitutedTrainerId
                        ? `${trainers.find(t => t.id === selectedSubstitutedTrainerId)?.name} 的學員`
                        : customerSearch.trim() ? '搜尋結果' : '我的學員'}
                    </span>
                    <span className="text-[11px] text-stone-400">{filteredAndSortedCustomers.length} 位</span>
                  </div>
                  {filteredAndSortedCustomers.map((cust) => {
                    const contractInfo = customerContractMap.get(cust.id)
                    const hasActiveContract = contractInfo && contractInfo.remainingTotal > 0

                    return (
                      <button
                        key={cust.id}
                        onClick={() => handleSelectCustomer(cust)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left cursor-pointer transition-all active:scale-[0.98] group",
                          hasActiveContract
                            ? "bg-white border-orange-100 hover:border-orange-300 hover:shadow-sm shadow-xs"
                            : "bg-stone-50/60 border-stone-100 hover:bg-white hover:border-stone-200"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl font-black text-sm flex items-center justify-center shrink-0 transition-all",
                          hasActiveContract
                            ? "bg-orange-100 text-orange-600 group-hover:bg-orange-500 group-hover:text-white"
                            : "bg-stone-200 text-stone-500"
                        )}>
                          {cust.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-stone-900 text-sm">{cust.name}</div>
                          <div className="text-xs text-stone-400 mt-0.5">{cust.phone || '—'}</div>
                        </div>
                        {hasActiveContract && (
                          <span className="shrink-0 text-[11px] font-bold text-orange-600 bg-orange-50 border border-orange-200/80 rounded-lg px-2 py-1">
                            剩 {contractInfo.remainingTotal} 堂
                          </span>
                        )}
                        <RiArrowRightSLine className="h-4 w-4 text-stone-300 group-hover:text-orange-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-stone-400 text-sm space-y-1">
                  <RiSearchLine className="w-7 h-7 text-stone-300 mx-auto" />
                  <p className="font-medium">找不到相符學員</p>
                </div>
              )}
            </div>
          ) : (
            /* ═══ Step 2: Form Details ═══ */
            <div className="px-5 pt-4 pb-6 space-y-5">

              {/* Student Info Banner */}
              <div className="flex items-center gap-3 p-3.5 bg-orange-50 border border-orange-100 rounded-2xl">
                <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shrink-0">
                  <span className="text-sm font-black text-white">
                    {selectedCustomer?.name?.charAt(0) || '?'}
                  </span>
                </div>
                <div>
                  <p className="font-black text-stone-900 text-sm">{selectedCustomer?.name}</p>
                  <p className="text-xs text-stone-400">{selectedCustomer?.phone || '—'}</p>
                </div>
              </div>

              {/* Select Contract */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest block">選擇合約</Label>
                {contractsLoading ? (
                  <div className="py-6 text-center text-xs text-stone-400 animate-pulse">載入合約中...</div>
                ) : contracts.length > 0 ? (
                  <div className="space-y-2">
                    {contracts.map((contract) => {
                      const isSelected = selectedContractId === contract.id
                      const typeMap = { group: '團體', shared: '共享', dual: '雙人', single: '單人' }
                      const typeLabel = typeMap[contract.contractType as keyof typeof typeMap] || '單人'
                      const typeColorMap = {
                        group:  'from-emerald-400 to-teal-400',
                        shared: 'from-amber-400 to-orange-400',
                        dual:   'from-purple-400 to-violet-400',
                        single: 'from-blue-400 to-sky-400',
                      }
                      const typeColor = typeColorMap[contract.contractType as keyof typeof typeColorMap] || typeColorMap.single
                      const pct = contract.totalSessions > 0
                        ? Math.min(100, (contract.remainingSessions / contract.totalSessions) * 100)
                        : 0

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
                          className={cn(
                            "w-full text-left rounded-2xl border p-3.5 cursor-pointer transition-all active:scale-[0.99]",
                            isSelected
                              ? "border-orange-400 bg-orange-50/50 shadow-sm ring-1 ring-orange-300/40"
                              : "border-stone-100 bg-white hover:border-stone-200 hover:shadow-xs"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2.5">
                            <div>
                              <div className="font-bold text-stone-900 text-sm">{contract.contractNo || '未命名合約'}</div>
                              <span className={`inline-block mt-0.5 text-[10px] font-bold text-white bg-gradient-to-r ${typeColor} px-2 py-0.5 rounded-md`}>
                                {typeLabel}合約
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xl font-black text-stone-900 tabular-nums leading-none">
                                {contract.remainingSessions}
                              </div>
                              <div className="text-[10px] text-stone-400">/ {contract.totalSessions} 堂</div>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${typeColor} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {isSelected && (
                            <div className="flex items-center justify-end mt-2">
                              <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600">
                                <RiCheckLine className="h-3 w-3" />
                                已選擇
                              </span>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-2">
                    <RiAlertLine className="h-4 w-4 shrink-0" />
                    <span>該學員沒有可用的有效合約，請聯絡管理員新增。</span>
                  </div>
                )}
              </div>

              {/* Contract-specific attendee info */}
              {selectedContract && (
                <div className="space-y-2">
                  {selectedContract.contractType === 'dual' ? (
                    <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[11px] font-bold text-purple-700 uppercase tracking-widest">雙人出席成員</Label>
                        <span className="text-[10px] font-bold text-purple-500 bg-purple-100 px-2 py-0.5 rounded-md">固定扣 1 堂</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {dualPartners.map(partner => (
                          <div key={partner.id} className="flex items-center gap-1.5 bg-white border border-purple-200 rounded-xl px-3 py-1.5">
                            <RiUser3Line className="w-3.5 h-3.5 text-purple-500" />
                            <span className="text-xs font-bold text-purple-900">{partner.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (selectedContract.contractType === 'group' || selectedContract.groupMemberQuotas) ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">勾選實際出席學員</Label>
                        <span className="text-[10px] font-medium text-emerald-600">{attendingCustomerIds.length} 位出席</span>
                      </div>
                      <div className="space-y-1.5">
                        {groupMembers.map(member => {
                          const isAttending = attendingCustomerIds.includes(member.id)
                          return (
                            <label
                              key={member.id}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all",
                                isAttending
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white border border-emerald-100 text-stone-600 hover:border-emerald-200"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isAttending}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setAttendingCustomerIds([...attendingCustomerIds, member.id])
                                  } else {
                                    setAttendingCustomerIds(attendingCustomerIds.filter(id => id !== member.id))
                                  }
                                }}
                                className="sr-only"
                              />
                              <div className={cn(
                                "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                                isAttending ? "bg-white border-white" : "border-stone-300"
                              )}>
                                {isAttending && <RiCheckLine className="w-3 h-3 text-emerald-600" />}
                              </div>
                              <span className="text-sm font-bold">{member.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ) : selectedContract.contractType === 'shared' ? (
                    <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-2xl">
                      <RiUserLine className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-900">共享合約 · 一對一獨立銷課</p>
                        <p className="text-[10px] text-amber-600 mt-0.5">僅對 {selectedCustomer?.name} 進行銷課</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Trainer info */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest block">授課教練</Label>
                {currentTrainerId ? (
                  <div className="flex items-center gap-2.5 p-3 bg-stone-50 border border-stone-200 rounded-xl">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <RiUser3Line className="w-4 h-4 text-orange-600" />
                    </div>
                    <span className="font-bold text-stone-900 text-sm flex-1">{currentTrainerName}</span>
                    <span className="text-[10px] text-stone-400 flex items-center gap-1">
                      <RiLockLine className="w-3 h-3" />登入教練
                    </span>
                  </div>
                ) : trainersLoading ? (
                  <div className="text-xs text-stone-400 animate-pulse p-3">載入教練中...</div>
                ) : (
                  <select
                    value={selectedTrainerId}
                    onChange={(e) => setSelectedTrainerId(e.target.value)}
                    className="w-full bg-white border border-stone-200 text-stone-900 px-3.5 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/40 cursor-pointer font-medium"
                  >
                    <option value="">— 請選擇教練 —</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}
                {isSubstituteTeaching && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
                    <RiInformationLine className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span>與合約原教練（{contractPrimaryTrainer?.name || '—'}）不同，將建立為「代課紀錄」。</span>
                  </div>
                )}
              </div>

              {/* Date & Sessions grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest block">上課日期</Label>
                  <Input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="h-11 bg-white border-stone-200 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest block">
                    {selectedContract?.contractType === 'group' ? '每人堂數' : '扣堂數'}
                  </Label>
                  <div className="relative">
                    {selectedContract?.contractType === 'dual' ? (
                      <Input
                        type="number"
                        value={1}
                        disabled
                        className="h-11 bg-stone-50 border-stone-200 rounded-xl text-stone-500 font-bold cursor-not-allowed pr-12"
                      />
                    ) : (
                      <Input
                        type="number"
                        min="1"
                        max={selectedContract ? selectedContract.remainingSessions : 100}
                        value={sessionAmount}
                        onChange={(e) => setSessionAmount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="h-11 bg-white border-stone-200 rounded-xl text-sm font-bold pr-12"
                      />
                    )}
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 pointer-events-none">
                      {selectedContract?.contractType === 'dual' ? '固定' : selectedContract?.contractType === 'group' ? '/ 人' : '堂'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-stone-500 uppercase tracking-widest block">課程備註</Label>
                <Textarea
                  placeholder="課程筆記、學員狀況... (選填)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-white border-stone-200 rounded-xl min-h-[80px] text-sm resize-none"
                />
              </div>

              {/* Error */}
              {submitError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <RiAlertLine className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer — only show on step 2 */}
        {step === 2 && (
          <div className="px-5 py-4 border-t border-stone-100 bg-white shrink-0">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedContractId || !selectedTrainerId}
              className="w-full h-12 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-200 disabled:text-stone-400 text-white font-black rounded-2xl text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-orange-200 disabled:shadow-none"
            >
              {submitting ? (
                <>
                  <RiLoader4Line className="h-4 w-4 animate-spin" />
                  儲存中...
                </>
              ) : (
                <>
                  <RiCheckLine className="h-4 w-4" />
                  確認銷課
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          Record Detail Side Panel
      ═══════════════════════════════════════════ */}
      {selectedRecord && (() => {
        const r = selectedRecord
        const trainerName = trainers.find(t => t.id === r.trainerId)?.name || '—'
        const attendingNames = r.attendingCustomerNames && r.attendingCustomerNames.length > 0
          ? r.attendingCustomerNames.join('、')
          : r.customerName
        const isSubstituteRecord = r.contractTrainerId && r.contractTrainerId !== r.trainerId
        const contractTrainerName = r.contractTrainerId
          ? trainers.find(t => t.id === r.contractTrainerId)?.name
          : null
        const contract = venueContracts.find(c => c.id === r.contractId)
        const isGroup = contract ? (contract.contractType === 'group' || !!contract.groupMemberQuotas) : false
        const isShared = contract ? (contract.contractType === 'shared' || (Array.isArray(contract.customerIds) && contract.customerIds.length >= 3 && contract.contractType !== 'group')) : false
        const isDual = contract ? (!isGroup && !isShared && (contract.contractType === 'dual' || (!!contract.sharedWithCustomerId && contract.contractType !== 'shared'))) : false

        return (
          <div
            ref={panelRef}
            style={{
              transform: isPanelVisible ? 'translateX(0)' : 'translateX(100%)',
              opacity: isPanelVisible ? 1 : 0,
              transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease',
            }}
            className="fixed top-0 right-0 h-full w-full sm:w-[360px] bg-white border-l border-stone-200 shadow-2xl z-50 flex flex-col"
          >
            {/* Panel Header */}
            <div className="px-5 py-5 border-b border-stone-100 bg-gradient-to-br from-stone-50 to-white flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">銷課紀錄</p>
                <h3 className="text-lg font-black text-stone-900 leading-tight">{attendingNames}</h3>
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
                className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors shrink-0"
              >
                <RiCloseLine className="h-4 w-4 text-stone-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Sessions hero */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100 rounded-2xl p-5 text-center">
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2">扣堂數</p>
                <p className="text-5xl font-black text-orange-500 tabular-nums leading-none">-{r.sessionAmount}</p>
                <p className="text-xs text-orange-300 font-bold mt-2">堂</p>
              </div>

              {/* Detail rows */}
              <div className="bg-stone-50 rounded-2xl border border-stone-100 divide-y divide-stone-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-xs font-bold text-stone-400">上課日期</span>
                  <span className="text-sm font-bold text-stone-800">
                    {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy/MM/dd') : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-xs font-bold text-stone-400">上課時間</span>
                  <span className="text-sm font-bold text-stone-800">
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
                {contract && (
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-xs font-bold text-stone-400">合約類型</span>
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold",
                      isGroup ? "bg-emerald-100 text-emerald-700" :
                      isShared ? "bg-amber-100 text-amber-700" :
                      isDual ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {isGroup ? '團體合約' : isShared ? '共享合約' : isDual ? '雙人合約' : '單人合約'}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {r.notes && (
                <div>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-2">課程備註</p>
                  <div className="bg-stone-50 rounded-xl border border-stone-100 px-4 py-3">
                    <p className="text-sm text-stone-700 leading-relaxed">{r.notes}</p>
                  </div>
                </div>
              )}

              {/* Attending list */}
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

      {/* Record panel backdrop */}
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
  )
}
