import { useState, useMemo } from 'react'
import { useCashFlow } from '../hooks/useCashFlow'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import { normalizeCashFlowRecord } from '../components/cashflow/CashFlowTable'
import type { ProfitLossData, ProfitLossRow } from '../types'

export default function ProfitLossPage() {
  const { records, loading } = useCashFlow()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const profitLossData = useMemo<ProfitLossData>(() => {
    const yearRecords = records.filter(
      (r) => r.date && r.date.toDate().getFullYear() === selectedYear
    )

    const incomeMap = new Map<string, (number | null)[]>()
    const expenseMap = new Map<string, (number | null)[]>()
    const initMonths = () => Array(12).fill(null)

    const isAssetOrLiability = (cat: string) =>
      ['現金', '銀行存款', '公司存款', '預收款', '應付帳款', '業主資本', '業主往來', '應收帳款'].some((a) => cat.includes(a))

    yearRecords.map(normalizeCashFlowRecord).forEach((r) => {
      const monthIndex = r.date.toDate().getMonth()
      const cat = r.category || '一般收支'

      if (r.type === 'income') {
        if (!isAssetOrLiability(cat)) {
          if (!incomeMap.has(cat)) incomeMap.set(cat, initMonths())
          const arr = incomeMap.get(cat)!
          arr[monthIndex] = (arr[monthIndex] || 0) + r.amount
        }
      } else {
        if (!isAssetOrLiability(cat)) {
          if (!expenseMap.has(cat)) expenseMap.set(cat, initMonths())
          const arr = expenseMap.get(cat)!
          arr[monthIndex] = (arr[monthIndex] || 0) + r.amount
        }
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

    const totalIncome = initMonths()
    const totalExpenses = initMonths()
    const netIncome = initMonths()

    for (let i = 0; i < 12; i++) {
      const mIncome = income.reduce((sum, row) => sum + (row.months[i] || 0), 0)
      const mExpense = expenses.reduce((sum, row) => sum + (row.months[i] || 0), 0)

      totalIncome[i] = mIncome > 0 ? mIncome : null
      totalExpenses[i] = mExpense > 0 ? mExpense : null

      const net = mIncome - mExpense
      netIncome[i] = mIncome > 0 || mExpense > 0 ? net : null
    }

    return {
      year: selectedYear,
      income,
      totalIncome,
      expenses,
      totalExpenses,
      netIncome,
    }
  }, [records, selectedYear])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">損益表</h1>
          <p className="text-sm text-stone-500 mt-1">管理月度損益與統計分析</p>
        </div>
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
  )
}
