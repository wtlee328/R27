import { useState, useMemo } from 'react'
import { useCashFlow } from '../hooks/useCashFlow'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import type { ProfitLossData, ProfitLossRow } from '../types'

export default function ProfitLossPage() {
  const { records, loading } = useCashFlow()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const profitLossData = useMemo<ProfitLossData>(() => {
    // Filter records for the selected year
    const yearRecords = records.filter(
      (r) => r.date && r.date.toDate().getFullYear() === selectedYear
    )

    const incomeMap = new Map<string, (number | null)[]>()
    const expenseMap = new Map<string, (number | null)[]>()

    // Initialize maps
    const initMonths = () => Array(12).fill(null)

    // A simple heuristic to separate income and expenses:
    // Any record where debit is an asset (e.g. 現金/銀行存款) and credit is revenue
    // For simplicity, let's treat all creditCategories NOT containing '現金' or '銀行' as income.
    // And all debitCategories NOT containing '現金' or '銀行' as expense.
    const isAssetOrLiability = (cat: string) =>
      ['現金', '銀行存款', '應收帳款', '應付帳款'].some((a) => cat.includes(a))

    yearRecords.forEach((r) => {
      const monthIndex = r.date.toDate().getMonth()

      // Income logic
      if (!isAssetOrLiability(r.creditCategory)) {
        if (!incomeMap.has(r.creditCategory)) incomeMap.set(r.creditCategory, initMonths())
        const arr = incomeMap.get(r.creditCategory)!
        arr[monthIndex] = (arr[monthIndex] || 0) + r.creditAmount
      }

      // Expense logic
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
          <p className="text-sm text-stone-500 mt-1">月度營收與支出統計</p>
        </div>
        <select
          className="border border-stone-200 rounded-lg px-4 py-2 text-sm bg-white font-medium text-stone-700 focus:ring-2 focus:ring-brand-400 focus:border-brand-400 transition-colors cursor-pointer"
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
