import type { CashFlowRecord } from '../../types'
import { format } from 'date-fns'
import { Edit2, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'

interface CashFlowTableProps {
  records: CashFlowRecord[]
  onEdit?: (record: CashFlowRecord) => void
  onDelete?: (id: string) => void
}

export function CashFlowTable({ records, onEdit, onDelete }: CashFlowTableProps) {
  if (records.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-stone-200">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
          <span className="text-stone-400 text-xl">💰</span>
        </div>
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

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
          <tr>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">日期</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">借方科目</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">借方金額</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">貸方科目</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">貸方金額</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">摘要</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-center">來源</th>
            {(onEdit || onDelete) && (
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">操作</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-stone-50/80 transition-colors duration-150">
              <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                {r.date ? format(r.date.toDate(), 'yyyy/MM/dd') : '-'}
              </td>
              <td className="px-5 py-3.5 text-stone-700 font-medium">{r.debitCategory}</td>
              <td className="px-5 py-3.5 text-right font-medium text-emerald-600 tabular-nums">
                {r.debitAmount.toLocaleString()}
              </td>
              <td className="px-5 py-3.5 text-stone-700 font-medium">{r.creditCategory}</td>
              <td className="px-5 py-3.5 text-right font-medium text-red-500 tabular-nums">
                {r.creditAmount.toLocaleString()}
              </td>
              <td className="px-5 py-3.5 text-stone-500">{r.description}</td>
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
