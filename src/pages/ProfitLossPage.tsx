import { useState, useMemo } from 'react'
import { Calendar, ArrowUpRight, ArrowDownRight, Percent } from 'lucide-react'
import { RiPieChartLine, RiLineChartLine } from '@remixicon/react'
import { FilterDropdown } from '../components/shared/FilterDropdown'
import { StatCard } from '../components/shared/StatCard'
import { useCashFlow } from '../hooks/useCashFlow'
import { useCustomers } from '../hooks/useCustomers'
import { useLessonRecords } from '../hooks/useLessonRecords'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import { normalizeCashFlowRecord } from '../components/cashflow/CashFlowTable'
import type { ProfitLossData, ProfitLossRow } from '../types'

export default function ProfitLossPage() {
  const { records, loading } = useCashFlow()
  const { contracts } = useCustomers()
  const { records: lessonRecords } = useLessonRecords()
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

  // Monthly Realized Lesson Revenues for the selected year
  const monthlyRealizedLessonRevenues = useMemo(() => {
    const monthlyRevs = Array(12).fill(0)
    const contractMap = new Map<string, any>()
    contracts.forEach((c) => contractMap.set(c.id, c))

    lessonRecords.forEach((r) => {
      if (!r.sessionDate) return
      const dt = r.sessionDate.toDate ? r.sessionDate.toDate() : new Date(r.sessionDate as any)
      if (dt.getFullYear() === selectedYear) {
        const monthIndex = dt.getMonth()
        const sessions = Number(r.sessionAmount || 1)
        const c = contractMap.get(r.contractId)
        let sessionPrice = 1500
        if (c && Number(c.totalSessions) > 0) {
          sessionPrice = Number(c.totalAmount || 0) / Number(c.totalSessions)
        }
        monthlyRevs[monthIndex] += sessions * sessionPrice
      }
    })

    return monthlyRevs.map((val) => Math.round(val))
  }, [lessonRecords, contracts, selectedYear])

  // Customized Profit Loss Data (Replacing course tuition income with realized lesson revenue)
  const customizedProfitLossData = useMemo<ProfitLossData>(() => {
    const isTuitionCat = (cat: string) =>
      ['學費', '課程', '教練課', '預收'].some((k) => cat.includes(k))

    let foundTuitionRow = false
    const newIncomeRows: ProfitLossRow[] = []

    profitLossData.income.forEach((row) => {
      if (isTuitionCat(row.category) && !foundTuitionRow) {
        foundTuitionRow = true
        const months = monthlyRealizedLessonRevenues.map((val) => (val > 0 ? val : null))
        const total = monthlyRealizedLessonRevenues.reduce((a, b) => a + b, 0)
        newIncomeRows.push({
          category: '銷課收入 (已實現履約營收)',
          months,
          total,
        })
      } else if (!isTuitionCat(row.category)) {
        newIncomeRows.push(row)
      }
    })

    if (!foundTuitionRow) {
      const months = monthlyRealizedLessonRevenues.map((val) => (val > 0 ? val : null))
      const total = monthlyRealizedLessonRevenues.reduce((a, b) => a + b, 0)
      newIncomeRows.unshift({
        category: '銷課收入 (已實現履約營收)',
        months,
        total,
      })
    }

    const initMonths = () => Array(12).fill(null)
    const customizedTotalIncome = initMonths()
    const customizedNetIncome = initMonths()

    for (let i = 0; i < 12; i++) {
      const mIncome = newIncomeRows.reduce((sum, row) => sum + (row.months[i] || 0), 0)
      const mExpense = profitLossData.expenses.reduce((sum, row) => sum + (row.months[i] || 0), 0)

      customizedTotalIncome[i] = mIncome > 0 ? mIncome : null
      const net = mIncome - mExpense
      customizedNetIncome[i] = mIncome > 0 || mExpense > 0 ? net : null
    }

    return {
      year: selectedYear,
      income: newIncomeRows,
      totalIncome: customizedTotalIncome,
      expenses: profitLossData.expenses,
      totalExpenses: profitLossData.totalExpenses,
      netIncome: customizedNetIncome,
    }
  }, [profitLossData, monthlyRealizedLessonRevenues, selectedYear])

  const targetMonthIdx = typeof selectedMonth === 'number' ? selectedMonth - 1 : null
  const currentPnlExpense = targetMonthIdx !== null
    ? (profitLossData.totalExpenses[targetMonthIdx] || 0)
    : profitLossData.totalExpenses.reduce((a, b) => (a || 0) + (b || 0), 0)
  const customizedCurrentPnlIncome = targetMonthIdx !== null
    ? (customizedProfitLossData.totalIncome[targetMonthIdx] || 0)
    : customizedProfitLossData.totalIncome.reduce((a, b) => (a || 0) + (b || 0), 0)
  const customizedCurrentPnlNet = customizedCurrentPnlIncome - currentPnlExpense

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiPieChartLine className="w-6 h-6 text-orange-500" />
            損益表
          </h1>
          <p className="text-sm text-stone-500 mt-1">管理 {selectedYear} 年 {monthLabel} 損益統計與分析</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={selectedYear}
            onChange={(v) => setSelectedYear(Number(v))}
            options={[0, 1, 2].map((offset) => {
              const y = now.getFullYear() - offset
              return { value: y, label: `${y} 年` }
            })}
            icon={Calendar}
            label="選擇年份"
          />

          <FilterDropdown
            value={selectedMonth}
            onChange={(v) => setSelectedMonth(v === 'all' ? 'all' : Number(v))}
            options={[
              { value: 'all', label: '所有月份 (全年度)' },
              ...Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
                value: m,
                label: `${String(m).padStart(2, '0')} 月`,
              })),
            ]}
            label="選擇月份"
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <div className="space-y-8">
          {/* 原有標準損益表 (現金收支基礎) */}
          <ProfitLossTable data={profitLossData} selectedMonth={selectedMonth} />

          {/* 使用者客製化損益表 (銷課收入認列版) */}
          <div className="pt-8 border-t border-stone-200/90 space-y-5">
            <div className="bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 text-white p-5 rounded-2xl shadow-sm border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
                  <RiLineChartLine className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold tracking-tight text-white">客製化損益表 (銷課收入認列版)</h3>
                    <span className="text-[10px] font-black bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      權責發生制
                    </span>
                  </div>
                  <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                    說明：此客製化版本將【課程學費收入】改以【學員實際完課銷課堂數】之已實現營收替代，其餘所有營業支出與常規金流項目與上方標準損益表完全一致。
                  </p>
                </div>
              </div>
            </div>

            {/* 客製化損益表指標卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title={`客製化營業總收入 (${monthLabel})`}
                value={`NT$ ${customizedCurrentPnlIncome.toLocaleString()}`}
                icon={ArrowUpRight}
                iconColor="text-emerald-600"
                iconBg="bg-emerald-50"
                subtitle="銷課認列已實現營收 + 其他收入"
              />
              <StatCard
                title={`營業支出小計 (${monthLabel})`}
                value={`NT$ ${currentPnlExpense.toLocaleString()}`}
                icon={ArrowDownRight}
                iconColor="text-red-500"
                iconBg="bg-red-50"
                subtitle="與標準損益表 100% 一致"
              />
              <StatCard
                title={`客製化本期淨收益 (${monthLabel})`}
                value={`NT$ ${customizedCurrentPnlNet.toLocaleString()}`}
                icon={Percent}
                iconColor={customizedCurrentPnlNet >= 0 ? 'text-emerald-600' : 'text-red-500'}
                iconBg={customizedCurrentPnlNet >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
                subtitle={customizedCurrentPnlNet >= 0 ? '銷課權責淨盈餘' : '銷課權責淨虧損'}
              />
            </div>

            <ProfitLossTable data={customizedProfitLossData} selectedMonth={selectedMonth} />
          </div>
        </div>
      )}
    </div>
  )
}
