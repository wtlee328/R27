import { useState, useMemo, useEffect } from 'react'
import { 
  format, 
  startOfDay, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isBefore, 
  addMonths, 
  subMonths,
  parseISO
} from 'date-fns'
import { Calendar as CalendarIcon, Clock, AlertCircle, Plus, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

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

  // Fallback to 20 if logic fails or returns 0
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

export default function TrainerVenuePage() {
  const { bookings, loading: bookingsLoading, createBooking, deleteBooking } = useVenueBookings()
  const { trainers, loading: trainersLoading } = useTrainers()
  const { user } = useAuthStore()

  // Calendar states
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
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
    const [y, m, d] = selectedDate.split('-').map(Number)
    const dayOfWeek = new Date(y, m - 1, d).getDay()
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

  // Foolproof helper: Check if a slot is in the past
  const isSlotInPast = (dateStr: string, slotStr: string) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (dateStr < todayStr) return true
    if (dateStr > todayStr) return false
    
    // For today, parse slot time and current time
    const currentHour = new Date().getHours()
    const currentMinute = new Date().getMinutes()
    const [slotHour, slotMin] = slotStr.split(':').map(Number)
    
    // Operational hours midnight overflow helper (e.g. 00:00 - 05:00 is next day calendar-wise)
    const [y, m, d] = dateStr.split('-').map(Number)
    const slotDate = new Date(y, m - 1, d)
    if (slotHour < 9) {
      slotDate.setDate(slotDate.getDate() + 1)
    }
    slotDate.setHours(slotHour, slotMin, 0, 0)
    
    return slotDate < new Date()
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTrainerId || !startSlot || !endSlot) {
      setSubmitError('請填寫所有必填欄位')
      return
    }

    // Past date check
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (selectedDate < todayStr) {
      setSubmitError('不允許預約過去的日期')
      return
    }

    // Past time check
    if (isSlotInPast(selectedDate, startSlot)) {
      setSubmitError('不允許預約過去的時間時段')
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

    setSubmitting(true)
    setSubmitError(null)

    try {
      const trainerName = trainers.find(t => t.id === selectedTrainerId)?.name || '未命名教練'
      await createBooking({
        trainerId: selectedTrainerId,
        trainerName,
        date: (() => {
          const [y, m, d] = selectedDate.split('-').map(Number)
          return new Date(y, m - 1, d)
        })(),
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

  // Monthly Calendar Calculations
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = endOfWeek(monthEnd)
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const handleToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    setSelectedDate(format(today, 'yyyy-MM-dd'))
  }

  const getBookingIndicator = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    const dayBookings = bookings.filter(b => {
      if (!b.date) return false
      return format(b.date.toDate(), 'yyyy-MM-dd') === dayStr
    })
    const hasApproved = dayBookings.some(b => b.status === 'approved')
    const hasPending = dayBookings.some(b => b.status === 'pending')
    return { hasApproved, hasPending }
  }

  return (
    <div className="space-y-6">
      {/* ---- Header Section ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900">場租申請</h1>
          <p className="text-stone-500 text-sm mt-1">月曆預約空閒場地</p>
        </div>
        <Button
          onClick={() => {
            const todayStr = format(new Date(), 'yyyy-MM-dd')
            setSelectedDate(todayStr)
            setStartSlot(timeSlots[0] || '09:00')
            setEndSlot(timeSlots[1] || '10:00')
            setIsBooking(true)
          }}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-5 h-10 cursor-pointer font-bold"
        >
          <Plus className="h-4 w-4" />
          填寫預約單
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ---- Left: Monthly Calendar ---- */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h2 className="text-sm font-bold text-stone-800">
              {format(currentMonth, 'yyyy年 MM月')}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleToday}
                className="h-7 text-[11px] px-2.5 rounded-lg border-stone-200 text-stone-600 cursor-pointer font-bold"
              >
                今天
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevMonth}
                className="h-7 w-7 rounded-lg border-stone-200 text-stone-600 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNextMonth}
                className="h-7 w-7 rounded-lg border-stone-200 text-stone-600 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mt-4">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-stone-400 py-1 uppercase">
                {d}
              </div>
            ))}
            {calendarDays.map((day) => {
              const dayStr = format(day, 'yyyy-MM-dd')
              const isSelected = selectedDate === dayStr
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isPast = isBefore(day, startOfDay(new Date()))
              const { hasApproved, hasPending } = getBookingIndicator(day)
              
              return (
                <button
                  key={dayStr}
                  onClick={() => {
                    if (!isPast) {
                      setSelectedDate(dayStr)
                    }
                  }}
                  disabled={isPast}
                  className={`relative flex flex-col items-center justify-between p-2 h-16 rounded-xl transition-all ${
                    isSelected
                      ? 'bg-brand-500 text-white font-bold shadow-sm shadow-brand-500/20'
                      : isPast
                        ? 'bg-stone-50/50 text-stone-200 cursor-not-allowed opacity-40'
                        : isCurrentMonth
                          ? 'hover:bg-stone-50 text-stone-700'
                          : 'hover:bg-stone-50/50 text-stone-350'
                  }`}
                >
                  <span className="text-xs font-black">{format(day, 'd')}</span>
                  
                  {/* Indicators */}
                  <div className="flex gap-1 justify-center mt-1">
                    {hasApproved && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />
                    )}
                    {hasPending && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-500 animate-pulse'}`} />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ---- Right: Hourly Slots Table ---- */}
        <div className="lg:col-span-5 bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="border-b border-stone-100 p-4 bg-stone-50 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-stone-700">預約狀況表</span>
            <span className="text-[10px] text-stone-400 font-semibold">{selectedDate}</span>
          </div>

          <div className="divide-y divide-stone-100 overflow-y-auto max-h-[560px]">
            {bookingsLoading ? (
              <div className="p-8 text-center text-xs text-stone-400 animate-pulse">載入時段中...</div>
            ) : (
              timeSlots.map((slot) => {
                const busyInfo = busySlotsMap.get(slot)
                const isPast = isSlotInPast(selectedDate, slot)
                const idx = timeSlots.indexOf(slot)
                const nextSlot = idx !== -1 && idx + 1 < timeSlots.length ? timeSlots[idx + 1] : operatingHours.endTime
                const slotRange = `${slot} - ${nextSlot}`
                
                if (isPast) {
                  return (
                    <div key={slot} className="flex items-center p-3.5 gap-4 bg-stone-50/30 text-stone-300">
                      <div className="w-28 text-[11px] font-black flex items-center gap-1.5 shrink-0 select-none">
                        <Clock className="h-3 w-3 text-stone-200" />
                        {slotRange}
                      </div>
                      <div className="flex-1 text-xs font-medium text-stone-350">時段已過期</div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-stone-150 bg-stone-100 text-stone-400">
                        已過期
                      </span>
                    </div>
                  )
                }

                if (busyInfo && busyInfo.status !== 'rejected') {
                  const isOwnBooking = busyInfo.booking.trainerId === user?.uid || user?.role === 'admin'
                  const statusBg = 
                    busyInfo.status === 'approved'
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  
                  const label = 
                    busyInfo.status === 'approved' ? '已核准' : '審核中'

                  return (
                    <div key={slot} className="flex items-center p-3.5 gap-4 bg-stone-50/50">
                      <div className="w-28 text-[11px] font-black text-stone-500 flex items-center gap-1.5 shrink-0 select-none">
                        <Clock className="h-3 w-3 text-stone-400" />
                        {slotRange}
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
                    <div className="w-28 text-[11px] font-black text-stone-400 flex items-center gap-1.5 shrink-0 select-none">
                      <Clock className="h-3 w-3 text-stone-300" />
                      {slotRange}
                    </div>
                    <div className="flex-1 text-xs text-stone-400">空閒時段</div>
                    <button
                      onClick={() => {
                        setStartSlot(slot)
                        const idx = timeSlots.indexOf(slot)
                        if (idx !== -1 && idx + 1 < timeSlots.length) {
                          setEndSlot(timeSlots[idx + 1])
                        } else {
                          setEndSlot(operatingHours.endTime)
                        }
                        setIsBooking(true)
                      }}
                      className="text-[10px] font-bold text-brand-500 hover:text-brand-600 bg-brand-50 hover:bg-brand-100/50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      預約
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ---- Booking Request Dialog ---- */}
      <Dialog open={isBooking} onOpenChange={setIsBooking}>
        <DialogContent className="max-w-md p-5 bg-white rounded-2xl border-none shadow-2xl">
          <DialogTitle className="text-base font-bold text-stone-800 border-b border-stone-100 pb-3 mb-2 flex items-center justify-between pr-6">
            <span>填寫場租預約</span>
            <span className="text-xs text-stone-400 font-bold">{selectedDate}</span>
          </DialogTitle>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Date Picker */}
            <div className="space-y-1.5">
              <Label htmlFor="dateInput" className="text-stone-700 font-bold text-xs">預約日期 *</Label>
              <Input
                type="date"
                id="dateInput"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
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
                    const isPast = isSlotInPast(selectedDate, slot)
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
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                className="flex-1 h-10 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                disabled={submitting || !selectedTrainerId || !startSlot || !endSlot}
              >
                {submitting ? '送出中...' : '送出申請'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
