import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { AlertCircle } from 'lucide-react'
import { useTrainers } from '../../hooks/useTrainers'
import { useCenterStore } from '../../stores/centerStore'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { format } from 'date-fns'

interface VenueFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    trainerId: string
    trainerName: string
    date: Date
    startTime: string
    endTime: string
    renterName: string
    purpose: string
    amount: number
  }) => Promise<void>
  bookings: any[]
  initialDate?: string // e.g. "2026-07-13" from calendar selectedDate
}

// Generate hourly slots between startTime and endTime
function generateTimeSlots(startHourStr: string, endHourStr: string) {
  const start = parseInt(startHourStr.split(':')[0]) || 9
  const end = parseInt(endHourStr.split(':')[0]) || 5
  
  let totalHours = 0
  if (end < start) {
    totalHours = (end + 24) - start
  } else {
    totalHours = end - start
  }

  if (totalHours <= 0) {
    totalHours = 20
  }

  const slots: string[] = []
  for (let i = 0; i < totalHours; i++) {
    const hr = (start + i) % 24
    const hrStr = String(hr).padStart(2, '0') + ':00'
    slots.push(hrStr)
  }
  return slots
}

export function VenueFormModal({ open, onOpenChange, onSubmit, bookings, initialDate }: VenueFormModalProps) {
  const [loading, setLoading] = useState(false)
  const { trainers, loading: trainersLoading } = useTrainers()
  const { centerId } = useCenterStore()

  // Form states
  const [date, setDate] = useState(() => initialDate || format(new Date(), 'yyyy-MM-dd'))
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [startSlot, setStartSlot] = useState('')
  const [endSlot, setEndSlot] = useState('')
  const [renterName, setRenterName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [amount, setAmount] = useState(500) // Default amount
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Operating Hours Config
  const [config, setConfig] = useState<any>(null)

  useEffect(() => {
    async function loadConfig() {
      try {
        const docRef = doc(db, 'systemConfig', 'operatingHours')
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          setConfig(snap.data())
        }
      } catch (e) {
        console.error('Failed to load operating hours config', e)
      }
    }
    if (open) {
      loadConfig()
    }
  }, [open])

  // Sync date when initialDate changes or modal opens
  useEffect(() => {
    if (open) {
      setDate(initialDate || format(new Date(), 'yyyy-MM-dd'))
      setSelectedTrainerId('')
      setStartSlot('')
      setEndSlot('')
      setRenterName('')
      setPurpose('')
      setAmount(500)
      setSubmitError(null)
    }
  }, [open, initialDate])

  const operatingHours = useMemo(() => {
    const center = centerId || 'r27'
    const defaultHours = { startTime: '09:00', endTime: '05:00' }
    if (!config || !config[center]) return defaultHours

    // Selected date day of week (0 is Sunday, 1 is Monday, ..., 6 is Saturday)
    const [y, m, d] = date.split('-').map(Number)
    const dayOfWeek = new Date(y, m - 1, d).getDay()
    const dayStr = String(dayOfWeek)

    if (config[center][dayStr]) {
      return config[center][dayStr]
    }
    if (config[center].startTime) {
      return config[center]
    }
    return defaultHours
  }, [config, date, centerId])

  const timeSlots = useMemo(() => {
    return generateTimeSlots(operatingHours.startTime, operatingHours.endTime)
  }, [operatingHours])

  const endTimes = useMemo(() => {
    if (timeSlots.length === 0) return []
    const list = timeSlots.map(slot => {
      const [hrStr, minStr] = slot.split(':')
      const hr = (parseInt(hrStr) + 1) % 24
      return String(hr).padStart(2, '0') + ':' + minStr
    })
    if (list.length > 0) {
      list[list.length - 1] = operatingHours.endTime
    }
    return list
  }, [timeSlots, operatingHours])

  // Filter bookings for the selected date
  const selectedDateBookings = useMemo(() => {
    return bookings.filter(b => {
      if (!b.date) return false
      const bDateStr = format(b.date.toDate(), 'yyyy-MM-dd')
      return bDateStr === date
    })
  }, [bookings, date])

  // Build a map of busy slots for rendering
  const busySlotsMap = useMemo(() => {
    const map = new Map<string, { booking: any; status: string }>()
    selectedDateBookings.forEach(b => {
      const startIndex = timeSlots.indexOf(b.startTime)
      const endIndex = timeSlots.indexOf(b.endTime)
      
      if (startIndex !== -1 && endIndex !== -1) {
        for (let i = startIndex; i < endIndex; i++) {
          map.set(timeSlots[i], { booking: b, status: b.status })
        }
      } else if (startIndex !== -1 && b.endTime === operatingHours.endTime) {
        const count = timeSlots.length
        for (let i = startIndex; i < count; i++) {
          map.set(timeSlots[i], { booking: b, status: b.status })
        }
      }
    })
    return map
  }, [selectedDateBookings, timeSlots, operatingHours])

  const isSlotInPast = (dateStr: string, slotStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (dateStr < todayStr) return true
    if (dateStr > todayStr) return false
    
    const currentHour = new Date().getHours()
    const currentMinute = new Date().getMinutes()
    const [slotHour, slotMin] = slotStr.split(':').map(Number)
    
    const [y, m, d] = dateStr.split('-').map(Number)
    const slotDate = new Date(y, m - 1, d)
    if (slotHour < 9) {
      slotDate.setDate(slotDate.getDate() + 1)
    }
    slotDate.setHours(slotHour, slotMin, 0, 0)
    
    return slotDate < new Date()
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTrainerId || !startSlot || !endSlot) {
      setSubmitError('請填寫所有必填欄位')
      return
    }

    const startIndex = timeSlots.indexOf(startSlot)
    const endIndex = timeSlots.indexOf(endSlot)
    if (startIndex >= endIndex && endIndex !== -1) {
      setSubmitError('結束時間必須晚於開始時間')
      return
    }

    // Check conflict
    let hasConflict = false
    const checkEndIndex = endIndex === -1 ? timeSlots.length : endIndex
    for (let i = startIndex; i < checkEndIndex; i++) {
      const busy = busySlotsMap.get(timeSlots[i])
      if (busy && busy.status !== 'rejected') {
        hasConflict = true
        break
      }
    }

    if (hasConflict) {
      setSubmitError('所選時段已被預約，請選擇其他時段')
      return
    }

    setLoading(true)
    setSubmitError(null)

    try {
      const trainerName = trainers.find(t => t.id === selectedTrainerId)?.name || '未命名教練'
      const parsedDate = (() => {
        const [y, m, d] = date.split('-').map(Number)
        return new Date(y, m - 1, d)
      })()

      await onSubmit({
        trainerId: selectedTrainerId,
        trainerName,
        date: parsedDate,
        startTime: startSlot,
        endTime: endSlot,
        renterName,
        purpose,
        amount
      })
      onOpenChange(false)
    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || '新增場租失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 bg-white rounded-2xl border-none shadow-2xl">
        <DialogTitle className="text-base font-bold text-stone-800 border-b border-stone-100 pb-3 mb-2 flex items-center justify-between pr-6">
          <span>填寫場租預約</span>
          <span className="text-xs text-stone-400 font-bold">{date}</span>
        </DialogTitle>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date Picker */}
          <div className="space-y-1.5">
            <Label htmlFor="dateInput" className="text-stone-700 font-bold text-xs">預約日期 *</Label>
            <Input
              type="date"
              id="dateInput"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
            />
          </div>

          {/* Select Trainer */}
          <div className="space-y-1.5">
            <Label htmlFor="trainer" className="text-stone-700 font-bold text-xs">申請教練 *</Label>
            {trainersLoading ? (
              <div className="text-xs text-stone-400">載入教練名單中...</div>
            ) : (
              <select
                id="trainer"
                value={selectedTrainerId}
                onChange={(e) => setSelectedTrainerId(e.target.value)}
                required
                className="w-full bg-white border border-stone-200 text-stone-900 px-3 py-2 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer font-medium"
              >
                <option value="">-- 請選擇您的名稱 --</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Time Slot Select */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startTime" className="text-stone-700 font-bold text-xs">開始時間 *</Label>
              <select
                id="startTime"
                value={startSlot}
                onChange={(e) => setStartSlot(e.target.value)}
                required
                className="w-full bg-white border border-stone-200 text-stone-900 px-3 py-2 rounded-xl text-sm cursor-pointer"
              >
                <option value="">選擇時間</option>
                {timeSlots.map(slot => {
                  const isPast = isSlotInPast(date, slot)
                  const isBusy = busySlotsMap.has(slot) && busySlotsMap.get(slot)?.status !== 'rejected'
                  return (
                    <option 
                      key={slot} 
                      value={slot}
                      disabled={isPast || isBusy}
                    >
                      {slot} {isPast ? '(已過期)' : isBusy ? '(已預約)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime" className="text-stone-700 font-bold text-xs">結束時間 *</Label>
              <select
                id="endTime"
                value={endSlot}
                onChange={(e) => setEndSlot(e.target.value)}
                required
                className="w-full bg-white border border-stone-200 text-stone-900 px-3 py-2 rounded-xl text-sm cursor-pointer"
              >
                <option value="">選擇時間</option>
                {endTimes.map(slot => {
                  const slotHour = parseInt(slot.split(':')[0])
                  const startHour = parseInt(operatingHours.startTime.split(':')[0]) || 9
                  const isNextDay = slotHour < startHour
                  return (
                    <option key={slot} value={slot}>
                      {slot} {isNextDay ? '(隔天)' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {/* Amount Field (Specific to Admin) */}
          <div className="space-y-1.5">
            <Label htmlFor="amount" className="text-stone-700 font-bold text-xs">場租收費金額 (NT$) *</Label>
            <Input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
              required
              min={0}
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renterName" className="text-stone-700 font-bold text-xs">外部租借人名稱 / 租借單位 (選填)</Label>
            <Input
              id="renterName"
              placeholder="例如: 外部教練陳先生、自主練習學員"
              value={renterName}
              onChange={(e) => setRenterName(e.target.value)}
              className="h-10 bg-white border-stone-200 rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purpose" className="text-stone-700 font-bold text-xs">預約用途</Label>
            <Textarea
              id="purpose"
              placeholder="例如: 一對一私人課、自主訓練"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="bg-white border-stone-200 rounded-xl min-h-[70px] text-sm"
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
              className="flex-1 h-10 border-stone-200 rounded-xl text-stone-600 text-xs font-bold cursor-pointer"
              disabled={loading}
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 h-10 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer"
              disabled={loading || !selectedTrainerId || !startSlot || !endSlot}
            >
              {loading ? '送出中...' : '確認新增'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
