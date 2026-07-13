import { useState, useMemo } from 'react'
import { DollarSign, PlusCircle, Database } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { VenueTable } from '../components/venue/VenueTable'
import { VenueFormModal } from '../components/venue/VenueFormModal'
import { useVenueRentals } from '../hooks/useVenueRentals'
import { useTrainers } from '../hooks/useTrainers'
import { format } from 'date-fns'
import type { VenueRental } from '../types'

export default function VenuePage() {
  const { rentals, loading, createRental, updateRental, deleteRental } = useVenueRentals()
  const { trainers } = useTrainers()
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRental, setSelectedRental] = useState<VenueRental | null>(null)
  
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return format(new Date(), 'yyyy/MM')
  })
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>('')

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

  // Filter rentals by selected month and trainer
  const filteredRentals = useMemo(() => {
    let list = rentals
    
    if (selectedMonth !== 'all') {
      list = list.filter((r) => {
        const d = r.date?.toDate()
        return d && format(d, 'yyyy/MM') === selectedMonth
      })
    }

    if (selectedTrainerId) {
      list = list.filter((r) => r.renterTrainerId === selectedTrainerId)
    }

    return list
  }, [rentals, selectedMonth, selectedTrainerId])

  // Calculate statistics
  const totalIncomeSelectedMonth = useMemo(() => {
    return filteredRentals.reduce((sum, r) => sum + r.amount, 0)
  }, [filteredRentals])

  const totalIncomeAllTime = useMemo(() => {
    // If a trainer is selected, sum only that trainer's rentals. Otherwise sum all.
    const subset = selectedTrainerId 
      ? rentals.filter(r => r.renterTrainerId === selectedTrainerId)
      : rentals
    return subset.reduce((sum, r) => sum + r.amount, 0)
  }, [rentals, selectedTrainerId])

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
          <p className="text-stone-500 font-medium mt-2">記錄與統計場租收入明細，系統會自動同步至金流對帳表</p>
        </div>
        <Button 
          onClick={() => {
            setSelectedRental(null)
            setIsModalOpen(true)
          }} 
          className="rounded-full px-8 bg-stone-950 hover:bg-stone-800 shadow-lg shadow-stone-200 cursor-pointer font-bold h-10 inline-flex items-center"
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
          title={selectedTrainerId ? '該教練歷年總收入累計' : '歷年總收入累計'} 
          value={`NT$ ${totalIncomeAllTime.toLocaleString()}`} 
          icon={Database}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
      </div>

      {/* Main List Section */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-100 pb-4">
          <h2 className="text-lg font-bold text-stone-900">場租收費明細</h2>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Trainer Filter Select */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 font-bold shrink-0">篩選教練</span>
              <select
                value={selectedTrainerId}
                onChange={(e) => setSelectedTrainerId(e.target.value)}
                className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-white font-medium text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-stone-400 transition-colors cursor-pointer outline-none shadow-sm h-9"
              >
                <option value="">全部教練</option>
                {trainers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Month Filter Select */}
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
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="loading-spinner"><span /></div>
          </div>
        ) : (
          <VenueTable 
            rentals={filteredRentals} 
            onDelete={deleteRental}
            onRowClick={handleRowClick}
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
