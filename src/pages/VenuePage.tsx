import { useState, useMemo } from 'react'
import { DollarSign, PlusCircle, Database } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { VenueTable } from '../components/venue/VenueTable'
import { VenueFormModal } from '../components/venue/VenueFormModal'
import { useVenueRentals } from '../hooks/useVenueRentals'
import { format } from 'date-fns'

export default function VenuePage() {
  const { rentals, loading, createRental, deleteRental } = useVenueRentals()
  const [isModalOpen, setIsModalOpen] = useState(false)
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
  const totalIncomeSelectedMonth = useMemo(() => {
    return filteredRentals.reduce((sum, r) => sum + r.amount, 0)
  }, [filteredRentals])

  const totalIncomeAllTime = useMemo(() => {
    return rentals.reduce((sum, r) => sum + r.amount, 0)
  }, [rentals])

  const handleCreateRental = async (data: any) => {
    await createRental(data)
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
          <p className="text-stone-500 font-medium mt-2">記錄與統計場租收入明細，系統會自動同步至金流對帳表</p>
        </div>
        <Button 
          onClick={() => setIsModalOpen(true)} 
          className="rounded-full px-8 bg-stone-950 hover:bg-stone-800 shadow-lg shadow-stone-200"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> 新增場租紀錄
        </Button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard 
          title={`${selectedMonth === 'all' ? '歷年' : selectedMonth} 場租總收入`} 
          value={`NT$ ${totalIncomeSelectedMonth.toLocaleString()}`} 
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard 
          title="歷年總收入累計" 
          value={`NT$ ${totalIncomeAllTime.toLocaleString()}`} 
          icon={Database}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
      </div>

      {/* Main List Section */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <h2 className="text-lg font-bold text-stone-900">場租收費明細</h2>
          
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
            onDelete={deleteRental}
          />
        )}
      </div>

      {/* Add Rental Modal */}
      <VenueFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSubmit={handleCreateRental}
      />
    </div>
  )
}
