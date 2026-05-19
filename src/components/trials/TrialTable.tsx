import React, { useState } from 'react'
import type { TrialRecord } from '../../types'
import { format } from 'date-fns'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '../ui/dialog'
import { Button } from '../ui/button'
import { AlertCircle, Trash2 } from 'lucide-react'

export function TrialTable({
  trials,
  onDelete,
  onUpdateStatus,
}: {
  trials: TrialRecord[]
  onDelete: (id: string) => void
  onUpdateStatus: (id: string, newStatus: 'pending' | 'converted' | 'not_converted') => void
}) {
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleDelete = () => {
    if (deleteId) {
      onDelete(deleteId)
      setDeleteId(null)
    }
  }

  if (trials.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-stone-200">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
          <span className="text-stone-400 text-xl">🎯</span>
        </div>
        <p className="text-stone-500 text-sm font-medium">目前沒有體驗客資料</p>
        <p className="text-stone-400 text-xs mt-1">點擊上方按鈕新增體驗客紀錄</p>
      </div>
    )
  }

  return (
    <>
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">體驗日期</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">姓名</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">聯絡電話</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">備註</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-center">結果狀態</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {trials.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/30 transition-colors duration-150">
                <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                  {r.date ? format(r.date.toDate(), 'yyyy/MM/dd') : '-'}
                </td>
                <td className="px-5 py-3.5 font-medium text-stone-900">{r.clientName}</td>
                <td className="px-5 py-3.5 text-stone-600 tabular-nums">{r.phone}</td>
                <td className="px-5 py-3.5 text-stone-500">{r.notes}</td>
                <td className="px-5 py-3.5 text-center">
                  <select
                    className="text-xs bg-stone-50 border border-stone-200 rounded-full px-3 py-1.5 cursor-pointer focus:ring-1 focus:ring-brand-400 focus:border-brand-400 transition-all hover:bg-white font-medium"
                    value={r.outcome}
                    onChange={(e) => onUpdateStatus(r.id, e.target.value as any)}
                  >
                    <option value="pending">待確認</option>
                    <option value="converted">已成交</option>
                    <option value="not_converted">未成交</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-600 text-sm font-semibold transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteId(r.id)
                    }}
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-stone-900">確認刪除體驗客紀錄？</DialogTitle>
            <DialogDescription className="text-stone-500 mt-2">
              刪除後將無法復原。如果該客戶已成交並轉為學員，建議保留此紀錄以供追蹤來源。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="flex-1 gap-2">
              <Trash2 className="w-4 h-4" /> 確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
