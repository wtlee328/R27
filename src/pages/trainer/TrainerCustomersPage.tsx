import { useState, useMemo } from 'react'
import { Users, FileText, Cake, PlusCircle } from 'lucide-react'
import { RiGroupLine } from '@remixicon/react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/shared/StatCard'
import { CustomerTable } from '@/components/customers/CustomerTable'
import { CustomerFormModal } from '@/components/customers/CustomerFormModal'
import { CustomerContractModal } from '@/components/customers/CustomerContractModal'
import { CustomerDetailsModal } from '@/components/customers/CustomerDetailsModal'
import { ContractFormModal } from '@/components/customers/ContractFormModal'
import { InstallmentManagerModal } from '@/components/customers/InstallmentManagerModal'
import { useCustomers } from '@/hooks/useCustomers'
import { useAuthStore } from '@/stores/authStore'
import { useTrainerProfileStore } from '@/stores/trainerProfileStore'
import type { CombinedCustomerContractValues, ContractFormValues } from '@/lib/validators'
import type { Customer, Contract } from '@/types'

type FilterType = 'all' | 'active' | 'expiring' | 'birthday' | 'pending_collection'

export default function TrainerCustomersPage() {
  const { user } = useAuthStore()
  const { selectedTrainerId } = useTrainerProfileStore()
  const currentTrainerId = selectedTrainerId || (user?.role === 'trainer' ? user?.trainerId : null)

  const { 
    customers, 
    contracts,
    loading, 
    updateCustomerProfile, 
    onboardNewCustomer, 
    createContract,
    refresh
  } = useCustomers()

  // Filter customers that belong to current trainer
  const myCustomers = useMemo(() => {
    if (!currentTrainerId) return customers
    return customers.filter(cust => {
      // 1. Primary assigned trainer
      if (cust.trainerId === currentTrainerId) return true
      // 2. Or has a contract where current trainer is primary or secondary trainer
      return contracts.some(con =>
        (con.customerId === cust.id || con.sharedWithCustomerId === cust.id || (con.customerIds && con.customerIds.includes(cust.id))) &&
        (con.trainerId === currentTrainerId || con.secondaryTrainerId === currentTrainerId)
      )
    })
  }, [customers, contracts, currentTrainerId])

  // Filter contracts relevant to current trainer
  const myContracts = useMemo(() => {
    if (!currentTrainerId) return contracts
    const myCustIds = new Set(myCustomers.map(c => c.id))
    return contracts.filter(con =>
      con.trainerId === currentTrainerId ||
      con.secondaryTrainerId === currentTrainerId ||
      myCustIds.has(con.customerId) ||
      (con.sharedWithCustomerId && myCustIds.has(con.sharedWithCustomerId)) ||
      (con.customerIds && con.customerIds.some(id => myCustIds.has(id)))
    )
  }, [contracts, currentTrainerId, myCustomers])

  // Metrics for current trainer
  const activeContractsCount = useMemo(() => {
    const activeCustIds = new Set(
      myContracts
        .filter(c => c.status === 'active' || c.status === 'expiring')
        .map(c => c.customerId)
    )
    return myCustomers.filter(cust => activeCustIds.has(cust.id)).length
  }, [myCustomers, myContracts])

  const expiringContractsCount = useMemo(() => {
    const now = new Date()
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(now.getDate() + 30)

    const expiringCustIds = new Set(
      myContracts
        .filter(c => {
          if (c.status !== 'active' && c.status !== 'expiring' && c.status !== 'expired') return false
          if (!c.endDate) return false
          const end = c.endDate.toDate()
          return end <= thirtyDaysFromNow
        })
        .map(c => c.customerId)
    )
    return myCustomers.filter(cust => expiringCustIds.has(cust.id)).length
  }, [myCustomers, myContracts])

  const thisMonthBirthdaysCount = useMemo(() => {
    const currentMonth = new Date().getMonth()
    return myCustomers.filter(cust => {
      if (!cust.dateOfBirth) return false
      const dob = cust.dateOfBirth.toDate()
      return dob.getMonth() === currentMonth
    }).length
  }, [myCustomers])

  // Modals visibility
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isRenewalOpen, setIsRenewalOpen] = useState(false)
  const [isContractViewOpen, setIsContractViewOpen] = useState(false)
  const [isInstallmentManagerOpen, setIsInstallmentManagerOpen] = useState(false)

  // Selected Data
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [selectedInstallmentContract, setSelectedInstallmentContract] = useState<Contract | null>(null)
  const [selectedInstallmentCustomer, setSelectedInstallmentCustomer] = useState<Customer | null>(null)
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

  // Pending installment contracts (unpaid installments)
  const pendingInstallmentItems = useMemo(() => {
    const pendingContracts = myContracts.filter(c => 
      c.paymentType === 'installments' && 
      (c.paidAmount || 0) < (c.totalAmount || 0)
    )
    return pendingContracts.map(contract => {
      const customer = myCustomers.find(cust => cust.id === contract.customerId || contract.customerIds?.includes(cust.id))
      return { contract, customer }
    })
  }, [myContracts, myCustomers])

  // --- Real-time Filtered Customer list ---
  const filteredCustomers = useMemo(() => {
    if (activeFilter === 'all') return myCustomers

    if (activeFilter === 'pending_collection') {
      const pendingCustomerIds = new Set(
        pendingInstallmentItems.map(item => item.customer?.id).filter(Boolean) as string[]
      )
      return myCustomers.filter(cust => pendingCustomerIds.has(cust.id))
    }

    if (activeFilter === 'active') {
      const activeCustomerIds = new Set(
        myContracts
          .filter(c => c.status === 'active' || c.status === 'expiring')
          .map(c => c.customerId)
      )
      return myCustomers.filter(cust => activeCustomerIds.has(cust.id))
    }

    if (activeFilter === 'expiring') {
      const now = new Date()
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(now.getDate() + 30)

      const expiringCustomerIds = new Set(
        myContracts
          .filter(c => {
            if (c.status !== 'active' && c.status !== 'expiring' && c.status !== 'expired') return false
            if (!c.endDate) return false
            const end = c.endDate.toDate()
            return end <= thirtyDaysFromNow
          })
          .map(c => c.customerId)
      )
      return myCustomers.filter(cust => expiringCustomerIds.has(cust.id))
    }

    if (activeFilter === 'birthday') {
      const currentMonth = new Date().getMonth()
      return myCustomers.filter(cust => {
        if (!cust.dateOfBirth) return false
        const dob = cust.dateOfBirth.toDate()
        return dob.getMonth() === currentMonth
      })
    }

    return myCustomers
  }, [myCustomers, myContracts, activeFilter, pendingInstallmentItems])

  const pendingCollectionCount = pendingInstallmentItems.length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiGroupLine className="w-6 h-6 text-orange-500" />
            學員管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">管理您的專屬學員及合約狀態</p>
        </div>
        <Button 
          onClick={handleOpenOnboarding}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-sm text-sm px-5 h-10 cursor-pointer font-bold"
        >
          <PlusCircle className="w-4 h-4" />
          新增學員
        </Button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="我的學員總數"
          value={loading ? '...' : String(myCustomers.length)}
          icon={Users}
          onClick={() => setActiveFilter('all')}
          className={`cursor-pointer transition-all hover:scale-[1.01] ${activeFilter === 'all' ? 'ring-2 ring-brand-500' : ''}`}
        />
        <StatCard
          title="合約有效學員"
          value={loading ? '...' : String(activeContractsCount)}
          icon={FileText}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          onClick={() => setActiveFilter('active')}
          className={`cursor-pointer transition-all hover:scale-[1.01] ${activeFilter === 'active' ? 'ring-2 ring-brand-500' : ''}`}
        />
        <StatCard
          title="合約即將到期"
          value={loading ? '...' : String(expiringContractsCount)}
          icon={FileText}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          onClick={() => setActiveFilter('expiring')}
          className={`cursor-pointer transition-all hover:scale-[1.01] ${activeFilter === 'expiring' ? 'ring-2 ring-brand-500' : ''}`}
        />
        <StatCard
          title="本月壽星"
          value={loading ? '...' : String(thisMonthBirthdaysCount)}
          icon={Cake}
          iconColor="text-pink-600"
          iconBg="bg-pink-50"
          onClick={() => setActiveFilter('birthday')}
          className={`cursor-pointer transition-all hover:scale-[1.01] ${activeFilter === 'birthday' ? 'ring-2 ring-brand-500' : ''}`}
        />
      </div>

      {/* Pending collection alert bar */}
      {!loading && pendingCollectionCount > 0 && (
        <div 
          onClick={() => setActiveFilter('pending_collection')}
          className={`flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-amber-50/50 cursor-pointer hover:bg-amber-50 transition-colors ${
            activeFilter === 'pending_collection' ? 'ring-2 ring-amber-500' : ''
          }`}
        >
          <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>提醒：您有 {pendingCollectionCount} 筆待收款的合約期數</span>
          </div>
          <span className="text-xs text-amber-600 font-bold hover:underline">點此查看名單 →</span>
        </div>
      )}

      {/* Customer Table */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-800">
            {activeFilter === 'all' && '學員名單'}
            {activeFilter === 'active' && '合約有效學員名單'}
            {activeFilter === 'expiring' && '合約即將到期學員名單'}
            {activeFilter === 'birthday' && '本月壽星學員名單'}
            {activeFilter === 'pending_collection' && '分期款待收款名單'}
          </h2>
          {activeFilter !== 'all' && (
            <button
              onClick={() => setActiveFilter('all')}
              className="text-xs text-stone-500 hover:text-stone-700 font-bold underline cursor-pointer"
            >
              清除篩選，顯示全部
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center text-stone-400 text-sm animate-pulse">載入中...</div>
        ) : (
          <CustomerTable 
            customers={filteredCustomers} 
            contracts={myContracts}
            onView={handleViewDetails}
          />
        )}
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
        contracts={contracts}
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

      <InstallmentManagerModal
        open={isInstallmentManagerOpen}
        onOpenChange={setIsInstallmentManagerOpen}
        contract={selectedInstallmentContract}
        customer={selectedInstallmentCustomer}
        onUpdated={refresh}
      />
    </div>
  )
}
