import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Timestamp } from 'firebase/firestore'
import { 
  RiGroupLine, 
  RiFileTextLine, 
  RiAlertLine, 
  RiCake2Line, 
  RiUserAddLine, 
  RiBankCardLine,
  RiCloseLine,
  RiAddLine
} from '@remixicon/react'
import { Button } from '../components/ui/button'
import { StatCard } from '../components/shared/StatCard'
import { CustomerTable } from '../components/customers/CustomerTable'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { CustomerContractModal } from '../components/customers/CustomerContractModal'
import { CustomerDetailsModal } from '../components/customers/CustomerDetailsModal'
import { ContractFormModal } from '../components/customers/ContractFormModal'
import { InstallmentManagerModal } from '../components/customers/InstallmentManagerModal'
import { DeleteCustomerModal } from '../components/customers/DeleteCustomerModal'
import { useCustomers } from '../hooks/useCustomers'
import { useTrainers } from '../hooks/useTrainers'
import { useAuthStore } from '../stores/authStore'
import type { CombinedCustomerContractValues, ContractFormValues } from '../lib/validators'
import type { Customer, Contract } from '../types'

type FilterType = 'all' | 'active' | 'expiring' | 'birthday' | 'pending_collection'

export default function CustomersPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const { trainers } = useTrainers()
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
    deleteCustomer,
    refresh
  } = useCustomers()

  // Modals visibility
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isRenewalOpen, setIsRenewalOpen] = useState(false)
  const [isContractViewOpen, setIsContractViewOpen] = useState(false)
  const [isInstallmentManagerOpen, setIsInstallmentManagerOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  // Selected Data
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [selectedInstallmentContract, setSelectedInstallmentContract] = useState<Contract | null>(null)
  const [selectedInstallmentCustomer, setSelectedInstallmentCustomer] = useState<Customer | null>(null)
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)

  // Filter State
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  const handleOpenDeleteCustomer = (customer: Customer) => {
    setCustomerToDelete(customer)
    setIsDeleteModalOpen(true)
  }

  const handleConfirmDeleteCustomer = async (customerId: string) => {
    await deleteCustomer(customerId)
    if (selectedCustomer?.id === customerId) {
      setIsDetailOpen(false)
      setSelectedCustomer(null)
    }
  }

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
        pendingInstallmentItems
          .map(item => item.customer?.id)
          .filter((id): id is string => !!id)
      )
      return customers.filter(c => pendingCustomerIds.has(c.id))
    }

    if (activeFilter === 'active') {
      const activeCustomerIds = new Set(
        contracts
          .filter(c => c.status === 'active')
          .flatMap(c => {
            const ids: string[] = []
            if (c.customerId) ids.push(c.customerId)
            if (c.primaryCustomerId) ids.push(c.primaryCustomerId)
            if (c.customerIds) ids.push(...c.customerIds)
            return ids
          })
      )
      return customers.filter(c => activeCustomerIds.has(c.id))
    }

    if (activeFilter === 'expiring') {
      const now = new Date()
      const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      const expiringCustomerIds = new Set<string>()

      contracts.forEach(c => {
        if (c.status !== 'active' && c.status !== 'expiring' && c.status !== 'expired') return
        
        let isExpiringSoon = false
        if (c.endDate) {
          const end = (c.endDate as any).toDate ? (c.endDate as any).toDate() : new Date(c.endDate)
          if (!isNaN(end.getTime()) && end <= in30Days) {
            isExpiringSoon = true
          }
        }

        const ids: string[] = []
        if (c.customerId) ids.push(c.customerId)
        if (c.primaryCustomerId) ids.push(c.primaryCustomerId)
        if (c.customerIds) ids.push(...c.customerIds)

        ids.forEach(id => {
          let isLowSessions = false
          if (c.contractType === 'group' && c.groupMemberQuotas?.[id]) {
            if (c.groupMemberQuotas[id].remainingSessions < 5) isLowSessions = true
          } else {
            if (typeof c.remainingSessions === 'number' && c.remainingSessions < 5) isLowSessions = true
          }

          if (isExpiringSoon || isLowSessions) {
            expiringCustomerIds.add(id)
          }
        })
      })
      return customers.filter(c => expiringCustomerIds.has(c.id))
    }

    if (activeFilter === 'birthday') {
      const currentMonth = new Date().getMonth()
      return customers.filter(c => {
        if (!c.dateOfBirth) return false
        return c.dateOfBirth.toDate().getMonth() === currentMonth
      })
    }

    return customers
  }, [customers, contracts, activeFilter, pendingInstallmentItems])

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiGroupLine className="w-6 h-6 text-orange-500" />
            客戶檔案管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">追蹤學員進度與合約狀態</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={handleOpenOnboarding} 
            className="font-semibold text-sm px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <RiUserAddLine className="w-4 h-4" />
            新增客戶
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title="總客戶數" 
          value={customers.length.toString()} 
          icon={RiGroupLine} 
          onClick={() => setActiveFilter('all')}
          isActive={activeFilter === 'all'}
        />
        <StatCard 
          title="待收合約" 
          value={pendingInstallmentItems.length.toString()} 
          icon={RiBankCardLine} 
          subtitle="分期付款待收合約" 
          onClick={() => setActiveFilter('pending_collection')}
          isActive={activeFilter === 'pending_collection'}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
        <StatCard 
          title="有效合約" 
          value={activeContractsCount.toString()} 
          icon={RiFileTextLine} 
          subtitle="進行中之合約" 
          onClick={() => setActiveFilter('active')}
          isActive={activeFilter === 'active'}
        />
        <StatCard 
          title="即將到期／堂數<5" 
          value={expiringContractsCount.toString()} 
          icon={RiAlertLine} 
          subtitle="30天內到期或堂數<5" 
          onClick={() => setActiveFilter('expiring')}
          isActive={activeFilter === 'expiring'}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard 
          title="本月壽星" 
          value={thisMonthBirthdaysCount.toString()} 
          icon={RiCake2Line} 
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
              {activeFilter === 'expiring' && '即將到期／堂數<5學員'}
              {activeFilter === 'birthday' && '本月壽星學員'}
              {` (${filteredCustomers.length} 人)`}
            </span>
            <button
              onClick={() => setActiveFilter('all')}
              className="p-0.5 hover:bg-stone-200 rounded-md transition-colors text-stone-400 hover:text-stone-800"
              title="清除篩選"
            >
              <RiCloseLine className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Installment Payment Management Section */}
        {activeFilter === 'pending_collection' && pendingInstallmentItems.length > 0 && (
          <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <RiBankCardLine className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">分期收款管理</h2>
                  <p className="text-xs text-stone-500">追蹤並個別管理未結清的分期付款合約</p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200">
                待收合約: {pendingInstallmentItems.length} 件
              </span>
            </div>

            <div className="divide-y divide-stone-100">
              {pendingInstallmentItems.map(({ contract, customer }) => {
                const paid = contract.paidAmount || 0
                const total = contract.totalAmount || 0
                const remaining = total - paid
                const progressPct = total > 0 ? Math.round((paid / total) * 100) : 0

                return (
                  <div key={contract.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-sm">
                        {customer?.name?.charAt(0) || '學'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900">{customer?.name || '未知學員'}</span>
                          <span className="text-xs text-stone-400 font-mono">{customer?.phone}</span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          合約建立日期：
                          {contract.createdAt ? (
                            contract.createdAt instanceof Timestamp
                              ? format(contract.createdAt.toDate(), 'yyyy/MM/dd')
                              : (contract.createdAt as any)?.seconds
                                ? format(new Date((contract.createdAt as any).seconds * 1000), 'yyyy/MM/dd')
                                : typeof contract.createdAt === 'string' || contract.createdAt instanceof Date
                                  ? format(new Date(contract.createdAt), 'yyyy/MM/dd')
                                  : '未知'
                          ) : '未知'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 self-end sm:self-auto">
                      <div className="text-right">
                        <div className="text-xs font-bold text-stone-900">
                          已繳 <span className="text-emerald-600">NT$ {paid.toLocaleString()}</span> / 總額 NT$ {total.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-orange-600 font-semibold mt-0.5">
                          剩餘未繳：NT$ {remaining.toLocaleString()}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedInstallmentContract(contract)
                          setSelectedInstallmentCustomer(customer || null)
                          setIsInstallmentManagerOpen(true)
                        }}
                        className="text-xs font-bold border-stone-200 hover:bg-stone-50"
                      >
                        管理收款
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Main Table Container */}
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
              onDelete={isAdmin ? handleOpenDeleteCustomer : undefined}
              trainers={trainers}
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
        onDeleteCustomer={isAdmin ? handleOpenDeleteCustomer : undefined}
      />

      <CustomerFormModal
        open={isOnboardingOpen}
        onOpenChange={(open) => {
          setIsOnboardingOpen(open)
          if (!open) {
            setSelectedCustomer(null)
            setIsEditingProfile(false)
          }
        }}
        onSubmit={handleOnboardingSubmit}
        initialCustomer={isEditingProfile ? selectedCustomer : null}
        isEditMode={isEditingProfile}
        customers={customers}
        contracts={contracts}
      />

      <ContractFormModal
        open={isRenewalOpen}
        onOpenChange={(open) => {
          setIsRenewalOpen(open)
          if (!open) setSelectedCustomer(null)
        }}
        customer={selectedCustomer}
        customers={customers}
        onSubmit={handleRenewalSubmit}
      />

      <CustomerContractModal
        open={isContractViewOpen}
        onOpenChange={(open) => {
          setIsContractViewOpen(open)
          if (!open) setSelectedContract(null)
        }}
        customer={selectedCustomer}
        contract={selectedContract}
        onUpdate={refresh}
      />

      <InstallmentManagerModal
        open={isInstallmentManagerOpen}
        onOpenChange={setIsInstallmentManagerOpen}
        contract={selectedInstallmentContract}
        customer={selectedInstallmentCustomer}
        onUpdate={refresh}
      />

      <DeleteCustomerModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        customer={customerToDelete}
        contracts={contracts}
        customers={customers}
        onConfirm={handleConfirmDeleteCustomer}
      />
    </div>
  )
}
