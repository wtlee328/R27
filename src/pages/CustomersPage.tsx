import { useState, useMemo } from 'react'
import { Users, FileText, AlertCircle, Cake, PlusCircle, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { CustomerTable } from '../components/customers/CustomerTable'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { CustomerContractModal } from '../components/customers/CustomerContractModal'
import { CustomerDetailsModal } from '../components/customers/CustomerDetailsModal'
import { ContractFormModal } from '../components/customers/ContractFormModal'
import { useCustomers } from '../hooks/useCustomers'
import type { CombinedCustomerContractValues, ContractFormValues } from '../lib/validators'
import type { Customer, Contract } from '../types'

type FilterType = 'all' | 'active' | 'expiring' | 'birthday'

export default function CustomersPage() {
  const { 
    customers, 
    contracts,
    loading, 
    activeContractsCount,
    expiringContractsCount,
    thisMonthBirthdaysCount,
    updateCustomerProfile, 
    onboardNewCustomer, 
    createContract 
  } = useCustomers()

  // Modals visibility
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isRenewalOpen, setIsRenewalOpen] = useState(false)
  const [isContractViewOpen, setIsContractViewOpen] = useState(false)

  // Selected Data
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  // Filter State
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  const handleViewDetails = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsDetailOpen(true)
  }

  const handleOpenOnboarding = () => {
    setSelectedCustomer(null)
    setIsEditingProfile(false)
    setIsOnboardingOpen(true)
  }

  const handleOpenEditProfile = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsEditingProfile(true)
    setIsOnboardingOpen(true)
  }

  const handleOpenRenewal = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsRenewalOpen(true)
  }

  const handleViewContract = (customer: Customer, contract: Contract) => {
    setSelectedCustomer(customer)
    setSelectedContract(contract)
    setIsContractViewOpen(true)
  }

  const handleOnboardingSubmit = async (data: CombinedCustomerContractValues) => {
    if (selectedCustomer && isEditingProfile) {
      await updateCustomerProfile(selectedCustomer.id, data as CombinedCustomerContractValues)
    } else {
      await onboardNewCustomer(data)
    }
  }

  const handleRenewalSubmit = async (data: ContractFormValues) => {
    if (selectedCustomer) {
      await createContract(selectedCustomer.id, data)
    }
  }

  // --- Real-time Filtered Customer list ---
  const filteredCustomers = useMemo(() => {
    if (activeFilter === 'all') return customers

    if (activeFilter === 'active') {
      const activeCustomerIds = new Set(
        contracts
          .filter(c => c.status === 'active' || c.status === 'expiring')
          .map(c => c.customerId)
      )
      return customers.filter(cust => activeCustomerIds.has(cust.id))
    }

    if (activeFilter === 'expiring') {
      const now = new Date()
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(now.getDate() + 30)

      const expiringCustomerIds = new Set(
        contracts
          .filter(c => {
            if (c.status !== 'active' && c.status !== 'expiring') return false
            if (!c.endDate) return false
            const end = c.endDate.toDate()
            return end >= now && end <= thirtyDaysFromNow
          })
          .map(c => c.customerId)
      )
      return customers.filter(cust => expiringCustomerIds.has(cust.id))
    }

    if (activeFilter === 'birthday') {
      const currentMonth = new Date().getMonth()
      return customers.filter(cust => {
        if (!cust.dateOfBirth) return false
        const dob = cust.dateOfBirth.toDate()
        return dob.getMonth() === currentMonth
      })
    }

    return customers
  }, [customers, contracts, activeFilter])

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 px-4">
        <div>
          <h1 className="text-4xl font-black text-stone-900 tracking-tight">客戶檔案管理</h1>
          <p className="text-stone-500 font-medium mt-2">追蹤學員進度與合約狀態</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-full px-6 border-stone-200 bg-white shadow-sm hover:bg-stone-50">
            匯入客戶
          </Button>
          <Button onClick={handleOpenOnboarding} className="rounded-full px-8 bg-stone-950 hover:bg-stone-800 shadow-lg shadow-stone-200">
            <PlusCircle className="w-4 h-4 mr-2" /> 新增客戶
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="總客戶數" 
          value={customers.length.toString()} 
          icon={Users} 
          onClick={() => setActiveFilter('all')}
          isActive={activeFilter === 'all'}
        />
        <StatCard 
          title="有效合約" 
          value={activeContractsCount.toString()} 
          icon={FileText} 
          subtitle="進行中之合約" 
          onClick={() => setActiveFilter('active')}
          isActive={activeFilter === 'active'}
        />
        <StatCard 
          title="即將到期" 
          value={expiringContractsCount.toString()} 
          icon={AlertCircle} 
          subtitle="未來 30 天內" 
          onClick={() => setActiveFilter('expiring')}
          isActive={activeFilter === 'expiring'}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard 
          title="本月壽星" 
          value={thisMonthBirthdaysCount.toString()} 
          icon={Cake} 
          onClick={() => setActiveFilter('birthday')}
          isActive={activeFilter === 'birthday'}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
      </div>

      {/* Main List Section */}
      <div className="flex flex-col gap-4">
        {/* Active Filter Badge */}
        {activeFilter !== 'all' && (
          <div className="flex items-center gap-2.5 px-4 py-2 bg-stone-100 border border-stone-200/60 rounded-xl self-start text-xs font-bold text-stone-700 animate-in fade-in slide-in-from-top-1 duration-200">
            <span>
              篩選中：
              {activeFilter === 'active' && '有效合約學員'}
              {activeFilter === 'expiring' && '合約即將到期學員'}
              {activeFilter === 'birthday' && '本月壽星學員'}
              {` (${filteredCustomers.length} 人)`}
            </span>
            <button
              onClick={() => setActiveFilter('all')}
              className="p-0.5 hover:bg-stone-200 rounded-md transition-colors text-stone-400 hover:text-stone-800"
              title="清除篩選"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="bg-white p-2 rounded-[2.5rem] border border-stone-200 shadow-sm">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="loading-spinner"><span /></div>
            </div>
          ) : (
            <CustomerTable 
              customers={filteredCustomers} 
              contracts={contracts}
              onView={handleViewDetails}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <CustomerDetailsModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        customer={selectedCustomer}
        onEditProfile={handleOpenEditProfile}
        onCreateContract={handleOpenRenewal}
        onViewContract={handleViewContract}
      />

      <CustomerFormModal
        open={isOnboardingOpen}
        onOpenChange={(open) => {
          setIsOnboardingOpen(open)
          if (!open) setIsEditingProfile(false)
        }}
        onSubmit={handleOnboardingSubmit}
        isEditMode={isEditingProfile}
        customers={customers}
        initialData={selectedCustomer ? {
          name: selectedCustomer.name,
          phone: selectedCustomer.phone,
          idNumber: selectedCustomer.idNumber,
          email: selectedCustomer.email,
          dateOfBirth: selectedCustomer.dateOfBirth.toDate(),
          emergencyContact: selectedCustomer.emergencyContact,
          medicalHistory: selectedCustomer.medicalHistory,
          historicalSessions: selectedCustomer.historicalSessions,
        } : undefined}
      />

      <ContractFormModal
        open={isRenewalOpen}
        onOpenChange={setIsRenewalOpen}
        customer={selectedCustomer}
        customers={customers}
        onSubmit={handleRenewalSubmit}
      />

      <CustomerContractModal
        open={isContractViewOpen}
        onOpenChange={setIsContractViewOpen}
        customer={selectedCustomer}
        contract={selectedContract}
        onContractUpdated={refresh}
      />
    </div>
  )
}
