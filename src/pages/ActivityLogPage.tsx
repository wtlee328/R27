import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Search, Filter, Calendar, User, Info, ArrowDown, ArrowUp } from 'lucide-react'
import { RiHistoryLine } from '@remixicon/react'
import { useActivityLogs } from '@/hooks/useActivityLogs'
import { useTrainers } from '@/hooks/useTrainers'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/shared/StatCard'
import { ACTIVITY_ACTION_LABELS, ACTIVITY_MODULE_LABELS } from '@/lib/constants'

export default function ActivityLogPage() {
  const { logs, loading, refresh } = useActivityLogs()
  const { trainers } = useTrainers()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedModule, setSelectedModule] = useState<string>('all')
  const [selectedAction, setSelectedAction] = useState<string>('all')

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch =
        log.trainerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.recordSummary.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchModule = selectedModule === 'all' || log.module === selectedModule
      const matchAction = selectedAction === 'all' || log.action === selectedAction

      return matchSearch && matchModule && matchAction
    })
  }, [logs, searchTerm, selectedModule, selectedAction])

  const formatLogDate = (timestamp: any) => {
    if (!timestamp) return ''
    return format(timestamp.toDate(), 'yyyy/MM/dd HH:mm:ss')
  }

  // Count stats
  const totalLogsCount = filteredLogs.length
  const createsCount = filteredLogs.filter(l => l.action === 'create').length
  const deletesCount = filteredLogs.filter(l => l.action === 'delete').length

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
          <RiHistoryLine className="w-6 h-6 text-orange-500" />
          操作記錄
        </h1>
        <p className="text-sm text-stone-500 mt-1">審查與追蹤教練介面的銷課、預約與表單異動記錄</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Input
              type="text"
              placeholder="搜尋教練或操作摘要..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 pl-9 border-stone-200 text-xs rounded-xl"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          </div>

          {/* Module Filter */}
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="bg-white border border-stone-200 text-stone-950 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer h-10"
          >
            <option value="all">所有功能模組</option>
            <option value="lessonRecords">教練銷課 (Lessons)</option>
            <option value="trialRecords">體驗客 (Trials)</option>
            <option value="venueBookings">場租申請 (Bookings)</option>
            <option value="customers">學員管理 (Customers)</option>
          </select>

          {/* Action Filter */}
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-white border border-stone-200 text-stone-950 px-3 py-2 rounded-xl text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer h-10"
          >
            <option value="all">所有動作類型</option>
            <option value="create">新增 (Create)</option>
            <option value="update">編輯 (Update)</option>
            <option value="delete">刪除 (Delete)</option>
          </select>
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
                      <div className="flex items-center gap-2">
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
