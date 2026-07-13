import type { VenueRental } from '../../types'
import { format } from 'date-fns'

export function VenueTable({
  rentals,
  onDelete,
}: {
  rentals: VenueRental[]
  onDelete?: (id: string, cashFlowRecordId: string) => void
}) {
  if (rentals.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-stone-200">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
          <span className="text-stone-400 text-xl">🏠</span>
        </div>
        <p className="text-stone-500 text-sm font-medium">目前沒有場租資料</p>
        <p className="text-stone-400 text-xs mt-1">點擊上方按鈕新增場租紀錄</p>
      </div>
    )
  }

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
          <tr>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">日期</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">承租人名稱</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">金額</th>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">備註</th>
            {onDelete && <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">操作</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rentals.map((r) => (
            <tr key={r.id} className="hover:bg-brand-50/30 transition-colors duration-150">
              <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                {r.date ? format(r.date.toDate(), 'yyyy/MM/dd') : '-'}
              </td>
              <td className="px-5 py-3.5 font-medium text-stone-900">{r.renterName}</td>
              <td className="px-5 py-3.5 text-right text-emerald-600 font-semibold tabular-nums">
                NT$ {r.amount.toLocaleString()}
              </td>
              <td className="px-5 py-3.5 text-stone-500">{r.notes}</td>
              {onDelete && (
                <td className="px-5 py-3.5 text-right">
                  <button
                    className="text-red-500 hover:text-red-600 text-sm font-semibold transition-colors"
                    onClick={() => {
                      if (window.confirm('確定要刪除這筆場租紀錄嗎？系統將同步刪除關聯的現金流量紀錄。')) {
                        onDelete(r.id, r.cashFlowRecordId)
                      }
                    }}
                  >
                    刪除
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
