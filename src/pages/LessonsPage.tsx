import { useState, useMemo } from 'react'
import { CalendarCheck, Activity, Users, Search, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { LessonRecordWizard } from '../components/lessons/LessonRecordWizard'
import { TrainerOnboardModal } from '../components/lessons/TrainerOnboardModal'
import { useLessonRecords } from '../hooks/useLessonRecords'
import { useTrainers } from '../hooks/useTrainers'
import { useCustomers } from '../hooks/useCustomers'
import type { LessonRecordFormValues, TrainerFormValues } from '../lib/validators'
import type { LessonRecord } from '../types'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '../components/ui/dialog'

type SortField = 'name' | 'systemLessons' | 'totalUsedLessons'
type SortOrder = 'asc' | 'desc'

export default function LessonsPage() {
  const { records, createRecord, deleteRecord, updateRecord, refresh: refreshRecords } = useLessonRecords()
  const { trainers, loading: loadingTrainers, migrationRunning, addTrainer, refresh: refreshTrainers } = useTrainers()
  const { customers, contracts, refresh: refreshCustomers } = useCustomers()

  // Selected trainer state (null = dashboard grid view, string = expanded trainer card)
  const [selectedTrainerId, setSelectedTrainerId] = useState<string | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('systemLessons')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  // Lesson Record Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LessonRecord | null>(null)

  // Trainer Onboarding state
  const [isTrainerOnboardOpen, setIsTrainerOnboardOpen] = useState(false)

  // Tab state in trainer detailed view ('students' | 'history')
  const [activeTab, setActiveTab] = useState<'students' | 'history'>('history')

  // Selected Month filter state (defaults to current month)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

  // List of all months that have records
  const monthOptions = useMemo(() => {
    const monthsSet = new Set<string>()
    // Include current month by default
    const now = new Date()
    const currentMonthStr = format(now, 'yyyy/MM')
    monthsSet.add(currentMonthStr)
    
    records.forEach(r => {
      if (r.sessionDate) {
        monthsSet.add(format(r.sessionDate.toDate(), 'yyyy/MM'))
      }
    })
    
    return Array.from(monthsSet).sort().reverse() // Newest month first
  }, [records])
  
  // Delete record confirmation state
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Handle sorting trigger
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

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
    return trainers.map((t) => {
      // Find customers assigned to this trainer
      const assignedCustomerIds = customers
        .filter((c) => c.trainerId === t.id)
        .map((c) => c.id)

      // Find active/ongoing contracts for these customers
      const trainerContracts = contracts.filter(
        (c) => assignedCustomerIds.includes(c.customerId) || assignedCustomerIds.includes(c.primaryCustomerId)
      )
      const systemLessons = trainerContracts.reduce((sum, c) => sum + Number(c.remainingSessions || 0), 0)

      // Find lesson records belonging to this trainer (or assigned customers)
      const trainerLessons = records.filter(
        (lr) => lr.trainerId === t.id || assignedCustomerIds.includes(lr.customerId)
      )

      // Calculate used lessons for the selected month or all-time
      const filteredLessonsForMonth = selectedMonth === 'all'
        ? trainerLessons
        : trainerLessons.filter(lr => lr.sessionDate && format(lr.sessionDate.toDate(), 'yyyy/MM') === selectedMonth)

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
      if (sortField === 'name') {
        const comparison = a.name.localeCompare(b.name, 'zh-Hant')
        return sortOrder === 'asc' ? comparison : -comparison
      } else {
        const valA = Number(a[sortField] || 0)
        const valB = Number(b[sortField] || 0)
        const comparison = valA - valB
        return sortOrder === 'asc' ? comparison : -comparison
      }
    })
  }, [trainersWithDynamicMetrics, searchQuery, sortField, sortOrder])

  // Helper to get contracts for a specific student
  const getStudentContracts = (studentId: string) => {
    return contracts.filter(con => 
      (con.customerIds && con.customerIds.includes(studentId)) || 
      con.customerId === studentId ||
      con.primaryCustomerId === studentId ||
      con.sharedWithCustomerId === studentId
    )
  }

  const handleOpenCreate = () => {
    setEditingRecord(null)
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
      // If we are creating from trainer view, pre-assign this trainer to the record
      const recordData = {
        ...data,
        trainerId: selectedTrainerId || data.trainerId
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

  const handleTrainerOnboardSubmit = async (data: TrainerFormValues) => {
    await addTrainer(data)
  }

  const toggleTrainerExpand = (trainerId: string) => {
    if (selectedTrainerId === trainerId) {
      setSelectedTrainerId(null)
    } else {
      setSelectedTrainerId(trainerId)
    }
  }

  // Dashboard Stats
  const totalSystemRemaining = trainers.reduce((sum, t) => sum + Number(t.systemLessons || 0), 0)
  const totalHistoryConsumed = trainers.reduce((sum, t) => sum + Number(t.totalUsedLessons || 0), 0)

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
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">教練銷課管理</h1>
          <p className="text-sm text-stone-500 mt-1">追蹤教練的課程堂數消耗與系統剩餘堂數</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsTrainerOnboardOpen(true)} className="font-semibold text-sm px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl">
            + 新增教練
          </Button>
        </div>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="系統剩餘總堂數"
          value={`${totalSystemRemaining} 堂`}
          icon={CalendarCheck}
          subtitle="目前合約中所有未消耗的堂數"
        />
        <StatCard
          title="累計已銷總堂數"
          value={`${totalHistoryConsumed} 堂`}
          icon={Activity}
          subtitle="全館累計上課堂數"
        />
        <StatCard
          title="登錄教練人數"
          value={`${trainers.length} 位`}
          icon={Users}
          subtitle="教練獨立名冊與銷課統計"
        />
      </div>

      {/* TRAINERS SECTION WITH MONTH FILTER & ACCORDIONS */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-stone-700 select-none">選擇月份</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-stone-200 text-stone-950 px-3 py-1.5 rounded-xl text-sm font-black shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="all">全部月份</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m.replace('/', ' 年 ')} 月
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="搜尋教練名稱、Email 或電話..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Sorting Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-stone-50 p-4 rounded-xl border border-stone-100/80 text-xs text-stone-500 select-none">
          <div className="flex items-center gap-2">
            <span>排序依據:</span>
            <button
              onClick={() => handleSort('name')}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold hover:bg-stone-200 hover:text-stone-900 transition-colors flex items-center gap-1",
                sortField === 'name' ? "bg-white text-stone-900 shadow-sm border border-stone-200 font-bold" : "bg-transparent"
              )}
            >
              教練姓名 {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSort('systemLessons')}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold hover:bg-stone-200 hover:text-stone-900 transition-colors flex items-center gap-1",
                sortField === 'systemLessons' ? "bg-white text-stone-900 shadow-sm border border-stone-200 font-bold" : "bg-transparent"
              )}
            >
              剩餘堂數 {sortField === 'systemLessons' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSort('totalUsedLessons')}
              className={cn(
                "px-2.5 py-1 rounded-md font-semibold hover:bg-stone-200 hover:text-stone-900 transition-colors flex items-center gap-1",
                sortField === 'totalUsedLessons' ? "bg-white text-stone-900 shadow-sm border border-stone-200 font-bold" : "bg-transparent"
              )}
            >
              已銷堂數 {sortField === 'totalUsedLessons' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
          </div>
          <div>
            <span>共 {filteredAndSortedTrainers.length} 位教練</span>
          </div>
        </div>

        {/* Trainer Accordion List */}
        <div className="space-y-4">
          {filteredAndSortedTrainers.map((t) => {
            const isExpanded = selectedTrainerId === t.id
            
            // Get student list for this trainer
            const trainerStudentIds = customers
              .filter(c => c.trainerId === t.id)
              .map(c => c.id)

            // Find lesson records belonging to this trainer (or assigned customers)
            const trainerLessons = records.filter(lr => 
              lr.trainerId === t.id || trainerStudentIds.includes(lr.customerId)
            )

            // Filter by selected month
            const filteredLessons = selectedMonth === 'all'
              ? trainerLessons
              : trainerLessons.filter(lr => lr.sessionDate && format(lr.sessionDate.toDate(), 'yyyy/MM') === selectedMonth)

            // If query is present, filter inside the expanded history list too
            const query = searchQuery.trim().toLowerCase()
            const searchFilteredLessons = query 
              ? filteredLessons.filter(r => 
                  r.customerName.toLowerCase().includes(query) ||
                  (r.attendingCustomerNames && r.attendingCustomerNames.some(name => name.toLowerCase().includes(query)))
                )
              : filteredLessons

            return (
              <div 
                key={t.id} 
                className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden transition-all duration-300"
              >
                {/* Accordion Header */}
                <div 
                  onClick={() => toggleTrainerExpand(t.id)}
                  className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:bg-stone-50/50 transition-colors select-none"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-black text-lg shadow-sm">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-stone-900">{t.name}</h3>
                      <p className="text-xs text-stone-400 mt-1 font-mono">📧 {t.email} | 📞 {t.phone}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto justify-end">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200">
                      {selectedMonth === 'all' ? '累計已銷堂數' : '本月銷課堂數'}: {t.totalUsedLessons} 堂
                    </span>
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-yellow-50 text-yellow-600 border border-yellow-200">
                      累計使用堂數: {t.systemLessons} 堂
                    </span>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-xs font-bold text-stone-600 transition-colors ml-1">
                      {isExpanded ? (
                        <>
                          <span>收合明細</span>
                          <ChevronUp className="w-3.5 h-3.5" />
                        </>
                      ) : (
                        <>
                          <span>展開明細</span>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Accordion Body (Expanded Panel) */}
                {isExpanded && (
                  <div className="border-t border-stone-100 bg-stone-50/40 p-6 space-y-6">
                    {/* Inner Tabs & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 pb-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab('history')}
                          className={cn(
                            "px-4 py-2 font-bold text-xs rounded-xl border transition-all",
                            activeTab === 'history'
                              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                          )}
                        >
                          📖 銷課明細 ({searchFilteredLessons.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('students')}
                          className={cn(
                            "px-4 py-2 font-bold text-xs rounded-xl border transition-all",
                            activeTab === 'students'
                              ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                          )}
                        >
                          👥 專屬學員 & 剩餘課堂 ({trainerStudentIds.length})
                        </button>
                      </div>

                      <Button 
                        onClick={handleOpenCreate} 
                        className="px-3.5 py-1.5 text-xs font-bold bg-brand-600 hover:bg-brand-700 text-white rounded-xl self-end sm:self-auto"
                      >
                        + 新增銷課紀錄
                      </Button>
                    </div>

                    {/* Tab Panels */}
                    {activeTab === 'history' ? (
                      /* History Table view matching design layout */
                      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-stone-50 text-stone-500 border-b border-stone-200 select-none">
                            <tr>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">日期</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">學生</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">合約</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-center">堂數</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-right">金額</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">備註</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider text-right">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {searchFilteredLessons.map((r) => {
                              const contract = contracts.find(c => c.id === r.contractId)
                              const fee = contract ? r.sessionAmount * contract.pricePerSession : 0
                              return (
                                <tr key={r.id} className="hover:bg-brand-50/10 transition-colors duration-150 group">
                                  <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                                    {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy-MM-dd') : '-'}
                                  </td>
                                  <td className="px-5 py-3.5 font-bold text-stone-900">
                                    {r.attendingCustomerNames && r.attendingCustomerNames.length > 0
                                      ? r.attendingCustomerNames.join(' & ')
                                      : r.customerName}
                                  </td>
                                  <td className="px-5 py-3.5">
                                    {contract ? (
                                      <span className={cn(
                                        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold",
                                        contract.contractType === 'dual' 
                                          ? "bg-purple-50 text-purple-700 border border-purple-100" 
                                          : "bg-blue-50 text-blue-700 border border-blue-100"
                                      )}>
                                        {contract.contractType === 'dual' ? '👥 雙人' : '👤 單人'}
                                      </span>
                                    ) : (
                                      <span className="text-stone-400 text-xs">-</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 text-center">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-stone-100 text-stone-700 border border-stone-200/60 tabular-nums">
                                      {r.sessionAmount} 堂
                                    </span>
                                  </td>
                                  <td className="px-5 py-3.5 text-right font-bold text-stone-900 tabular-nums">
                                    {contract ? `NT$ ${(fee).toLocaleString()}` : '-'}
                                  </td>
                                  <td className="px-5 py-3.5 text-stone-500 max-w-[150px] truncate">{r.notes || '-'}</td>
                                  <td className="px-5 py-3.5 text-right">
                                    <div className="flex justify-end gap-3.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                      <button
                                        type="button"
                                        className="text-brand-500 hover:text-brand-600 text-xs font-bold transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenEdit(r)
                                        }}
                                      >
                                        編輯
                                      </button>
                                      <button
                                        type="button"
                                        className="text-red-500 hover:text-red-600 text-xs font-bold transition-colors"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDeleteId(r.id)
                                        }}
                                      >
                                        刪除
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                            {searchFilteredLessons.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-16 text-center text-stone-400 font-medium">
                                  <p>此月份無銷課紀錄</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* Trainee list directory */
                      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-stone-50 text-stone-500 border-b border-stone-200 select-none">
                            <tr>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">學員姓名</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">聯絡電話</th>
                              <th className="px-5 py-3 font-bold text-[10px] uppercase tracking-wider">進行中合約與剩餘堂數</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {customers
                              .filter(s => s.trainerId === t.id)
                              .map((s) => {
                                const studentContracts = getStudentContracts(s.id)
                                return (
                                  <tr key={s.id} className="hover:bg-brand-50/10 transition-colors duration-150">
                                    <td className="px-5 py-4.5 font-bold text-stone-900 flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-full bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-bold text-xs">
                                        {s.name.charAt(0)}
                                      </div>
                                      {s.name}
                                    </td>
                                    <td className="px-5 py-4.5 text-stone-600 font-mono text-xs">
                                      {s.phone}
                                    </td>
                                    <td className="px-5 py-4.5 space-y-2">
                                      {studentContracts.length === 0 ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-500">
                                          暫無合約
                                        </span>
                                      ) : (
                                        studentContracts.map((c) => {
                                          const percent = c.totalSessions ? Math.round((c.remainingSessions / c.totalSessions) * 100) : 0
                                          return (
                                            <div key={c.id} className="bg-stone-50 border border-stone-200/50 rounded-xl p-3 space-y-1.5 max-w-sm">
                                              <div className="flex justify-between items-center text-[10px]">
                                                <span className={cn(
                                                  "px-1.5 py-0.5 rounded font-bold uppercase",
                                                  c.contractType === 'dual' 
                                                    ? "bg-purple-100 text-purple-700" 
                                                    : "bg-blue-100 text-blue-700"
                                                )}>
                                                  {c.contractType === 'dual' ? '👥 雙人' : '👤 單人'}
                                                </span>
                                                <span className="font-extrabold text-stone-700">
                                                  剩餘 {c.remainingSessions} / {c.totalSessions} 堂
                                                </span>
                                              </div>
                                              <div className="w-full bg-stone-200 rounded-full h-1">
                                                <div 
                                                  className={cn(
                                                    "h-1 rounded-full transition-all",
                                                    percent <= 20 ? "bg-red-500" : percent <= 50 ? "bg-amber-500" : "bg-brand-600"
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
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredAndSortedTrainers.length === 0 && (
          <div className="py-12 text-center text-stone-400 font-medium text-sm">
            無匹配的教練資料
          </div>
        )}
      </div>

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

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-bold text-stone-900">確認刪除銷課紀錄？</DialogTitle>
            <DialogDescription className="text-stone-500 mt-2 text-xs">
              刪除此銷課紀錄後，該學員的合約剩餘堂數將會自動增加（歸還），且教練歷史銷課堂數也會扣除。此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 font-semibold">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteRecord} className="flex-1 font-semibold">
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
