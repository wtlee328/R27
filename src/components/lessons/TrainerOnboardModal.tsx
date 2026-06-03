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
import { trainerFormSchema, type TrainerFormValues } from '../../lib/validators'

interface TrainerOnboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: TrainerFormValues) => Promise<void>
}

export function TrainerOnboardModal({
  open,
  onOpenChange,
  onSubmit,
}: TrainerOnboardModalProps) {
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TrainerFormValues>({
    resolver: zodResolver(trainerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
    },
  })

  const handleFormSubmit = async (data: TrainerFormValues) => {
    setLoading(true)
    try {
      await onSubmit(data)
      onOpenChange(false)
      reset()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) reset()
      onOpenChange(val)
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-stone-900 font-bold">新增教練帳號 (Trainer Onboarding)</DialogTitle>
          <DialogDescription>
            請輸入新教練的姓名、電子郵件及聯絡電話以新增至系統中。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label className="text-stone-700 font-semibold">教練姓名 *</Label>
            <Input
              {...register('name')}
              placeholder="例如：教練 D"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-0.5">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-stone-700 font-semibold">電子郵件 *</Label>
            <Input
              type="email"
              {...register('email')}
              placeholder="trainerD@r27.com"
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-0.5">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-stone-700 font-semibold">聯絡電話 *</Label>
            <Input
              {...register('phone')}
              placeholder="09xx-xxx-xxx"
              className={errors.phone ? 'border-red-500' : ''}
            />
            {errors.phone && (
              <p className="text-red-500 text-xs mt-0.5">{errors.phone.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              className="font-medium"
            >
              取消
            </Button>
            <Button type="submit" disabled={loading} className="font-medium bg-brand-600 hover:bg-brand-700 text-white">
              {loading ? '儲存中...' : '確認新增'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
