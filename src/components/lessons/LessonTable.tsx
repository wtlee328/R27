import React, { useState } from 'react'
import type { LessonRecord } from '../../types'
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

export function LessonTable({
  records,
  onDelete,
  onEdit,
}: {
  records: LessonRecord[]
  onDelete: (id: string) => void
  onEdit: (record: LessonRecord) => void
}) {
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleDelete = () => {
    if (deleteId) {
      onDelete(deleteId)
      setDeleteId(null)
    }
  }

  if (records.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl border border-stone-200">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 mb-3">
          <span className="text-stone-400 text-xl">📖</span>
        </div>
        <p className="text-stone-500 text-sm font-medium">目前沒有銷課紀錄</p>
        <p className="text-stone-400 text-xs mt-1">點擊上方按鈕開始記錄上課</p>
      </div>
    )
  }

  return (
    <>
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
            <tr>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">上課日期</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">客戶姓名</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-center">消耗堂數</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider">備註</th>
              <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-brand-50/30 transition-colors duration-150 group">
                <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                  {r.sessionDate ? format(r.sessionDate.toDate(), 'yyyy/MM/dd') : '-'}
                </td>
                <td className="px-5 py-3.5 font-medium text-stone-900">{r.customerName}</td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200/60">
                    {r.sessionAmount} 堂
                  </span>
                </td>
                <td className="px-5 py-3.5 text-stone-500">{r.notes}</td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="text-brand-500 hover:text-brand-600 text-sm font-semibold transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(r)
                      }}
                    >
                      編輯
                    </button>
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
                  </div>
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
            <DialogTitle className="text-xl font-bold text-stone-900">確認刪除銷課紀錄？</DialogTitle>
            <DialogDescription className="text-stone-500 mt-2">
              刪除後，該學員的合約剩餘堂數將會自動歸還，且歷史總堂數也會扣除。此操作無法復原。
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
