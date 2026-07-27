import { useState, useMemo, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { Database, Search, Filter, Calendar, User, Info, ArrowDown, ArrowUp, Building2, RefreshCw } from 'lucide-react'
import { RiHistoryLine } from '@remixicon/react'
import { collection, query, orderBy, limit, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useActivityLogs } from '@/hooks/useActivityLogs'
import { useTrainers } from '@/hooks/useTrainers'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/shared/StatCard'
import { FilterDropdown } from '@/components/shared/FilterDropdown'
import { Button } from '@/components/ui/button'
import { ACTIVITY_ACTION_LABELS, ACTIVITY_MODULE_LABELS } from '@/lib/constants'

export default function ActivityLogPage() {
  const { logs, loading, refresh } = useActivityLogs()
  const { trainers } = useTrainers()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCenter, setSelectedCenter] = useState<string>('all')
  const [selectedModule, setSelectedModule] = useState<string>('all')
  const [selectedAction, setSelectedAction] = useState<string>('all')
  const [isFixing, setIsFixing] = useState(false)
  const autoMigratedRef = useRef(false)

  // Auto fix logs starting from 馮安怡 to Coffit
  useEffect(() => {
    if (logs.length > 0 && !autoMigratedRef.current) {
      const targetIdx = logs.findIndex(l => l.recordSummary && l.recordSummary.includes('馮安怡'))
      if (targetIdx !== -1) {
        const needsFix = logs.slice(0, targetIdx + 1).some(l => l.centerId !== 'coffit')
        if (needsFix) {
          autoMigratedRef.current = true
          handleFixCoffitLogs(true)
        }
      }
    }
  }, [logs])

  const handleFixCoffitLogs = async (silent = false) => {
    try {
      setIsFixing(true)
      const logsRef = collection(db, 'activityLogs')
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(300))
      const snapshot = await getDocs(q)
      
      const docs = snapshot.docs.map(d => ({
        id: d.id,
        ref: d.ref,
        summary: d.data().recordSummary || '',
        centerId: d.data().centerId
      }))

      const targetIdx = docs.findIndex(d => d.summary.includes('馮安怡'))
      if (targetIdx === -1) {
        if (!silent) alert('未在資料庫找到「馮安怡」的操作記錄')
        return
      }

      const toUpdate = docs.slice(0, targetIdx + 1)
      let count = 0
      for (const d of toUpdate) {
        if (d.centerId !== 'coffit') {
          await updateDoc(d.ref, { centerId: 'coffit' })
          count++
        }
      }

      if (count > 0) {
        await refresh()
        if (!silent) alert(`校正完成！已將「馮安怡」及後續共 ${count} 筆操作記錄更正為 Coffit。`)
      } else if (!silent) {
        alert('記錄均已完成校正為 Coffit。')
      }
    } catch (err: any) {
      console.error('Migration error:', err)
      if (!silent) alert('校正記錄時發生錯誤：' + err.message)
    } finally {
      setIsFixing(false)
    }
  }

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const centerLabel = log.centerId === 'coffit' ? 'coffit' : log.centerId === 'r27' ? 'r27 健身' : '通用場館'
      const matchSearch =
        log.trainerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.recordSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        centerLabel.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchCenter = selectedCenter === 'all' || log.centerId === selectedCenter || (!log.centerId && selectedCenter === 'r27')
      const matchModule = selectedModule === 'all' || log.module === selectedModule
      const matchAction = selectedAction === 'all' || log.action === selectedAction

      return matchSearch && matchCenter && matchModule && matchAction
    })
  }, [logs, searchTerm, selectedCenter, selectedModule, selectedAction])

  const formatLogDate = (timestamp: any) => {
    if (!timestamp) return ''
    return format(timestamp.toDate(), 'yyyy/MM/dd HH:mm:ss')
  }

  const getCenterBadge = (cId?: string) => {
    if (cId === 'coffit') {
      return (
        <span className="bg-purple-50 text-purple-700 border-purple-200/80 font-bold text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          Coffit
        </span>
      )
    }
    if (cId === 'r27') {
      return (
        <span className="bg-orange-50 text-orange-700 border-orange-200/80 font-bold text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
          R27 健身
        </span>
      )
    }
    return (
      <span className="bg-stone-100 text-stone-600 border-stone-200 font-bold text-[10px] px-2 py-0.5 rounded border inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
        通用場館
      </span>
    )
  }

  // Count stats
  const totalLogsCount = filteredLogs.length
  const createsCount = filteredLogs.filter(l => l.action === 'create').length
  const deletesCount = filteredLogs.filter(l => l.action === 'delete').length

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiHistoryLine className="w-6 h-6 text-orange-500" />
            操作記錄
          </h1>
          <p className="text-sm text-stone-500 mt-1">審查與追蹤全場館教練介面的銷課、預約與表單異動記錄</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFixCoffitLogs(false)}
          disabled={isFixing}
          className="text-xs font-bold text-stone-700 border-stone-200 hover:bg-stone-50 shrink-0 gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-purple-600 ${isFixing ? 'animate-spin' : ''}`} />
          校正近期記錄為 Coffit
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="總操作次數"
          value={`${totalLogsCount} 次`}
          icon={Database}
        />
        <StatCard
          title="新增操作次數"
          value={`${createsCount} 次`}
          icon={ArrowUp}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title="刪除操作次數"
          value={`${deletesCount} 次`}
          icon={ArrowDown}
          iconColor="text-red-600"
          iconBg="bg-red-50"
        />
      </div>

      {/* Filters Card */}
      <div className="bg-white border border-stone-200 shadow-sm rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Input
              type="text"
              placeholder="搜尋教練、摘要或場館..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-9 border-stone-200 text-xs rounded-xl"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          {/* Center Filter */}
          <FilterDropdown
            value={selectedCenter}
            onChange={setSelectedCenter}
            options={[
              { value: 'all', label: '所有場館' },
              { value: 'r27', label: 'R27 健身' },
              { value: 'coffit', label: 'Coffit' },
            ]}
            icon={Building2}
            label="場館過濾"
            className="h-10"
          />

          {/* Module Filter */}
          <FilterDropdown
            value={selectedModule}
            onChange={setSelectedModule}
            options={[
              { value: 'all', label: '所有功能模組' },
              { value: 'lessonRecords', label: '教練銷課 (Lessons)' },
              { value: 'trialRecords', label: '體驗客 (Trials)' },
              { value: 'venueBookings', label: '場租申請 (Bookings)' },
              { value: 'customers', label: '學員管理 (Customers)' },
            ]}
            icon={Filter}
            label="功能模組"
            className="h-10"
          />

          {/* Action Filter */}
          <FilterDropdown
            value={selectedAction}
            onChange={setSelectedAction}
            options={[
              { value: 'all', label: '所有動作類型' },
              { value: 'create', label: '新增 (Create)' },
              { value: 'update', label: '編輯 (Update)' },
              { value: 'delete', label: '刪除 (Delete)' },
            ]}
            label="動作類型"
            className="h-10"
          />
        </div>

        {/* Logs List */}
        <div className="space-y-3 pt-2">
          {loading ? (
            <div className="space-y-2.5">
              <div className="skeleton h-16 w-full" />
              <div className="skeleton h-16 w-full" />
            </div>
          ) : filteredLogs.length > 0 ? (
            <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto pr-1">
              {filteredLogs.map((log) => {
                const actionColor = 
                  log.action === 'create'
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                    : log.action === 'delete'
                      ? 'text-red-600 bg-red-50 border-red-100'
                      : 'text-blue-600 bg-blue-50 border-blue-100'

                return (
                  <div key={log.id} className="py-3.5 flex justify-between items-start gap-4 hover:bg-stone-50/40 px-2 rounded-xl transition-colors">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getCenterBadge(log.centerId)}

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${actionColor}`}>
                          {ACTIVITY_ACTION_LABELS[log.action]}
                        </span>
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">
                          {ACTIVITY_MODULE_LABELS[log.module]}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-stone-800 break-words leading-relaxed">
                        {log.recordSummary}
                      </p>
                      <div className="flex items-center gap-4 text-[10px] text-stone-500 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-stone-400" />
                          {log.trainerName}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-stone-400" />
                          {formatLogDate(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-stone-400 text-xs bg-stone-50/50 rounded-2xl border border-stone-200 border-dashed">
              沒有符合條件的操作記錄
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Stub Input component if not imported from ui
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-stone-50 border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 ${props.className || ''}`}
    />
  )
}
