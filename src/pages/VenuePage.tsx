import { useState } from 'react'
import { Home, DollarSign, Calendar } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { VenueTable } from '../components/venue/VenueTable'
import { VenueFormModal } from '../components/venue/VenueFormModal'
import { useVenueRentals } from '../hooks/useVenueRentals'
import type { VenueRentalFormValues } from '../lib/validators'

export default function VenuePage() {
  const { rentals, loading, createRental, deleteRental } = useVenueRentals()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCreateRental = async (data: VenueRentalFormValues) => {
    await createRental(data)
  }

  // Calculate stats for current month
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const currentMonthRentals = rentals.filter((r) => {
    const d = r.date?.toDate()
    return d && d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const totalIncomeThisMonth = currentMonthRentals.reduce(
    (sum, r) => sum + r.amount,
    0
  )

  const totalIncomeAllTime = rentals.reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">場租管理</h1>
          <p className="text-sm text-stone-500 mt-1">紀錄外部教練場租與收入</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>+ 新增場租</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="本月場租收入"
          value={`NT$ ${totalIncomeThisMonth.toLocaleString()}`}
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          title="本月場租次數"
          value={`${currentMonthRentals.length} 次`}
          icon={Calendar}
        />
        <StatCard
          title="累計場租總收入"
          value={`NT$ ${totalIncomeAllTime.toLocaleString()}`}
          icon={Home}
          subtitle="歷史累計所有收入"
        />
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <VenueTable rentals={rentals} onDelete={deleteRental} />
      )}

      <VenueFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateRental}
      />
    </div>
  )
}
