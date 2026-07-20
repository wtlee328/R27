import { useState, useMemo } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownRight, Upload, TrendingUp, BarChart2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { CashFlowTable } from '../components/cashflow/CashFlowTable'
import { CashFlowFormModal } from '../components/cashflow/CashFlowFormModal'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import { useCashFlow } from '../hooks/useCashFlow'
import type { CashFlowFormValues } from '../lib/validators'
import type { ProfitLossData, ProfitLossRow } from '../types'

type TabType = 'cash-flow' | 'profit-loss'

export default function FinancePage() {
  const { records, loading, createRecord } = useCashFlow()
  const [activeTab, setActiveTab] = useState<TabType>('cash-flow')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const handleCreateRecord = async (data: CashFlowFormValues) => {
    await createRecord(data)
  }

  // --- Cash Flow Stats ---
  const totalIncome = useMemo(() => records.reduce((sum, r) => sum + r.debitAmount, 0), [records])
  const totalExpense = useMemo(() => records.reduce((sum, r) => sum + r.creditAmount, 0), [records])
  const netIncome = useMemo(() => totalIncome - totalExpense, [totalIncome, totalExpense])

  // --- Profit & Loss Calculation ---
  const profitLossData = useMemo<ProfitLossData>(() => {
    const yearRecords = records.filter(
      (r) => r.date && r.date.toDate().getFullYear() === selectedYear
    )

    const incomeMap = new Map<string, (number | null)[]>()
    const expenseMap = new Map<string, (number | null)[]>()
    const initMonths = () => Array(12).fill(null)

    const isAssetOrLiability = (cat: string) =>
      ['現金', '銀行存款', '公司存款', '預收款', '應付帳款', '業主資本', '業主往來', '應收帳款'].some((a) => cat.includes(a))

    yearRecords.forEach((r) => {
      const monthIndex = r.date.toDate().getMonth()

      if (!isAssetOrLiability(r.creditCategory)) {
        if (!incomeMap.has(r.creditCategory)) incomeMap.set(r.creditCategory, initMonths())
        const arr = incomeMap.get(r.creditCategory)!
        arr[monthIndex] = (arr[monthIndex] || 0) + r.creditAmount
      }

      if (!isAssetOrLiability(r.debitCategory)) {
        if (!expenseMap.has(r.debitCategory)) expenseMap.set(r.debitCategory, initMonths())
        const arr = expenseMap.get(r.debitCategory)!
        arr[monthIndex] = (arr[monthIndex] || 0) + r.debitAmount
      }
    })

    const toRows = (map: Map<string, (number | null)[]>): ProfitLossRow[] => {
      return Array.from(map.entries()).map(([category, months]) => ({
        category,
        months,
        total: months.reduce((a, b) => (a || 0) + (b || 0), 0),
      }))
    }

    const income = toRows(incomeMap)
    const expenses = toRows(expenseMap)

    const totalIncomeArr = initMonths()
    const totalExpensesArr = initMonths()
    const netIncomeArr = initMonths()

    for (let i = 0; i < 12; i++) {
      const mIncome = income.reduce((sum, row) => sum + (row.months[i] || 0), 0)
      const mExpense = expenses.reduce((sum, row) => sum + (row.months[i] || 0), 0)
      
      totalIncomeArr[i] = mIncome > 0 ? mIncome : null
      totalExpensesArr[i] = mExpense > 0 ? mExpense : null
      
      const net = mIncome - mExpense
      netIncomeArr[i] = mIncome > 0 || mExpense > 0 ? net : null
    }

    return {
      year: selectedYear,
      income,
      totalIncome: totalIncomeArr,
      expenses,
      totalExpenses: totalExpensesArr,
      netIncome: netIncomeArr,
    }
  }, [records, selectedYear])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">會計管理</h1>
          <p className="text-sm text-stone-500 mt-1">管理收支流水並掌握月度營收與損益統計</p>
        </div>

        {/* Tab Controls */}
        <div className="flex p-1 bg-stone-100 rounded-xl border border-stone-200/50 self-start sm:self-center">
          <button
            onClick={() => setActiveTab('cash-flow')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'cash-flow'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            現金流量表
          </button>
          <button
            onClick={() => setActiveTab('profit-loss')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'profit-loss'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            損益表
          </button>
        </div>
      </div>

      {/* Tab Contents: Cash Flow */}
      {activeTab === 'cash-flow' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-600">收支流水帳目</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                匯入 CSV
              </Button>
              <Button onClick={() => setIsModalOpen(true)} size="sm">+ 新增記帳</Button>
            </div>
          </div>

          {/* Stats cards */}
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
      )}

      {/* Tab Contents: Profit Loss */}
      {activeTab === 'profit-loss' && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-600">{selectedYear} 年度損益統計</h3>
            <select
              className="border border-stone-200 rounded-lg px-3 py-1.5 text-xs bg-white font-medium text-stone-700 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-colors cursor-pointer"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[0, 1, 2].map((offset) => {
                const y = new Date().getFullYear() - offset
                return (
                  <option key={y} value={y}>
                    {y} 年度
                  </option>
                )
              })}
            </select>
          </div>

          {loading ? (
            <div className="loading-spinner"><span /></div>
          ) : (
            <ProfitLossTable data={profitLossData} />
          )}
        </div>
      )}
    </div>
  )
}
