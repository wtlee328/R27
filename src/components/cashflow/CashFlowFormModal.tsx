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
import { cashFlowFormSchema, type CashFlowFormValues } from '../../lib/validators'

interface CashFlowFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CashFlowFormValues) => Promise<void>
  initialData?: Partial<CashFlowFormValues>
}

export function CashFlowFormModal({
  open,
  onOpenChange,
  onSubmit,
  initialData,
}: CashFlowFormModalProps) {
  const [loading, setLoading] = useState(false)

  const form = useForm<CashFlowFormValues>({
    resolver: zodResolver(cashFlowFormSchema),
    defaultValues: {
      date: new Date(),
      debitCategory: '',
      debitAmount: 0,
      creditCategory: '',
      creditAmount: 0,
      description: '',
      notes: '',
      source: 'manual',
      sourceId: null,
      ...initialData,
    },
  })

  const handleSubmit = async (data: CashFlowFormValues) => {
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
          <DialogTitle>{initialData ? '編輯記帳' : '新增記帳'}</DialogTitle>
          <DialogDescription>輸入借貸方科目與金額，確保會計平衡。</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>日期 *</Label>
            <Input type="date" {...form.register('date', { valueAsDate: true })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>借方科目 (Debit) *</Label>
              <Input placeholder="例如: 現金" {...form.register('debitCategory')} />
            </div>
            <div className="space-y-2">
              <Label>借方金額 *</Label>
              <Input type="number" {...form.register('debitAmount')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>貸方科目 (Credit) *</Label>
              <Input placeholder="例如: 銷貨收入" {...form.register('creditCategory')} />
            </div>
            <div className="space-y-2">
              <Label>貸方金額 *</Label>
              <Input type="number" {...form.register('creditAmount')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>摘要 *</Label>
            <Input placeholder="例如: 收取現金會費" {...form.register('description')} />
          </div>

          <div className="space-y-2">
            <Label>備註</Label>
            <Input {...form.register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '儲存中...' : '儲存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
