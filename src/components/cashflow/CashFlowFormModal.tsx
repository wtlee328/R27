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
import { cashFlowFormSchema, type CashFlowFormValues } from '../../lib/validators'
import { ACCOUNT_CATEGORY_GROUPS, ALL_ACCOUNT_CATEGORIES } from '../../lib/constants'

interface CashFlowFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CashFlowFormValues) => Promise<void>
  initialData?: Partial<CashFlowFormValues>
}

interface CategorySelectInputProps {
  label: string
  value: string
  onChange: (val: string) => void
  error?: string
}

function CategorySelectInput({
  label,
  value,
  onChange,
  error,
}: CategorySelectInputProps) {
  const isPreset = ALL_ACCOUNT_CATEGORIES.includes(value)
  const [isCustom, setIsCustom] = useState(!isPreset && value !== '')
  const [customVal, setCustomVal] = useState(!isPreset ? value : '')

  useEffect(() => {
    const matchedPreset = ALL_ACCOUNT_CATEGORIES.includes(value)
    if (matchedPreset) {
      setIsCustom(false)
    } else if (value !== '') {
      setIsCustom(true)
      setCustomVal(value)
    }
  }, [value])

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value
    if (selected === '__CUSTOM__') {
      setIsCustom(true)
      onChange(customVal)
    } else {
      setIsCustom(false)
      onChange(selected)
    }
  }

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value
    setCustomVal(newVal)
    onChange(newVal)
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-stone-700 font-bold text-xs">{label} *</Label>
      <select
        value={isCustom ? '__CUSTOM__' : (value || '')}
        onChange={handleSelectChange}
        className="w-full h-10 px-3 border border-stone-200 rounded-xl text-xs bg-white text-stone-800 font-bold focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
      >
        <option value="" disabled>-- 請選擇會計科目 --</option>
        {ACCOUNT_CATEGORY_GROUPS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__CUSTOM__">＋ 自行輸入科目...</option>
      </select>

      {isCustom && (
        <Input
          type="text"
          placeholder="請輸入自訂會計科目名稱"
          value={customVal}
          onChange={handleCustomInputChange}
          className="h-9 text-xs bg-stone-50 border-stone-200 rounded-xl mt-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
        />
      )}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function AccountSelectInput({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const presetAccounts = ['公司存款', '現金', '銀行存款']
  const isPreset = presetAccounts.includes(value)
  const [isCustom, setIsCustom] = useState(!isPreset && value !== '')
  const [customVal, setCustomVal] = useState(!isPreset ? value : '')

  useEffect(() => {
    if (presetAccounts.includes(value)) {
      setIsCustom(false)
    } else if (value !== '') {
      setIsCustom(true)
      setCustomVal(value)
    }
  }, [value])

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value
    if (selected === '__CUSTOM__') {
      setIsCustom(true)
      onChange(customVal || '其他帳戶')
    } else {
      setIsCustom(false)
      onChange(selected)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-stone-700 font-bold text-xs">資金帳戶 / 管道</Label>
      <select
        value={isCustom ? '__CUSTOM__' : (value || '公司存款')}
        onChange={handleSelectChange}
        className="w-full h-10 px-3 border border-stone-200 rounded-xl text-xs bg-white text-stone-800 font-bold focus:outline-none focus:ring-2 focus:ring-stone-900/10 cursor-pointer"
      >
        {presetAccounts.map((acc) => (
          <option key={acc} value={acc}>
            {acc}
          </option>
        ))}
        <option value="__CUSTOM__">＋ 自行輸入帳戶...</option>
      </select>

      {isCustom && (
        <Input
          type="text"
          placeholder="請輸入帳戶名稱"
          value={customVal}
          onChange={(e) => {
            setCustomVal(e.target.value)
            onChange(e.target.value)
          }}
          className="h-9 text-xs bg-stone-50 border-stone-200 rounded-xl mt-1.5"
        />
      )}
    </div>
  )
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
      type: 'income',
      category: '',
      amount: 0,
      account: '公司存款',
      description: '',
      notes: '',
      source: 'manual',
      sourceId: null,
      ...initialData,
    },
  })

  // Reset form when modal opens or initialData changes
  useEffect(() => {
    if (open) {
      form.reset({
        date: initialData?.date || new Date(),
        type: initialData?.type || 'income',
        category: initialData?.category || '',
        amount: initialData?.amount || 0,
        account: initialData?.account || '公司存款',
        description: initialData?.description || '',
        notes: initialData?.notes || '',
        source: initialData?.source || 'manual',
        sourceId: initialData?.sourceId || null,
      })
    }
  }, [open, initialData, form])

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

  const toInputDateFormat = (d: any) => {
    if (!d) return ''
    if (d instanceof Date) {
      return d.toISOString().split('T')[0]
    }
    if (d.toDate && typeof d.toDate === 'function') {
      return d.toDate().toISOString().split('T')[0]
    }
    return String(d).split('T')[0]
  }

  const currentType = form.watch('type')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? '編輯記帳' : '新增記帳'}</DialogTitle>
          <DialogDescription>輸入收支類別與金額，掌握實質現金流動。</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Transaction Type Segmented Toggle */}
          <div className="space-y-1.5">
            <Label className="text-stone-700 font-bold text-xs">交易類型 *</Label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100/80 rounded-2xl border border-stone-200/60">
              <button
                type="button"
                onClick={() => form.setValue('type', 'income', { shouldValidate: true })}
                className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  currentType === 'income'
                    ? 'bg-emerald-600 text-white shadow-sm font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>＋ 現金流入 (收入)</span>
              </button>
              <button
                type="button"
                onClick={() => form.setValue('type', 'expense', { shouldValidate: true })}
                className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  currentType === 'expense'
                    ? 'bg-red-600 text-white shadow-sm font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>－ 現金流出 (支出)</span>
              </button>
            </div>
            {form.formState.errors.type && (
              <p className="text-red-500 text-xs mt-1">{form.formState.errors.type.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-stone-700 font-bold text-xs">日期 *</Label>
              <Input
                type="date"
                className="h-10 rounded-xl text-xs"
                value={toInputDateFormat(form.watch('date'))}
                onChange={(e) => form.setValue('date', e.target.valueAsDate || new Date())}
              />
              {form.formState.errors.date && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.date.message}</p>
              )}
            </div>

            <AccountSelectInput
              value={form.watch('account') || '公司存款'}
              onChange={(val) => form.setValue('account', val)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <CategorySelectInput
              label="會計科目"
              value={form.watch('category')}
              onChange={(val) => form.setValue('category', val, { shouldValidate: true })}
              error={form.formState.errors.category?.message}
            />
            <div className="space-y-1.5">
              <Label className="text-stone-700 font-bold text-xs">交易金額 *</Label>
              <Input
                type="number"
                className="h-10 rounded-xl text-xs font-mono font-bold"
                placeholder="例如: 22000"
                {...form.register('amount', { valueAsNumber: true })}
              />
              {form.formState.errors.amount && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.amount.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-stone-700 font-bold text-xs">摘要 *</Label>
            <Input
              placeholder="例如: 收取現金會費 / 支付3月場館租金"
              className="h-10 rounded-xl text-xs"
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p className="text-red-500 text-xs mt-1">{form.formState.errors.description.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-stone-700 font-bold text-xs">備註</Label>
            <Input
              className="h-10 rounded-xl text-xs"
              placeholder="可選填發票號碼、對照備註等"
              {...form.register('notes')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading} className="bg-stone-900 hover:bg-stone-800 text-white font-bold">
              {loading ? '儲存中...' : '儲存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
