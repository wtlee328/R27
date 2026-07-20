import type { CashFlowRecord } from '../../types'
import { ACCOUNT_CATEGORY_GROUPS, ALL_ACCOUNT_CATEGORIES } from '../../lib/constants'

interface TrialBalanceRow {
  category: string
  groupName: string
  debitTotal: number
  creditTotal: number
}

interface TrialBalanceTableProps {
  records: CashFlowRecord[]
  monthLabel?: string
}

export function TrialBalanceTable({ records, monthLabel }: TrialBalanceTableProps) {
  // Aggregate debit and credit totals per category
  const categoryMap = new Map<string, { debitTotal: number; creditTotal: number }>()

  records.forEach((r) => {
    if (r.debitCategory) {
      const current = categoryMap.get(r.debitCategory) || { debitTotal: 0, creditTotal: 0 }
      categoryMap.set(r.debitCategory, {
        ...current,
        debitTotal: current.debitTotal + (r.debitAmount || 0),
      })
    }
    if (r.creditCategory) {
      const current = categoryMap.get(r.creditCategory) || { debitTotal: 0, creditTotal: 0 }
      categoryMap.set(r.creditCategory, {
        ...current,
        creditTotal: current.creditTotal + (r.creditAmount || 0),
      })
    }
  })

  // Sort rows based on ACCOUNT_CATEGORY_GROUPS order
  const orderedCategories: { category: string; groupName: string }[] = []

  // 1. Add preset categories in group order
  ACCOUNT_CATEGORY_GROUPS.forEach((g) => {
    g.items.forEach((item) => {
      if (categoryMap.has(item)) {
        orderedCategories.push({ category: item, groupName: g.group })
      }
    })
  })

  // 2. Add custom categories not in preset list
  categoryMap.forEach((_, cat) => {
    if (!ALL_ACCOUNT_CATEGORIES.includes(cat)) {
      orderedCategories.push({ category: cat, groupName: '自訂科目' })
    }
  })

  const rows: TrialBalanceRow[] = orderedCategories.map(({ category, groupName }) => {
    const data = categoryMap.get(category) || { debitTotal: 0, creditTotal: 0 }
    return {
      category,
      groupName,
      debitTotal: data.debitTotal,
      creditTotal: data.creditTotal,
    }
  })

  const grandTotalDebit = rows.reduce((sum, r) => sum + r.debitTotal, 0)
  const grandTotalCredit = rows.reduce((sum, r) => sum + r.creditTotal, 0)
  const isBalanced = grandTotalDebit === grandTotalCredit
  const difference = Math.abs(grandTotalDebit - grandTotalCredit)

  return (
    <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="bg-stone-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">試算表 {monthLabel ? `（${monthLabel}）` : ''}</h3>
          <p className="text-xs text-stone-400 mt-0.5">統計各會計科目之借貸彙整金額與借貸平衡驗證</p>
        </div>
        <div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
            isBalanced 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}>
            {isBalanced ? '✓ 借貸平衡' : `! 未平衡 (差額 $${difference.toLocaleString()})`}
          </span>
        </div>
      </div>

      <table className="w-full text-sm text-left">
        <thead className="bg-stone-100 text-stone-700 border-b border-stone-200">
          <tr>
            <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider">科目</th>
            <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider text-right text-emerald-700">借方 (Debit)</th>
            <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider text-right text-red-700">貸方 (Credit)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-6 py-12 text-center text-stone-400 text-xs font-medium">
                該時段尚無會計科目交易記錄
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.category} className="hover:bg-stone-50/80 transition-colors">
                <td className="px-6 py-3.5 text-stone-800 font-bold flex items-center gap-2">
                  <span>{row.category}</span>
                  <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-stone-100 text-stone-500 border border-stone-200/50">
                    {row.groupName}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right font-mono font-bold text-stone-900 tabular-nums">
                  {row.debitTotal > 0 ? `$${row.debitTotal.toLocaleString()}` : '$0'}
                </td>
                <td className="px-6 py-3.5 text-right font-mono font-bold text-stone-900 tabular-nums">
                  {row.creditTotal > 0 ? `$${row.creditTotal.toLocaleString()}` : '$0'}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot className="bg-stone-100/90 border-t-2 border-stone-300">
          <tr>
            <td className="px-6 py-4 font-black text-stone-900">
              合計 (Total)
            </td>
            <td className="px-6 py-4 text-right font-mono font-black text-emerald-700 text-base tabular-nums">
              ${grandTotalDebit.toLocaleString()}
            </td>
            <td className="px-6 py-4 text-right font-mono font-black text-red-700 text-base tabular-nums">
              ${grandTotalCredit.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
