import { useState, useMemo } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Calendar, User, UserCheck, TrendingUp, AlertCircle, Plus, Search, Check, Info, Phone, Mail } from 'lucide-react'
import { useTrials } from '@/hooks/useTrials'
import { useTrainers } from '@/hooks/useTrainers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { TRIAL_OUTCOME_LABELS } from '@/lib/constants'

export default function TrainerTrialsPage() {
  const { trials, loading: trialsLoading, createTrial, updateTrial } = useTrials()
  const { trainers, loading: trainersLoading } = useTrainers()

  const [isAdding, setIsAdding] = useState(false)

  // Form states
  const [clientName, setClientName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [trialTrainerId, setTrialTrainerId] = useState('')
  const [outcome, setOutcome] = useState<'pending' | 'converted' | 'not_converted'>('pending')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleCancel = () => {
    setIsAdding(false)
    setClientName('')
    setPhone('')
    setEmail('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setTrialTrainerId('')
    setOutcome('pending')
    setNotes('')
    setSubmitError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientName || !phone || !trialTrainerId) {
      setSubmitError('請填寫所有必填欄位')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      await createTrial({
        clientName,
        phone,
        email,
        date: new Date(date),
        trialTrainerId,
        outcome,
        notes,
      })
      handleCancel()
    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || '新增體驗客失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateOutcome = async (id: string, newOutcome: 'pending' | 'converted' | 'not_converted') => {
    try {
      await updateTrial(id, { outcome: newOutcome })
    } catch (err) {
      console.error('Error updating outcome:', err)
    }
  }

  const formatTrialDate = (timestamp: any) => {
    if (!timestamp) return ''
    const d = timestamp.toDate()
    if (isToday(d)) {
      return '今天'
    }
    if (isYesterday(d)) {
      return '昨天'
    }
    return format(d, 'yyyy/MM/dd')
  }

  return (
    <div className="space-y-6">
      {/* ---- Header Section ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">體驗客</h1>
          <p className="text-stone-500 text-xs mt-1">追蹤體驗課程與轉換狀態</p>
        </div>
        {!isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-4 h-10 cursor-pointer font-bold"
          >
            <Plus className="h-4 w-4" />
            新增體驗客
          </Button>
        )}
      </div>

      {isAdding ? (
        /* ---- Add Mode ---- */
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-2">
            <button
              type="button"
              onClick={handleCancel}
              className="text-stone-500 hover:text-stone-700 text-xs font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              ← 返回
            </button>
            <span className="text-xs text-stone-400 font-medium">填寫體驗客資訊</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="clientName" className="text-stone-700 font-bold text-xs">體驗客姓名 *</Label>
            <Input
              id="clientName"
              placeholder="例如: 王小明"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              className="h-11 bg-white border-stone-200 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-stone-700 font-bold text-xs">聯絡電話 *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="0912-345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="h-11 bg-white border-stone-200 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-stone-700 font-bold text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-white border-stone-200 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-stone-700 font-bold text-xs">體驗日期 *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="h-11 bg-white border-stone-200 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="outcome" className="text-stone-700 font-bold text-xs">體驗結果</Label>
              <select
                id="outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as any)}
                className="w-full bg-white border border-stone-200 text-stone-900 px-3.5 py-2.5 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer font-medium"
              >
                <option value="pending">待確認 (Pending)</option>
                <option value="converted">已成交 (Converted)</option>
                <option value="not_converted">未成交 (Not Converted)</option>
              </select>
            </div>
          </div>

          {/* Select Trainer */}
          <div className="space-y-1.5">
            <Label htmlFor="trialTrainerId" className="text-stone-700 font-bold text-xs">體驗課教練 *</Label>
            {trainersLoading ? (
              <div className="text-xs text-stone-400">載入教練名單中...</div>
            ) : (
              <select
                id="trialTrainerId"
                value={trialTrainerId}
                onChange={(e) => setTrialTrainerId(e.target.value)}
                required
                className="w-full bg-white border border-stone-200 text-stone-900 px-3.5 py-2.5 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer font-medium"
              >
                <option value="">-- 請選擇體驗課教練 --</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-stone-700 font-bold text-xs">體驗備註</Label>
            <Textarea
              id="notes"
              placeholder="猶豫價格、體能狀況、期待改善項目等..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-white border-stone-200 rounded-xl min-h-[80px]"
            />
          </div>

          {submitError && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="h-4.5 w-4.5 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="flex-1 h-11 border-stone-200 rounded-xl text-stone-600 text-sm font-bold cursor-pointer"
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 h-11 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold cursor-pointer"
              disabled={submitting || !trialTrainerId}
            >
              {submitting ? '儲存中...' : '確認新增'}
            </Button>
          </div>
        </form>
      ) : (
        /* ---- History/List Mode ---- */
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-brand-500" />
              名單追蹤
            </h2>
            <p className="text-[11px] text-stone-500 mt-0.5">顯示本場館近期預約體驗之名單與成交進度</p>
          </div>

          <div className="space-y-3">
            {trialsLoading ? (
              <div className="space-y-3">
                <div className="skeleton h-20 w-full" />
                <div className="skeleton h-20 w-full" />
              </div>
            ) : trials.length > 0 ? (
              trials.slice(0, 15).map((record) => {
                const trainerName = trainers.find(t => t.id === record.trialTrainerId)?.name || '未指定教練'
                
                const statusColor = 
                  record.outcome === 'converted'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    : record.outcome === 'not_converted'
                      ? 'bg-stone-100 text-stone-600 border-stone-200'
                      : 'bg-amber-50 text-amber-700 border-amber-100'

                return (
                  <Card key={record.id} className="border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                    <CardContent className="p-4 flex justify-between items-start gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-800 text-sm">{record.clientName}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor}`}>
                            {TRIAL_OUTCOME_LABELS[record.outcome]}
                          </span>
                        </div>
                        <div className="space-y-1 text-[11px] text-stone-500">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5 text-stone-400" />
                              {formatTrialDate(record.date)}
                            </span>
                            <span>·</span>
                            <span>體驗教練: {trainerName}</span>
                          </div>
                          {record.phone && (
                            <a href={`tel:${record.phone}`} className="flex items-center gap-1 text-brand-600 font-semibold hover:underline">
                              <Phone className="h-3.5 w-3.5" />
                              {record.phone}
                            </a>
                          )}
                        </div>
                        {record.notes && (
                          <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-100 p-2 rounded-lg italic">
                            備註: {record.notes}
                          </p>
                        )}
                      </div>
                      
                      {/* Outcome Actions */}
                      {record.outcome === 'pending' && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => handleUpdateOutcome(record.id, 'converted')}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg shadow-sm transition-colors cursor-pointer"
                          >
                            已成交
                          </button>
                          <button
                            onClick={() => handleUpdateOutcome(record.id, 'not_converted')}
                            className="bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-[10px] px-2.5 py-1.5 rounded-lg transition-colors border border-stone-200 cursor-pointer"
                          >
                            未成交
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-stone-200 text-stone-400 text-xs">
                無體驗名單
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
