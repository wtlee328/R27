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
import { venueRentalFormSchema, type VenueRentalFormValues } from '../../lib/validators'

interface VenueFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: VenueRentalFormValues) => Promise<void>
}

export function VenueFormModal({ open, onOpenChange, onSubmit }: VenueFormModalProps) {
  const [loading, setLoading] = useState(false)

  const form = useForm<VenueRentalFormValues>({
    resolver: zodResolver(venueRentalFormSchema),
    defaultValues: {
      renterName: '',
      date: new Date(),
      amount: 0,
      notes: '',
    },
  })

  const handleSubmit = async (data: VenueRentalFormValues) => {
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
          <DialogTitle>新增場租紀錄</DialogTitle>
          <DialogDescription>
            新增後，系統將自動於現金流量表產生對應的場租收入。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>承租人名稱 *</Label>
            <Input placeholder="例如: 王教練" {...form.register('renterName')} />
            {form.formState.errors.renterName && (
              <p className="text-red-500 text-xs">{form.formState.errors.renterName.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>場租日期 *</Label>
              <Input type="date" {...form.register('date', { valueAsDate: true })} />
            </div>
            <div className="space-y-2">
              <Label>場租金額 *</Label>
              <Input type="number" {...form.register('amount')} />
              {form.formState.errors.amount && (
                <p className="text-red-500 text-xs">{form.formState.errors.amount.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>備註</Label>
            <Input {...form.register('notes')} placeholder="例如：2小時, 使用深蹲架" />
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
