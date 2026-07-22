import { useState, useMemo } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownRight, TrendingUp, BarChart2, List, FileSpreadsheet, Percent, Calendar, Building2, CreditCard } from 'lucide-react'
import { RiCalculatorLine, RiLineChartLine } from '@remixicon/react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { FilterDropdown } from '../components/shared/FilterDropdown'
import { CashFlowTable, normalizeCashFlowRecord } from '../components/cashflow/CashFlowTable'
import { CashFlowStatementTable } from '../components/cashflow/CashFlowStatementTable'
import { CashFlowFormModal } from '../components/cashflow/CashFlowFormModal'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import { BalanceSheetTable } from '../components/balancesheet/BalanceSheetTable'
import { PrepaidLessonsTable } from '../components/prepaid/PrepaidLessonsTable'
import { useCashFlow } from '../hooks/useCashFlow'
import { useCustomers } from '../hooks/useCustomers'
import { useLessonRecords } from '../hooks/useLessonRecords'
import type { CashFlowFormValues } from '../lib/validators'
import type { ProfitLossData, ProfitLossRow, CashFlowRecord } from '../types'

type TabType = 'cash-flow' | 'profit-loss' | 'balance-sheet' | 'prepaid-lessons'
type CashFlowSubView = 'statement' | 'detailed'

export default function FinancePage() {
  const { records, loading, createRecord, updateRecord, deleteRecord } = useCashFlow()
  const { contracts } = useCustomers()
  const { records: lessonRecords } = useLessonRecords()
  const [activeTab, setActiveTab] = useState<TabType>('cash-flow')
  const [cashFlowSubView, setCashFlowSubView] = useState<CashFlowSubView>('statement')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<CashFlowRecord | null>(null)

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(now.getMonth() + 1)

  const handleCreateOrUpdateRecord = async (data: CashFlowFormValues) => {
    // Generate legacy compatibility fields for backwards compatibility
    const legacyFields =
      data.type === 'income'
        ? {
            debitCategory: data.account || '公司存款',
            debitAmount: data.amount,
            creditCategory: data.category,
            creditAmount: data.amount,
          }
        : {
            debitCategory: data.category,
            debitAmount: data.amount,
            creditCategory: data.account || '公司存款',
            creditAmount: data.amount,
          }

    const payload = {
      ...data,
      ...legacyFields,
    }

    if (editingRecord) {
      await updateRecord(editingRecord.id, payload)
      setEditingRecord(null)
    } else {
      await createRecord(payload)
    }
  }

  const handleEditRecord = (record: CashFlowRecord) => {
    setEditingRecord(record)
    setIsModalOpen(true)
  }

  const handleDeleteRecord = async (id: string) => {
    await deleteRecord(id)
  }

  // Filter records by selected year and month
  const filteredCashFlowRecords = useMemo(() => {
    return records.filter((r) => {
      if (!r.date) return false
      const d = r.date.toDate()
      const matchesYear = d.getFullYear() === selectedYear
      const matchesMonth = selectedMonth === 'all' || d.getMonth() + 1 === selectedMonth
      return matchesYear && matchesMonth
    })
  }, [records, selectedYear, selectedMonth])

  // --- Cash Flow Statement Inflow/Outflow Calculation ---
  const { totalInflowSum, totalOutflowSum, netCashChange } = useMemo(() => {
    let inflow = 0
    let outflow = 0

    filteredCashFlowRecords.map(normalizeCashFlowRecord).forEach((r) => {
      if (r.type === 'income') {
        inflow += r.amount || 0
      } else {
        outflow += r.amount || 0
      }
    })

    return {
      totalInflowSum: inflow,
      totalOutflowSum: outflow,
      netCashChange: inflow - outflow,
    }
  }, [filteredCashFlowRecords])

  // Label for month (e.g., "07月" or "全年度")
  const monthLabel = useMemo(() => {
    if (selectedMonth === 'all') return '全年度'
    return `${String(selectedMonth).padStart(2, '0')}月`
  }, [selectedMonth])

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

  // P&L Summary for selected month
  const targetMonthIdx = typeof selectedMonth === 'number' ? selectedMonth - 1 : null
  const currentPnlIncome = targetMonthIdx !== null
    ? (profitLossData.totalIncome[targetMonthIdx] || 0)
    : profitLossData.totalIncome.reduce((a, b) => (a || 0) + (b || 0), 0)
  const currentPnlExpense = targetMonthIdx !== null
    ? (profitLossData.totalExpenses[targetMonthIdx] || 0)
    : profitLossData.totalExpenses.reduce((a, b) => (a || 0) + (b || 0), 0)
  const currentPnlNet = currentPnlIncome - currentPnlExpense

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

  const customizedCurrentPnlIncome = targetMonthIdx !== null
    ? (customizedProfitLossData.totalIncome[targetMonthIdx] || 0)
    : customizedProfitLossData.totalIncome.reduce((a, b) => (a || 0) + (b || 0), 0)
  const customizedCurrentPnlNet = customizedCurrentPnlIncome - currentPnlExpense

  const normalizedEditingRecord = editingRecord ? normalizeCashFlowRecord(editingRecord) : null

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiCalculatorLine className="w-6 h-6 text-orange-500" />
            會計管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">管理正規現金流量表、收支金流與月度損益統計</p>
        </div>

        {/* Tab Controls */}
        <div className="flex p-1 bg-stone-100/80 rounded-2xl border border-stone-200/60 self-start sm:self-center">
          <button
            onClick={() => setActiveTab('cash-flow')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
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
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'profit-loss'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            損益表
          </button>
          <button
            onClick={() => setActiveTab('balance-sheet')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'balance-sheet'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            資產負債表
          </button>
          <button
            onClick={() => setActiveTab('prepaid-lessons')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'prepaid-lessons'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            預收與銷課
          </button>
        </div>
      </div>

      {/* Tab Contents: Cash Flow Statement */}
      {activeTab === 'cash-flow' && (
        <div className="flex flex-col gap-6">
          {/* Action & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex p-1 bg-stone-100/80 rounded-2xl border border-stone-200/60">
                <button
                  onClick={() => setCashFlowSubView('statement')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    cashFlowSubView === 'statement'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  現金流量表 (三大活動彙整)
                </button>
                <button
                  onClick={() => setCashFlowSubView('detailed')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    cashFlowSubView === 'detailed'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  收支流水明細
                </button>
              </div>
            </div>

            {/* Shared Year & Month Selection Filters */}
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

              <Button
                onClick={() => {
                  setEditingRecord(null)
                  setIsModalOpen(true)
                }}
                className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl px-4 py-2"
              >
                + 新增記帳
              </Button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title={`現金流入總額 (${monthLabel})`}
              value={`NT$ ${totalInflowSum.toLocaleString()}`}
              icon={ArrowUpRight}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
            <StatCard
              title={`現金流出總額 (${monthLabel})`}
              value={`NT$ ${totalOutflowSum.toLocaleString()}`}
              icon={ArrowDownRight}
              iconColor="text-red-500"
              iconBg="bg-red-50"
            />
            <StatCard
              title={`本期現金淨變動額 (${monthLabel})`}
              value={`NT$ ${Math.abs(netCashChange).toLocaleString()}`}
              icon={DollarSign}
              subtitle={netCashChange >= 0 ? '現金增加 (正流入)' : '現金減少 (淨流出)'}
            />
          </div>

          {loading ? (
            <div className="loading-spinner"><span /></div>
          ) : cashFlowSubView === 'statement' ? (
            <CashFlowStatementTable records={filteredCashFlowRecords} monthLabel={monthLabel} />
          ) : (
            <CashFlowTable
              records={filteredCashFlowRecords}
              onEdit={handleEditRecord}
              onDelete={handleDeleteRecord}
            />
          )}

          <CashFlowFormModal
            open={isModalOpen}
            onOpenChange={(open) => {
              setIsModalOpen(open)
              if (!open) setEditingRecord(null)
            }}
            onSubmit={handleCreateOrUpdateRecord}
            initialData={
              normalizedEditingRecord
                ? {
                    date: normalizedEditingRecord.date?.toDate() || new Date(),
                    type: normalizedEditingRecord.type,
                    category: normalizedEditingRecord.category,
                    amount: normalizedEditingRecord.amount,
                    account: normalizedEditingRecord.account || '公司存款',
                    description: normalizedEditingRecord.description,
                    notes: normalizedEditingRecord.notes || '',
                    source: normalizedEditingRecord.source || 'manual',
                    sourceId: normalizedEditingRecord.sourceId || null,
                  }
                : undefined
            }
          />
        </div>
      )}

      {/* Tab Contents: Profit Loss */}
      {activeTab === 'profit-loss' && (
        <div className="flex flex-col gap-6">
          {/* Action & Filter Toolbar for Profit Loss */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <h3 className="text-sm font-bold text-stone-800">
              {selectedYear} 年 {monthLabel} 損益統計
            </h3>

            {/* Shared Year & Month Selection Filters */}
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

          {/* Stats cards for Profit Loss */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title={`營業總收入 (${monthLabel})`}
              value={`NT$ ${currentPnlIncome.toLocaleString()}`}
              icon={ArrowUpRight}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
              subtitle="收入 100.00% 基準"
            />
            <StatCard
              title={`營業支出小計 (${monthLabel})`}
              value={`NT$ ${currentPnlExpense.toLocaleString()}`}
              icon={ArrowDownRight}
              iconColor="text-red-500"
              iconBg="bg-red-50"
              subtitle="支出 100.00% 基準"
            />
            <StatCard
              title={`本期淨收益 (${monthLabel})`}
              value={`NT$ ${currentPnlNet.toLocaleString()}`}
              icon={Percent}
              iconColor={currentPnlNet >= 0 ? 'text-emerald-600' : 'text-red-500'}
              iconBg={currentPnlNet >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
              subtitle={currentPnlNet >= 0 ? '淨收益 (盈餘)' : '淨虧損'}
            />
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
      )}

      {/* Tab Contents: Balance Sheet */}
      {activeTab === 'balance-sheet' && (
        <BalanceSheetTable
          contracts={contracts}
          records={records}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          currentPnlIncome={currentPnlIncome}
          currentPnlExpense={currentPnlExpense}
          currentPnlNet={currentPnlNet}
        />
      )}

      {/* Tab Contents: Prepaid & Realized Lessons */}
      {activeTab === 'prepaid-lessons' && (
        <PrepaidLessonsTable
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
        />
      )}
    </div>
  )
}
