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
import { RiUserSearchLine, RiDeleteBinLine, RiAlertLine } from '@remixicon/react'
import { useTrainers } from '../../hooks/useTrainers'

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
  const { trainers } = useTrainers()

  const handleDelete = () => {
    if (deleteId) {
      onDelete(deleteId)
      setDeleteId(null)
    }
  }

  if (trials.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-xl">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-stone-100 mb-3">
          <RiUserSearchLine className="w-6 h-6 text-stone-400" />
        </div>
        <p className="text-stone-500 text-sm font-medium">目前沒有體驗客資料</p>
        <p className="text-stone-400 text-xs mt-1">點擊上方按鈕新增體驗客紀錄</p>
      </div>
    )
  }

  return (
    <>
      <div className="w-full">
        <table className="w-full text-sm text-left">
          <thead className="bg-stone-50/80 border-b border-stone-100">
            <tr>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">體驗日期</th>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">姓名</th>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">聯絡電話</th>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">體驗課教練</th>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">備註</th>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider text-center">結果狀態</th>
              <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {trials.map((r) => (
              <tr key={r.id} className="group hover:bg-stone-50/60 transition-colors">
                <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                  {r.date ? format(r.date.toDate(), 'yyyy/MM/dd') : '-'}
                </td>
                <td className="px-5 py-3.5 font-medium text-stone-900">{r.clientName}</td>
                <td className="px-5 py-3.5 text-stone-600 tabular-nums">{r.phone}</td>
                <td className="px-5 py-3.5 text-stone-700 font-medium">
                  {trainers.find((t) => t.id === r.trialTrainerId)?.name || '未指定'}
                </td>
                <td className="px-5 py-3.5 text-stone-500">{r.notes}</td>
                <td className="px-5 py-3.5 text-center">
                  <select
                    className={`text-[10px] font-bold border rounded-lg px-2.5 py-1 cursor-pointer focus:outline-none transition-all ${
                      r.outcome === 'pending' ? 'bg-stone-50 text-stone-600 border-stone-200' :
                      r.outcome === 'converted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-red-50 text-red-700 border-red-200'
                    }`}
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
                    className="text-stone-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteId(r.id)
                    }}
                  >
                    <RiDeleteBinLine className="w-4 h-4" />
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
              <RiAlertLine className="w-6 h-6 text-red-600" />
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
              <RiDeleteBinLine className="w-4 h-4" /> 確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
