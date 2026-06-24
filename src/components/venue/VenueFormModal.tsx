import { useState, useEffect } from 'react'
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
import { useTrainers } from '../../hooks/useTrainers'
import { useRenterCustomers } from '../../hooks/useRenterCustomers'

interface VenueFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: VenueRentalFormValues) => Promise<void>
}

export function VenueFormModal({ open, onOpenChange, onSubmit }: VenueFormModalProps) {
  const [loading, setLoading] = useState(false)
  const { trainers } = useTrainers()
  
  const form = useForm<VenueRentalFormValues>({
    resolver: zodResolver(venueRentalFormSchema),
    defaultValues: {
      renterTrainerId: '',
      selectedRenterCustomerId: '',
      newRenterCustomerName: '',
      renterName: '',
      date: new Date(),
      amount: 0,
      notes: '',
    },
  })

  const selectedTrainerId = form.watch('renterTrainerId')
  const { customers: renterCustomers, createRenterCustomer } = useRenterCustomers(selectedTrainerId)

  // Clear selections when trainer changes
  useEffect(() => {
    form.setValue('selectedRenterCustomerId', '')
    form.setValue('newRenterCustomerName', '')
  }, [selectedTrainerId, form])

  const handleSubmit = async (data: VenueRentalFormValues) => {
    setLoading(true)
    try {
      let finalRenterName = ''
      const trainerObj = trainers.find(t => t.id === data.renterTrainerId)
      const trainerName = trainerObj ? trainerObj.name : '未知教練'

      let customerName = ''
      if (data.newRenterCustomerName && data.newRenterCustomerName.trim() !== '') {
        // Save new customer to DB
        const cleanName = data.newRenterCustomerName.trim()
        const newCustomerId = await createRenterCustomer(cleanName)
        data.selectedRenterCustomerId = newCustomerId
        customerName = cleanName
      } else if (data.selectedRenterCustomerId) {
        const custObj = renterCustomers.find(c => c.id === data.selectedRenterCustomerId)
        if (custObj) {
          customerName = custObj.name
        }
      }

      if (customerName) {
        finalRenterName = `${trainerName} - ${customerName}`
      } else {
        finalRenterName = trainerName
      }

      await onSubmit({
        ...data,
        renterName: finalRenterName
      })
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
            <Label>承租教練 *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-white"
              {...form.register('renterTrainerId')}
            >
              <option value="">選擇教練</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {form.formState.errors.renterTrainerId && (
              <p className="text-red-500 text-xs">{form.formState.errors.renterTrainerId.message}</p>
            )}
          </div>

          {selectedTrainerId && (
            <div className="p-4 bg-stone-50 border rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-stone-700">承租教練的學員 (選填)</h4>
              
              <div className="space-y-1">
                <Label className="text-xs">選擇現有學員</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                  {...form.register('selectedRenterCustomerId')}
                  disabled={!!form.watch('newRenterCustomerName')}
                >
                  <option value="">-- 無學員或新增學員 --</option>
                  {renterCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-stone-200"></div>
                <span className="flex-shrink mx-3 text-stone-400 text-[10px] uppercase font-bold">或</span>
                <div className="flex-grow border-t border-stone-200"></div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">新增此教練的學員</Label>
                <Input 
                  placeholder="例如: 林小明 (填寫將會自動儲存)" 
                  {...form.register('newRenterCustomerName')}
                  disabled={!!form.watch('selectedRenterCustomerId')}
                />
              </div>
            </div>
          )}

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
