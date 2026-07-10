import { useState, useMemo, useEffect } from 'react'
import { format, addDays, startOfDay } from 'date-fns'
import { Calendar, Clock, AlertCircle, Plus, Check, Info, FileText, X } from 'lucide-react'
import { useVenueBookings } from '@/hooks/useVenueBookings'
import { useTrainers } from '@/hooks/useTrainers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/stores/authStore'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { VenueBooking, BookingStatus } from '@/types'

// Generate 20-hour slots starting from startHour
function generateTimeSlots(startHourStr: string, endHourStr: string) {
  const start = parseInt(startHourStr.split(':')[0]) || 9
  const slots: string[] = []
  
  for (let i = 0; i < 20; i++) {
    const hr = (start + i) % 24
    const hrStr = String(hr).padStart(2, '0') + ':00'
    slots.push(hrStr)
  }
  return slots
}

export default function TrainerVenuePage() {
  const { bookings, loading: bookingsLoading, createBooking, deleteBooking } = useVenueBookings()
  const { trainers, loading: trainersLoading } = useTrainers()
  const { user } = useAuthStore()

  // Selected date defaults to today
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [isBooking, setIsBooking] = useState(false)

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
    loadConfig()
  }, [])

  const operatingHours = useMemo(() => {
    const center = user?.centerId || 'r27'
    const defaultHours = { startTime: '09:00', endTime: '05:00' }
    if (!config || !config[center]) return defaultHours

    // Selected date day of week (0 is Sunday, 1 is Monday, ..., 6 is Saturday)
    const dayOfWeek = new Date(selectedDate).getDay()
    const dayStr = String(dayOfWeek)

    if (config[center][dayStr]) {
      return config[center][dayStr]
    }
    // Backward compatibility for old flat format
    if (config[center].startTime) {
      return config[center]
    }
    return defaultHours
  }, [config, selectedDate, user])

  const timeSlots = useMemo(() => {
    return generateTimeSlots(operatingHours.startTime, operatingHours.endTime)
  }, [operatingHours])

  // Form states
  const [selectedTrainerId, setSelectedTrainerId] = useState('')
  const [startSlot, setStartSlot] = useState('')
  const [endSlot, setEndSlot] = useState('')
  const [purpose, setPurpose] = useState('')
  const [renterName, setRenterName] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleCancel = () => {
    setIsBooking(false)
    setSelectedTrainerId('')
    setStartSlot('')
    setEndSlot('')
    setPurpose('')
    setRenterName('')
    setSubmitError(null)
  }

  // Filter bookings for the selected date
  const selectedDateBookings = useMemo(() => {
    return bookings.filter(b => {
      if (!b.date) return false
      const bDateStr = format(b.date.toDate(), 'yyyy-MM-dd')
      return bDateStr === selectedDate
    })
  }, [bookings, selectedDate])

  // Build a map of busy slots for rendering
  const busySlotsMap = useMemo(() => {
    const map = new Map<string, { booking: VenueBooking; status: BookingStatus }>()
    
    selectedDateBookings.forEach(b => {
      // Find start and end indices in the slots array
      const startIndex = timeSlots.indexOf(b.startTime)
      const endIndex = timeSlots.indexOf(b.endTime)
      
      if (startIndex !== -1 && endIndex !== -1) {
        for (let i = startIndex; i < endIndex; i++) {
          map.set(timeSlots[i], { booking: b, status: b.status })
        }
      } else if (startIndex !== -1 && b.endTime === '05:00') {
        // Handle overflow cases to 5 AM
        const count = timeSlots.length
        for (let i = startIndex; i < count; i++) {
          map.set(timeSlots[i], { booking: b, status: b.status })
        }
      }
    })
    return map
  }, [selectedDateBookings, timeSlots])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTrainerId || !startSlot || !endSlot) {
      setSubmitError('請填寫所有必填欄位')
      return
    }

    const startIndex = timeSlots.indexOf(startSlot)
    const endIndex = timeSlots.indexOf(endSlot)
    if (startIndex >= endIndex && endSlot !== '05:00') {
      setSubmitError('結束時間必須晚於開始時間')
      return
    }

    // Check conflict
    let hasConflict = false
    const checkEndIndex = endSlot === '05:00' ? timeSlots.length : endIndex
    for (let i = startIndex; i < checkEndIndex; i++) {
      if (busySlotsMap.has(timeSlots[i])) {
        hasConflict = true
        break
      }
    }

    if (hasConflict) {
      setSubmitError('所選時段已被預約，請選擇其他時段')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const trainerName = trainers.find(t => t.id === selectedTrainerId)?.name || '未命名教練'
      await createBooking({
        trainerId: selectedTrainerId,
        trainerName,
        date: new Date(selectedDate),
        startTime: startSlot,
        endTime: endSlot,
        purpose,
        renterName,
      })
      handleCancel()
    } catch (err: any) {
      console.error(err)
      setSubmitError(err.message || '預約場租失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // Quick select week dates for header
  const weekDates = useMemo(() => {
    const dates = []
    const today = startOfDay(new Date())
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i)
      dates.push({
        dateStr: format(d, 'yyyy-MM-dd'),
        dayLabel: format(d, 'E').replace('Mon', '一').replace('Tue', '二').replace('Wed', '三').replace('Thu', '四').replace('Fri', '五').replace('Sat', '六').replace('Sun', '日'),
        numLabel: format(d, 'd'),
      })
    }
    return dates
  }, [])

  return (
    <div className="space-y-6">
      {/* ---- Header Section ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">場租申請</h1>
          <p className="text-stone-500 text-xs mt-1">預約本場館之空閒場地</p>
        </div>
        {!isBooking && (
          <Button
            onClick={() => setIsBooking(true)}
            className="flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-4 h-10 cursor-pointer font-bold"
          >
            <Plus className="h-4 w-4" />
            場租申請
          </Button>
        )}
      </div>

      {isBooking ? (
        /* ---- Request Booking Form ---- */
        <form onSubmit={handleSubmit} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 mb-2">
            <button
              type="button"
              onClick={handleCancel}
              className="text-stone-500 hover:text-stone-700 text-xs font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              ← 返回
            </button>
            <span className="text-xs text-stone-400 font-medium">填寫場租預約</span>
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
                className="w-full bg-white border border-stone-200 text-stone-900 px-3.5 py-2.5 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 cursor-pointer font-medium"
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

          <div className="space-y-1.5">
            <Label htmlFor="bookingDate" className="text-stone-700 font-bold text-xs">場租日期 *</Label>
            <Input
              id="bookingDate"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              className="h-11 bg-white border-stone-200 rounded-xl"
            />
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
                className="w-full bg-white border border-stone-200 text-stone-900 px-3 py-2.5 rounded-xl text-sm cursor-pointer"
              >
                <option value="">選擇時間</option>
                {timeSlots.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime" className="text-stone-700 font-bold text-xs">結束時間 *</Label>
              <select
                id="endTime"
                value={endSlot}
                onChange={(e) => setEndSlot(e.target.value)}
                required
                className="w-full bg-white border border-stone-200 text-stone-900 px-3 py-2.5 rounded-xl text-sm cursor-pointer"
              >
                <option value="">選擇時間</option>
                {timeSlots.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
                <option value="05:00">05:00 (隔天)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renterName" className="text-stone-700 font-bold text-xs">外部租借人名稱 / 租借單位 (選填)</Label>
            <Input
              id="renterName"
              placeholder="例如: 外部教練陳先生、或自主練習學員"
              value={renterName}
              onChange={(e) => setRenterName(e.target.value)}
              className="h-11 bg-white border-stone-200 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purpose" className="text-stone-700 font-bold text-xs">預約用途</Label>
            <Textarea
              id="purpose"
              placeholder="例如: 一對一私人課、或自主訓練"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
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
              disabled={submitting || !selectedTrainerId || !startSlot || !endSlot}
            >
              {submitting ? '送出中...' : '送出申請'}
            </Button>
          </div>
        </form>
      ) : (
        /* ---- Calendar Slot Picker & List Mode ---- */
        <div className="space-y-5">
          {/* Week Selector Grid */}
          <div className="grid grid-cols-7 gap-1 bg-white border border-stone-200 rounded-2xl p-2 shadow-sm">
            {weekDates.map((item) => {
              const isSelected = selectedDate === item.dateStr
              return (
                <button
                  key={item.dateStr}
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`flex flex-col items-center py-2.5 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-brand-500 text-white font-bold shadow-sm shadow-brand-500/20'
                      : 'hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <span className="text-[10px] opacity-75 font-medium">{item.dayLabel}</span>
                  <span className="text-sm font-black mt-1">{item.numLabel}</span>
                </button>
              )
            })}
          </div>

          {/* Hourly Slots Table */}
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="border-b border-stone-100 p-4 bg-stone-50 flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700">場地預約狀況表</span>
              <span className="text-[10px] text-stone-400 font-semibold uppercase">{selectedDate}</span>
            </div>

            <div className="divide-y divide-stone-100 max-h-[450px] overflow-y-auto">
              {bookingsLoading ? (
                <div className="p-8 text-center text-xs text-stone-400 animate-pulse">載入時段中...</div>
              ) : (
                timeSlots.map((slot) => {
                  const busyInfo = busySlotsMap.get(slot)
                  
                  if (busyInfo) {
                    const isOwnBooking = busyInfo.booking.trainerId === user?.uid || user?.role === 'admin'
                    const statusBg = 
                      busyInfo.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                        : busyInfo.status === 'rejected'
                          ? 'bg-red-500/10 text-red-700 border-red-500/20'
                          : 'bg-amber-500/10 text-amber-700 border-amber-500/20 animate-pulse'
                    
                    const label = 
                      busyInfo.status === 'approved' ? '已核准' : busyInfo.status === 'rejected' ? '已駁回' : '審核中'

                    return (
                      <div key={slot} className="flex items-center p-3.5 gap-4 bg-stone-50/50">
                        <div className="w-12 text-xs font-black text-stone-500 flex items-center gap-1">
                          <Clock className="h-3 w-3 text-stone-400" />
                          {slot}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-700">
                              {busyInfo.booking.trainerName}
                            </span>
                            {busyInfo.booking.renterName && (
                              <span className="text-[10px] text-stone-500 font-medium">
                                ({busyInfo.booking.renterName})
                              </span>
                            )}
                          </div>
                          {busyInfo.booking.purpose && (
                            <p className="text-[10px] text-stone-400 truncate mt-0.5">{busyInfo.booking.purpose}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBg}`}>
                            {label}
                          </span>
                          {busyInfo.booking.status === 'pending' && isOwnBooking && (
                            <button
                              onClick={() => {
                                if (window.confirm('確定要取消此申請嗎？')) {
                                  deleteBooking(busyInfo.booking.id)
                                }
                              }}
                              className="text-stone-400 hover:text-red-500 p-1 cursor-pointer transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={slot} className="flex items-center justify-between p-3.5 gap-4">
                      <div className="w-12 text-xs font-black text-stone-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-stone-300" />
                        {slot}
                      </div>
                      <div className="flex-1 text-xs text-stone-400">空閒時段</div>
                      <button
                        onClick={() => {
                          setStartSlot(slot)
                          // Auto set end slot to start + 1hr
                          const idx = timeSlots.indexOf(slot)
                          if (idx !== -1 && idx + 1 < timeSlots.length) {
                            setEndSlot(timeSlots[idx + 1])
                          } else {
                            setEndSlot('05:00')
                          }
                          setIsBooking(true)
                        }}
                        className="text-[10px] font-bold text-brand-500 hover:text-brand-600 bg-brand-50 hover:bg-brand-100/50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        預約此時段
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
