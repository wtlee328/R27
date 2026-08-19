import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RiUser3Line } from '@remixicon/react'
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
import { Textarea } from '../ui/textarea'
import { useTrainers } from '../../hooks/useTrainers'
import { venueRentalFormSchema, type VenueRentalFormValues } from '../../lib/validators'
import type { VenueRental } from '../../types'

interface VenueFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: VenueRentalFormValues) => Promise<void>
  initialDate?: string // e.g. "2026-07-13"
  initialData?: VenueRental | null
  fixedTrainerId?: string
}

export function VenueFormModal({ open, onOpenChange, onSubmit, initialDate, initialData, fixedTrainerId }: VenueFormModalProps) {
  const [loading, setLoading] = useState(false)
  const { trainers, loading: trainersLoading } = useTrainers()
  
  const form = useForm<VenueRentalFormValues>({
    resolver: zodResolver(venueRentalFormSchema),
    defaultValues: {
      renterTrainerId: fixedTrainerId || '',
      selectedRenterCustomerId: '',
      newRenterCustomerName: '',
      renterName: '',
      date: new Date() as any,
      amount: 300,
      notes: '',
    },
  })

  // Sync initialData, initialDate, or fixedTrainerId when opening
  useEffect(() => {
    if (open) {
      if (initialData) {
        // Extract external renter name if stored in format: "TrainerName - RenterName"
        let extName = ''
        if (initialData.renterName) {
          const parts = initialData.renterName.split(' - ')
          if (parts.length > 1) {
            extName = parts.slice(1).join(' - ')
          }
        }

        form.reset({
          renterTrainerId: initialData.renterTrainerId || fixedTrainerId || '',
          selectedRenterCustomerId: initialData.renterCustomerId || '',
          newRenterCustomerName: extName,
          renterName: initialData.renterName || '',
          date: (initialData.date ? initialData.date.toDate() : new Date()) as any,
          amount: initialData.amount ?? 300,
          notes: initialData.notes || '',
        })
      } else {
        form.reset({
          renterTrainerId: fixedTrainerId || '',
          selectedRenterCustomerId: '',
          newRenterCustomerName: '',
          renterName: '',
          date: (initialDate ? new Date(initialDate + 'T12:00:00') : new Date()) as any,
          amount: 300,
          notes: '',
        })
      }
    }
  }, [open, initialData, initialDate, fixedTrainerId, form])

  const handleSubmit = async (data: VenueRentalFormValues) => {
    setLoading(true)
    try {
      const activeTrainerId = data.renterTrainerId || fixedTrainerId || ''
      const trainerObj = trainers.find(t => t.id === activeTrainerId)
      const trainerName = trainerObj ? trainerObj.name : '未知教練'

      let finalRenterName = trainerName
      if (data.newRenterCustomerName && data.newRenterCustomerName.trim() !== '') {
        finalRenterName = `${trainerName} - ${data.newRenterCustomerName.trim()}`
      }

      await onSubmit({
        ...data,
        renterTrainerId: activeTrainerId,
        renterName: finalRenterName,
      })
      onOpenChange(false)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // Format date for the input type="date"
  const formatDateForInput = (d: any) => {
    if (!d) return ''
    const dateObj = d instanceof Date ? d : new Date(d)
    if (isNaN(dateObj.getTime())) return ''
    return dateObj.toISOString().split('T')[0]
  }

  const isEditMode = !!initialData

  const watchedDate = form.watch('date')
  const watchedTrainerId = form.watch('renterTrainerId') || fixedTrainerId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white border border-stone-200 shadow-2xl rounded-2xl p-6">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-stone-900 font-black text-lg">
            {initialData ? '編輯場租預約' : '新增場租預約'}
          </DialogTitle>
          <DialogDescription className="text-stone-500 text-xs">
            {initialData ? '修改此筆場租預約明細' : '登記並預約教練或學員之場地租借時段'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Date Picker */}
          <div className="space-y-1.5">
            <Label htmlFor="date" className="text-stone-700 font-bold text-xs">預約日期 *</Label>
            <Input
              type="date"
              id="date"
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
              value={formatDateForInput(watchedDate)}
              onChange={(e) => {
                const val = e.target.value
                if (val) {
                  form.setValue('date', new Date(val + 'T12:00:00'))
                }
              }}
            />
            {form.formState.errors.date && (
              <p className="text-red-500 text-xs">{form.formState.errors.date.message}</p>
            )}
          </div>

          {/* Select Trainer */}
          <div className="space-y-1.5">
            <Label htmlFor="renterTrainerId" className="text-stone-700 font-bold text-xs">申請教練 *</Label>
            {fixedTrainerId ? (
              <div className="flex items-center justify-between p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-bold text-stone-800">
                <div className="flex items-center gap-2">
                  <RiUser3Line className="w-4 h-4 text-brand-500" />
                  <span>{trainers.find(t => t.id === watchedTrainerId)?.name || '登入教練'}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-stone-200/80 text-stone-600 rounded-md font-medium">已鎖定為當前教練</span>
              </div>
            ) : trainersLoading ? (
              <div className="text-xs text-stone-400">載入教練名單中...</div>
            ) : (
              <select
                id="renterTrainerId"
                className="w-full bg-white border border-stone-200 text-stone-900 px-3 py-2.5 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer font-medium"
                {...form.register('renterTrainerId')}
              >
                <option value="">-- 請選擇您的名稱 --</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {form.formState.errors.renterTrainerId && (
              <p className="text-red-500 text-xs">{form.formState.errors.renterTrainerId.message}</p>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount" className="text-stone-700 font-bold text-xs">場租收費金額 (NT$) *</Label>
            <Input
              type="number"
              id="amount"
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
              placeholder="300"
              {...form.register('amount', { valueAsNumber: true })}
            />
            {form.formState.errors.amount && (
              <p className="text-red-500 text-xs">{form.formState.errors.amount.message}</p>
            )}
          </div>

          {/* External Renter Name */}
          <div className="space-y-1.5">
            <Label htmlFor="newRenterCustomerName" className="text-stone-700 font-bold text-xs">外部租借人名稱 / 租借單位 (選填)</Label>
            <Input
              id="newRenterCustomerName"
              placeholder="例如: 外部教練陳先生、自主練習學員"
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
              {...form.register('newRenterCustomerName')}
            />
          </div>

          {/* Purpose / Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-stone-700 font-bold text-xs">預約用途</Label>
            <Textarea
              id="notes"
              placeholder="例如: 一對一私人課、自主訓練"
              className="bg-white border-stone-200 rounded-xl min-h-[70px] text-sm"
              {...form.register('notes')}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-10 border-stone-200 rounded-xl text-stone-600 text-xs font-bold cursor-pointer"
              disabled={loading}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 h-10 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              disabled={loading}
            >
              {loading ? '儲存中...' : (isEditMode ? '儲存變更' : '確認新增')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
