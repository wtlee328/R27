import { useState, useMemo } from 'react'
import { useCashFlow } from '../hooks/useCashFlow'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import { normalizeCashFlowRecord } from '../components/cashflow/CashFlowTable'
import type { ProfitLossData, ProfitLossRow } from '../types'

export default function ProfitLossPage() {
  const { records, loading } = useCashFlow()
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(now.getMonth() + 1)

  const monthLabel = useMemo(() => {
    if (selectedMonth === 'all') return '全年度'
    return `${String(selectedMonth).padStart(2, '0')}月`
  }, [selectedMonth])

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">損益表</h1>
          <p className="text-sm text-stone-500 mt-1">管理 {selectedYear} 年 {monthLabel} 損益統計與分析</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-stone-50 font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[0, 1, 2].map((offset) => {
              const y = now.getFullYear() - offset
              return (
                <option key={y} value={y}>
                  {y} 年
                </option>
              )
            })}
          </select>

          <select
            className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-stone-50 font-bold text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
            value={selectedMonth}
            onChange={(e) => {
              const val = e.target.value
              setSelectedMonth(val === 'all' ? 'all' : Number(val))
            }}
          >
            <option value="all">所有月份 (全年度)</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')} 月
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <ProfitLossTable data={profitLossData} selectedMonth={selectedMonth} />
      )}
    </div>
  )
}
