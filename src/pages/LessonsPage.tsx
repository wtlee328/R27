import { useState, useMemo } from 'react'
import { CalendarCheck, Activity, Users, ArrowLeft, ArrowUpDown, Search, UserCheck, ShieldAlert, BookOpen } from 'lucide-react'
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
  const { trainers, loading: loadingTrainers, runMigration, migrationRunning, addTrainer, refresh: refreshTrainers } = useTrainers()
  const { customers, contracts, refresh: refreshCustomers } = useCustomers()

  // Selected trainer state (null = dashboard grid view, string = detail view)
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
  const [activeTab, setActiveTab] = useState<'students' | 'history'>('students')
  
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

  // Filter & sort trainers
  const filteredAndSortedTrainers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = trainers.filter(t => 
      t.name.toLowerCase().includes(query) ||
      t.email.toLowerCase().includes(query) ||
      t.phone.includes(query)
    )

    return [...filtered].sort((a, b) => {
      let comparison = 0
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name, 'zh-Hant')
      } else {
        comparison = a[sortField] - b[sortField]
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [trainers, searchQuery, sortField, sortOrder])

  // Get selected trainer details
  const selectedTrainer = useMemo(() => {
    return trainers.find(t => t.id === selectedTrainerId)
  }, [trainers, selectedTrainerId])

  // Get lesson records of the selected trainer
  const trainerRecords = useMemo(() => {
    if (!selectedTrainerId) return []
    // Get students assigned to this trainer
    const trainerStudentIds = customers
      .filter(c => c.trainerId === selectedTrainerId)
      .map(c => c.id)

    return records.filter(r => 
      r.trainerId === selectedTrainerId || 
      trainerStudentIds.includes(r.customerId)
    )
  }, [records, selectedTrainerId, customers])

  // Filtered trainer lesson records (by student name search)
  const filteredTrainerRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return trainerRecords
    return trainerRecords.filter(r => 
      r.customerName.toLowerCase().includes(query) ||
      (r.attendingCustomerNames && r.attendingCustomerNames.some(name => name.toLowerCase().includes(query)))
    )
  }, [trainerRecords, searchQuery])
  // Get students assigned to this trainer
  const trainerStudents = useMemo(() => {
    if (!selectedTrainerId) return []
    return customers.filter(c => c.trainerId === selectedTrainerId)
  }, [customers, selectedTrainerId])

  // Filtered trainer students
  const filteredTrainerStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return trainerStudents
    return trainerStudents.filter(c => 
      c.name.toLowerCase().includes(query) ||
      c.phone.includes(query)
    )
  }, [trainerStudents, searchQuery])

  // Helper to get contracts for a specific student
  const getStudentContracts = (studentId: string) => {
    return contracts.filter(con => 
      (con.customerIds && con.customerIds.includes(studentId)) || 
      con.customerId === studentId ||
      con.primaryCustomerId === studentId ||
      con.sharedWithCustomerId === studentId
    )
  }
  // Helper to look up remaining sessions for a contract
  const getContractRemaining = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId)
    return contract ? contract.remainingSessions : 0
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

  // Dashboard Stats
  const totalSystemRemaining = trainers.reduce((sum, t) => sum + t.systemLessons, 0)
  const totalHistoryConsumed = trainers.reduce((sum, t) => sum + t.totalUsedLessons, 0)

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
      {!selectedTrainerId ? (
        // DASHBOARD MODE
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 tracking-tight">教練銷課管理</h1>
              <p className="text-sm text-stone-500 mt-1">追蹤教練的課程堂數消耗與系統剩餘堂數</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setIsTrainerOnboardOpen(true)} className="font-semibold text-sm px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white">
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
              subtitle="教練 A、B、C 獨立名單"
            />
          </div>

          {/* TRAINERS TABLE & SEARCH */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="font-bold text-stone-900 text-base">教練績效與堂數列表</h3>
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

            <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-stone-50 text-stone-500 border-b border-stone-200 select-none">
                  <tr>
                    <th 
                      onClick={() => handleSort('name')}
                      className="px-6 py-4 font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-stone-100 hover:text-stone-900 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        教練姓名
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">聯絡資訊</th>
                    <th 
                      onClick={() => handleSort('systemLessons')}
                      className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right cursor-pointer hover:bg-stone-100 hover:text-stone-900 transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        系統剩餘堂數
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('totalUsedLessons')}
                      className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right cursor-pointer hover:bg-stone-100 hover:text-stone-900 transition-colors"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        累計已銷堂數
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredAndSortedTrainers.map((t) => (
                    <tr 
                      key={t.id} 
                      onClick={() => {
                        setSelectedTrainerId(t.id)
                        setSearchQuery('') // clear search for detailed view
                      }}
                      className="hover:bg-brand-50/20 active:bg-brand-50/40 transition-all duration-200 cursor-pointer group"
                    >
                      <td className="px-6 py-4.5 font-bold text-stone-900 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-black text-sm">
                          {t.name.charAt(0)}
                        </div>
                        <div>
                          <p className="group-hover:text-brand-600 transition-colors">{t.name}</p>
                          <span className="text-[10px] text-stone-400 font-normal">點擊查看銷課明細</span>
                        </div>
                      </td>
                      <td className="px-6 py-4.5 text-stone-600">
                        <p className="text-xs">{t.email}</p>
                        <p className="text-xs text-stone-400 font-mono mt-0.5">{t.phone}</p>
                      </td>
                      <td className="px-6 py-4.5 text-right font-extrabold text-stone-900 text-sm tabular-nums">
                        {t.systemLessons} 堂
                      </td>
                      <td className="px-6 py-4.5 text-right">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200/60 tabular-nums">
                          {t.totalUsedLessons} 堂
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredAndSortedTrainers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-stone-400 font-medium text-sm">
                        無匹配的教練資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        // TRAINER DETAIL MODE
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
            <button
              onClick={() => {
                setSelectedTrainerId(null)
                setSearchQuery('')
              }}
              className="inline-flex items-center gap-2 text-stone-600 hover:text-brand-600 font-bold transition-colors text-sm self-start"
            >
              <ArrowLeft className="w-4 h-4" /> 返回教練列表
            </button>
            <Button onClick={handleOpenCreate} className="self-end md:self-auto">+ 新增教練銷課</Button>
          </div>

          {/* Trainer Card Details */}
          {selectedTrainer && (
            <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
              <div className="absolute right-0 top-0 -translate-y-8 translate-x-8 text-white/5 font-black text-9xl pointer-events-none select-none">
                R27
              </div>
              <div className="flex items-center gap-4.5 z-10">
                <div className="w-16 h-16 rounded-full bg-brand-500 border-4 border-stone-700 text-white flex items-center justify-center font-black text-2xl shadow-inner">
                  {selectedTrainer.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-2xl font-black">{selectedTrainer.name}</h2>
                  <p className="text-xs text-stone-400 mt-1 flex items-center gap-3">
                    <span>📧 {selectedTrainer.email}</span>
                    <span>📞 {selectedTrainer.phone}</span>
                  </p>
                </div>
              </div>
              
              <div className="flex gap-4 md:gap-8 z-10">
                <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <p className="text-[10px] text-stone-300 font-bold uppercase tracking-wider mb-1">系統剩餘堂數</p>
                  <p className="text-2xl font-black tabular-nums">{selectedTrainer.systemLessons} <span className="text-xs font-normal">堂</span></p>
                </div>
                <div className="bg-white/10 px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <p className="text-[10px] text-stone-300 font-bold uppercase tracking-wider mb-1">累計已銷堂數</p>
                  <p className="text-2xl font-black text-brand-400 tabular-nums">{selectedTrainer.totalUsedLessons} <span className="text-xs font-normal text-white">堂</span></p>
                </div>
              </div>
            </div>
          )}

          {/* TABS SWITCHER */}
          <div className="flex border-b border-stone-200 mt-2">
            <button
              onClick={() => {
                setActiveTab('students')
                setSearchQuery('')
              }}
              className={cn(
                "px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2",
                activeTab === 'students'
                  ? "border-brand-500 text-brand-600 font-extrabold"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              )}
            >
              👥 專屬學員名單 & 剩餘課堂
              <span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                {trainerStudents.length}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('history')
                setSearchQuery('')
              }}
              className={cn(
                "px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2",
                activeTab === 'history'
                  ? "border-brand-500 text-brand-600 font-extrabold"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              )}
            >
              📖 歷史上課銷課紀錄
              <span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                {trainerRecords.length}
              </span>
            </button>
          </div>

          {activeTab === 'students' ? (
            /* Student List View */
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-stone-900 text-base">專屬學員與合約剩餘堂數</h3>
                  <p className="text-xs text-stone-400 mt-0.5">顯示指派給此教練的學生以及他們目前合約的剩餘堂數細節</p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="搜尋學員姓名或電話..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm text-left">
                  <thead className="bg-stone-50 text-stone-500 border-b border-stone-200 select-none">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">學員姓名</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">聯絡電話</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">進行中合約與剩餘堂數</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTrainerStudents.map((s) => {
                      const studentContracts = getStudentContracts(s.id)
                      return (
                        <tr key={s.id} className="hover:bg-brand-50/10 transition-colors duration-150">
                          <td className="px-6 py-5.5 font-bold text-stone-950 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center font-bold text-xs">
                              {s.name.charAt(0)}
                            </div>
                            {s.name}
                          </td>
                          <td className="px-6 py-5.5 text-stone-600 font-mono">
                            {s.phone}
                          </td>
                          <td className="px-6 py-5.5 space-y-3">
                            {studentContracts.length === 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-stone-100 text-stone-500 border border-stone-200">
                                暫無合約
                              </span>
                            ) : (
                              studentContracts.map((c) => {
                                const percent = c.totalSessions ? Math.round((c.remainingSessions / c.totalSessions) * 100) : 0
                                return (
                                  <div key={c.id} className="bg-stone-50/80 border border-stone-200/60 rounded-xl p-3.5 space-y-2 max-w-lg">
                                    <div className="flex justify-between items-center text-xs">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn(
                                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                          c.contractType === 'dual' 
                                            ? "bg-purple-100 text-purple-700 border border-purple-200" 
                                            : "bg-blue-100 text-blue-700 border border-blue-200"
                                        )}>
                                          {c.contractType === 'dual' ? '👥 雙人' : '👤 單人'}
                                        </span>
                                        <span className="text-stone-400 font-mono">#{c.id.substring(0, 8)}</span>
                                      </div>
                                      <span className="font-extrabold text-stone-900 tabular-nums">
                                        剩餘 {c.remainingSessions} / 總共 {c.totalSessions} 堂
                                      </span>
                                    </div>
                                    
                                    {/* Progress Bar */}
                                    <div className="w-full bg-stone-200 rounded-full h-1.5">
                                      <div 
                                        className={cn(
                                          "h-1.5 rounded-full transition-all duration-300",
                                          percent <= 20 ? "bg-red-500" : percent <= 50 ? "bg-amber-500" : "bg-brand-600"
                                        )}
                                        style={{ width: `${percent}%` }}
                                      />
                                    </div>

                                    {c.endDate && (
                                      <div className="flex justify-between text-[10px] text-stone-400 font-semibold pt-1">
                                        <span>到期日: {format(c.endDate.toDate(), 'yyyy/MM/dd')}</span>
                                        {c.status === 'expiring' && (
                                          <span className="text-red-500 font-bold animate-pulse">⚠️ 即將到期</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {filteredTrainerStudents.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-16 text-center text-stone-400 font-medium">
                          此教練名下暫無對應的學生學員
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Historical Lesson Records View */
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-stone-900 text-base">學生上課銷課明細</h3>
                  <p className="text-xs text-stone-400 mt-0.5">顯示目前教練名下所有學生的歷史上課紀錄</p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="搜尋學員姓名..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-sm text-left">
                  <thead className="bg-stone-50 text-stone-500 border-b border-stone-200 select-none">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">上課日期</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">學員姓名</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-center">消耗堂數</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-center">合約剩餘堂數</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider">備註</th>
                      <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTrainerRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-brand-50/10 transition-colors duration-150 group">
                        <td className="px-6 py-4 text-stone-500 tabular-nums">
                          {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy/MM/dd') : '-'}
                        </td>
                        <td className="px-6 py-4 font-bold text-stone-950">
                          {r.attendingCustomerNames && r.attendingCustomerNames.length > 0
                            ? r.attendingCustomerNames.join(' & ')
                            : r.customerName}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-sky-50 text-sky-700 border border-sky-200/60 tabular-nums">
                            {r.sessionAmount} 堂
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-extrabold text-stone-700 tabular-nums">
                          {getContractRemaining(r.contractId)} 堂
                        </td>
                        <td className="px-6 py-4 text-stone-500 max-w-xs truncate">{r.notes || '-'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
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
                    ))}
                    {filteredTrainerRecords.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-16 text-center bg-white">
                          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
                            <span className="text-stone-400 text-lg">📖</span>
                          </div>
                          <p className="text-stone-500 text-sm font-medium">該教練目前沒有銷課明細</p>
                          <p className="text-stone-400 text-xs mt-1">點擊右上方按鈕開始新增銷課</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

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
