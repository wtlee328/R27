import { useState, useMemo, useEffect } from 'react'
import { Home, DollarSign, Calendar, Clock, Check, X, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { VenueTable } from '../components/venue/VenueTable'
import { VenueFormModal } from '../components/venue/VenueFormModal'
import { useVenueRentals } from '../hooks/useVenueRentals'
import { useVenueBookings } from '../hooks/useVenueBookings'
import type { VenueRentalFormValues } from '../lib/validators'
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
  subMonths
} from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { useCenterStore } from '@/stores/centerStore'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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

export default function VenuePage() {
  const { rentals, loading: rentalsLoading, createRental, deleteRental } = useVenueRentals()
  const { bookings, loading: bookingsLoading, updateBookingStatus } = useVenueBookings()

  const { centerId } = useCenterStore()
  const [activeTab, setActiveTab] = useState<'calendar' | 'bookings' | 'rentals'>('calendar')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

  // Calendar states
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

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

  // Approval/Rejection Modal states
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  
  // Form inputs for approval
  const [rentalAmount, setRentalAmount] = useState(500)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [approvalLoading, setApprovalLoading] = useState(false)

  // Form inputs for rejection
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [rejectionLoading, setRejectionLoading] = useState(false)

  const handleCreateRental = async (data: VenueRentalFormValues) => {
    await createRental(data)
  }

  // Open Approval Modal
  const openApprovalModal = (booking: any) => {
    setSelectedBookingId(booking.id)
    setSelectedBooking(booking)
    setRentalAmount(500)
    setApprovalNotes(booking.purpose || '')
    setApprovalModalOpen(true)
  }

  // Confirm Approval
  const handleConfirmApproval = async () => {
    if (!selectedBookingId || !selectedBooking) return
    setApprovalLoading(true)
    try {
      // 1. Create a venue rental record + cash flow record
      const rentalId = await createRental({
        date: selectedBooking.date?.toDate() || new Date(),
        amount: rentalAmount,
        notes: approvalNotes,
        renterName: selectedBooking.renterName || selectedBooking.trainerName || '',
        renterTrainerId: selectedBooking.trainerId || '',
        selectedRenterCustomerId: selectedBooking.renterCustomerId || '',
      })

      // 2. Update booking status to approved
      await updateBookingStatus(selectedBookingId, 'approved', approvalNotes, rentalId)
      setApprovalModalOpen(false)
    } catch (err) {
      console.error(err)
      alert('核准時段失敗，請重試')
    } finally {
      setApprovalLoading(false)
    }
  }

  // Open Rejection Modal
  const openRejectionModal = (bookingId: string) => {
    setSelectedBookingId(bookingId)
    setRejectionNotes('')
    setRejectModalOpen(true)
  }

  // Confirm Rejection
  const handleConfirmRejection = async () => {
    if (!selectedBookingId) return
    setRejectionLoading(true)
    try {
      await updateBookingStatus(selectedBookingId, 'rejected', rejectionNotes)
      setRejectModalOpen(false)
    } catch (err) {
      console.error(err)
      alert('駁回時段失敗，請重試')
    } finally {
      setRejectionLoading(false)
    }
  }

  // Generate month options
  const monthOptions = useMemo(() => {
    const monthsSet = new Set<string>()
    const currentMonthStr = format(new Date(), 'yyyy/MM')
    monthsSet.add(currentMonthStr)
    
    rentals.forEach(r => {
      if (r.date) {
        monthsSet.add(format(r.date.toDate(), 'yyyy/MM'))
      }
    })
    
    return Array.from(monthsSet).sort().reverse()
  }, [rentals])

  // Filter rentals by selected month
  const filteredRentals = useMemo(() => {
    if (selectedMonth === 'all') return rentals
    return rentals.filter((r) => {
      const d = r.date?.toDate()
      return d && format(d, 'yyyy/MM') === selectedMonth
    })
  }, [rentals, selectedMonth])

  // Filter pending bookings
  const pendingBookings = useMemo(() => {
    return bookings.filter(b => b.status === 'pending')
  }, [bookings])

  const totalIncomeSelectedMonth = filteredRentals.reduce(
    (sum, r) => sum + r.amount,
    0
  )

  const totalIncomeAllTime = rentals.reduce((sum, r) => sum + r.amount, 0)

  const operatingHours = useMemo(() => {
    const center = centerId || 'r27'
    const defaultHours = { startTime: '09:00', endTime: '05:00' }
    if (!config || !config[center]) return defaultHours

    // Selected date day of week (0 is Sunday, 1 is Monday, ..., 6 is Saturday)
    const [y, m, d] = selectedDate.split('-').map(Number)
    const dayOfWeek = new Date(y, m - 1, d).getDay()
    const dayStr = String(dayOfWeek)

    if (config[center][dayStr]) {
      return config[center][dayStr]
    }
    if (config[center].startTime) {
      return config[center]
    }
    return defaultHours
  }, [config, selectedDate, centerId])

  const timeSlots = useMemo(() => {
    return generateTimeSlots(operatingHours.startTime, operatingHours.endTime)
  }, [operatingHours])

  const selectedDateBookings = useMemo(() => {
    return bookings.filter(b => {
      if (!b.date) return false
      const bDateStr = format(b.date.toDate(), 'yyyy-MM-dd')
      return bDateStr === selectedDate
    })
  }, [bookings, selectedDate])

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">場租管理</h1>
          <p className="text-sm text-stone-500 mt-1">紀錄外部教練場租與審核申請</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>+ 新增場租</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title={selectedMonth === 'all' ? '累計場租總收入' : '當月場租收入'}
          value={`NT$ ${totalIncomeSelectedMonth.toLocaleString()}`}
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title={selectedMonth === 'all' ? '累計場租次數' : '當月場租次數'}
          value={`${filteredRentals.length} 次`}
          icon={Calendar}
        />
        <StatCard
          title="待審核申請"
          value={`${pendingBookings.length} 筆`}
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          subtitle="來自教練介面之場租申請"
        />
      </div>

      {/* Tabs Layout */}
      <div className="flex border-b border-stone-200 gap-6">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`pb-3 font-bold text-sm select-none border-b-2 cursor-pointer transition-colors ${
            activeTab === 'calendar'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          場租日曆
        </button>
        <button
          onClick={() => setActiveTab('rentals')}
          className={`pb-3 font-bold text-sm select-none border-b-2 cursor-pointer transition-colors ${
            activeTab === 'rentals'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          場租紀錄
        </button>
        <button
          onClick={() => setActiveTab('bookings')}
          className={`pb-3 font-bold text-sm select-none border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeTab === 'bookings'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <span>預約審核</span>
          {pendingBookings.length > 0 && (
            <span className="bg-brand-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {pendingBookings.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'calendar' && (
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
                const { hasApproved, hasPending } = getBookingIndicator(day)
                
                return (
                  <button
                    key={dayStr}
                    onClick={() => setSelectedDate(dayStr)}
                    className={`relative flex flex-col items-center justify-between p-2 h-16 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-brand-500 text-white font-bold shadow-sm shadow-brand-500/20'
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
                  const idx = timeSlots.indexOf(slot)
                  const nextSlot = idx !== -1 && idx + 1 < timeSlots.length ? timeSlots[idx + 1] : operatingHours.endTime
                  const slotRange = `${slot} - ${nextSlot}`

                  if (busyInfo && busyInfo.status !== 'rejected') {
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
                            <span className="text-xs font-bold text-stone-700 truncate">
                              {busyInfo.booking.trainerName}
                            </span>
                            {busyInfo.booking.renterName && (
                              <span className="text-[10px] text-stone-500 font-medium shrink-0">
                                ({busyInfo.booking.renterName})
                              </span>
                            )}
                          </div>
                          {busyInfo.booking.purpose && (
                            <p className="text-[10px] text-stone-400 truncate mt-0.5">{busyInfo.booking.purpose}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBg}`}>
                            {label}
                          </span>
                          
                          {/* Approve/Reject directly in slot if pending */}
                          {busyInfo.status === 'pending' && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openApprovalModal(busyInfo.booking)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white p-1 rounded-md transition-colors cursor-pointer"
                                title="直接核准"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => openRejectionModal(busyInfo.booking.id)}
                                className="bg-red-500 hover:bg-red-600 text-white p-1 rounded-md transition-colors cursor-pointer"
                                title="直接駁回"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
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
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-stone-150 bg-stone-50 text-stone-400">
                        空閒
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rentals' && (
        /* Rentals History Card */
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-100 pb-5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-stone-700 select-none">選擇月份</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-stone-200 text-stone-950 px-3 py-1.5 rounded-xl text-sm font-black shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="all">全部月份</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m.replace('/', ' 年 ')} 月
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rentalsLoading ? (
            <div className="loading-spinner"><span /></div>
          ) : (
            <VenueTable rentals={filteredRentals} onDelete={deleteRental} />
          )}
        </div>
      )}

      {activeTab === 'bookings' && (
        /* Pending Bookings List */
        <div className="space-y-4">
          {bookingsLoading ? (
            <div className="loading-spinner"><span /></div>
          ) : pendingBookings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingBookings.map((booking) => {
                const bookingDate = booking.date ? format(booking.date.toDate(), 'yyyy/MM/dd') : ''
                return (
                  <div
                    key={booking.id}
                    className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <span className="text-xs bg-brand-50 text-brand-600 font-bold px-2 py-0.5 rounded-md border border-brand-100">
                            {booking.trainerName}
                          </span>
                          {booking.renterName && (
                            <span className="text-xs text-stone-500 font-medium ml-2">
                              (租借人: {booking.renterName})
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-stone-400 font-semibold">{bookingDate}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-xs text-stone-600 font-bold">
                        <Clock className="h-3.5 w-3.5 text-stone-400" />
                        <span>時段: {booking.startTime} - {booking.endTime}</span>
                      </div>

                      {booking.purpose && (
                        <p className="text-xs text-stone-500 bg-stone-50 border border-stone-100 p-2.5 rounded-xl">
                          用途: {booking.purpose}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => openRejectionModal(booking.id)}
                        className="flex-1 bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
                      >
                        <X className="h-3.5 w-3.5" />
                        駁回申請
                      </button>
                      <button
                        onClick={() => openApprovalModal(booking)}
                        className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        確認核准
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16 bg-white border border-stone-200 rounded-2xl text-stone-400 text-xs shadow-sm">
              目前沒有待審核的預約申請
            </div>
          )}
        </div>
      )}

      {/* Main Add Manual Rental Modal */}
      <VenueFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateRental}
      />

      {/* Approve Booking Dialog */}
      <Dialog open={approvalModalOpen} onOpenChange={setApprovalModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>核准場租申請</DialogTitle>
            <DialogDescription>請確認此場租收費金額與入帳資訊。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-stone-700 font-bold text-xs">收費金額 (NT$) *</Label>
              <Input
                id="amount"
                type="number"
                value={rentalAmount}
                onChange={(e) => setRentalAmount(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appNotes" className="text-stone-700 font-bold text-xs">入帳備註</Label>
              <Textarea
                id="appNotes"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setApprovalModalOpen(false)} disabled={approvalLoading}>
              取消
            </Button>
            <Button onClick={handleConfirmApproval} disabled={approvalLoading}>
              {approvalLoading ? '核准中...' : '確認並記錄入帳'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Booking Dialog */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>駁回場租申請</DialogTitle>
            <DialogDescription>請填寫駁回原因，這將會顯示在教練的申請狀態中。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rejNotes" className="text-stone-700 font-bold text-xs">駁回原因 *</Label>
              <Textarea
                id="rejNotes"
                required
                placeholder="例如：該時段已被團體課程佔用，或已經額滿..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectModalOpen(false)} disabled={rejectionLoading}>
              取消
            </Button>
            <Button onClick={handleConfirmRejection} disabled={rejectionLoading} className="bg-red-600 hover:bg-red-700 text-white">
              {rejectionLoading ? '駁回中...' : '確認駁回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
