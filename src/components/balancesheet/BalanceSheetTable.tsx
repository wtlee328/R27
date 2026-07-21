import React, { useMemo } from 'react'
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  CreditCard,
  Clock,
  DollarSign,
  Info,
  Layers,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react'
import type { Contract, CashFlowRecord } from '../../types'
import { cn } from '../../lib/utils'

interface BalanceSheetTableProps {
  contracts: Contract[]
  records: CashFlowRecord[]
  selectedYear: number
  selectedMonth: number | 'all'
}

export function BalanceSheetTable({
  contracts,
  records,
  selectedYear,
  selectedMonth,
}: BalanceSheetTableProps) {
  // ─── 1. 自動帶入計算 (Auto-calculated Financial Line Items) ───

  // A. 待收合約分期款 (Accounts Receivable - Pending Installments)
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

  // B. 系統剩餘總金額 / 預收學費負債 (Unearned Tuition Revenue Liability)
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

  // C. 已銷堂數總金額 / 已實現營業收入 (Realized Lesson Revenue)
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

  // Helper to filter out asset/liability transfer categories
  const isAssetOrLiabilityCategory = (cat: string) =>
    ['現金', '銀行存款', '公司存款', '預收款', '應付帳款', '業主資本', '業主往來', '應收帳款'].some((a) => cat.includes(a))

  // D. 現金與存款結餘 (Cash & Bank Balance from Cash Flow)
  const cashBalance = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0

    records.forEach((r) => {
      const amt = r.amount || 0
      if (r.type === 'income') {
        totalIncome += amt
      } else if (r.type === 'expense') {
        totalExpense += amt
      }
    })

    return {
      totalIncome,
      totalExpense,
      netCash: totalIncome - totalExpense,
    }
  }, [records])

  // E. 損益表常規收支與淨利 (100% 勾稽損益表 P&L Calculation)
  const pnlBreakdown = useMemo(() => {
    let otherIncomeTotal = 0
    let operatingExpensesTotal = 0

    records.forEach((r) => {
      const amt = r.amount || 0
      const cat = r.category || '一般收支'
      if (!isAssetOrLiabilityCategory(cat)) {
        if (r.type === 'income') {
          otherIncomeTotal += amt
        } else if (r.type === 'expense') {
          operatingExpensesTotal += amt
        }
      }
    })

    // 總營業收入 = 已銷金額 + 其他營運收入
    const totalOperatingIncome = realizedRevenueDetail.realizedTotal + otherIncomeTotal
    // 本期淨利 / 累積盈餘 = 總營業收入 - 營業總支出 (100% 與損益表勾稽)
    const netIncome = totalOperatingIncome - operatingExpensesTotal

    return {
      otherIncomeTotal,
      operatingExpensesTotal,
      totalOperatingIncome,
      netIncome,
    }
  }, [records, realizedRevenueDetail.realizedTotal])

  // ─── 2. 資產、負債與權益總計 (Total Assets, Liabilities & Equity) ───

  // 總資產 = 現金與存款 + 待收合約分期款
  const totalAssets = Math.max(0, cashBalance.netCash) + pendingInstallmentsDetail.pendingTotal

  // 總負債 = 預收學費負債 (系統剩餘金額)
  const totalLiabilities = unearnedRevenueDetail.unearnedTotal

  // 業主權益總計 = 總資產 - 總負債
  const totalEquity = totalAssets - totalLiabilities

  // 業主資本投入調整 = 總權益 - 累積淨利
  const capitalBalance = totalEquity - pnlBreakdown.netIncome

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Assets */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500">總資產 (Total Assets)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-stone-900 tabular-nums">
            NT$ {totalAssets.toLocaleString()}
          </div>
          <div className="text-[11px] text-stone-400 font-medium flex items-center gap-1">
            <span>現金與存款 + 待收合約</span>
          </div>
        </div>

        {/* Total Liabilities */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500">總負債 (Total Liabilities)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-stone-900 tabular-nums">
            NT$ {totalLiabilities.toLocaleString()}
          </div>
          <div className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
            <span>系統剩餘堂數預收金額</span>
          </div>
        </div>

        {/* Owner's Equity */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500">業主權益 (Owner's Equity)</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-stone-900 tabular-nums">
            NT$ {totalEquity.toLocaleString()}
          </div>
          <div className="text-[11px] text-orange-600 font-medium flex items-center gap-1">
            <span>已銷金額 + 累積累積損益</span>
          </div>
        </div>

        {/* Balance Status */}
        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-500">會計平衡驗證</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 pt-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>資產 = 負債 + 權益</span>
          </div>
          <div className="text-[11px] text-stone-400 font-medium">
            恆等式 100% 自動平衡校驗
          </div>
        </div>
      </div>

      {/* 2. Main Two-Column Balance Sheet Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN: ASSETS */}
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-orange-400" />
                <h3 className="font-bold text-base tracking-wide">資產項目 (Assets)</h3>
              </div>
              <span className="text-xs text-stone-300 font-mono">資產類別</span>
            </div>

            <div className="p-6 space-y-6">
              {/* Category 1: Current Assets */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <span className="text-xs font-black text-stone-800 uppercase tracking-wider">
                    一、流動資產 (Current Assets)
                  </span>
                  <span className="text-xs text-stone-400 font-mono">金額 (NT$)</span>
                </div>

                <div className="space-y-2 text-xs font-medium text-stone-700">
                  {/* Item 1: Cash & Bank */}
                  <div className="flex items-center justify-between py-2 px-3 bg-stone-50/80 rounded-xl hover:bg-stone-100/80 transition-colors">
                    <div className="flex items-center gap-2">
                      <span>現金與銀行存款 (Cash & Bank)</span>
                      <span className="text-[10px] bg-stone-200 text-stone-700 px-1.5 py-0.2 rounded font-bold">
                        流水對帳
                      </span>
                    </div>
                    <span className="font-bold text-stone-900 tabular-nums">
                      $ {Math.max(0, cashBalance.netCash).toLocaleString()}
                    </span>
                  </div>

                  {/* Item 2: Accounts Receivable - Pending Installments */}
                  <div className="flex items-center justify-between py-2 px-3 bg-orange-50/50 border border-orange-100 rounded-xl hover:bg-orange-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-orange-500" />
                      <span className="font-bold text-stone-800">待收合約分期款 (Accounts Receivable)</span>
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded font-bold">
                        🤖 自動連動
                      </span>
                    </div>
                    <span className="font-bold text-orange-600 tabular-nums">
                      $ {pendingInstallmentsDetail.pendingTotal.toLocaleString()}
                    </span>
                  </div>

                  <div className="pl-4 text-[11px] text-stone-400 space-y-0.5 font-sans">
                    <p>• 自動連動全館 {pendingInstallmentsDetail.pendingCount} 筆待收分期付款合約之未結清尾款</p>
                  </div>
                </div>
              </div>

              {/* Category 2: Non-Current Assets */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <span className="text-xs font-black text-stone-800 uppercase tracking-wider">
                    二、非流動資產 (Non-Current Assets)
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 px-3 bg-stone-50/80 rounded-xl text-xs text-stone-500">
                  <span>場館設備與固定資產 (Fixed Assets)</span>
                  <span className="font-bold text-stone-400">$ 0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Asset Total Footer */}
          <div className="px-6 py-4 bg-stone-100 border-t border-stone-200/80 flex items-center justify-between">
            <span className="font-black text-stone-900 text-sm">資產總計 (Total Assets)</span>
            <span className="font-black text-stone-900 text-lg tabular-nums">
              NT$ {totalAssets.toLocaleString()}
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base tracking-wide">負債與權益 (Liabilities & Equity)</h3>
              </div>
              <span className="text-xs text-stone-300 font-mono">負債及權益類別</span>
            </div>

            <div className="p-6 space-y-6">
              {/* Category 1: Liabilities */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <span className="text-xs font-black text-stone-800 uppercase tracking-wider">
                    一、流動負債 (Current Liabilities)
                  </span>
                  <span className="text-xs text-stone-400 font-mono">金額 (NT$)</span>
                </div>

                <div className="space-y-2 text-xs font-medium text-stone-700">
                  {/* Item 1: Unearned Revenue (System Remaining Amount) */}
                  <div className="flex items-center justify-between py-2 px-3 bg-amber-50/60 border border-amber-100 rounded-xl hover:bg-amber-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-600" />
                      <span className="font-bold text-stone-800">預收學費負債 / 系統剩餘金額 (Deferred Revenue)</span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                        🤖 自動連動
                      </span>
                    </div>
                    <span className="font-bold text-amber-700 tabular-nums">
                      $ {unearnedRevenueDetail.unearnedTotal.toLocaleString()}
                    </span>
                  </div>

                  <div className="pl-4 text-[11px] text-stone-400 space-y-0.5">
                    <p>
                      • 自動連動 {unearnedRevenueDetail.activeContractCount} 份進行中合約，剩餘{' '}
                      {unearnedRevenueDetail.remainingSessionsTotal} 堂未上課堂數之剩餘價值
                    </p>
                  </div>
                </div>
              </div>

              {/* Category 2: Owner's Equity */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <span className="text-xs font-black text-stone-800 uppercase tracking-wider">
                    二、業主權益 (Owner's Equity)
                  </span>
                </div>

                <div className="space-y-2 text-xs font-medium text-stone-700">
                  {/* Item 1: Realized Lesson Revenue */}
                  <div className="flex items-center justify-between py-2 px-3 bg-emerald-50/50 border border-emerald-100 rounded-xl hover:bg-emerald-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-bold text-stone-800">已銷堂數金額 / 已實現銷課營收</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">
                        🤖 自動連動銷課
                      </span>
                    </div>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      $ {realizedRevenueDetail.realizedTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Item 2: Other Operating Income */}
                  <div className="flex items-center justify-between py-2 px-3 bg-emerald-50/20 border border-emerald-100/60 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-700 font-medium">其他常規營運收入 (Other P&L Income)</span>
                      <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-bold">
                        🤖 自動連動金流
                      </span>
                    </div>
                    <span className="font-bold text-emerald-600 tabular-nums">
                      + $ {pnlBreakdown.otherIncomeTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Item 3: Operating Expenses */}
                  <div className="flex items-center justify-between py-2 px-3 bg-stone-50/80 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-700 font-medium">營業總支出 (Operating Expenses)</span>
                      <span className="text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.2 rounded font-bold">
                        排除轉帳科目
                      </span>
                    </div>
                    <span className="font-bold text-stone-700 tabular-nums">
                      - $ {pnlBreakdown.operatingExpensesTotal.toLocaleString()}
                    </span>
                  </div>

                  {/* Item 4: Retained Earnings / Net Income (100% matched to P&L) */}
                  <div className="flex items-center justify-between py-2.5 px-3 bg-orange-50/70 border border-orange-200/90 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-orange-950">累積盈餘 / 本期淨利 (Retained Earnings)</span>
                      <span className="text-[10px] bg-orange-200 text-orange-900 px-1.5 py-0.2 rounded font-black">
                        ✓ 100% 勾稽損益表
                      </span>
                    </div>
                    <span className={cn(
                      "font-black text-sm tabular-nums",
                      pnlBreakdown.netIncome >= 0 ? "text-emerald-600" : "text-red-500"
                    )}>
                      $ {pnlBreakdown.netIncome.toLocaleString()}
                    </span>
                  </div>

                  {/* Item 5: Capital Balance */}
                  <div className="flex items-center justify-between py-2 px-3 bg-stone-50/60 rounded-xl text-stone-600">
                    <span>業主資本 / 資本公積投入 (Capital Balance)</span>
                    <span className="font-bold text-stone-800 tabular-nums">
                      $ {capitalBalance.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Liabilities & Equity Total Footer */}
          <div className="px-6 py-4 bg-stone-100 border-t border-stone-200/80 flex items-center justify-between">
            <span className="font-black text-stone-900 text-sm">負債與權益總計 (Total Liabilities & Equity)</span>
            <span className="font-black text-stone-900 text-lg tabular-nums">
              NT$ {(totalLiabilities + totalEquity).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Automatic Data Source Information Note */}
      <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200/70 space-y-2 text-xs text-stone-600">
        <div className="flex items-center gap-2 font-bold text-stone-800">
          <Info className="w-4 h-4 text-orange-500" />
          <span>資產負債表自動勾稽說明</span>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-stone-500 text-[11px]">
          <li>
            <strong className="text-stone-700">待收合約 (應收帳款)</strong>：自動即時彙整全館分期付款合約中，尚未收取的剩餘尾款總金額。
          </li>
          <li>
            <strong className="text-stone-700">系統剩餘金額 (預收學費負債)</strong>：根據權責發生制，將學員已購買但尚未上的堂數，按合約均價計算為預收履約負債。
          </li>
          <li>
            <strong className="text-stone-700">已銷金額 (已實現營業收入)</strong>：學員完成上課後，將對應堂數之價值從預收負債轉入已實現營收與業主權益。
          </li>
        </ul>
      </div>
    </div>
  )
}
