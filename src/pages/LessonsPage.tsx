import { useState } from 'react'
import { CalendarCheck, Activity, Users } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { LessonTable } from '../components/lessons/LessonTable'
import { LessonRecordWizard } from '../components/lessons/LessonRecordWizard'
import { useLessonRecords } from '../hooks/useLessonRecords'
import type { LessonRecordFormValues } from '../lib/validators'
import type { LessonRecord } from '../types'

export default function LessonsPage() {
  const { records, loading, createRecord, deleteRecord, updateRecord } = useLessonRecords()
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LessonRecord | null>(null)

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
      await createRecord(data)
    }
  }

  // Calculate stats for current month
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const currentMonthRecords = records.filter((r) => {
    const d = r.sessionDate?.toDate()
    return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const totalSessionsThisMonth = currentMonthRecords.reduce(
    (sum, r) => sum + r.sessionAmount,
    0
  )

  // Unique clients this month
  const uniqueClients = new Set(currentMonthRecords.map((r) => r.customerId)).size

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">教練銷課</h1>
          <p className="text-sm text-stone-500 mt-1">紀錄與管理上課堂數</p>
        </div>
        <Button onClick={handleOpenCreate}>+ 新增銷課</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="本月總銷課"
          value={`${totalSessionsThisMonth} 堂`}
          icon={CalendarCheck}
        />
        <StatCard
          title="本月上課人數"
          value={`${uniqueClients} 人`}
          icon={Users}
        />
        <StatCard
          title="總計銷課"
          value={`${records.reduce((sum, r) => sum + r.sessionAmount, 0)} 堂`}
          icon={Activity}
          subtitle="歷史累計所有堂數"
        />
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <LessonTable 
          records={records} 
          onDelete={deleteRecord} 
          onEdit={handleOpenEdit} 
        />
      )}

      <LessonRecordWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onSubmit={handleWizardSubmit}
        initialData={editingRecord}
      />
    </div>
  )
}
