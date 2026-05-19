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
import { lessonRecordFormSchema, type LessonRecordFormValues } from '../../lib/validators'
import { useCustomers } from '../../hooks/useCustomers'
import { useContracts } from '../../hooks/useContracts'
import type { LessonRecord } from '../../types'

interface LessonRecordWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: LessonRecordFormValues) => Promise<void>
  initialData?: LessonRecord | null
}

export function LessonRecordWizard({
  open,
  onOpenChange,
  onSubmit,
  initialData,
}: LessonRecordWizardProps) {
  const [loading, setLoading] = useState(false)
  const { customers } = useCustomers()
  
  const form = useForm<LessonRecordFormValues>({
    resolver: zodResolver(lessonRecordFormSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      contractId: '',
      sessionDate: new Date(),
      sessionAmount: 1,
      notes: '',
    },
  })

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      form.reset({
        customerId: initialData.customerId,
        customerName: initialData.customerName,
        contractId: initialData.contractId,
        sessionDate: initialData.sessionDate.toDate(),
        sessionAmount: initialData.sessionAmount,
        notes: initialData.notes || '',
      })
    } else {
      form.reset({
        customerId: '',
        customerName: '',
        contractId: '',
        sessionDate: new Date(),
        sessionAmount: 1,
        notes: '',
      })
    }
  }, [initialData, form])

  const selectedCustomerId = form.watch('customerId')
  const { contracts } = useContracts(selectedCustomerId)

  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value
    const cust = customers.find((c) => c.id === custId)
    form.setValue('customerId', custId)
    form.setValue('customerName', cust?.name || '')
    form.setValue('contractId', '') // reset contract
  }

  const handleSubmit = async (data: LessonRecordFormValues) => {
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
          <DialogTitle>{initialData ? '編輯銷課紀錄' : '新增銷課紀錄'}</DialogTitle>
          <DialogDescription>請選擇客戶、合約，並輸入銷課堂數。</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>客戶 *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={selectedCustomerId}
              onChange={handleCustomerChange}
            >
              <option value="" disabled>請選擇客戶</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
            {form.formState.errors.customerId && (
              <p className="text-red-500 text-xs">{form.formState.errors.customerId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>合約 *</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              {...form.register('contractId')}
              disabled={!selectedCustomerId}
            >
              <option value="" disabled>請選擇合約</option>
              {contracts.length === 0 && selectedCustomerId && (
                 <option value="temp_contract_01">預設合約 (開發中佔位)</option>
              )}
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  合約 {c.id.substring(0, 8)} (剩餘: {c.remainingSessions} 堂)
                </option>
              ))}
            </select>
            {form.formState.errors.contractId && (
              <p className="text-red-500 text-xs">{form.formState.errors.contractId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>上課日期 *</Label>
              <Input type="date" {...form.register('sessionDate', { valueAsDate: true })} />
            </div>
            <div className="space-y-2">
              <Label>消耗堂數 *</Label>
              <Input type="number" step="0.5" {...form.register('sessionAmount')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>備註</Label>
            <Input {...form.register('notes')} placeholder="例如：上半身訓練、深蹲進步..." />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '儲存中...' : '確認銷課'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
