import { useState } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { RiMoneyDollarCircleLine } from '@remixicon/react'
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiMoneyDollarCircleLine className="w-6 h-6 text-orange-500" />
            現金流量表
          </h1>
          <p className="text-sm text-stone-500 mt-1">管理借貸與收支紀錄</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsModalOpen(true)} className="font-semibold text-sm px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl">+ 新增記帳</Button>
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
