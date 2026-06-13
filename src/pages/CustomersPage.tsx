import { useState, useMemo } from 'react'
import { Users, FileText, AlertCircle, Cake, PlusCircle, X, CreditCard } from 'lucide-react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { CustomerTable } from '../components/customers/CustomerTable'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { CustomerContractModal } from '../components/customers/CustomerContractModal'
import { CustomerDetailsModal } from '../components/customers/CustomerDetailsModal'
import { ContractFormModal } from '../components/customers/ContractFormModal'
import { InstallmentManagerModal } from '../components/customers/InstallmentManagerModal'
import { useCustomers } from '../hooks/useCustomers'
import type { CombinedCustomerContractValues, ContractFormValues } from '../lib/validators'
import type { Customer, Contract } from '../types'

type FilterType = 'all' | 'active' | 'expiring' | 'birthday' | 'pending_collection'

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
    createContract,
    refresh
  } = useCustomers()

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
    const pendingContracts = contracts.filter(c => 
      c.paymentType === 'installments' && 
      (c.paidAmount || 0) < (c.totalAmount || 0)
    )
    return pendingContracts.map(contract => {
      const customer = customers.find(cust => cust.id === contract.customerId || contract.customerIds?.includes(cust.id))
      return { contract, customer }
    })
  }, [contracts, customers])

  // --- Real-time Filtered Customer list ---
  const filteredCustomers = useMemo(() => {
    if (activeFilter === 'all') return customers

    if (activeFilter === 'pending_collection') {
      const pendingCustomerIds = new Set(
        pendingInstallmentItems.map(item => item.customer?.id).filter(Boolean) as string[]
      )
      return customers.filter(cust => pendingCustomerIds.has(cust.id))
    }

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
  }, [customers, contracts, activeFilter, pendingInstallmentItems])

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title="總客戶數" 
          value={customers.length.toString()} 
          icon={Users} 
          onClick={() => setActiveFilter('all')}
          isActive={activeFilter === 'all'}
        />
        <StatCard 
          title="待收合約" 
          value={pendingInstallmentItems.length.toString()} 
          icon={CreditCard} 
          subtitle="分期付款待收合約" 
          onClick={() => setActiveFilter('pending_collection')}
          isActive={activeFilter === 'pending_collection'}
          iconColor="text-red-600"
          iconBg="bg-red-50"
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
              {activeFilter === 'pending_collection' && '待收分期合約學員'}
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

        {/* Installment Payment Management Section */}
        {activeFilter === 'pending_collection' && pendingInstallmentItems.length > 0 && (
          <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">分期收款管理</h2>
                  <p className="text-xs text-stone-500">追蹤並個別管理未結清的分期付款合約</p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-100">
                待收合約: {pendingInstallmentItems.length} 件
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingInstallmentItems.map(({ contract, customer }) => {
                const totalAmount = contract.totalAmount || 0
                const paidAmount = contract.paidAmount || 0
                const pendingAmount = totalAmount - paidAmount
                const installments = contract.installments || []
                const paidCount = installments.filter(inst => inst.status === 'paid').length
                const totalCount = installments.length

                return (
                  <div 
                    key={contract.id} 
                    className="bg-stone-50 border border-stone-200/60 rounded-2xl p-5 flex flex-col justify-between hover:border-stone-300 transition-all shadow-sm"
                  >
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="font-bold text-stone-900 text-sm">{customer?.name || '未知學員'}</h4>
                          <p className="text-[10px] text-stone-400 font-mono mt-0.5">{contract.contractNo || contract.id}</p>
                        </div>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                          已收 {paidCount} / {totalCount} 期
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-stone-500">合約總額</span>
                          <span className="font-bold text-stone-800">NT$ {totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">已收金額</span>
                          <span className="font-bold text-green-600">NT$ {paidAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-stone-500">待收金額</span>
                          <span className="font-bold text-red-500">NT$ {pendingAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <Button 
                      onClick={() => {
                        setSelectedInstallmentContract(contract)
                        setSelectedInstallmentCustomer(customer || null)
                        setIsInstallmentManagerOpen(true)
                      }}
                      className="mt-5 w-full h-9 text-xs font-bold bg-stone-900 hover:bg-stone-850 text-white rounded-xl shadow-sm hover:shadow-md transition-all"
                    >
                      管理收款
                    </Button>
                  </div>
                )
              })}
            </div>
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
