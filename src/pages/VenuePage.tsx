import { useState, useMemo } from 'react'
import { Home, DollarSign, Calendar } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { VenueTable } from '../components/venue/VenueTable'
import { VenueFormModal } from '../components/venue/VenueFormModal'
import { useVenueRentals } from '../hooks/useVenueRentals'
import type { VenueRentalFormValues } from '../lib/validators'
import { format } from 'date-fns'

export default function VenuePage() {
  const { rentals, loading, createRental, deleteRental } = useVenueRentals()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

  const handleCreateRental = async (data: VenueRentalFormValues) => {
    await createRental(data)
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
          <p className="text-sm text-stone-500 mt-1">紀錄外部教練場租與收入</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>+ 新增場租</Button>
      </div>

      {/* MONTH FILTER */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm w-fit select-none">
        <span className="text-sm font-bold text-stone-700">選擇月份</span>
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
          title="歷史累計總收入"
          value={`NT$ ${totalIncomeAllTime.toLocaleString()}`}
          icon={Home}
          subtitle="歷史累計所有收入"
        />
      </div>

      {loading ? (
        <div className="loading-spinner"><span /></div>
      ) : (
        <VenueTable rentals={filteredRentals} onDelete={deleteRental} />
      )}

      <VenueFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateRental}
      />
    </div>
  )
}
