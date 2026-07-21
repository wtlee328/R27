import type { CashFlowRecord } from '../../types'
import { format } from 'date-fns'
import { Edit2, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'

interface CashFlowTableProps {
  records: CashFlowRecord[]
  onEdit?: (record: CashFlowRecord) => void
  onDelete?: (id: string) => void
}

export function normalizeCashFlowRecord(r: CashFlowRecord) {
  // If record already has new schema fields (type, category, amount)
  if (r.type && r.category && typeof r.amount === 'number') {
    return {
      ...r,
      type: r.type,
      category: r.category,
      amount: r.amount,
      account: r.account || '公司存款',
    }
  }

  // Helper to check if a category is a cash/bank asset
  const isCashOrBank = (cat?: string) =>
    cat && ['現金', '銀行存款', '公司存款'].some((a) => cat.includes(a))

  // Legacy schema fallback (debitCategory/creditCategory/debitAmount/creditAmount)
  const isDebitCash = isCashOrBank(r.debitCategory)
  const isCreditCash = isCashOrBank(r.creditCategory)

  if (isDebitCash && !isCreditCash) {
    return {
      ...r,
      type: 'income' as const,
      category: r.creditCategory || r.debitCategory || '未知科目',
      amount: r.creditAmount || r.debitAmount || 0,
      account: r.debitCategory || '公司存款',
    }
  } else if (isCreditCash && !isDebitCash) {
    return {
      ...r,
      type: 'expense' as const,
      category: r.debitCategory || r.creditCategory || '未知科目',
      amount: r.debitAmount || r.creditAmount || 0,
      account: r.creditCategory || '公司存款',
    }
  } else {
    const isExpenseCategory = [
      '房租', '薪資', '水電', '行銷', '會計', '網路', '雜項', '器材', '新光AED', '公司福利', '保險', '營業稅', '攤提'
    ].some((c) => (r.debitCategory || '').includes(c))

    return {
      ...r,
      type: isExpenseCategory ? ('expense' as const) : ('income' as const),
      category: r.debitCategory || r.creditCategory || '一般收支',
      amount: r.debitAmount || r.creditAmount || 0,
      account: '公司存款',
    }
  }
}

export function CashFlowTable({ records, onEdit, onDelete }: CashFlowTableProps) {
  if (records.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-stone-200">
        <p className="text-stone-500 text-sm font-medium">目前沒有記帳資料</p>
        <p className="text-stone-400 text-xs mt-1">點擊上方按鈕新增第一筆紀錄</p>
      </div>
    )
  }

  const sourceLabels: Record<string, string> = {
    manual: '手動',
    venue_rental: '場租',
    csv_import: '匯入',
    lesson: '銷課',
  }

  const normalizedRecords = records.map(normalizeCashFlowRecord)

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
          <tr>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">日期</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">交易類型</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">會計科目</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">資金帳戶</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">金額</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">摘要</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-center">來源</th>
            {(onEdit || onDelete) && (
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">操作</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {normalizedRecords.map((r) => (
            <tr key={r.id} className="hover:bg-stone-50/80 transition-colors duration-150">
              <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                {r.date ? format(r.date.toDate(), 'yyyy/MM/dd') : '-'}
              </td>
              <td className="px-5 py-3.5">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    r.type === 'income'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {r.type === 'income' ? '＋ 收入' : '－ 支出'}
                </span>
              </td>
              <td className="px-5 py-3.5 text-stone-900 font-bold">{r.category}</td>
              <td className="px-5 py-3.5 text-stone-600 text-xs font-medium">
                <span className="px-2 py-0.5 rounded bg-stone-100 border border-stone-200/50">
                  {r.account}
                </span>
              </td>
              <td
                className={`px-5 py-3.5 text-right font-mono font-bold tabular-nums ${
                  r.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                {r.type === 'income' ? `+$${r.amount.toLocaleString()}` : `-$${r.amount.toLocaleString()}`}
              </td>
              <td className="px-5 py-3.5 text-stone-600">{r.description}</td>
              <td className="px-5 py-3.5 text-center">
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-stone-100 text-stone-600 border border-stone-200/60">
                  {sourceLabels[r.source] ?? r.source}
                </span>
              </td>
              {(onEdit || onDelete) && (
                <td className="px-5 py-3.5 text-right space-x-1">
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-stone-400 hover:text-stone-700"
                      onClick={() => onEdit(r)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-stone-400 hover:text-red-600"
                      onClick={() => {
                        if (confirm('確定要刪除這筆記帳紀錄嗎？')) {
                          onDelete(r.id)
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
