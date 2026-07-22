import React, { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  RiBankCardLine,
  RiTimeLine,
  RiLineChartLine,
  RiSearchLine,
  RiBookOpenLine,
  RiTable2,
  RiCalendarLine,
  RiGroupLine,
  RiUser3Line,
  RiExchangeLine,
  RiArrowUpLine,
} from '@remixicon/react'
import { StatCard } from '../shared/StatCard'
import { FilterDropdown } from '../shared/FilterDropdown'
import { Input } from '../ui/input'
import { useCustomers } from '../../hooks/useCustomers'
import { useLessonRecords } from '../../hooks/useLessonRecords'
import { useTrainers } from '../../hooks/useTrainers'
import type { Contract, Customer } from '../../types'
import { cn } from '../../lib/utils'
import { Calendar } from 'lucide-react'

type DetailTab = 'contracts' | 'lessons' | 'monthly-summary'

interface PrepaidLessonsTableProps {
  selectedYear: number
  selectedMonth: number | 'all'
  onYearChange?: (year: number) => void
  onMonthChange?: (month: number | 'all') => void
}

export function PrepaidLessonsTable({
  selectedYear,
  selectedMonth,
  onYearChange,
  onMonthChange,
}: PrepaidLessonsTableProps) {
  const { contracts, customers } = useCustomers()
  const { records } = useLessonRecords()
  const { trainers } = useTrainers()

  const [activeTab, setActiveTab] = useState<DetailTab>('contracts')
  const [searchTerm, setSearchTerm] = useState('')

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
    customers.forEach((c) => map.set(c.id, c))
    return map
  }, [customers])

  const trainerMap = useMemo(() => {
    const map = new Map<string, string>()
    trainers.forEach((t) => map.set(t.id, t.name))
    return map
  }, [trainers])

  const contractMap = useMemo(() => {
    const map = new Map<string, Contract>()
    contracts.forEach((c) => map.set(c.id, c))
    return map
  }, [contracts])

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

  const summaryMetrics = useMemo(() => {
    let newContractsTotalValue = 0
    let lumpSumTotal = 0
    let installmentPaidTotal = 0
    let pendingInstallmentsTotal = 0

    periodContracts.forEach((c) => {
      const total = Number(c.totalAmount || 0)
      const paid = Number(c.paidAmount || 0)
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
      const sessions = Number(r.sessionAmount || 1)
      totalSessionsUsed += sessions
      if (c && Number(c.totalSessions) > 0) {
        const avgPrice = Number(c.totalAmount || 0) / Number(c.totalSessions)
        realizedRevenueTotal += sessions * avgPrice
      } else {
        realizedRevenueTotal += sessions * 1500
      }
    })

    let unearnedLiabilityBalance = 0
    let remainingSessionsCount = 0

    contracts.forEach((c) => {
      const rem = Number(c.remainingSessions || 0)
      const tot = Number(c.totalSessions || 0)
      if (rem > 0 && tot > 0) {
        const avgPrice = Number(c.totalAmount || 0) / tot
        unearnedLiabilityBalance += rem * avgPrice
        remainingSessionsCount += rem
      }
    })

    return {
      newContractsTotalValue: Math.round(newContractsTotalValue),
      lumpSumTotal: Math.round(lumpSumTotal),
      installmentPaidTotal: Math.round(installmentPaidTotal),
      pendingInstallmentsTotal: Math.round(pendingInstallmentsTotal),
      realizedRevenueTotal: Math.round(realizedRevenueTotal),
      totalSessionsUsed,
      unearnedLiabilityBalance: Math.round(unearnedLiabilityBalance),
      remainingSessionsCount,
    }
  }, [periodContracts, periodLessonRecords, contractMap, contracts])

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
            const total = Number(c.totalAmount || 0)
            const paid = Number(c.paidAmount || 0)
            monthPrepaidValue += total
            if (c.paymentType === 'installment') monthInstallmentPaid += paid
            else monthLumpSum += total
          }
        }
      })

      let monthRealizedRev = 0
      let monthSessionsCount = 0

      records.forEach((r) => {
        if (r.sessionDate) {
          const dt = r.sessionDate.toDate ? r.sessionDate.toDate() : new Date(r.sessionDate as any)
          if (dt.getFullYear() === selectedYear && dt.getMonth() + 1 === monthNum) {
            const sessions = Number(r.sessionAmount || 1)
            monthSessionsCount += sessions
            const c = contractMap.get(r.contractId)
            if (c && Number(c.totalSessions) > 0) {
              monthRealizedRev += sessions * (Number(c.totalAmount || 0) / Number(c.totalSessions))
            } else {
              monthRealizedRev += sessions * 1500
            }
          }
        }
      })

      return {
        monthNum,
        monthLabel: `${String(monthNum).padStart(2, '0')} 月`,
        monthPrepaidValue: Math.round(monthPrepaidValue),
        monthLumpSum: Math.round(monthLumpSum),
        monthInstallmentPaid: Math.round(monthInstallmentPaid),
        monthSessionsCount,
        monthRealizedRev: Math.round(monthRealizedRev),
        netPrepaidChange: Math.round(monthPrepaidValue - monthRealizedRev),
      }
    })
  }, [contracts, records, selectedYear, contractMap])

  const tabs = [
    { id: 'contracts' as const, label: '預收款合約', count: periodContracts.length, icon: <RiBankCardLine className="w-3.5 h-3.5" /> },
    { id: 'lessons' as const, label: '銷課認列', count: periodLessonRecords.length, icon: <RiLineChartLine className="w-3.5 h-3.5" /> },
    { id: 'monthly-summary' as const, label: '年度對照', count: null, icon: <RiTable2 className="w-3.5 h-3.5" /> },
  ]

  const periodLabel = selectedMonth === 'all'
    ? `${selectedYear} 全年度`
    : `${selectedYear} 年 ${String(selectedMonth).padStart(2, '0')} 月`

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* ── Filter Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200/80 shadow-[0_1px_4px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-orange-50 flex items-center justify-center">
            <RiCalendarLine className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-xs font-black text-stone-800">預收與銷課統計期間</p>
            <p className="text-[10px] text-stone-400 font-medium mt-0.5">{periodLabel}</p>
          </div>
        </div>

        {onYearChange && onMonthChange && (
          <div className="flex items-center gap-2">
            <FilterDropdown
              value={selectedYear}
              onChange={(v) => onYearChange(Number(v))}
              options={[0, 1, 2, 3].map((offset) => {
                const y = new Date().getFullYear() - offset
                return { value: y, label: `${y} 年` }
              })}
              icon={Calendar}
              label="年份"
            />
            <FilterDropdown
              value={selectedMonth}
              onChange={(v) => onMonthChange(v === 'all' ? 'all' : Number(v))}
              options={[
                { value: 'all', label: '全年度' },
                ...Array.from({ length: 12 }, (_, i) => i + 1).map((m) => ({
                  value: m,
                  label: `${String(m).padStart(2, '0')} 月`,
                })),
              ]}
              label="月份"
            />
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title={`新簽預收總額`}
          value={`NT$ ${summaryMetrics.newContractsTotalValue.toLocaleString()}`}
          icon={RiBankCardLine}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          subtitle={`一次付清 $${summaryMetrics.lumpSumTotal.toLocaleString()} · 分期 $${summaryMetrics.installmentPaidTotal.toLocaleString()}`}
        />
        <StatCard
          title={`銷課認列金額`}
          value={`NT$ ${summaryMetrics.realizedRevenueTotal.toLocaleString()}`}
          icon={RiLineChartLine}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          subtitle={`已履約 ${summaryMetrics.totalSessionsUsed} 堂課`}
        />
        <StatCard
          title={`銷課堂數`}
          value={`${summaryMetrics.totalSessionsUsed} 堂`}
          icon={RiBookOpenLine}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          subtitle={`均堂價 NT$ ${summaryMetrics.totalSessionsUsed > 0 ? Math.round(summaryMetrics.realizedRevenueTotal / summaryMetrics.totalSessionsUsed).toLocaleString() : '0'}`}
        />
        <StatCard
          title={`預收學費負債餘額`}
          value={`NT$ ${summaryMetrics.unearnedLiabilityBalance.toLocaleString()}`}
          icon={RiTimeLine}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          subtitle={`剩餘 ${summaryMetrics.remainingSessionsCount} 堂待履約`}
        />
      </div>

      {/* ── Main Panel ── */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] overflow-hidden">

        {/* Tab Bar + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-100">
          <div className="flex items-center gap-1 p-1 bg-stone-100/80 rounded-xl w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-400 hover:text-stone-700'
                )}
              >
                <span className={cn(
                  'transition-colors',
                  activeTab === tab.id
                    ? tab.id === 'contracts' ? 'text-orange-500'
                      : tab.id === 'lessons' ? 'text-emerald-500'
                      : 'text-blue-500'
                    : 'text-stone-400'
                )}>
                  {tab.icon}
                </span>
                {tab.label}
                {tab.count !== null && (
                  <span className={cn(
                    'text-[9px] font-black px-1.5 py-0.5 rounded-full',
                    activeTab === tab.id ? 'bg-stone-100 text-stone-700' : 'bg-stone-200/60 text-stone-400'
                  )}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab !== 'monthly-summary' && (
            <div className="relative w-full sm:w-56">
              <Input
                type="text"
                placeholder="搜尋姓名、合約編號..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs bg-stone-50 border-stone-200/80 focus:bg-white rounded-xl"
              />
              <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
            </div>
          )}
        </div>

        {/* ── Tab 1: Contracts ── */}
        {activeTab === 'contracts' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-100">
                <tr>
                  {['學員', '合約編號', '付款方式', '合約總額', '已收款', '待收款', '堂數進度', '教練', '簽約日'].map((h, i) => (
                    <th key={i} className={cn(
                      'px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-wider',
                      i >= 3 && i <= 5 ? 'text-right' : i === 6 ? 'text-center' : ''
                    )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {periodContracts.length > 0 ? (
                  periodContracts.map((c) => {
                    const cust = customerMap.get(c.customerId)
                    const total = Number(c.totalAmount || 0)
                    const paid = Number(c.paidAmount || 0)
                    const pending = Math.max(0, total - paid)
                    const isInstallment = c.paymentType === 'installment' || (c.installments && c.installments.length > 0)
                    const isDual = c.contractType === 'dual'
                    const dt = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt as any)
                    const progressPct = c.totalSessions > 0 ? Math.round(((c.totalSessions - c.remainingSessions) / c.totalSessions) * 100) : 0

                    return (
                      <tr key={c.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-stone-900">{cust?.name || '未知學員'}</p>
                          <p className="text-[10px] text-stone-400 font-mono mt-0.5">{cust?.phone || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-mono font-bold text-stone-800 text-[11px]">{c.contractNo || '未命名'}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {isDual
                              ? <RiGroupLine className="w-3 h-3 text-orange-400" />
                              : <RiUser3Line className="w-3 h-3 text-stone-300" />
                            }
                            <span className="text-[9px] text-stone-400">{isDual ? '雙人課' : '一對一'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {isInstallment ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <RiExchangeLine className="w-3 h-3" /> 分期
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <RiArrowUpLine className="w-3 h-3" /> 一次付清
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-stone-900 tabular-nums">
                          {total.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                          {paid.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {pending > 0
                            ? <span className="font-bold text-orange-600">{pending.toLocaleString()}</span>
                            : <span className="text-stone-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] font-bold text-stone-700 tabular-nums">
                              {c.remainingSessions} / {c.totalSessions}
                            </span>
                            <div className="w-16 h-1 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-stone-800 rounded-full"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-stone-600 font-medium">
                          {trainerMap.get(c.trainerId) || '—'}
                        </td>
                        <td className="px-4 py-3 text-stone-400 font-mono text-[10px]">
                          {format(dt, 'MM/dd')}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-stone-400 text-xs">
                      所選期間尚無預收款合約
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tab 2: Lessons ── */}
        {activeTab === 'lessons' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 border-b border-stone-100">
                <tr>
                  {['日期', '學員', '教練', '銷課堂數', '認列金額', '合約編號', '備註'].map((h, i) => (
                    <th key={i} className={cn(
                      'px-4 py-3 text-[10px] font-black text-stone-400 uppercase tracking-wider',
                      i === 3 ? 'text-center' : i === 4 ? 'text-right' : ''
                    )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {periodLessonRecords.length > 0 ? (
                  periodLessonRecords.map((r) => {
                    const dt = r.sessionDate?.toDate ? r.sessionDate.toDate() : new Date(r.sessionDate as any)
                    const c = contractMap.get(r.contractId)
                    const totSessions = c ? Number(c.totalSessions || 0) : 0
                    const avgPrice = c && totSessions > 0 ? Number(c.totalAmount || 0) / totSessions : 1500
                    const sessionAmount = Number(r.sessionAmount || 1)
                    const valueRealized = Math.round(sessionAmount * avgPrice)
                    const isSubstitute = c && c.trainerId !== r.trainerId

                    return (
                      <tr key={r.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono text-stone-500 text-[10px]">
                          {format(dt, 'yyyy-MM-dd')}
                        </td>
                        <td className="px-4 py-3 font-bold text-stone-900">
                          {r.customerName}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-stone-700">
                              {trainerMap.get(r.trainerId) || '—'}
                            </span>
                            {isSubstitute && (
                              <span className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                                代課
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums">
                            -{sessionAmount} 堂
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                          NT$ {valueRealized.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-stone-400 text-[10px]">
                          {c?.contractNo || '—'}
                        </td>
                        <td className="px-4 py-3 text-stone-400 italic text-[10px]">
                          {r.notes || '—'}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-400 text-xs">
                      所選期間尚無銷課認列紀錄
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tab 3: Monthly Summary ── */}
        {activeTab === 'monthly-summary' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-950 text-white">
                <tr>
                  {['月份', '簽約總金額', '一次付清', '分期實收', '銷課堂數', '銷課已實現營收', '淨預收變動'].map((h, i) => (
                    <th key={i} className={cn(
                      'px-4 py-3.5 text-[10px] font-bold uppercase tracking-wider text-stone-300',
                      i >= 1 && i <= 2 ? 'text-right' : i === 3 ? 'text-right' : i === 4 ? 'text-center' : i >= 5 ? 'text-right' : ''
                    )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {monthlyMatrix.map((m) => {
                  const isCurrentMonth = typeof selectedMonth === 'number' && selectedMonth === m.monthNum
                  return (
                    <tr
                      key={m.monthNum}
                      className={cn(
                        'hover:bg-stone-50/80 transition-colors',
                        isCurrentMonth ? 'bg-orange-50/40' : ''
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className={cn(
                          'font-bold',
                          isCurrentMonth ? 'text-orange-700' : 'text-stone-700'
                        )}>
                          {m.monthLabel}
                        </span>
                        {isCurrentMonth && (
                          <span className="ml-1.5 text-[9px] font-black bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded">
                            當月
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-stone-900 tabular-nums">
                        {m.monthPrepaidValue > 0 ? `NT$ ${m.monthPrepaidValue.toLocaleString()}` : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-600 tabular-nums">
                        {m.monthLumpSum > 0 ? m.monthLumpSum.toLocaleString() : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700 font-semibold tabular-nums">
                        {m.monthInstallmentPaid > 0 ? m.monthInstallmentPaid.toLocaleString() : <span className="text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {m.monthSessionsCount > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-black bg-stone-100 text-stone-700">
                            {m.monthSessionsCount} 堂
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 tabular-nums">
                        {m.monthRealizedRev > 0 ? `NT$ ${m.monthRealizedRev.toLocaleString()}` : <span className="text-stone-300">—</span>}
                      </td>
                      <td className={cn(
                        'px-4 py-3 text-right font-black tabular-nums',
                        m.netPrepaidChange > 0 ? 'text-orange-600' : m.netPrepaidChange < 0 ? 'text-blue-600' : 'text-stone-300'
                      )}>
                        {m.netPrepaidChange !== 0
                          ? `${m.netPrepaidChange >= 0 ? '+' : ''}NT$ ${m.netPrepaidChange.toLocaleString()}`
                          : '—'
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
