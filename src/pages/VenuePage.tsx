import { useState, useMemo } from 'react'
import { Home, DollarSign, Calendar, Clock, Check, X, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { VenueTable } from '../components/venue/VenueTable'
import { VenueFormModal } from '../components/venue/VenueFormModal'
import { useVenueRentals } from '../hooks/useVenueRentals'
import { useVenueBookings } from '../hooks/useVenueBookings'
import type { VenueRentalFormValues } from '../lib/validators'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'

export default function VenuePage() {
  const { rentals, loading: rentalsLoading, createRental, deleteRental } = useVenueRentals()
  const { bookings, loading: bookingsLoading, updateBookingStatus } = useVenueBookings()

  const [activeTab, setActiveTab] = useState<'rentals' | 'bookings'>('rentals')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

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

      {activeTab === 'rentals' ? (
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
      ) : (
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
