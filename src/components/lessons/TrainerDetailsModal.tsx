import React, { useState } from 'react'
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

        {/* Header Bar */}
        <div className="bg-white px-6 pr-14 py-6 border-b border-stone-200">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-stone-900 flex items-center justify-center text-white text-xl font-black shadow-md shrink-0">
                {trainer.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-stone-900">{trainer.name}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-stone-500 flex-wrap">
                  {trainer.email && (
                    <span className="flex items-center gap-1">
                      <RiMailLine className="w-3.5 h-3.5 text-stone-400" />
                      {trainer.email}
                    </span>
                  )}
                  {trainer.email && trainer.phone && <span className="text-stone-300">|</span>}
                  {trainer.phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <RiPhoneLine className="w-3.5 h-3.5 text-stone-400" />
                      {trainer.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {onDeleteTrainer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onDeleteTrainer(trainer.id)
                  }}
                  className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl"
                >
                  <RiDeleteBinLine className="w-4 h-4" /> 刪除教練
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => onCreateLesson(trainer.id)}
                className="gap-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-sm"
              >
                <RiAddLine className="w-4 h-4" /> 新增銷課
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-stone-100">
            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-center">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">
                {selectedMonth === 'all' ? '累計已銷堂數' : '本月銷課堂數'}
              </span>
              <span className="text-base font-black text-stone-900 tabular-nums mt-0.5 block">
                {trainer.totalUsedLessons || 0} <span className="text-xs font-semibold text-stone-400">堂</span>
              </span>
            </div>

            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-center">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">
                系統剩餘堂數
              </span>
              <span className="text-base font-black text-stone-900 tabular-nums mt-0.5 block">
                {trainer.systemLessons || 0} <span className="text-xs font-semibold text-stone-400">堂</span>
              </span>
            </div>

            <div className="bg-stone-50 rounded-xl p-3 border border-stone-100 text-center">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">
                專屬學員人數
              </span>
              <span className="text-base font-black text-stone-900 tabular-nums mt-0.5 block">
                {trainerStudents.length} <span className="text-xs font-semibold text-stone-400">人</span>
              </span>
            </div>
          </div>
        </div>

        {/* Tabs & Tab Content */}
        <Tabs defaultValue="history" value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white px-6 pt-2 border-b border-stone-200 shrink-0">
            <TabsList className="bg-transparent border-none p-0 gap-6">
              <TabsTrigger
                value="history"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 rounded-none pb-3 px-0 font-bold text-xs"
              >
                銷課明細 ({filteredLessons.length})
              </TabsTrigger>
              <TabsTrigger
                value="students"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 rounded-none pb-3 px-0 font-bold text-xs"
              >
                專屬學員 & 剩餘課堂 ({trainerStudentIds.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="history" className="mt-0 space-y-4">
              <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-400 border-b border-stone-200 select-none">
                    <tr>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">日期</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">學生</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">合約</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">授課教練</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px] text-center">堂數</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px] text-right">金額</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">備註</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px] text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredLessons.map((r) => {
                      const contract = contracts.find(c => c.id === r.contractId)
                      const fee = contract ? r.sessionAmount * contract.pricePerSession : 0
                      const teachingTrainerName = trainers.find(tr => tr.id === r.trainerId)?.name || '未知'
                      const isSubstitute = contract && (contract.trainerId !== r.trainerId && contract.secondaryTrainerId !== r.trainerId)
                      const isSelected = selectedRecord?.id === r.id

                      return (
                        <tr 
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
                            "transition-all cursor-pointer group",
                            isSelected 
                              ? "bg-amber-50/80 font-medium" 
                              : "hover:bg-stone-50/80"
                          )}
                        >
                          <td className="px-4 py-3 text-stone-500 tabular-nums font-mono whitespace-nowrap">
                            {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy-MM-dd') : '-'}
                          </td>
                          <td className="px-4 py-3 font-bold text-stone-900 whitespace-nowrap">
                            {r.attendingCustomerNames && r.attendingCustomerNames.length > 0
                              ? r.attendingCustomerNames.join(' & ')
                              : r.customerName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {contract ? (
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold",
                                contract.contractType === 'dual' 
                                  ? "bg-orange-50 text-orange-700 border border-orange-100" 
                                  : "bg-blue-50 text-blue-700 border border-blue-100"
                              )}>
                                {contract.contractType === 'dual' ? (
                                  <><RiGroupLine className="w-3 h-3 text-orange-500" />雙人</>
                                ) : (
                                  <><RiUser3Line className="w-3 h-3 text-blue-500" />單人</>
                                )}
                              </span>
                            ) : (
                              <span className="text-stone-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-700">{teachingTrainerName}</span>
                              {isSubstitute && (
                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.2">
                                  代課
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-stone-100 text-stone-800 tabular-nums">
                              {r.sessionAmount} 堂
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-stone-900 tabular-nums whitespace-nowrap">
                            {contract ? `NT$ ${(fee).toLocaleString()}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-stone-500 max-w-[120px] truncate">
                            {r.notes || '-'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <RiArrowRightSLine className={cn(
                                "w-4 h-4 text-stone-400 transition-transform duration-200",
                                isSelected ? "rotate-90 text-stone-800" : "group-hover:translate-x-0.5"
                              )} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {filteredLessons.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-stone-400 font-medium">
                          無銷課紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="students" className="mt-0 space-y-4">
              <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <table className="w-full text-xs text-left">
                  <thead className="bg-stone-50 text-stone-400 border-b border-stone-200 select-none">
                    <tr>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">學員姓名</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">聯絡電話</th>
                      <th className="px-4 py-3 font-black uppercase tracking-wider text-[10px]">進行中合約與剩餘堂數</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {trainerStudents.map((s) => {
                      const studentContracts = getStudentContracts(s.id)

                      return (
                        <tr key={s.id} className="hover:bg-stone-50/60 transition-colors">
                          <td className="px-4 py-3.5 font-bold text-stone-900 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-black text-xs shrink-0">
                                {s.name.charAt(0)}
                              </div>
                              <span>{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-stone-600 font-mono whitespace-nowrap">
                            {s.phone}
                          </td>
                          <td className="px-4 py-3.5 space-y-2">
                            {studentContracts.length === 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-400">
                                暫無合約
                              </span>
                            ) : (
                              studentContracts.map((c) => {
                                const percent = c.totalSessions ? Math.round((c.remainingSessions / c.totalSessions) * 100) : 0
                                const isDual = c.contractType === 'dual' || !!c.sharedWithCustomerId

                                return (
                                  <div key={c.id} className="bg-stone-50/80 border border-stone-200/60 rounded-xl p-2.5 space-y-1.5 max-w-sm">
                                    <div className="flex justify-between items-center text-[10px]">
                                      <span className={cn(
                                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold uppercase",
                                        isDual ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                                      )}>
                                        {isDual ? <><RiGroupLine className="w-3 h-3" />雙人</> : <><RiUser3Line className="w-3 h-3" />單人</>}
                                      </span>
                                      <span className="font-extrabold text-stone-700 tabular-nums">
                                        剩餘 {c.remainingSessions} / {c.totalSessions} 堂
                                      </span>
                                    </div>
                                    <div className="w-full bg-stone-200/80 rounded-full h-1 overflow-hidden">
                                      <div
                                        className={cn(
                                          "h-1 rounded-full transition-all",
                                          percent <= 20 ? "bg-red-500" : percent <= 50 ? "bg-amber-500" : "bg-stone-800"
                                        )}
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {trainerStudents.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-12 text-center text-stone-400 font-medium">
                          尚未分配專屬學員
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Right Slide-in Detail Panel for selected lesson */}
        {selectedRecord && (() => {
          const r = selectedRecord
          const contract = contracts.find(c => c.id === r.contractId)
          const fee = contract ? r.sessionAmount * contract.pricePerSession : 0
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
                            contract.contractType === 'dual' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {contract.contractType === 'dual' ? '雙人合約' : '單人合約'}
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
