import { useState } from 'react'
import { Users, UserCheck, TrendingUp } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { TrialTable } from '../components/trials/TrialTable'
import { TrialFormModal } from '../components/trials/TrialFormModal'
import { useTrials } from '../hooks/useTrials'
import type { TrialRecordFormValues } from '../lib/validators'

export default function TrialsPage() {
  const { trials, loading, createTrial, deleteTrial, updateTrial } = useTrials()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCreateTrial = async (data: TrialRecordFormValues) => {
    await createTrial(data)
  }

  const handleUpdateStatus = async (id: string, outcome: 'pending' | 'converted' | 'not_converted') => {
    await updateTrial(id, { outcome })
  }

  // Calculate stats for current month
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const currentMonthTrials = trials.filter((r) => {
    const d = r.date?.toDate()
    return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const convertedThisMonth = currentMonthTrials.filter((r) => r.outcome === 'converted').length
  const totalThisMonth = currentMonthTrials.length
  
  const conversionRate = totalThisMonth > 0 
    ? Math.round((convertedThisMonth / totalThisMonth) * 100) 
    : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">體驗客管理</h1>
          <p className="text-sm text-stone-500 mt-1">追蹤體驗課程與名單轉換率</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>+ 新增體驗客</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="本月體驗人數"
          value={`${totalThisMonth} 人`}
          icon={Users}
        />
        <StatCard
          title="本月成交人數"
          value={`${convertedThisMonth} 人`}
          icon={UserCheck}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title="本月轉換率"
          value={`${conversionRate} %`}
          icon={TrendingUp}
          subtitle={`目標 > 30%`}
        />
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <TrialTable 
          trials={trials} 
          onDelete={deleteTrial} 
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      <TrialFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateTrial}
      />
    </div>
  )
}
