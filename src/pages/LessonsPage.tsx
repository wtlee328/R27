import { useState, useMemo } from 'react'
import { 
  RiCalendarCheckLine, 
  RiMailLine, 
  RiPhoneLine, 
  RiGroupLine, 
  RiUser3Line,
  RiMoneyDollarCircleLine,
  RiBookOpenLine,
  RiSearchLine,
  RiFilterLine,
  RiArrowUpDownLine,
  RiDeleteBinLine,
  RiArrowRightSLine,
  RiAlertLine,
  RiAddLine,
  RiUserAddLine,
  RiCalendarLine
} from '@remixicon/react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { FilterDropdown } from '../components/shared/FilterDropdown'
import { LessonRecordWizard } from '../components/lessons/LessonRecordWizard'
import { TrainerOnboardModal } from '../components/lessons/TrainerOnboardModal'
import { TrainerDetailsModal } from '../components/lessons/TrainerDetailsModal'
import { useLessonRecords } from '../hooks/useLessonRecords'
import { useTrainers } from '../hooks/useTrainers'
import { useCustomers } from '../hooks/useCustomers'
import type { LessonRecordFormValues, TrainerFormValues } from '../lib/validators'
import type { LessonRecord } from '../types'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { Input } from '../components/ui/input'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '../components/ui/dialog'

type SortField = 'systemLessons' | 'totalUsedLessons' | 'name'

export default function LessonsPage() {
  const { records, createRecord, deleteRecord, updateRecord, refresh: refreshRecords } = useLessonRecords()
  const { trainers, loading: loadingTrainers, migrationRunning, addTrainer, deleteTrainer, refresh: refreshTrainers } = useTrainers()
  const { customers, contracts, refresh: refreshCustomers } = useCustomers()

  // Selected trainer state for right-side drawer sheet
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  
  // Sorting state
  const [sortOption, setSortOption] = useState<'remaining-desc' | 'remaining-asc' | 'used-desc' | 'name'>('remaining-desc')

  // Lesson Record Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LessonRecord | null>(null)

  // Trainer Onboarding state
  const [isTrainerOnboardOpen, setIsTrainerOnboardOpen] = useState(false)

  // Selected Month filter state (defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

  // List of all months that have records
  const monthOptions = useMemo(() => {
    const monthsSet = new Set<string>()
    const now = new Date()
    const currentMonthStr = format(now, 'yyyy/MM')
    monthsSet.add(currentMonthStr)
    
    ;(records || []).forEach(r => {
      if (r.sessionDate) {
        monthsSet.add(format(r.sessionDate.toDate(), 'yyyy/MM'))
      }
    })
    
    return Array.from(monthsSet).sort().reverse()
  }, [records])
  
  // Delete record confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Delete trainer confirmation state
  const [deleteTrainerId, setDeleteTrainerId] = useState<string | null>(null)
  const [reassignTrainerId, setReassignTrainerId] = useState<string>('')

  // Handle manual data refresh
  const handleRefreshAll = async () => {
    await Promise.all([
      refreshTrainers(),
      refreshRecords(),
      refreshCustomers()
    ])
  }

  // Dynamic metrics per trainer based on the selectedMonth
  const trainersWithDynamicMetrics = useMemo(() => {
    return (trainers || []).map((t) => {
      const assignedCustomerIds = (customers || [])
        .filter((c) => c.trainerId === t.id)
        .map((c) => c.id)

      const trainerContracts = (contracts || []).filter(
        (c) => assignedCustomerIds.includes(c.customerId) || assignedCustomerIds.includes(c.primaryCustomerId)
      )
      const systemLessons = trainerContracts.reduce((sum, c) => sum + Number(c.remainingSessions || 0), 0)

      const taughtLessons = (records || []).filter((lr) => lr.trainerId === t.id)

      const filteredLessonsForMonth = selectedMonth === 'all'
        ? taughtLessons
        : taughtLessons.filter(lr => lr.sessionDate && format(lr.sessionDate.toDate(), 'yyyy/MM') === selectedMonth)

      const usedLessons = filteredLessonsForMonth.reduce((sum, lr) => sum + Number(lr.sessionAmount || 0), 0)

      return {
        ...t,
        systemLessons,
        totalUsedLessons: usedLessons,
      }
    })
  }, [trainers, customers, contracts, records, selectedMonth])

  // Filter & sort trainers
  const filteredAndSortedTrainers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = trainersWithDynamicMetrics.filter(t => 
      t.name.toLowerCase().includes(query) ||
      t.email.toLowerCase().includes(query) ||
      t.phone.includes(query)
    )

    return [...filtered].sort((a, b) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name, 'zh-Hant')
      } else if (sortOption === 'used-desc') {
        return (b.totalUsedLessons || 0) - (a.totalUsedLessons || 0)
      } else if (sortOption === 'remaining-asc') {
        return (a.systemLessons || 0) - (b.systemLessons || 0)
      } else {
        // remaining-desc (default)
        return (b.systemLessons || 0) - (a.systemLessons || 0)
      }
    })
  }, [trainersWithDynamicMetrics, searchQuery, sortOption])

  // Selected trainer object for the right-side sheet drawer
  const selectedTrainerObj = useMemo(() => {
    if (!selectedTrainerId) return null
    return trainersWithDynamicMetrics.find(t => t.id === selectedTrainerId) || null
  }, [trainersWithDynamicMetrics, selectedTrainerId])

  const handleOpenCreate = (targetTrainerId?: string) => {
    setEditingRecord(null)
    if (targetTrainerId) {
      setSelectedTrainerId(targetTrainerId)
    }
    setIsWizardOpen(true)
  }

  const handleOpenEdit = (record: LessonRecord) => {
    setEditingRecord(record)
    setIsWizardOpen(true)
  }

  const handleWizardSubmit = async (data: LessonRecordFormValues) => {
    if (editingRecord) {
      await updateRecord(editingRecord.id, data)
    } else {
      const recordData = {
        ...data,
        trainerId: data.trainerId || selectedTrainerId || undefined
      }
      await createRecord(recordData)
    }
    await handleRefreshAll()
  }

  const handleDeleteRecord = async () => {
    if (deleteId) {
      await deleteRecord(deleteId)
      setDeleteId(null)
      await handleRefreshAll()
    }
  }

  const handleDeleteTrainer = async () => {
    if (deleteTrainerId) {
      await deleteTrainer(deleteTrainerId, reassignTrainerId || null)
      setSelectedTrainerId(null)
      setDeleteTrainerId(null)
      setReassignTrainerId('')
      await handleRefreshAll()
    }
  }

  const handleTrainerOnboardSubmit = async (data: TrainerFormValues) => {
    await addTrainer(data)
  }

  // Dashboard Stats
  const totalSystemRemaining = trainersWithDynamicMetrics.reduce((sum, t) => sum + Number(t.systemLessons || 0), 0)

  const totalSystemRemainingAmount = contracts.reduce((sum, c) => {
    const remaining = Number(c.remainingSessions || 0)
    if (remaining <= 0) return sum
    const pricePerSession = Number(c.pricePerSession || (c.totalSessions ? c.totalAmount / c.totalSessions : 0))
    return sum + (remaining * pricePerSession)
  }, 0)

  const selectedMonthRecords = selectedMonth === 'all'
    ? records
    : records.filter(r => r.sessionDate && format(r.sessionDate.toDate(), 'yyyy/MM') === selectedMonth)

  const selectedMonthConsumed = selectedMonthRecords.reduce(
    (sum, r) => sum + Number(r.sessionAmount || 0), 
    0
  )

  const selectedMonthRevenue = selectedMonthRecords.reduce((sum, r) => {
    const contract = contracts.find(c => c.id === r.contractId)
    const price = contract ? contract.pricePerSession : 0
    return sum + (Number(r.sessionAmount || 0) * price)
  }, 0)

  if (loadingTrainers || migrationRunning) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="loading-spinner"><span /></div>
        <p className="text-stone-500 font-bold text-sm animate-pulse">
          {migrationRunning ? '正在建立模擬教練並隨機分配學員...' : '載入教練銷課資料中...'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiCalendarCheckLine className="w-6 h-6 text-orange-500" />
            教練銷課管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">追蹤教練的課程堂數消耗與系統剩餘堂數</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => handleOpenCreate()} 
            className="font-semibold text-sm px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <RiAddLine className="w-4 h-4" />
            新增銷課
          </Button>
          <Button 
            onClick={() => setIsTrainerOnboardOpen(true)} 
            className="font-semibold text-sm px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <RiUserAddLine className="w-4 h-4" />
            新增教練
          </Button>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="系統剩餘總堂數"
          value={`${totalSystemRemaining} 堂`}
          icon={RiCalendarCheckLine}
          subtitle="目前合約中所有未消耗的堂數"
        />
        <StatCard
          title="系統剩餘總金額"
          value={`NT$ ${Math.round(totalSystemRemainingAmount).toLocaleString()}`}
          icon={RiMoneyDollarCircleLine}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          subtitle="合約中未上課堂數之剩餘價值加總"
        />
        <StatCard
          title={selectedMonth === 'all' ? '累計已銷總堂數' : '當月已銷總堂數'}
          value={`${selectedMonthConsumed} 堂`}
          icon={RiBookOpenLine}
          subtitle={selectedMonth === 'all' ? '歷史累計上課堂數' : '當月累計上課堂數'}
        />
        <StatCard
          title={selectedMonth === 'all' ? '累計已銷總金額' : '當月已銷總金額'}
          value={`NT$ ${Math.round(selectedMonthRevenue).toLocaleString()}`}
          icon={RiMoneyDollarCircleLine}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          subtitle={selectedMonth === 'all' ? '歷史累計上課金額加總' : '當月銷課金額加總'}
        />
      </div>

      {/* MAIN TRAINERS LIST CONTAINER */}
      <div className="bg-white p-2 rounded-[2.5rem] border border-stone-200 shadow-sm">
        <div className="flex flex-col">
          {/* Search & Sort & Filter Header */}
          <div className="px-8 py-6 flex flex-col md:flex-row gap-4 justify-between items-center bg-white rounded-t-2xl border-b border-stone-100">
            <div className="relative w-full md:max-w-xs">
              <RiSearchLine className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <Input 
                placeholder="搜尋教練姓名、Email 或電話..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-11 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-stone-200 transition-all text-sm font-medium"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              {/* Selected Month Filter */}
              <FilterDropdown
                value={selectedMonth}
                onChange={setSelectedMonth}
                options={[
                  { value: 'all', label: '全部月份' },
                  ...monthOptions.map((m) => ({
                    value: m,
                    label: `${m.replace('/', ' 年 ')} 月`,
                  })),
                ]}
                icon={RiCalendarLine}
                label="月份篩選"
              />

              {/* Sort Dropdown */}
              <FilterDropdown
                value={sortOption}
                onChange={(val) => setSortOption(val as any)}
                options={[
                  { value: 'remaining-desc', label: '剩餘堂數 (多 → 少)' },
                  { value: 'remaining-asc', label: '剩餘堂數 (少 → 多)' },
                  { value: 'used-desc', label: '已銷堂數 (多 → 少)' },
                  { value: 'name', label: '教練姓名' },
                ]}
                icon={RiArrowUpDownLine}
                label="排序方式"
              />

              <div className="hidden sm:block w-px h-4 bg-stone-200" />
              <span className="text-xs text-stone-400 font-black uppercase tracking-wider whitespace-nowrap">
                Total: {filteredAndSortedTrainers.length} 位教練
              </span>
            </div>
          </div>

          {/* Modern List View */}
          <div className="bg-white rounded-b-2xl overflow-hidden">
          {filteredAndSortedTrainers.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-stone-400 font-medium italic">找不到符合條件的教練</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-50">
              {filteredAndSortedTrainers.map((t) => {
                const assignedStudentCount = customers.filter(c => c.trainerId === t.id).length

                return (
                  <div 
                    key={t.id}
                    onClick={() => setSelectedTrainerId(t.id)}
                    className="group flex flex-col lg:flex-row lg:items-center justify-between p-6 lg:px-8 hover:bg-stone-50/80 transition-all cursor-pointer relative"
                  >
                    {/* Active Indicator Strip on Hover */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-stone-900 opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Trainer Profile Section */}
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-700 text-xl font-black group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-bold text-stone-900 text-base group-hover:text-stone-950 transition-colors">
                            {t.name}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400 font-bold">
                          {t.email && (
                            <span className="flex items-center gap-1.5">
                              <RiMailLine className="w-3.5 h-3.5" /> {t.email}
                            </span>
                          )}
                          {t.phone && (
                            <span className="flex items-center gap-1.5 font-mono">
                              <RiPhoneLine className="w-3.5 h-3.5" /> {t.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Trainer Stats Section */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 sm:gap-10 mt-4 lg:mt-0">
                      {/* Total Used Lessons */}
                      <div className="space-y-1 min-w-[100px]">
                        <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.2em]">
                          {selectedMonth === 'all' ? '累計已銷' : '本月已銷'}
                        </p>
                        <p className="text-xs font-bold text-stone-700 tabular-nums">
                          {t.totalUsedLessons || 0} 堂
                        </p>
                      </div>

                      {/* System Remaining Lessons */}
                      <div className="space-y-1 min-w-[100px]">
                        <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.2em]">系統剩餘堂數</p>
                        <p className="text-xs font-bold text-stone-900 tabular-nums">
                          {t.systemLessons || 0} 堂
                        </p>
                      </div>

                      {/* Dedicated Students */}
                      <div className="space-y-1 min-w-[90px]">
                        <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.2em]">專屬學員</p>
                        <p className="text-xs font-bold text-stone-700 tabular-nums">
                          {assignedStudentCount} 人
                        </p>
                      </div>

                      {/* Action & Navigation */}
                      <div className="flex items-center gap-2 pl-2">
                        <RiArrowRightSLine className="w-5 h-5 text-stone-300 group-hover:text-stone-800 transition-colors" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* RIGHT-SIDE DRAWER SHEET (Trainer Details) */}
      <TrainerDetailsModal
        open={!!selectedTrainerId}
        onOpenChange={(open) => !open && setSelectedTrainerId(null)}
        trainer={selectedTrainerObj}
        records={records}
        customers={customers}
        contracts={contracts}
        trainers={trainers}
        selectedMonth={selectedMonth}
        onDeleteTrainer={(trainerId) => setDeleteTrainerId(trainerId)}
        onCreateLesson={(trainerId) => handleOpenCreate(trainerId)}
        onEditLesson={(record) => handleOpenEdit(record)}
        onDeleteLesson={(recordId) => setDeleteId(recordId)}
      />

      {/* MODALS & WIZARDS */}
      <LessonRecordWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onSubmit={handleWizardSubmit}
        initialData={editingRecord}
        trainerId={selectedTrainerId || undefined}
      />

      <TrainerOnboardModal
        open={isTrainerOnboardOpen}
        onOpenChange={setIsTrainerOnboardOpen}
        onSubmit={handleTrainerOnboardSubmit}
      />

      {/* Delete Lesson Record Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4 border border-red-100">
              <RiAlertLine className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-bold text-stone-900">確認刪除銷課紀錄？</DialogTitle>
            <DialogDescription className="text-stone-500 mt-2 text-xs">
              刪除此銷課紀錄後，該學員的合約剩餘堂數將會自動增加（歸還），且教練歷史銷課堂數也會扣除。此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 font-semibold rounded-xl text-xs">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteRecord} className="flex-1 font-semibold rounded-xl text-xs bg-red-600 hover:bg-red-700">
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Trainer Confirmation Dialog */}
      <Dialog open={!!deleteTrainerId} onOpenChange={(open) => {
        if (!open) {
          setDeleteTrainerId(null)
          setReassignTrainerId('')
        }
      }}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-stone-200">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3 border border-red-100">
              <RiAlertLine className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-bold text-stone-900">
              確認刪除教練「{trainers.find(t => t.id === deleteTrainerId)?.name || ''}」？
            </DialogTitle>
            <DialogDescription className="text-stone-500 mt-1 text-xs leading-relaxed">
              刪除此教練後，教練資料將被移除。系統會自動維護銷課歷史營收帳目（歷史銷課紀錄完好保留以保護盈餘與會計報表）。
            </DialogDescription>
          </DialogHeader>

          {deleteTrainerId && (() => {
            const affectedCustCount = customers.filter(c => c.trainerId === deleteTrainerId).length
            const affectedContCount = contracts.filter(c => c.trainerId === deleteTrainerId || c.secondaryTrainerId === deleteTrainerId).length
            const otherTrainers = trainers.filter(t => t.id !== deleteTrainerId)

            return (
              <div className="space-y-3 my-2 text-xs">
                <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-200/60 space-y-1.5">
                  <p className="font-bold text-stone-900">受影響數據彙整：</p>
                  <div className="flex items-center justify-between text-stone-600">
                    <span>專屬學員數：</span>
                    <span className="font-bold text-stone-900">{affectedCustCount} 人</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-600">
                    <span>簽署/經手合約數：</span>
                    <span className="font-bold text-stone-900">{affectedContCount} 筆</span>
                  </div>
                </div>

                {otherTrainers.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <label className="font-bold text-stone-800">
                      選擇將學員與合約移交給：
                    </label>
                    <select
                      value={reassignTrainerId}
                      onChange={(e) => setReassignTrainerId(e.target.value)}
                      className="w-full h-10 px-3 border border-stone-200 rounded-xl text-xs bg-white font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
                    >
                      <option value="">不指定 (設為無教練)</option>
                      {otherTrainers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} 教練
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })()}

          <DialogFooter className="mt-4 flex gap-3">
            <Button variant="outline" onClick={() => setDeleteTrainerId(null)} className="flex-1 font-semibold rounded-xl text-xs">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteTrainer} className="flex-1 font-semibold rounded-xl text-xs bg-red-600 hover:bg-red-700">
              確認刪除教練
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
