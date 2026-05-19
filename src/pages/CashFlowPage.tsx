import { useState } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownRight, Upload } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { CashFlowTable } from '../components/cashflow/CashFlowTable'
import { CashFlowFormModal } from '../components/cashflow/CashFlowFormModal'
import { useCashFlow } from '../hooks/useCashFlow'
import type { CashFlowFormValues } from '../lib/validators'

export default function CashFlowPage() {
  const { records, loading, createRecord } = useCashFlow()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCreateRecord = async (data: CashFlowFormValues) => {
    await createRecord(data)
  }

  // Calculate totals
  const totalIncome = records.reduce((sum, r) => sum + r.debitAmount, 0)
  const totalExpense = records.reduce((sum, r) => sum + r.creditAmount, 0)
  const netIncome = totalIncome - totalExpense

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">現金流量表</h1>
          <p className="text-sm text-stone-500 mt-1">管理借貸與收支紀錄</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            匯入 CSV
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>+ 新增記帳</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="總收入 (借方)"
          value={`NT$ ${totalIncome.toLocaleString()}`}
          icon={ArrowUpRight}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title="總支出 (貸方)"
          value={`NT$ ${totalExpense.toLocaleString()}`}
          icon={ArrowDownRight}
          iconColor="text-red-500"
          iconBg="bg-red-50"
        />
        <StatCard
          title="淨利"
          value={`NT$ ${netIncome.toLocaleString()}`}
          icon={DollarSign}
          subtitle={netIncome >= 0 ? '盈餘' : '虧損'}
        />
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <CashFlowTable records={records} />
      )}

      <CashFlowFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateRecord}
      />
    </div>
  )
}
