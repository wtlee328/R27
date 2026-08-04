import React, { useState, useMemo } from 'react'
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
  RiArrowRightSLine
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

  if (!trainer) return null

  // Get assigned students for this trainer
  const trainerStudents = customers.filter(c => c.trainerId === trainer.id)
  const trainerStudentIds = trainerStudents.map(c => c.id)

  // Find lesson records belonging to this trainer
  const trainerLessons = records.filter(lr => lr.trainerId === trainer.id)

  // Filter lessons by selected month if needed
  const filteredLessons = selectedMonth === 'all'
    ? trainerLessons
    : trainerLessons.filter(lr => lr.sessionDate && format(lr.sessionDate.toDate(), 'yyyy/MM') === selectedMonth)

  // Sorting states for lesson records (Date, Student Name)
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

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
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-stone-100">
              {[
                { label: selectedMonth === 'all' ? '累計已銷堂數' : '本月銷課堂數', value: trainer.totalUsedLessons || 0, unit: '堂' },
                { label: '系統剩餘堂數', value: trainer.systemLessons || 0, unit: '堂' },
                { label: '專屬學員人數', value: trainerStudents.length, unit: '人' },
              ].map(({ label, value, unit }) => (
                <div key={label} className="text-center">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-lg font-black text-stone-900 tabular-nums">
                    {value} <span className="text-xs font-semibold text-stone-400">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
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
                          {contract?.contractType === 'dual' && (
                            <span className="text-[9px] font-black text-orange-600 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5 flex items-center gap-0.5">
                              <RiGroupLine className="w-2.5 h-2.5" />雙人
                            </span>
                          )}
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
                        <div className="text-right shrink-0">
                          <p className="text-[9px] font-black text-stone-400 uppercase tracking-wider">剩餘堂數</p>
                          <p className="text-lg font-black text-stone-900 tabular-nums">{totalRemaining}</p>
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
          const isDual = contract ? (!isGroup && (contract.contractType === 'dual' || !!contract.sharedWithCustomerId)) : false
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
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold",
                            isGroup ? "bg-emerald-100 text-emerald-700" :
                            isDual ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {isGroup ? '👥 團體合約' : isDual ? '👥 雙人合約' : '👤 單人合約'}
                          </span>
                        ) : '無合約資訊'}
                      </span>
                    </div>
                  </div>

                  {/* Notes */}
                  {r.notes && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">備註事項</p>
                      <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 text-xs text-stone-700 leading-relaxed">
                        {r.notes}
                      </div>
                    </div>
                  )}

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
