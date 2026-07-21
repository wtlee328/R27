import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  CreditCard,
  Clock,
  TrendingUp,
  Search,
  BookOpen,
  FileSpreadsheet,
} from 'lucide-react'
import { StatCard } from '../shared/StatCard'
import { Input } from '../ui/input'
import { useCustomers } from '../../hooks/useCustomers'
import { useLessonRecords } from '../../hooks/useLessonRecords'
import { useTrainers } from '../../hooks/useTrainers'
import type { Contract, Customer } from '../../types'
import { cn } from '../../lib/utils'

type DetailTab = 'contracts' | 'lessons' | 'monthly-summary'

interface PrepaidLessonsTableProps {
  selectedYear: number
  selectedMonth: number | 'all'
}

export function PrepaidLessonsTable({
  selectedYear,
  selectedMonth,
}: PrepaidLessonsTableProps) {
  const { contracts, customers } = useCustomers()
  const { records } = useLessonRecords()
  const { trainers } = useTrainers()

  const [activeTab, setActiveTab] = useState<DetailTab>('contracts')
  const [searchTerm, setSearchTerm] = useState('')

  // Customer map lookup
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
    customers.forEach((c) => map.set(c.id, c))
    return map
  }, [customers])

  // Trainer map lookup
  const trainerMap = useMemo(() => {
    const map = new Map<string, string>()
    trainers.forEach((t) => map.set(t.id, t.name))
    return map
  }, [trainers])

  // Contract map lookup
  const contractMap = useMemo(() => {
    const map = new Map<string, Contract>()
    contracts.forEach((c) => map.set(c.id, c))
    return map
  }, [contracts])

  // ─── 1. Filtered Contracts for Selected Period ───
  const periodContracts = useMemo(() => {
    return contracts.filter((c) => {
      if (!c.createdAt) return false
      const dt = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt as any)
      if (dt.getFullYear() !== selectedYear) return false
      if (typeof selectedMonth === 'number' && dt.getMonth() + 1 !== selectedMonth) return false

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const custName = (customerMap.get(c.customerId)?.name || '').toLowerCase()
        const contractNo = (c.contractNo || '').toLowerCase()
        const trainerName = (trainerMap.get(c.trainerId) || '').toLowerCase()
        return custName.includes(term) || contractNo.includes(term) || trainerName.includes(term)
      }
      return true
    })
  }, [contracts, selectedYear, selectedMonth, searchTerm, customerMap, trainerMap])

  // ─── 2. Filtered Lesson Records for Selected Period ───
  const periodLessonRecords = useMemo(() => {
    return records.filter((r) => {
      if (!r.sessionDate) return false
      const dt = r.sessionDate.toDate ? r.sessionDate.toDate() : new Date(r.sessionDate as any)
      if (dt.getFullYear() !== selectedYear) return false
      if (typeof selectedMonth === 'number' && dt.getMonth() + 1 !== selectedMonth) return false

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const custName = (r.customerName || '').toLowerCase()
        const trainerName = (trainerMap.get(r.trainerId) || '').toLowerCase()
        return custName.includes(term) || trainerName.includes(term)
      }
      return true
    })
  }, [records, selectedYear, selectedMonth, searchTerm, trainerMap])

  // ─── 3. Monthly Metrics & Stat Summaries ───
  const summaryMetrics = useMemo(() => {
    let newContractsTotalValue = 0
    let lumpSumTotal = 0
    let installmentPaidTotal = 0
    let pendingInstallmentsTotal = 0

    periodContracts.forEach((c) => {
      const total = c.totalAmount || 0
      const paid = c.paidAmount || 0
      newContractsTotalValue += total
      if (c.paymentType === 'installment' || (c.installments && c.installments.length > 0)) {
        installmentPaidTotal += paid
        pendingInstallmentsTotal += Math.max(0, total - paid)
      } else {
        lumpSumTotal += total
      }
    })

    let realizedRevenueTotal = 0
    let totalSessionsUsed = 0

    periodLessonRecords.forEach((r) => {
      const c = contractMap.get(r.contractId)
      const sessions = r.sessionAmount || 1
      totalSessionsUsed += sessions

      if (c && c.totalSessions > 0) {
        const avgPrice = (c.totalAmount || 0) / c.totalSessions
        realizedRevenueTotal += sessions * avgPrice
      } else {
        realizedRevenueTotal += sessions * 1500
      }
    })

    let unearnedLiabilityBalance = 0
    let remainingSessionsCount = 0

    contracts.forEach((c) => {
      if (c.remainingSessions > 0 && c.totalSessions > 0) {
        const avgPrice = (c.totalAmount || 0) / c.totalSessions
        unearnedLiabilityBalance += c.remainingSessions * avgPrice
        remainingSessionsCount += c.remainingSessions
      }
    })

    return {
      newContractsTotalValue,
      lumpSumTotal,
      installmentPaidTotal,
      pendingInstallmentsTotal,
      realizedRevenueTotal: Math.round(realizedRevenueTotal),
      totalSessionsUsed,
      unearnedLiabilityBalance: Math.round(unearnedLiabilityBalance),
      remainingSessionsCount,
    }
  }, [periodContracts, periodLessonRecords, contractMap, contracts])

  // ─── 4. 12-Month Comparative Breakdown Matrix ───
  const monthlyMatrix = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const monthNum = idx + 1
      let monthPrepaidValue = 0
      let monthLumpSum = 0
      let monthInstallmentPaid = 0

      contracts.forEach((c) => {
        if (c.createdAt) {
          const dt = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt as any)
          if (dt.getFullYear() === selectedYear && dt.getMonth() + 1 === monthNum) {
            const total = c.totalAmount || 0
            const paid = c.paidAmount || 0
            monthPrepaidValue += total
            if (c.paymentType === 'installment') {
              monthInstallmentPaid += paid
            } else {
              monthLumpSum += total
            }
          }
        }
      })

      let monthRealizedRev = 0
      let monthSessionsCount = 0

      records.forEach((r) => {
        if (r.sessionDate) {
          const dt = r.sessionDate.toDate ? r.sessionDate.toDate() : new Date(r.sessionDate as any)
          if (dt.getFullYear() === selectedYear && dt.getMonth() + 1 === monthNum) {
            const sessions = r.sessionAmount || 1
            monthSessionsCount += sessions
            const c = contractMap.get(r.contractId)
            if (c && c.totalSessions > 0) {
              monthRealizedRev += sessions * ((c.totalAmount || 0) / c.totalSessions)
            } else {
              monthRealizedRev += sessions * 1500
            }
          }
        }
      })

      const netPrepaidChange = monthPrepaidValue - monthRealizedRev

      return {
        monthNum,
        monthLabel: `${String(monthNum).padStart(2, '0')} 月`,
        monthPrepaidValue,
        monthLumpSum,
        monthInstallmentPaid,
        monthSessionsCount,
        monthRealizedRev: Math.round(monthRealizedRev),
        netPrepaidChange: Math.round(netPrepaidChange),
      }
    })
  }, [contracts, records, selectedYear, contractMap])

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: New Prepaid Tuition Collection */}
        <StatCard
          title={`新簽/預收總額 (${selectedMonth === 'all' ? '全年度' : String(selectedMonth).padStart(2, '0') + '月'})`}
          value={`NT$ ${summaryMetrics.newContractsTotalValue.toLocaleString()}`}
          icon={CreditCard}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          subtitle={`一次付清 $${summaryMetrics.lumpSumTotal.toLocaleString()} / 分期 $${summaryMetrics.installmentPaidTotal.toLocaleString()}`}
        />

        {/* Stat 2: Realized Lesson Revenue */}
        <StatCard
          title={`銷課認列金額 (${selectedMonth === 'all' ? '全年度' : String(selectedMonth).padStart(2, '0') + '月'})`}
          value={`NT$ ${summaryMetrics.realizedRevenueTotal.toLocaleString()}`}
          icon={TrendingUp}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          subtitle={`共銷課 ${summaryMetrics.totalSessionsUsed} 堂（履約已實現營收）`}
        />

        {/* Stat 3: Total Sessions Used */}
        <StatCard
          title={`銷課堂數 (${selectedMonth === 'all' ? '全年度' : String(selectedMonth).padStart(2, '0') + '月'})`}
          value={`${summaryMetrics.totalSessionsUsed} 堂`}
          icon={BookOpen}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          subtitle={`平均每堂 NT$ ${
            summaryMetrics.totalSessionsUsed > 0
              ? Math.round(summaryMetrics.realizedRevenueTotal / summaryMetrics.totalSessionsUsed).toLocaleString()
              : '0'
          }`}
        />

        {/* Stat 4: Deferred Revenue Balance */}
        <StatCard
          title="預收學費負債餘額 (目前全館)"
          value={`NT$ ${summaryMetrics.unearnedLiabilityBalance.toLocaleString()}`}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          subtitle={`剩餘 ${summaryMetrics.remainingSessionsCount} 堂待履約課堂價值`}
        />
      </div>

      {/* Main Tabs & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          {/* Tab Controls */}
          <div className="flex p-1 bg-stone-100/80 rounded-2xl border border-stone-200/60">
            <button
              onClick={() => setActiveTab('contracts')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer',
                activeTab === 'contracts'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900'
              )}
            >
              <CreditCard className="w-3.5 h-3.5 text-orange-500" />
              預收款合約明細 ({periodContracts.length})
            </button>
            <button
              onClick={() => setActiveTab('lessons')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer',
                activeTab === 'lessons'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900'
              )}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              銷課認列履約明細 ({periodLessonRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('monthly-summary')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer',
                activeTab === 'monthly-summary'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900'
              )}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
              12個月對照總表 ({selectedYear}年)
            </button>
          </div>

          {/* Search Input */}
          {activeTab !== 'monthly-summary' && (
            <div className="relative w-full sm:w-64">
              <Input
                type="text"
                placeholder="搜尋姓名、電話、合約編號..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 text-xs bg-stone-50 border-stone-200 focus:bg-white"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
            </div>
          )}
        </div>

        {/* Tab 1: Contracts Audit Table */}
        {activeTab === 'contracts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-100 text-stone-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">學員姓名</th>
                  <th className="px-4 py-3">合約編號 / 類型</th>
                  <th className="px-4 py-3">付款方式</th>
                  <th className="px-4 py-3 text-right">合約總金額</th>
                  <th className="px-4 py-3 text-right">已收預收款</th>
                  <th className="px-4 py-3 text-right">待收尾款</th>
                  <th className="px-4 py-3 text-center">剩餘 / 總堂數</th>
                  <th className="px-4 py-3">教練</th>
                  <th className="px-4 py-3">簽約日期</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                {periodContracts.length > 0 ? (
                  periodContracts.map((c) => {
                    const cust = customerMap.get(c.customerId)
                    const total = c.totalAmount || 0
                    const paid = c.paidAmount || 0
                    const pending = Math.max(0, total - paid)
                    const isInstallment =
                      c.paymentType === 'installment' || (c.installments && c.installments.length > 0)
                    const dt = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt as any)

                    return (
                      <tr key={c.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="px-4 py-3 font-bold text-stone-900">
                          {cust?.name || '未知學員'}
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                            {cust?.phone || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-stone-800">
                            {c.contractNo || '未命名合約'}
                          </span>
                          <div className="text-[10px] text-stone-400">
                            {c.contractType === 'dual' ? '👥 雙人課' : '👤 一對一'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isInstallment ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              💳 分期付款
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ⚡ 一次付清
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-stone-900 tabular-nums">
                          NT$ {total.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                          NT$ {paid.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">
                          {pending > 0 ? (
                            <span className="text-orange-600">NT$ {pending.toLocaleString()}</span>
                          ) : (
                            <span className="text-stone-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-stone-100 text-stone-700 border border-stone-200/80">
                            {c.remainingSessions} / {c.totalSessions} 堂
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-stone-600">
                          {trainerMap.get(c.trainerId) || '未知教練'}
                        </td>
                        <td className="px-4 py-3 text-stone-500 font-mono text-[11px]">
                          {format(dt, 'yyyy-MM-dd')}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-stone-400 text-xs">
                      所選月份尚無相關合約預收款紀錄
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Lesson Execution Audit Table */}
        {activeTab === 'lessons' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-100 text-stone-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">銷課日期</th>
                  <th className="px-4 py-3">學員姓名</th>
                  <th className="px-4 py-3">上課教練</th>
                  <th className="px-4 py-3 text-center">銷課堂數</th>
                  <th className="px-4 py-3 text-right">當次認列金額 (營收)</th>
                  <th className="px-4 py-3">對應合約編號</th>
                  <th className="px-4 py-3">銷課備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                {periodLessonRecords.length > 0 ? (
                  periodLessonRecords.map((r) => {
                    const dt = r.sessionDate?.toDate ? r.sessionDate.toDate() : new Date(r.sessionDate as any)
                    const c = contractMap.get(r.contractId)
                    const avgPrice = c && c.totalSessions > 0 ? (c.totalAmount || 0) / c.totalSessions : 1500
                    const sessionAmount = r.sessionAmount || 1
                    const valueRealized = Math.round(sessionAmount * avgPrice)
                    const isSubstitute = c && c.trainerId !== r.trainerId

                    return (
                      <tr key={r.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono text-stone-600">
                          {format(dt, 'yyyy-MM-dd')}
                        </td>
                        <td className="px-4 py-3 font-bold text-stone-900">
                          {r.customerName}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-stone-800">
                              {trainerMap.get(r.trainerId) || '未知教練'}
                            </span>
                            {isSubstitute && (
                              <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 rounded">
                                代課
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
                            -{sessionAmount} 堂
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                          NT$ {valueRealized.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-stone-500 text-[11px]">
                          {c?.contractNo || '—'}
                        </td>
                        <td className="px-4 py-3 text-stone-400 italic text-[11px]">
                          {r.notes || '—'}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-stone-400 text-xs">
                      所選月份尚無銷課認列紀錄
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: 12-Month Overview Comparative Matrix */}
        {activeTab === 'monthly-summary' && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-900 text-white font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">月份</th>
                    <th className="px-4 py-3.5 text-right">當月簽約總金額</th>
                    <th className="px-4 py-3.5 text-right">一次付清總額</th>
                    <th className="px-4 py-3.5 text-right">分期實收總額</th>
                    <th className="px-4 py-3.5 text-center">銷課堂數</th>
                    <th className="px-4 py-3.5 text-right">銷課已實現營收</th>
                    <th className="px-4 py-3.5 text-right">淨預收變動 (預收 - 銷課)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                  {monthlyMatrix.map((m) => (
                    <tr
                      key={m.monthNum}
                      className={cn(
                        'hover:bg-stone-50 transition-colors',
                        typeof selectedMonth === 'number' && selectedMonth === m.monthNum
                          ? 'bg-orange-50/50 font-bold'
                          : ''
                      )}
                    >
                      <td className="px-4 py-3 font-bold text-stone-900">{m.monthLabel}</td>
                      <td className="px-4 py-3 text-right font-bold text-stone-900 tabular-nums">
                        NT$ {m.monthPrepaidValue.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-600 tabular-nums">
                        NT$ {m.monthLumpSum.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700 tabular-nums font-semibold">
                        NT$ {m.monthInstallmentPaid.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-stone-100 text-stone-700">
                          {m.monthSessionsCount} 堂
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        NT$ {m.monthRealizedRev.toLocaleString()}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-black tabular-nums',
                          m.netPrepaidChange >= 0 ? 'text-orange-600' : 'text-blue-600'
                        )}
                      >
                        {m.netPrepaidChange >= 0 ? '+' : ''}
                        NT$ {m.netPrepaidChange.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
