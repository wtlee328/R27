import { useState, useMemo } from 'react'
import { DollarSign, ArrowUpRight, ArrowDownRight, Upload, TrendingUp, BarChart2, List, FileSpreadsheet } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { CashFlowTable } from '../components/cashflow/CashFlowTable'
import { TrialBalanceTable } from '../components/cashflow/TrialBalanceTable'
import { CashFlowFormModal } from '../components/cashflow/CashFlowFormModal'
import { ProfitLossTable } from '../components/profitloss/ProfitLossTable'
import { useCashFlow } from '../hooks/useCashFlow'
import type { CashFlowFormValues } from '../lib/validators'
import type { ProfitLossData, ProfitLossRow, CashFlowRecord } from '../types'

type TabType = 'cash-flow' | 'profit-loss'
type CashFlowSubView = 'trial-balance' | 'detailed'

export default function FinancePage() {
  const { records, loading, createRecord, updateRecord, deleteRecord } = useCashFlow()
  const [activeTab, setActiveTab] = useState<TabType>('cash-flow')
  const [cashFlowSubView, setCashFlowSubView] = useState<CashFlowSubView>('trial-balance')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<CashFlowRecord | null>(null)

  const now = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(now.getMonth() + 1)

  const handleCreateOrUpdateRecord = async (data: CashFlowFormValues) => {
    if (editingRecord) {
      await updateRecord(editingRecord.id, data)
      setEditingRecord(null)
    } else {
      await createRecord(data)
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

  // --- Cash Flow Stats ---
  const totalDebitSum = useMemo(
    () => filteredCashFlowRecords.reduce((sum, r) => sum + (r.debitAmount || 0), 0),
    [filteredCashFlowRecords]
  )
  const totalCreditSum = useMemo(
    () => filteredCashFlowRecords.reduce((sum, r) => sum + (r.creditAmount || 0), 0),
    [filteredCashFlowRecords]
  )
  const netDifference = useMemo(
    () => totalDebitSum - totalCreditSum,
    [totalDebitSum, totalCreditSum]
  )

  // Label for month (e.g., "03月")
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
          <p className="text-sm text-stone-500 mt-1">管理試算表、收支金流與月度損益統計</p>
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
            試算表 / 金流
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
        </div>
      </div>

      {/* Tab Contents: Cash Flow / Trial Balance */}
      {activeTab === 'cash-flow' && (
        <div className="flex flex-col gap-6">
          {/* Action & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-2">
              <div className="flex p-1 bg-stone-100/80 rounded-2xl border border-stone-200/60">
                <button
                  onClick={() => setCashFlowSubView('trial-balance')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    cashFlowSubView === 'trial-balance'
                      ? 'bg-stone-900 text-white shadow-sm'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  試算表 (彙整按科目)
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

            {/* Year & Month Selection Filters */}
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
              title={`總借方金額 (${monthLabel})`}
              value={`NT$ ${totalDebitSum.toLocaleString()}`}
              icon={ArrowUpRight}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
            <StatCard
              title={`總貸方金額 (${monthLabel})`}
              value={`NT$ ${totalCreditSum.toLocaleString()}`}
              icon={ArrowDownRight}
              iconColor="text-red-500"
              iconBg="bg-red-50"
            />
            <StatCard
              title={`借貸差額 (${monthLabel})`}
              value={`NT$ ${Math.abs(netDifference).toLocaleString()}`}
              icon={DollarSign}
              subtitle={netDifference === 0 ? '✓ 完全平衡' : '未完全平衡'}
            />
          </div>

          {loading ? (
            <div className="loading-spinner"><span /></div>
          ) : cashFlowSubView === 'trial-balance' ? (
            <TrialBalanceTable records={filteredCashFlowRecords} monthLabel={monthLabel} />
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
              editingRecord
                ? {
                    date: editingRecord.date?.toDate() || new Date(),
                    debitCategory: editingRecord.debitCategory,
                    debitAmount: editingRecord.debitAmount,
                    creditCategory: editingRecord.creditCategory,
                    creditAmount: editingRecord.creditAmount,
                    description: editingRecord.description,
                    notes: editingRecord.notes || '',
                    source: editingRecord.source || 'manual',
                    sourceId: editingRecord.sourceId || null,
                  }
                : undefined
            }
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
