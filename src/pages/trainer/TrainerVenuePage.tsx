import { useState, useMemo } from 'react'
import { DollarSign, Plus, Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/shared/StatCard'
import { VenueTable } from '@/components/venue/VenueTable'
import { VenueFormModal } from '@/components/venue/VenueFormModal'
import { useVenueRentals } from '@/hooks/useVenueRentals'
import { format } from 'date-fns'
import type { VenueRental } from '@/types'

export default function TrainerVenuePage() {
  const { rentals, loading, createRental, updateRental } = useVenueRentals()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRental, setSelectedRental] = useState<VenueRental | null>(null)
  
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })

  // Generate month options dynamically from rentals
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

  // Calculate statistics
  const totalExpenseSelectedMonth = useMemo(() => {
    return filteredRentals.reduce((sum, r) => sum + r.amount, 0)
  }, [filteredRentals])

  const totalExpenseAllTime = useMemo(() => {
    return rentals.reduce((sum, r) => sum + r.amount, 0)
  }, [rentals])

  const handleFormSubmit = async (data: any) => {
    if (selectedRental) {
      await updateRental(selectedRental.id, data)
    } else {
      await createRental(data)
    }
  }

  const handleRowClick = (rental: VenueRental) => {
    setSelectedRental(rental)
    setIsModalOpen(true)
  }

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-5xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-4">
        <div>
          <h1 className="text-4xl font-black text-stone-900 tracking-tight flex items-center gap-3">
            <span className="text-3xl">🏠</span>
            場租管理
          </h1>
          <p className="text-stone-500 font-medium mt-2">記錄與查看您的場租預約與收費明細</p>
        </div>
        <Button 
          onClick={() => {
            setSelectedRental(null)
            setIsModalOpen(true)
          }} 
          className="rounded-full px-8 bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-100 font-bold cursor-pointer h-10 inline-flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" /> 填寫預約場租
        </Button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard 
          title={`${selectedMonth === 'all' ? '歷年' : selectedMonth} 我的場租總費用`} 
          value={`NT$ ${totalExpenseSelectedMonth.toLocaleString()}`} 
          icon={DollarSign}
          iconColor="text-brand-500"
          iconBg="bg-brand-50"
        />
        <StatCard 
          title="歷年累計場租費用" 
          value={`NT$ ${totalExpenseAllTime.toLocaleString()}`} 
          icon={Database}
          iconColor="text-stone-600"
          iconBg="bg-stone-50"
        />
      </div>

      {/* Main List Section */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <h2 className="text-lg font-bold text-stone-900">場租預約明細</h2>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 font-bold shrink-0">選擇月份</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-white font-medium text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-stone-400 transition-colors cursor-pointer outline-none shadow-sm h-9"
            >
              <option value="all">全部月份</option>
              {monthOptions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="loading-spinner"><span /></div>
          </div>
        ) : (
          <VenueTable 
            rentals={filteredRentals}
            onRowClick={handleRowClick}
            // Do not pass onDelete so trainers cannot delete rentals
          />
        )}
      </div>

      {/* Add / Edit Rental Modal */}
      <VenueFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleFormSubmit}
        initialData={selectedRental}
      />
    </div>
  )
}
