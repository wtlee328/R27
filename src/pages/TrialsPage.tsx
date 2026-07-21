import { useState, useMemo } from 'react'
import { Users, UserCheck, TrendingUp, Calendar } from 'lucide-react'
import { RiUserSearchLine } from '@remixicon/react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { FilterDropdown } from '../components/shared/FilterDropdown'
import { TrialTable } from '../components/trials/TrialTable'
import { TrialFormModal } from '../components/trials/TrialFormModal'
import { useTrials } from '../hooks/useTrials'
import type { TrialRecordFormValues } from '../lib/validators'
import { format } from 'date-fns'

export default function TrialsPage() {
  const { trials, loading, createTrial, deleteTrial, updateTrial } = useTrials()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

  const handleCreateTrial = async (data: TrialRecordFormValues) => {
    await createTrial(data)
  }

  const handleUpdateStatus = async (id: string, outcome: 'pending' | 'converted' | 'not_converted') => {
    await updateTrial(id, { outcome })
  }

  // Generate month options
  const monthOptions = useMemo(() => {
    const monthsSet = new Set<string>()
    const currentMonthStr = format(new Date(), 'yyyy/MM')
    monthsSet.add(currentMonthStr)
    
    trials.forEach(r => {
      if (r.date) {
        monthsSet.add(format(r.date.toDate(), 'yyyy/MM'))
      }
    })
    
    return Array.from(monthsSet).sort().reverse()
  }, [trials])

  // Filter trials by selected month
  const filteredTrials = useMemo(() => {
    if (selectedMonth === 'all') return trials
    return trials.filter((r) => {
      const d = r.date?.toDate()
      return d && format(d, 'yyyy/MM') === selectedMonth
    })
  }, [trials, selectedMonth])

  // Calculate stats for selected month
  const convertedCount = filteredTrials.filter((r) => r.outcome === 'converted').length
  const totalCount = filteredTrials.length
  
  const conversionRate = totalCount > 0 
    ? Math.round((convertedCount / totalCount) * 100) 
    : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiUserSearchLine className="w-6 h-6 text-orange-500" />
            體驗客管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">追蹤體驗課程與名單轉換率</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="font-semibold text-sm px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl">+ 新增體驗客</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title={selectedMonth === 'all' ? '累計體驗人數' : '當月體驗人數'}
          value={`${totalCount} 人`}
          icon={Users}
        />
        <StatCard
          title={selectedMonth === 'all' ? '累計成交人數' : '當月成交人數'}
          value={`${convertedCount} 人`}
          icon={UserCheck}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title={selectedMonth === 'all' ? '累計轉換率' : '當月轉換率'}
          value={`${conversionRate} %`}
          icon={TrendingUp}
          subtitle={`目標 > 30%`}
        />
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-stone-500 select-none">選擇月份</span>
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
              icon={Calendar}
              label="選擇月份"
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-spinner"><span /></div>
        ) : (
          <TrialTable 
            trials={filteredTrials} 
            onDelete={deleteTrial} 
            onUpdateStatus={handleUpdateStatus}
          />
        )}
      </div>

      <TrialFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateTrial}
      />
    </div>
  )
}
