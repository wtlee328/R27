import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { trialRecordFormSchema, type TrialRecordFormValues } from '../../lib/validators'
import { useTrainers } from '../../hooks/useTrainers'
import type { TrialRecord } from '../../types'

interface TrialFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: TrialRecordFormValues) => Promise<void>
  initialData?: TrialRecord | null
}

export function TrialFormModal({ open, onOpenChange, onSubmit, initialData }: TrialFormModalProps) {
  const [loading, setLoading] = useState(false)
  const { trainers } = useTrainers()

  const form = useForm<TrialRecordFormValues>({
    resolver: zodResolver(trialRecordFormSchema),
    defaultValues: {
      clientName: '',
      phone: '',
      email: '',
      date: new Date().toISOString().split('T')[0] as any,
      trialTrainerId: '',
      outcome: 'pending',
      notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      if (initialData) {
        const d = initialData.date ? format(initialData.date.toDate(), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
        form.reset({
          clientName: initialData.clientName || '',
          phone: initialData.phone || '',
          email: initialData.email || '',
          date: d as any,
          trialTrainerId: initialData.trialTrainerId || '',
          outcome: initialData.outcome || 'pending',
          notes: initialData.notes || '',
        })
      } else {
        form.reset({
          clientName: '',
          phone: '',
          email: '',
          date: format(new Date(), 'yyyy-MM-dd') as any,
          trialTrainerId: '',
          outcome: 'pending',
          notes: '',
        })
      }
    }
  }, [open, initialData, form])

  const handleSubmit = async (data: TrialRecordFormValues) => {
    setLoading(true)
    try {
      await onSubmit(data)
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white rounded-2xl p-6 shadow-xl border border-stone-200">
        <DialogHeader>
          <DialogTitle className="text-stone-900 font-bold text-lg">
            {initialData ? '編輯體驗客資料' : '新增體驗客'}
          </DialogTitle>
          <DialogDescription className="text-stone-500 text-xs mt-1">
            紀錄體驗客資訊，後續可追蹤轉換狀態。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-stone-700 font-bold text-xs">姓名 *</Label>
            <Input 
              placeholder="例如: 張三" 
              {...form.register('clientName')} 
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
            />
            {form.formState.errors.clientName && (
              <p className="text-red-500 text-xs">{form.formState.errors.clientName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-stone-700 font-bold text-xs">聯絡電話 *</Label>
              <Input 
                placeholder="0912-345678" 
                {...form.register('phone')} 
                className="h-10 bg-white border-stone-200 rounded-xl text-sm"
              />
              {form.formState.errors.phone && (
                <p className="text-red-500 text-xs">{form.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-stone-700 font-bold text-xs">Email</Label>
              <Input 
                type="email" 
                placeholder="name@email.com" 
                {...form.register('email')} 
                className="h-10 bg-white border-stone-200 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-stone-700 font-bold text-xs">體驗日期 *</Label>
              <Input 
                type="date" 
                {...form.register('date', { valueAsDate: true })} 
                className="h-10 bg-white border-stone-200 rounded-xl text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-stone-700 font-bold text-xs">體驗結果</Label>
              <select
                className="w-full h-10 bg-white border border-stone-200 rounded-xl px-3 text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
                {...form.register('outcome')}
              >
                <option value="pending">待確認 (Pending)</option>
                <option value="converted">已成交 (Converted)</option>
                <option value="not_converted">未成交 (Not Converted)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-stone-700 font-bold text-xs">體驗課教練 *</Label>
            <select
              className="w-full h-10 bg-white border border-stone-200 rounded-xl px-3 text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
              {...form.register('trialTrainerId')}
            >
              <option value="">-- 請選擇教練 --</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {form.formState.errors.trialTrainerId && (
              <p className="text-red-500 text-xs">{form.formState.errors.trialTrainerId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-stone-700 font-bold text-xs">備註</Label>
            <Input 
              {...form.register('notes')} 
              placeholder="例如：想練臀部、猶豫價格..." 
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 font-semibold rounded-xl text-xs">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 font-semibold rounded-xl text-xs bg-stone-900 hover:bg-stone-800 text-white">
              {loading ? '儲存中...' : (initialData ? '確認儲存' : '確認新增')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
