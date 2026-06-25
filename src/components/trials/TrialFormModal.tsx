import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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

interface TrialFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: TrialRecordFormValues) => Promise<void>
}

export function TrialFormModal({ open, onOpenChange, onSubmit }: TrialFormModalProps) {
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增體驗客</DialogTitle>
          <DialogDescription>
            紀錄體驗客資訊，後續可追蹤轉換狀態。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>姓名 *</Label>
            <Input placeholder="例如: 張三" {...form.register('clientName')} />
            {form.formState.errors.clientName && (
              <p className="text-red-500 text-xs">{form.formState.errors.clientName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>聯絡電話 *</Label>
              <Input {...form.register('phone')} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...form.register('email')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>體驗日期 *</Label>
              <Input type="date" {...form.register('date', { valueAsDate: true })} />
            </div>
            <div className="space-y-2">
              <Label>體驗結果</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                {...form.register('outcome')}
              >
                <option value="pending">待確認 (Pending)</option>
                <option value="converted">已成交 (Converted)</option>
                <option value="not_converted">未成交 (Not Converted)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>體驗課教練 *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              {...form.register('trialTrainerId')}
            >
              <option value="">選擇教練</option>
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

          <div className="space-y-2">
            <Label>備註</Label>
            <Input {...form.register('notes')} placeholder="例如：想練臀部、猶豫價格..." />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '儲存中...' : '確認新增'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
