import React, { useState, useMemo, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { format } from 'date-fns'
import type { Customer, Contract, LessonRecord, Trainer } from '../../types'
import { 
  RiGroupLine, 
  RiUser3Line, 
  RiMailLine, 
  RiPhoneLine, 
  RiBookOpenLine, 
  RiDeleteBinLine, 
  RiEditLine, 
  RiAddLine,
  RiTimeLine,
  RiMoneyDollarCircleLine,
  RiCloseLine,
  RiCalendarLine,
  RiUserLine,
  RiFileTextLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiPieChartLine
} from '@remixicon/react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'

interface TrainerWithMetrics extends Trainer {
  systemLessons?: number
  totalUsedLessons?: number
}

interface TrainerDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trainer: TrainerWithMetrics | null
  records: LessonRecord[]
  customers: Customer[]
  contracts: Contract[]
  trainers: Trainer[]
  selectedMonth: string
  onDeleteTrainer?: (trainerId: string) => void
  onCreateLesson: (trainerId: string) => void
  onEditLesson: (record: LessonRecord) => void
  onDeleteLesson: (recordId: string) => void
}

export function TrainerDetailsModal({
  open,
  onOpenChange,
  trainer,
  records,
  customers,
  contracts,
  trainers,
  selectedMonth,
  onDeleteTrainer,
  onCreateLesson,
  onEditLesson,
  onDeleteLesson,
}: TrainerDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<'history' | 'students'>('history')
  const [selectedRecord, setSelectedRecord] = useState<LessonRecord | null>(null)
  const [isPanelVisible, setIsPanelVisible] = useState(false)

  // Sorting states for lesson records (Date, Student Name)
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Breakdown expandable state ('period' | 'cumulative' | 'remaining' | null)
  const [expandedMetric, setExpandedMetric] = useState<'period' | 'cumulative' | 'remaining' | null>(null)

  // Get assigned students for this trainer
  const trainerStudents = useMemo(() => {
    if (!trainer) return []
    return customers.filter(c => c.trainerId === trainer.id)
  }, [customers, trainer])

  const trainerStudentIds = useMemo(() => {
    return trainerStudents.map(c => c.id)
  }, [trainerStudents])

  // Find lesson records belonging to this trainer
  const trainerLessons = useMemo(() => {
    if (!trainer) return []
    return records.filter(lr => lr.trainerId === trainer.id)
  }, [records, trainer])

  // Filter lessons by selected month if needed
  const filteredLessons = useMemo(() => {
    return selectedMonth === 'all'
      ? trainerLessons
      : trainerLessons.filter(lr => lr.sessionDate && format(lr.sessionDate.toDate(), 'yyyy/MM') === selectedMonth)
  }, [trainerLessons, selectedMonth])

  const sortedFilteredLessons = useMemo(() => {
    return [...filteredLessons].sort((a, b) => {
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
  }, [filteredLessons, sortBy, sortOrder])

  const calculateBreakdown = useCallback((lessonList: LessonRecord[]) => {
    const categories = {
      single: { nominal: 0, actual: 0 },
      dual:   { nominal: 0, actual: 0 },
      shared: { nominal: 0, actual: 0 },
      group:  { nominal: 0, actual: 0 },
    }

    lessonList.forEach(r => {
      const contract = contracts.find(c => c.id === r.contractId)
      let cType: 'single' | 'dual' | 'shared' | 'group' = 'single'
      if (contract) {
        if (contract.contractType === 'group' || !!contract.groupMemberQuotas) cType = 'group'
        else if (contract.contractType === 'shared' || (Array.isArray(contract.customerIds) && contract.customerIds.length >= 3 && contract.contractType !== 'group')) cType = 'shared'
        else if (contract.contractType === 'dual' || (!!contract.sharedWithCustomerId && contract.contractType !== 'shared')) cType = 'dual'
        else cType = 'single'
      } else {
        const count = r.attendingCustomerIds?.length || 1
        if (count > 2) cType = 'group'
        else if (count === 2) cType = 'dual'
        else cType = 'single'
      }

      const attendeeCount = Array.isArray(r.attendingCustomerIds) && r.attendingCustomerIds.length > 0
        ? r.attendingCustomerIds.length
        : 1
      
      // 名目銷課堂數：依上課人數計算，例如 3 人一起上課 = 3 堂
      const nominalSessions = Number(r.sessionAmount || attendeeCount || 1)
      // 實際銷課堂數：一次團體課不論幾人上課皆算 1 堂
      const actualSessions = 1

      categories[cType].nominal += nominalSessions
      categories[cType].actual += actualSessions
    })

    const totalNominal = Object.values(categories).reduce((sum, c) => sum + c.nominal, 0)
    const totalActual = Object.values(categories).reduce((sum, c) => sum + c.actual, 0)

    return { categories, totalNominal, totalActual }
  }, [contracts])

  const periodBreakdown = useMemo(() => calculateBreakdown(filteredLessons), [calculateBreakdown, filteredLessons])
  const cumulativeBreakdown = useMemo(() => calculateBreakdown(trainerLessons), [calculateBreakdown, trainerLessons])

  const remainingBreakdown = useMemo(() => {
    const categories = {
      single: { nominal: 0, actual: 0 },
      dual:   { nominal: 0, actual: 0 },
      shared: { nominal: 0, actual: 0 },
      group:  { nominal: 0, actual: 0 },
    }

    if (!trainer) return { categories, totalNominal: 0, totalActual: 0 }

    const studentIds = customers.filter(c => c.trainerId === trainer.id).map(c => c.id)
    const trainerContracts = contracts.filter(c => 
      studentIds.includes(c.customerId) || 
      studentIds.includes(c.primaryCustomerId) ||
      c.trainerId === trainer.id
    )

    trainerContracts.forEach(c => {
      if (c.status === 'cancelled' || c.status === 'completed' || c.status === 'expired') return
      const rem = Number(c.remainingSessions || 0)
      if (rem <= 0) return

      let cType: 'single' | 'dual' | 'shared' | 'group' = 'single'
      if (c.contractType === 'group' || !!c.groupMemberQuotas) cType = 'group'
      else if (c.contractType === 'shared' || (Array.isArray(c.customerIds) && c.customerIds.length >= 3 && c.contractType !== 'group')) cType = 'shared'
      else if (c.contractType === 'dual' || (!!c.sharedWithCustomerId && c.contractType !== 'shared')) cType = 'dual'
      else cType = 'single'

      let nominalRem = rem
      let actualRem = rem

      if (cType === 'group') {
        const memberCount = Math.max(
          1,
          c.groupMemberQuotas
            ? Object.keys(c.groupMemberQuotas).length
            : (Array.isArray(c.customerIds) && c.customerIds.length > 0 ? c.customerIds.length : (c.maxAttendees || 3))
        )
        nominalRem = memberCount * rem
      }

      if (categories[cType]) {
        categories[cType].nominal += nominalRem
        categories[cType].actual += actualRem
      }
    })

    const totalNominal = Object.values(categories).reduce((sum, c) => sum + c.nominal, 0)
    const totalActual = Object.values(categories).reduce((sum, c) => sum + c.actual, 0)

    return { categories, totalNominal, totalActual }
  }, [contracts, customers, trainer])

  if (!trainer) return null

  // Helper to get contracts for a specific student
  const getStudentContracts = (studentId: string) => {
    return contracts.filter(con => 
      (con.customerIds && con.customerIds.includes(studentId)) || 
      con.customerId === studentId ||
      con.primaryCustomerId === studentId ||
      con.sharedWithCustomerId === studentId
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl h-full p-0 flex flex-col bg-stone-50 overflow-hidden border-l border-stone-200">
        <SheetHeader className="sr-only">
          <SheetTitle>教練詳細資訊 - {trainer.name}</SheetTitle>
          <SheetDescription>檢視教練銷課明細與專屬學員名單</SheetDescription>
        </SheetHeader>

        {/* ── Header ── */}
        <div className="bg-white border-b border-stone-100 shrink-0">
          {/* Top accent strip */}
          <div className="h-1 bg-gradient-to-r from-stone-900 via-stone-700 to-stone-500" />

          <div className="px-6 py-5 pr-14">
            <div className="flex items-start justify-between gap-4">
              {/* Avatar + Name */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-stone-900 flex items-center justify-center text-white text-xl font-black shadow-lg shrink-0">
                  {trainer.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-stone-900 leading-tight">{trainer.name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-stone-400 flex-wrap">
                    {trainer.email && (
                      <span className="flex items-center gap-1 truncate max-w-[180px]">
                        <RiMailLine className="w-3.5 h-3.5 shrink-0" />
                        {trainer.email}
                      </span>
                    )}
                    {trainer.phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <RiPhoneLine className="w-3.5 h-3.5" />
                        {trainer.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0 self-start">
                {onDeleteTrainer && (
                  <button
                    onClick={() => { onOpenChange(false); onDeleteTrainer(trainer.id) }}
                    className="p-2 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="刪除教練"
                  >
                    <RiDeleteBinLine className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onCreateLesson(trainer.id)}
                  className="flex items-center gap-1.5 text-xs font-bold bg-stone-900 hover:bg-stone-700 text-white px-3.5 py-2 rounded-xl transition-colors shadow-sm"
                >
                  <RiAddLine className="w-4 h-4" /> 新增銷課
                </button>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-stone-100">
              {/* Card 1: 本月/期間銷課 */}
              <div
                onClick={() => setExpandedMetric(prev => prev === 'period' ? null : 'period')}
                className={cn(
                  "text-center p-2.5 rounded-xl transition-all cursor-pointer relative group border select-none",
                  expandedMetric === 'period' ? "bg-orange-50 border-orange-200 shadow-xs" : "border-stone-100 hover:border-orange-200 bg-white"
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest truncate">
                    {selectedMonth === 'all' ? '期間銷課' : '本月銷課'}
                  </p>
                  <RiArrowDownSLine className={cn("w-3 h-3 transition-transform text-orange-500 shrink-0", expandedMetric === 'period' && "rotate-180")} />
                </div>
                <p className="text-base font-black text-stone-900 tabular-nums mt-0.5">
                  {periodBreakdown.totalActual} <span className="text-xs font-semibold text-stone-400">堂</span>
                </p>
                <span className="text-[9px] text-orange-600 font-bold block mt-0.5 truncate">
                  {expandedMetric === 'period' ? '收起 Breakdown' : '點擊展開'}
                </span>
              </div>

              {/* Card 2: 教練累積銷課 */}
              <div
                onClick={() => setExpandedMetric(prev => prev === 'cumulative' ? null : 'cumulative')}
                className={cn(
                  "text-center p-2.5 rounded-xl transition-all cursor-pointer relative group border select-none",
                  expandedMetric === 'cumulative' ? "bg-orange-50 border-orange-200 shadow-xs" : "border-stone-100 hover:border-orange-200 bg-white"
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest truncate">
                    教練累積銷課
                  </p>
                  <RiArrowDownSLine className={cn("w-3 h-3 transition-transform text-orange-500 shrink-0", expandedMetric === 'cumulative' && "rotate-180")} />
                </div>
                <p className="text-base font-black text-stone-900 tabular-nums mt-0.5">
                  {cumulativeBreakdown.totalActual} <span className="text-xs font-semibold text-stone-400">堂</span>
                </p>
                <span className="text-[9px] text-orange-600 font-bold block mt-0.5 truncate">
                  {expandedMetric === 'cumulative' ? '收起 Breakdown' : '點擊展開'}
                </span>
              </div>

              {/* Card 3: 系統剩餘堂數 */}
              <div
                onClick={() => setExpandedMetric(prev => prev === 'remaining' ? null : 'remaining')}
                className={cn(
                  "text-center p-2.5 rounded-xl transition-all cursor-pointer relative group border select-none",
                  expandedMetric === 'remaining' ? "bg-emerald-50 border-emerald-200 shadow-xs" : "border-stone-100 hover:border-emerald-200 bg-white"
                )}
              >
                <div className="flex items-center justify-center gap-1">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest truncate">系統剩餘堂數</p>
                  <RiArrowDownSLine className={cn("w-3 h-3 transition-transform text-emerald-500 shrink-0", expandedMetric === 'remaining' && "rotate-180")} />
                </div>
                <p className="text-base font-black text-stone-900 tabular-nums mt-0.5">
                  {remainingBreakdown.totalActual || trainer.systemLessons || 0} <span className="text-xs font-semibold text-stone-400">堂</span>
                </p>
                <span className="text-[9px] text-emerald-600 font-bold block mt-0.5 truncate">
                  {expandedMetric === 'remaining' ? '收起 Breakdown' : '點擊展開'}
                </span>
              </div>

              {/* Card 4: 專屬學員人數 */}
              <div className="text-center p-2.5 rounded-xl border border-stone-100 bg-white">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5 truncate">專屬學員人數</p>
                <p className="text-base font-black text-stone-900 tabular-nums">
                  {trainerStudentIds.length} <span className="text-xs font-semibold text-stone-400">人</span>
                </p>
              </div>
            </div>

            {/* Breakdown Expanded Section */}
            {expandedMetric && (() => {
              const bd = expandedMetric === 'period'
                ? periodBreakdown
                : expandedMetric === 'cumulative'
                ? cumulativeBreakdown
                : remainingBreakdown

              const titleText = expandedMetric === 'period'
                ? `${selectedMonth === 'all' ? '全期篩選' : selectedMonth} 銷課合約類別 Breakdown`
                : expandedMetric === 'cumulative'
                ? '教練全期累積銷課合約類別 Breakdown'
                : '進行中合約 系統剩餘堂數 Breakdown'

              return (
                <div className={cn(
                  "mt-3 border rounded-xl p-3.5 space-y-2.5 animate-in fade-in duration-200",
                  expandedMetric === 'remaining' ? "bg-emerald-50/60 border-emerald-200" : "bg-stone-50 border-orange-200"
                )}>
                  <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
                    <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <RiPieChartLine className={cn("w-3.5 h-3.5", expandedMetric === 'remaining' ? "text-emerald-500" : "text-orange-500")} />
                      {titleText}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpandedMetric(null)}
                      className="text-stone-400 hover:text-stone-600 text-[10px] font-bold cursor-pointer"
                    >
                      關閉
                    </button>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="grid grid-cols-[1fr_80px_80px] gap-2 font-bold text-[10px] text-stone-400 uppercase border-b border-stone-200/40 pb-1">
                      <span>合約類別</span>
                      <span className="text-center">{expandedMetric === 'remaining' ? '名目剩餘' : '名目堂數'}</span>
                      <span className="text-center">{expandedMetric === 'remaining' ? '實際剩餘' : '實際銷課'}</span>
                    </div>
                    {[
                      { key: 'single', label: '單人合約', badgeCls: 'bg-blue-100 text-blue-700' },
                      { key: 'dual',   label: '雙人合約', badgeCls: 'bg-purple-100 text-purple-700' },
                      { key: 'shared', label: '共享合約', badgeCls: 'bg-amber-100 text-amber-700' },
                      { key: 'group',  label: '團體合約', badgeCls: 'bg-emerald-100 text-emerald-700' },
                    ].map(cat => {
                      const data = bd.categories[cat.key as keyof typeof bd.categories]
                      return (
                        <div key={cat.key} className="grid grid-cols-[1fr_80px_80px] gap-2 items-center text-xs">
                          <div>
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", cat.badgeCls)}>
                              {cat.label}
                            </span>
                          </div>
                          <span className="text-center font-mono font-bold text-stone-800">{data.nominal} 堂</span>
                          <span className={cn("text-center font-mono font-black", expandedMetric === 'remaining' ? "text-emerald-600" : "text-orange-600")}>
                            {data.actual} 堂
                          </span>
                        </div>
                      )
                    })}
                    <div className="grid grid-cols-[1fr_80px_80px] gap-2 items-center text-xs pt-1.5 border-t border-stone-200 font-bold">
                      <span className="text-stone-900">總計</span>
                      <span className="text-center font-mono text-stone-900">{bd.totalNominal} 堂</span>
                      <span className={cn("text-center font-mono font-black", expandedMetric === 'remaining' ? "text-emerald-600" : "text-orange-600")}>
                        {bd.totalActual} 堂
                      </span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Tabs & Tab Content */}
        <Tabs defaultValue="history" value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white px-6 border-b border-stone-100 shrink-0 flex items-center justify-between">
            <TabsList className="bg-transparent border-none p-0 gap-6 h-auto">
              <TabsTrigger
                value="history"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 data-[state=active]:text-stone-900 rounded-none py-3 px-0 font-bold text-xs text-stone-400 hover:text-stone-700 transition-colors"
              >
                銷課明細 ({sortedFilteredLessons.length})
              </TabsTrigger>
              <TabsTrigger
                value="students"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 data-[state=active]:text-stone-900 rounded-none py-3 px-0 font-bold text-xs text-stone-400 hover:text-stone-700 transition-colors"
              >
                專屬學員 ({trainerStudentIds.length})
              </TabsTrigger>
            </TabsList>

            {activeTab === 'history' && (
              <div className="flex items-center gap-1.5 text-xs py-1">
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-') as ['date' | 'name', 'asc' | 'desc']
                    setSortBy(field)
                    setSortOrder(order)
                  }}
                  className="h-7 rounded-lg border border-stone-200 bg-stone-50 px-2 text-[11px] font-semibold text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-400 cursor-pointer"
                >
                  <option value="date-desc">日期（由新到舊）</option>
                  <option value="date-asc">日期（由舊到新）</option>
                  <option value="name-asc">學生姓名（A → Z）</option>
                  <option value="name-desc">學生姓名（Z → A）</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="history" className="mt-0 p-4 space-y-2">
              {sortedFilteredLessons.length === 0 ? (
                <div className="py-16 text-center">
                  <RiTimeLine className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-stone-400 text-sm italic">無銷課紀錄</p>
                </div>
              ) : (
                sortedFilteredLessons.map((r) => {
                  const contract = contracts.find(c => c.id === r.contractId)
                  const perSessionPrice = contract && contract.totalSessions > 0 ? (contract.totalAmount / contract.totalSessions) : (contract?.pricePerSession || 0)
                  const fee = contract ? Math.round(r.sessionAmount * perSessionPrice) : 0
                  const teachingTrainerName = trainers.find(tr => tr.id === r.trainerId)?.name || '未知'
                  const isSubstitute = contract && (contract.trainerId !== r.trainerId && contract.secondaryTrainerId !== r.trainerId)
                  const isSelected = selectedRecord?.id === r.id
                  const attendingNames = r.attendingCustomerNames && r.attendingCustomerNames.length > 0
                    ? r.attendingCustomerNames.join(' & ')
                    : r.customerName

                  const targetCustId = r.customerId || (r.attendingCustomerIds && r.attendingCustomerIds[0])
                  const cumSessions = records.filter(l => 
                    (l.customerId === targetCustId || (l.attendingCustomerIds && l.attendingCustomerIds.includes(targetCustId)))
                  ).reduce((sum, l) => {
                    if (Array.isArray(l.deductions) && l.deductions.length > 0) {
                      const custDed = l.deductions.find((d: any) => d.customerId === targetCustId)
                      if (custDed && typeof custDed.amount === 'number') {
                        return sum + custDed.amount
                      }
                    }
                    return sum + Number(l.sessionAmount || 1)
                  }, 0)

                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        if (isSelected) {
                          setIsPanelVisible(false)
                          setTimeout(() => setSelectedRecord(null), 300)
                        } else {
                          setSelectedRecord(r)
                          setIsPanelVisible(false)
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => setIsPanelVisible(true))
                          })
                        }
                      }}
                      className={cn(
                        'flex items-center gap-4 p-4 rounded-2xl border cursor-pointer group transition-all',
                        isSelected
                          ? 'bg-stone-900 border-stone-800'
                          : 'bg-white border-stone-100 hover:border-stone-300 hover:shadow-sm'
                      )}
                    >
                      {/* Date column */}
                      <div className="shrink-0 text-center">
                        <p className={cn('text-[10px] font-black uppercase tracking-wider', isSelected ? 'text-stone-400' : 'text-stone-400')}>
                          {r.sessionDate ? format(r.sessionDate.toDate(), 'MM/dd') : '-'}
                        </p>
                        <p className={cn('text-[9px] font-mono', isSelected ? 'text-stone-500' : 'text-stone-300')}>
                          {r.sessionDate ? format(r.sessionDate.toDate(), 'HH:mm') : ''}
                        </p>
                      </div>

                      {/* Divider */}
                      <div className={cn('w-px h-8 shrink-0', isSelected ? 'bg-stone-700' : 'bg-stone-100')} />

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn('font-bold text-sm truncate', isSelected ? 'text-white' : 'text-stone-900')}>
                            {attendingNames}
                          </span>
                          {isSubstitute && (
                            <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">代課</span>
                          )}
                          {(() => {
                            const isGroup = contract ? (contract.contractType === 'group' || !!contract.groupMemberQuotas) : false
                            const isShared = contract ? (contract.contractType === 'shared' || (Array.isArray(contract.customerIds) && contract.customerIds.length >= 3 && contract.contractType !== 'group')) : false
                            const isDual = contract ? (!isGroup && !isShared && (contract.contractType === 'dual' || (!!contract.sharedWithCustomerId && contract.contractType !== 'shared'))) : false
                            return contract ? (
                              <span className={cn(
                                "text-[9px] font-black rounded-full px-2 py-0.5 flex items-center gap-0.5 border",
                                isGroup ? "text-emerald-700 bg-emerald-50 border-emerald-100" :
                                isShared ? "text-sky-700 bg-sky-50 border-sky-100" :
                                isDual ? "text-orange-600 bg-orange-50 border-orange-100" : "text-blue-600 bg-blue-50 border-blue-100"
                              )}>
                                <RiGroupLine className="w-2.5 h-2.5" />
                                {isGroup ? '團體' : isShared ? '共享' : isDual ? '雙人' : '單人'}
                              </span>
                            ) : null
                          })()}
                        </div>
                        <p className={cn('text-xs mt-0.5', isSelected ? 'text-stone-400' : 'text-stone-400')}>
                          {teachingTrainerName}
                        </p>
                      </div>

                      {/* Right stats */}
                      <div className="shrink-0 text-right space-y-0.5">
                        <p className={cn('text-base font-black tabular-nums', isSelected ? 'text-white' : 'text-stone-900')}>
                          -{r.sessionAmount}<span className={cn('text-xs font-semibold ml-0.5', isSelected ? 'text-stone-400' : 'text-stone-400')}>堂</span>
                        </p>
                        <p className={cn('text-[10px] font-bold tabular-nums', isSelected ? 'text-stone-400' : 'text-stone-400')}>
                          {contract ? `NT$ ${fee.toLocaleString()}` : '-'}
                        </p>
                      </div>

                      <RiArrowRightSLine className={cn(
                        'w-4 h-4 shrink-0 transition-all duration-200',
                        isSelected ? 'text-stone-500 rotate-90' : 'text-stone-300 group-hover:translate-x-0.5 group-hover:text-stone-600'
                      )} />
                    </div>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="students" className="mt-0 p-4 space-y-2.5">
              {trainerStudents.length === 0 ? (
                <div className="py-16 text-center">
                  <RiUser3Line className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-stone-400 text-sm italic">尚未分配專屬學員</p>
                </div>
              ) : (
                trainerStudents.map((s) => {
                  const studentContracts = getStudentContracts(s.id)
                  const activeContracts = studentContracts.filter(c => c.status === 'active' || c.remainingSessions > 0)
                  const totalRemaining = activeContracts.reduce((sum, c) => sum + c.remainingSessions, 0)

                  const studentCumSessions = records.filter(l => 
                    (l.customerId === s.id || (l.attendingCustomerIds && l.attendingCustomerIds.includes(s.id)))
                  ).reduce((sum, l) => {
                    const attendeeCount = Array.isArray(l.attendingCustomerIds) && l.attendingCustomerIds.length > 0 ? l.attendingCustomerIds.length : 1
                    if (Array.isArray(l.deductions) && l.deductions.length > 0) {
                      const custDed = l.deductions.find((d: any) => d.customerId === s.id)
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

                  const studentHistoricalTotal = studentCumSessions + Number(s.historicalSessions || 0)

                  return (
                    <div key={s.id} className="bg-white border border-stone-100 rounded-2xl p-4 space-y-3 hover:border-stone-200 transition-colors">
                      {/* Student header */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center font-black text-sm shrink-0">
                            {s.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-stone-900 text-sm truncate">{s.name}</p>
                            <p className="text-xs text-stone-400 font-mono">{s.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 text-right shrink-0">
                          <div>
                            <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider">歷史堂數(已上)</p>
                            <p className="text-base font-black text-stone-700 tabular-nums">
                              {studentHistoricalTotal} <span className="text-xs font-normal text-stone-400">堂</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider">系統累積已銷</p>
                            <p className="text-base font-black text-brand-600 tabular-nums">{studentCumSessions} <span className="text-xs font-normal text-stone-400">堂</span></p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider">剩餘堂數</p>
                            <p className="text-base font-black text-stone-900 tabular-nums">{totalRemaining} <span className="text-xs font-normal text-stone-400">堂</span></p>
                          </div>
                        </div>
                      </div>

                      {/* Contracts */}
                      {activeContracts.length > 0 ? (
                        <div className="space-y-2">
                          {activeContracts.map((c) => {
                            const percent = c.totalSessions ? Math.round((c.remainingSessions / c.totalSessions) * 100) : 0
                            const isDual = c.contractType === 'dual' || !!c.sharedWithCustomerId

                            return (
                              <div key={c.id} className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className={cn(
                                    'text-[10px] font-black flex items-center gap-1 px-2 py-0.5 rounded-full',
                                    isDual ? 'bg-orange-100 text-orange-700' : 'bg-stone-200 text-stone-600'
                                  )}>
                                    {isDual ? <RiGroupLine className="w-3 h-3" /> : <RiUser3Line className="w-3 h-3" />}
                                    {isDual ? '雙人' : '單人'}
                                  </span>
                                  <span className="text-xs font-black text-stone-700 tabular-nums">
                                    {c.remainingSessions} / {c.totalSessions} 堂
                                  </span>
                                </div>
                                <div className="w-full bg-stone-200 rounded-full h-1 overflow-hidden">
                                  <div
                                    className={cn('h-1 rounded-full transition-all', percent <= 20 ? 'bg-red-500' : percent <= 50 ? 'bg-amber-500' : 'bg-stone-800')}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-stone-400 italic">無進行中合約</p>
                      )}
                    </div>
                  )
                })
              )}
            </TabsContent>
          </div>
        </Tabs>

        {/* Right Slide-in Detail Panel for selected lesson */}
        {selectedRecord && (() => {
          const r = selectedRecord
          const contract = contracts.find(c => c.id === r.contractId)
          const isGroup = contract ? (contract.contractType === 'group' || !!contract.groupMemberQuotas) : false
          const isShared = contract ? (contract.contractType === 'shared' || (Array.isArray(contract.customerIds) && contract.customerIds.length >= 3 && contract.contractType !== 'group')) : false
          const isDual = contract ? (!isGroup && !isShared && (contract.contractType === 'dual' || (!!contract.sharedWithCustomerId && contract.contractType !== 'shared'))) : false
          const fee = typeof (r as any).recognizedAmount === 'number'
            ? (r as any).recognizedAmount
            : typeof (r as any).unitPriceAtDeduction === 'number'
            ? Math.round(r.sessionAmount * (r as any).unitPriceAtDeduction)
            : contract
            ? Math.round(r.sessionAmount * (contract.pricePerSession || 0))
            : 0
          const teachingTrainerName = trainers.find(tr => tr.id === r.trainerId)?.name || '未知'
          const isSubstitute = contract && (contract.trainerId !== r.trainerId && contract.secondaryTrainerId !== r.trainerId)
          const attendingNames = r.attendingCustomerNames && r.attendingCustomerNames.length > 0
            ? r.attendingCustomerNames.join(' & ')
            : r.customerName

          return (
            <>
              {/* Backdrop */}
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
                className="absolute inset-0 bg-stone-900/30 backdrop-blur-xs z-40"
              />

              {/* Panel */}
              <div
                style={{
                  transform: isPanelVisible ? 'translateX(0)' : 'translateX(100%)',
                  opacity: isPanelVisible ? 1 : 0,
                  transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease',
                }}
                className="absolute top-0 right-0 h-full w-full sm:w-[380px] bg-white border-l border-stone-200 shadow-2xl z-50 flex flex-col"
              >
                {/* Panel Header */}
                <div className="px-6 py-5 border-b border-stone-100 bg-stone-50 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">銷課明細紀錄</p>
                    <h3 className="text-lg font-bold text-stone-900 leading-tight">{attendingNames}</h3>
                    {isSubstitute && (
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
                    className="p-2 rounded-xl text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors shrink-0"
                  >
                    <RiCloseLine className="w-5 h-5" />
                  </button>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Sessions & Amount Card */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">消耗堂數</p>
                      <p className="text-2xl font-black text-stone-900 tabular-nums">-{r.sessionAmount} <span className="text-xs font-semibold text-stone-400">堂</span></p>
                    </div>
                    <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 text-center">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">認列金額</p>
                      <p className="text-2xl font-black text-stone-900 tabular-nums">{contract ? `NT$ ${(fee).toLocaleString()}` : '-'}</p>
                    </div>
                  </div>

                  {/* Details List */}
                  <div className="bg-stone-50 rounded-2xl border border-stone-100 divide-y divide-stone-100 overflow-hidden text-xs">
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="font-bold text-stone-400 flex items-center gap-1.5">
                        <RiCalendarLine className="w-4 h-4 text-stone-400" /> 上課日期
                      </span>
                      <span className="font-bold text-stone-900 font-mono">
                        {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy/MM/dd HH:mm') : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="font-bold text-stone-400 flex items-center gap-1.5">
                        <RiUserLine className="w-4 h-4 text-stone-400" /> 授課教練
                      </span>
                      <span className="font-bold text-stone-900">{teachingTrainerName}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="font-bold text-stone-400 flex items-center gap-1.5">
                        <RiFileTextLine className="w-4 h-4 text-stone-400" /> 合約類型
                      </span>
                      <span>
                        {contract ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border",
                            isGroup ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                            isShared ? "bg-sky-100 text-sky-700 border-sky-200" :
                            isDual ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-blue-100 text-blue-700 border-blue-200"
                          )}>
                            {isGroup ? '👥 團體合約' : isShared ? '👥 共享合約' : isDual ? '👥 雙人合約' : '👤 單人合約'}
                          </span>
                        ) : '無合約資訊'}
                      </span>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">備註事項</p>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-xs leading-relaxed">
                      <p className={cn("whitespace-pre-wrap", r.notes ? "text-stone-700 font-medium" : "text-stone-400 italic")}>
                        {r.notes || '無備註事項'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-4 border-t border-stone-100 flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsPanelVisible(false)
                        setTimeout(() => {
                          setSelectedRecord(null)
                          onEditLesson(r)
                        }, 300)
                      }}
                      className="flex-1 gap-1.5 text-xs font-bold rounded-xl border-stone-200 text-stone-700 hover:bg-stone-100"
                    >
                      <RiEditLine className="w-4 h-4" /> 編輯紀錄
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsPanelVisible(false)
                        setTimeout(() => {
                          setSelectedRecord(null)
                          onDeleteLesson(r.id)
                        }, 300)
                      }}
                      className="flex-1 gap-1.5 text-xs font-bold rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <RiDeleteBinLine className="w-4 h-4" /> 刪除紀錄
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </SheetContent>
    </Sheet>
  )
}
