import { useState, useMemo } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Calendar, UserCheck, AlertCircle, Plus, Phone, Edit2 } from 'lucide-react'
import { useTrials } from '@/hooks/useTrials'
import { useTrainers } from '@/hooks/useTrainers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'


export default function TrainerTrialsPage() {
  const { trials, loading: trialsLoading, createTrial, updateTrial } = useTrials()
  const { trainers, loading: trainersLoading } = useTrainers()

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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
    setEditingId(null)
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

    const parsedDate = (() => {
      const [y, m, d] = date.split('-').map(Number)
      return new Date(y, m - 1, d)
    })()

    try {
      if (editingId) {
        await updateTrial(editingId, {
          clientName,
          phone,
          email,
          date: parsedDate,
          trialTrainerId,
          outcome,
          notes,
        })
      } else {
        await createTrial({
          clientName,
          phone,
          email,
          date: parsedDate,
          trialTrainerId,
          outcome,
          notes,
        })
      }
      handleCancel()
    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || '儲存體驗客失敗')
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
          <h1 className="text-2xl font-black text-stone-900">體驗客管理</h1>
          <p className="text-stone-500 text-sm mt-1">追蹤體驗課程與轉換狀態</p>
        </div>
        {!isAdding && (
          <Button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-5 h-10 cursor-pointer font-bold"
          >
            <Plus className="h-4 w-4" />
            新增體驗客
          </Button>
        )}
      </div>

      {isAdding ? (
        /* ---- Add / Edit Mode ---- */
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-4 mb-1">
            <button
              type="button"
              onClick={handleCancel}
              className="text-stone-500 hover:text-stone-800 text-sm font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              ← 返回列表
            </button>
            <span className="text-sm text-stone-400 font-medium">
              {editingId ? '編輯體驗客資料' : '填寫體驗客資訊'}
            </span>
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

          {/* Row 2: Date, Outcome, Trainer */}
          <div className="grid grid-cols-3 gap-5">
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
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
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
              {submitting ? '儲存中...' : (editingId ? '確認儲存' : '確認新增')}
            </Button>
          </div>
        </form>
      ) : (
        /* ---- History/List Mode ---- */
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-brand-500" />
                體驗客名單追蹤
              </h2>
              <p className="text-stone-500 text-sm mt-0.5">顯示本場館近期體驗名單與成交進度</p>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1.2fr_220px] gap-4 px-6 py-3 bg-stone-50 border-b border-stone-100 text-xs font-bold text-stone-500 uppercase tracking-wide">
              <span>體驗客</span>
              <span>教練</span>
              <span>日期</span>
              <span>聯絡資訊</span>
              <span>狀態 / 操作</span>
            </div>

            {trialsLoading ? (
              <div className="p-10 text-center text-stone-400 text-sm animate-pulse">載入中...</div>
            ) : trials.length > 0 ? (
              <div className="divide-y divide-stone-100">
                {trials.slice(0, 20).map((record) => {
                  const trainerName = trainers.find(t => t.id === record.trialTrainerId)?.name || '未指定教練'

                  const statusConfig = record.outcome === 'converted'
                    ? { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '已成交' }
                    : record.outcome === 'not_converted'
                      ? { dot: 'bg-stone-400', badge: 'bg-stone-100 text-stone-500 border-stone-200', label: '未成交' }
                      : { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: '待跟進' }

                  return (
                    <div key={record.id} className="grid grid-cols-[2fr_1fr_1fr_1.2fr_220px] gap-4 px-6 py-4 hover:bg-stone-50/60 transition-colors items-center">
                      {/* Client name + notes */}
                      <div>
                        <span className="font-bold text-stone-800 text-sm block">{record.clientName}</span>
                        {record.notes && <p className="text-xs text-stone-400 italic truncate mt-0.5 max-w-[180px]">{record.notes}</p>}
                      </div>

                      {/* Trainer badge */}
                      <span className="text-xs bg-stone-100 text-stone-600 font-semibold px-2.5 py-1 rounded-lg inline-block w-fit">{trainerName}</span>

                      {/* Date */}
                      <span className="text-sm text-stone-500 font-medium">{formatTrialDate(record.date)}</span>

                      {/* Contact */}
                      <div className="space-y-0.5">
                        {record.phone && (
                          <a href={`tel:${record.phone}`} className="flex items-center gap-1.5 text-xs text-brand-600 font-semibold hover:underline">
                            <Phone className="h-3 w-3 shrink-0" />{record.phone}
                          </a>
                        )}
                        {record.email && <p className="text-xs text-stone-400 truncate">{record.email}</p>}
                      </div>

                      {/* Status + Actions — redesigned */}
                      <div className="flex flex-col gap-2">
                        {/* Row 1: Status badge + Edit button */}
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${statusConfig.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                            {statusConfig.label}
                          </span>
                          <button
                            onClick={() => {
                              setEditingId(record.id)
                              setClientName(record.clientName)
                              setPhone(record.phone)
                              setEmail(record.email || '')
                              const d = record.date ? format(record.date.toDate(), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
                              setDate(d)
                              setTrialTrainerId(record.trialTrainerId)
                              setOutcome(record.outcome)
                              setNotes(record.notes || '')
                              setIsAdding(true)
                            }}
                            title="編輯資料"
                            className="flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-stone-700 hover:bg-stone-100 border border-transparent hover:border-stone-200 px-2 py-1 rounded-lg transition-all cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>編輯</span>
                          </button>
                        </div>

                        {/* Row 2: Quick-outcome buttons (only when pending) */}
                        {record.outcome === 'pending' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdateOutcome(record.id, 'converted')}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-300 px-2 py-1.5 rounded-lg transition-all cursor-pointer"
                            >
                              ✓ 已成交
                            </button>
                            <button
                              onClick={() => handleUpdateOutcome(record.id, 'not_converted')}
                              className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-stone-500 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 px-2 py-1.5 rounded-lg transition-all cursor-pointer"
                            >
                              ✕ 未成交
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-stone-400 text-sm">尚無體驗名單</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

