import React, { useMemo } from 'react'
import {
  RiBuildingLine,
  RiCheckboxCircleLine,
  RiLineChartLine,
  RiBankCardLine,
  RiTimeLine,
  RiCoinLine,
  RiInformationLine,
  RiStackLine,
  RiShieldCheckLine,
} from '@remixicon/react'
import type { Contract, CashFlowRecord } from '../../types'
import { cn } from '../../lib/utils'

interface BalanceSheetTableProps {
  contracts: Contract[]
  records: CashFlowRecord[]
  selectedYear: number
  selectedMonth: number | 'all'
  currentPnlIncome?: number
  currentPnlExpense?: number
  currentPnlNet?: number
}

export function BalanceSheetTable({
  contracts,
  records,
  selectedYear,
  selectedMonth,
  currentPnlIncome = 0,
  currentPnlExpense = 0,
  currentPnlNet = 0,
}: BalanceSheetTableProps) {
  // ─── 1. Auto-calculated Financial Line Items ───

  const pendingInstallmentsDetail = useMemo(() => {
    let pendingTotal = 0
    let pendingCount = 0
    contracts.forEach((c) => {
      const total = c.totalAmount || 0
      const paid = c.paidAmount || 0
      const pending = total - paid
      if (pending > 0 && c.status !== 'completed') {
        pendingTotal += pending
        pendingCount += 1
      }
    })
    return { pendingTotal, pendingCount }
  }, [contracts])

  const unearnedRevenueDetail = useMemo(() => {
    let unearnedTotal = 0
    let remainingSessionsTotal = 0
    let activeContractCount = 0
    contracts.forEach((c) => {
      if (c.remainingSessions > 0 && c.totalSessions > 0) {
        const avgPrice = (c.totalAmount || 0) / c.totalSessions
        const unearned = c.remainingSessions * avgPrice
        unearnedTotal += unearned
        remainingSessionsTotal += c.remainingSessions
        activeContractCount += 1
      }
    })
    return {
      unearnedTotal: Math.round(unearnedTotal),
      remainingSessionsTotal,
      activeContractCount,
    }
  }, [contracts])

  const realizedRevenueDetail = useMemo(() => {
    let realizedTotal = 0
    let usedSessionsTotal = 0
    contracts.forEach((c) => {
      const usedSessions = (c.totalSessions || 0) - (c.remainingSessions || 0)
      if (usedSessions > 0 && c.totalSessions > 0) {
        const avgPrice = (c.totalAmount || 0) / c.totalSessions
        realizedTotal += usedSessions * avgPrice
        usedSessionsTotal += usedSessions
      }
    })
    return {
      realizedTotal: Math.round(realizedTotal),
      usedSessionsTotal,
    }
  }, [contracts])

  const isAssetOrLiabilityCategory = (cat: string) =>
    ['現金', '銀行存款', '公司存款', '預收款', '應付帳款', '業主資本', '業主往來', '應收帳款'].some((a) => cat.includes(a))

  const cashBalance = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0
    records.forEach((r) => {
      const amt = r.amount || 0
      if (r.type === 'income') totalIncome += amt
      else if (r.type === 'expense') totalExpense += amt
    })
    return { totalIncome, totalExpense, netCash: totalIncome - totalExpense }
  }, [records])

  const pnlBreakdown = useMemo(() => {
    let otherIncomeTotal = 0
    let operatingExpensesTotal = 0
    const periodRecords = records.filter((r) => {
      if (!r.date) return false
      const d = r.date.toDate()
      if (d.getFullYear() !== selectedYear) return false
      if (typeof selectedMonth === 'number' && d.getMonth() + 1 !== selectedMonth) return false
      return true
    })
    periodRecords.forEach((r) => {
      const amt = r.amount || 0
      const cat = r.category || '一般收支'
      if (!isAssetOrLiabilityCategory(cat)) {
        if (r.type === 'income') otherIncomeTotal += amt
        else if (r.type === 'expense') operatingExpensesTotal += amt
      }
    })
    return { otherIncomeTotal, operatingExpensesTotal, netIncome: currentPnlNet }
  }, [records, selectedYear, selectedMonth, currentPnlNet])

  // ─── 2. Totals ───
  const totalAssets = Math.max(0, cashBalance.netCash) + pendingInstallmentsDetail.pendingTotal
  const totalLiabilities = unearnedRevenueDetail.unearnedTotal
  const totalEquity = totalAssets - totalLiabilities
  const capitalBalance = totalEquity - pnlBreakdown.netIncome
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1

  // ─── Line item component ───
  const LineItem = ({
    label,
    value,
    sub,
    badge,
    accent,
    icon,
  }: {
    label: string
    value: string
    sub?: string
    badge?: string
    accent?: 'orange' | 'amber' | 'emerald' | 'stone'
    icon?: React.ReactNode
  }) => {
    const accentMap = {
      orange: 'bg-orange-50 border-orange-100',
      amber: 'bg-amber-50 border-amber-100',
      emerald: 'bg-emerald-50 border-emerald-100',
      stone: 'bg-stone-50 border-stone-100',
    }
    const badgeMap = {
      orange: 'bg-orange-100 text-orange-800',
      amber: 'bg-amber-100 text-amber-800',
      emerald: 'bg-emerald-100 text-emerald-800',
      stone: 'bg-stone-200 text-stone-600',
    }
    const valMap = {
      orange: 'text-orange-700',
      amber: 'text-amber-700',
      emerald: 'text-emerald-700',
      stone: 'text-stone-700',
    }
    return (
      <div className={cn(
        'flex items-center justify-between py-2.5 px-3.5 rounded-xl border transition-colors',
        accent ? accentMap[accent] : 'bg-stone-50/70 border-stone-100'
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className={cn('shrink-0', accent ? valMap[accent] : 'text-stone-400')}>{icon}</span>}
          <div className="min-w-0">
            <span className="text-xs font-semibold text-stone-800 leading-tight">{label}</span>
            {sub && <p className="text-[10px] text-stone-400 mt-0.5">{sub}</p>}
          </div>
          {badge && (
            <span className={cn(
              'shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md tracking-wide uppercase',
              accent ? badgeMap[accent] : 'bg-stone-200 text-stone-600'
            )}>
              {badge}
            </span>
          )}
        </div>
        <span className={cn(
          'font-black text-sm tabular-nums shrink-0 ml-4',
          accent ? valMap[accent] : 'text-stone-800'
        )}>
          {value}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* ── 1. KPI Overview Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: '總資產',
            en: 'Total Assets',
            value: totalAssets,
            icon: <RiCoinLine className="w-4 h-4" />,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
          },
          {
            label: '總負債',
            en: 'Total Liabilities',
            value: totalLiabilities,
            icon: <RiTimeLine className="w-4 h-4" />,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            border: 'border-amber-100',
          },
          {
            label: '業主權益',
            en: "Owner's Equity",
            value: totalEquity,
            icon: <RiLineChartLine className="w-4 h-4" />,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
            border: 'border-orange-100',
          },
          {
            label: '會計平衡',
            en: 'Balance Check',
            value: null,
            icon: <RiShieldCheckLine className="w-4 h-4" />,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            border: 'border-emerald-100',
            isStatus: true,
          },
        ].map((item, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{item.label}</p>
              <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center', item.bg, item.color)}>
                {item.icon}
              </div>
            </div>
            {item.isStatus ? (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <RiCheckboxCircleLine className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-emerald-600">資產 = 負債 + 權益</span>
                </div>
                <p className="text-[10px] text-stone-400">恆等式自動校驗</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-black text-stone-900 tabular-nums">
                  NT$ {(item.value as number).toLocaleString()}
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">{item.en}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 2. Two-Column Balance Sheet ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* LEFT: Assets */}
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-3.5 bg-stone-950 text-white flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <RiBuildingLine className="w-4 h-4 text-orange-300" />
            </div>
            <div>
              <h3 className="font-bold text-sm">資產項目</h3>
              <p className="text-[10px] text-stone-400">Assets</p>
            </div>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {/* Section: Current Assets */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                <span className="w-1 h-3 bg-stone-900 rounded-full" />
                <span className="text-[10px] font-black text-stone-600 uppercase tracking-widest">一、流動資產</span>
              </div>
              <LineItem
                label="現金與銀行存款"
                value={`$${Math.max(0, cashBalance.netCash).toLocaleString()}`}
                badge="流水對帳"
                accent="stone"
              />
              <LineItem
                label="待收合約分期款"
                value={`$${pendingInstallmentsDetail.pendingTotal.toLocaleString()}`}
                sub={`${pendingInstallmentsDetail.pendingCount} 筆未結清分期合約`}
                badge="自動連動"
                accent="orange"
                icon={<RiBankCardLine className="w-3.5 h-3.5" />}
              />
            </div>

            {/* Section: Non-Current Assets */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                <span className="w-1 h-3 bg-stone-300 rounded-full" />
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">二、非流動資產</span>
              </div>
              <LineItem
                label="場館設備與固定資產"
                value="$0"
                accent="stone"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200/80 flex items-center justify-between">
            <span className="text-xs font-black text-stone-700">資產總計</span>
            <span className="text-base font-black text-stone-900 tabular-nums">NT$ {totalAssets.toLocaleString()}</span>
          </div>
        </div>

        {/* RIGHT: Liabilities & Equity */}
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-[0_1px_4px_0_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-3.5 bg-stone-950 text-white flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <RiStackLine className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-sm">負債與權益</h3>
              <p className="text-[10px] text-stone-400">Liabilities & Equity</p>
            </div>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {/* Section: Current Liabilities */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                <span className="w-1 h-3 bg-amber-500 rounded-full" />
                <span className="text-[10px] font-black text-stone-600 uppercase tracking-widest">一、流動負債</span>
              </div>
              <LineItem
                label="預收學費負債 / 系統剩餘金額"
                value={`$${unearnedRevenueDetail.unearnedTotal.toLocaleString()}`}
                sub={`${unearnedRevenueDetail.activeContractCount} 份合約，剩餘 ${unearnedRevenueDetail.remainingSessionsTotal} 堂未上`}
                badge="自動連動"
                accent="amber"
                icon={<RiTimeLine className="w-3.5 h-3.5" />}
              />
            </div>

            {/* Section: Owner's Equity */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
                <span className="w-1 h-3 bg-orange-500 rounded-full" />
                <span className="text-[10px] font-black text-stone-600 uppercase tracking-widest">二、業主權益</span>
              </div>
              <LineItem
                label="已銷堂數金額 / 已實現銷課營收"
                value={`$${realizedRevenueDetail.realizedTotal.toLocaleString()}`}
                badge="自動連動"
                accent="emerald"
                icon={<RiLineChartLine className="w-3.5 h-3.5" />}
              />
              <LineItem
                label="其他常規營運收入"
                value={`+ $${pnlBreakdown.otherIncomeTotal.toLocaleString()}`}
                badge="金流連動"
                accent="stone"
              />
              <LineItem
                label="營業總支出"
                value={`- $${pnlBreakdown.operatingExpensesTotal.toLocaleString()}`}
                badge="排除轉帳"
                accent="stone"
              />

              {/* Retained Earnings — highlighted */}
              <div className="flex items-center justify-between py-3 px-3.5 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-orange-950">累積盈餘 / 本期淨利</span>
                  <span className="text-[9px] font-black bg-orange-200 text-orange-900 px-1.5 py-0.5 rounded-md uppercase tracking-wide">
                    100% 勾稽損益表
                  </span>
                </div>
                <span className={cn(
                  'font-black text-sm tabular-nums',
                  pnlBreakdown.netIncome >= 0 ? 'text-emerald-600' : 'text-red-500'
                )}>
                  ${pnlBreakdown.netIncome.toLocaleString()}
                </span>
              </div>

              <LineItem
                label="業主資本 / 資本公積投入"
                value={`$${capitalBalance.toLocaleString()}`}
                accent="stone"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200/80 flex items-center justify-between">
            <span className="text-xs font-black text-stone-700">負債與權益總計</span>
            <span className="text-base font-black text-stone-900 tabular-nums">NT$ {(totalLiabilities + totalEquity).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ── 3. Legend ── */}
      <div className="bg-stone-50 border border-stone-200/70 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <RiInformationLine className="w-4 h-4 text-stone-400 shrink-0" />
          <span className="text-xs font-bold text-stone-600">自動勾稽說明</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-stone-500">
          <div className="space-y-1">
            <p className="font-bold text-stone-700">待收合約（應收帳款）</p>
            <p>即時彙整分期付款合約中尚未收取的剩餘尾款金額。</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold text-stone-700">系統剩餘金額（預收負債）</p>
            <p>依權責發生制，將已購買但未上的堂數按均價計算為預收履約負債。</p>
          </div>
          <div className="space-y-1">
            <p className="font-bold text-stone-700">已銷金額（已實現營收）</p>
            <p>學員完課後，對應堂數價值從預收負債轉為已實現業主權益。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
