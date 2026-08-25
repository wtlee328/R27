import { useState, useMemo } from 'react'
import { Users, FileText, Cake, PlusCircle } from 'lucide-react'
import { format } from 'date-fns'
import { Timestamp } from 'firebase/firestore'
import { RiGroupLine, RiBankCardLine, RiAlertLine, RiTimeLine } from '@remixicon/react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/shared/StatCard'
import { CustomerTable } from '@/components/customers/CustomerTable'
import { CustomerFormModal } from '@/components/customers/CustomerFormModal'
import { CustomerContractModal } from '@/components/customers/CustomerContractModal'
import { CustomerDetailsModal } from '@/components/customers/CustomerDetailsModal'
import { ContractFormModal } from '@/components/customers/ContractFormModal'
import { InstallmentManagerModal } from '@/components/customers/InstallmentManagerModal'
import { useCustomers } from '@/hooks/useCustomers'
import { useLessonRecords } from '@/hooks/useLessonRecords'
import { useAuthStore } from '@/stores/authStore'
import { useTrainerProfileStore } from '@/stores/trainerProfileStore'
import { ensureDate, cn } from '@/lib/utils'
import type { CombinedCustomerContractValues, ContractFormValues } from '@/lib/validators'
import type { Customer, Contract } from '@/types'

type FilterType = 'all' | 'active' | 'expiring' | 'birthday' | 'pending_collection'

export default function TrainerCustomersPage() {
  const { user } = useAuthStore()
  const { selectedTrainerId } = useTrainerProfileStore()
  const currentTrainerId = selectedTrainerId || (user?.role === 'trainer' ? user?.trainerId : null)
  const { records: lessons } = useLessonRecords()

  const { 
    customers, 
    contracts,
    loading, 
    updateCustomerProfile, 
    onboardNewCustomer, 
    createContract,
    refresh
  } = useCustomers()

  // Filter customers that belong to current trainer (Contract-driven: any contract where current trainer is assigned, regardless of remaining sessions)
  const myCustomers = useMemo(() => {
    if (!currentTrainerId) return customers
    return customers.filter(cust => {
      // 1. Has any contract (active, expiring, expired, completed) where current trainer is assigned
      const hasContract = contracts.some(con => {
        const isMember = con.customerId === cust.id ||
          con.primaryCustomerId === cust.id ||
          con.sharedWithCustomerId === cust.id ||
          con.partnerId === cust.id ||
          (Array.isArray(con.customerIds) && con.customerIds.includes(cust.id))
        if (!isMember) return false

        // Check if designated in studentTrainers
        if (con.studentTrainers?.[cust.id]) {
          return con.studentTrainers[cust.id] === currentTrainerId
        }

        // For dual contracts: check primary trainer or secondary trainer
        if (con.contractType === 'dual') {
          const isPrimary = cust.id === (con.customerId || con.primaryCustomerId)
          if (!isPrimary && con.secondaryTrainerId) {
            return con.secondaryTrainerId === currentTrainerId
          }
          return con.trainerId === currentTrainerId || con.secondaryTrainerId === currentTrainerId
        }

        // General contract
        return con.trainerId === currentTrainerId || con.secondaryTrainerId === currentTrainerId
      })

      if (hasContract) return true

      // Fallback for uncontracted customers who were assigned to this trainer
      return cust.trainerId === currentTrainerId
    })
  }, [customers, contracts, currentTrainerId])

  // Filter contracts relevant to current trainer
  const myContracts = useMemo(() => {
    if (!currentTrainerId) return contracts
    return contracts.filter(con =>
      con.trainerId === currentTrainerId ||
      con.secondaryTrainerId === currentTrainerId ||
      (con.studentTrainers && Object.values(con.studentTrainers).includes(currentTrainerId))
    )
  }, [contracts, currentTrainerId])

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

    const expiringCustIds = new Set<string>()
    myContracts.forEach(c => {
      if (c.status !== 'active' && c.status !== 'expiring' && c.status !== 'expired') return

      let isExpiringSoon = false
      if (c.endDate) {
        const end = (c.endDate as any).toDate ? (c.endDate as any).toDate() : new Date(c.endDate)
        if (!isNaN(end.getTime()) && end <= thirtyDaysFromNow) {
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
          expiringCustIds.add(id)
        }
      })
    })
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

  // Helper to extract nearest unpaid installment due date and calculate warning state
  const getNearestInstallmentInfo = (contract: Contract) => {
    const installments = contract.installments || []
    const unpaid = installments.filter((inst: any) => inst.status !== 'paid' && inst.dueDate)
    
    if (unpaid.length === 0) {
      return { nearestDueDate: null, nearestAmount: 0, diffDays: null, isOverdue: false, isDueSoon: false }
    }

    const sorted = [...unpaid].sort((a: any, b: any) => {
      const timeA = ensureDate(a.dueDate).getTime()
      const timeB = ensureDate(b.dueDate).getTime()
      return timeA - timeB
    })

    const nearest = sorted[0]
    const nearestDueDate = ensureDate(nearest.dueDate)
    
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const target = new Date(nearestDueDate.getFullYear(), nearestDueDate.getMonth(), nearestDueDate.getDate())
    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    const isOverdue = diffDays < 0
    const isDueSoon = diffDays >= 0 && diffDays <= 5

    return {
      nearestDueDate,
      nearestAmount: nearest.amount || 0,
      diffDays,
      isOverdue,
      isDueSoon,
    }
  }

  // Pending installment contracts (unpaid installments), sorted by nearest due date
  const pendingInstallmentItems = useMemo(() => {
    const pendingContracts = myContracts.filter(c => 
      c.paymentType === 'installments' && 
      (c.paidAmount || 0) < (c.totalAmount || 0)
    )
    const items = pendingContracts.map(contract => {
      const customer = myCustomers.find(cust => cust.id === contract.customerId || contract.customerIds?.includes(cust.id))
      const dueInfo = getNearestInstallmentInfo(contract)
      return { contract, customer, ...dueInfo }
    })

    // 預設依據「最近到期日」由近至遠/已逾期者在前排序
    return items.sort((a, b) => {
      if (!a.nearestDueDate && !b.nearestDueDate) return 0
      if (!a.nearestDueDate) return 1
      if (!b.nearestDueDate) return -1
      return a.nearestDueDate.getTime() - b.nearestDueDate.getTime()
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

      const expiringCustomerIds = new Set<string>()
      myContracts.forEach(c => {
        if (c.status !== 'active' && c.status !== 'expiring' && c.status !== 'expired') return

        let isExpiringSoon = false
        if (c.endDate) {
          const end = (c.endDate as any).toDate ? (c.endDate as any).toDate() : new Date(c.endDate)
          if (!isNaN(end.getTime()) && end <= thirtyDaysFromNow) {
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
          title="即將到期／堂數<5"
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
      {!loading && pendingCollectionCount > 0 && activeFilter !== 'pending_collection' && (
        <div 
          onClick={() => setActiveFilter('pending_collection')}
          className="flex items-center justify-between p-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 cursor-pointer hover:bg-amber-50 transition-colors shadow-2xs"
        >
          <div className="flex items-center gap-2.5 text-amber-900 text-sm font-bold">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>提醒：您有 {pendingCollectionCount} 筆分期待收款合約</span>
          </div>
          <span className="text-xs text-amber-700 font-extrabold hover:underline">點此查看詳情與最近到期日 →</span>
        </div>
      )}

      {/* Installment Payment Management Section for Trainer */}
      {activeFilter === 'pending_collection' && pendingInstallmentItems.length > 0 && (
        <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                <RiBankCardLine className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">分期收款管理</h2>
                <p className="text-xs text-stone-500">追蹤並管理未結清合約（已預設依據最近繳費到期日排序）</p>
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200">
              待收合約: {pendingInstallmentItems.length} 件
            </span>
          </div>

          <div className="space-y-2">
            {pendingInstallmentItems.map(({ contract, customer, nearestDueDate, diffDays, isOverdue, isDueSoon }) => {
              const paid = contract.paidAmount || 0
              const total = contract.totalAmount || 0
              const remaining = total - paid
              const progressPct = total > 0 ? Math.round((paid / total) * 100) : 0

              return (
                <div 
                  key={contract.id} 
                  className={cn(
                    "py-3 px-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all border",
                    isOverdue
                      ? "bg-red-50/40 border-red-200/80"
                      : isDueSoon
                      ? "bg-amber-50/40 border-amber-200/80"
                      : "bg-stone-50/60 border-stone-100 hover:border-stone-200"
                  )}
                >
                  {/* LEFT: 客戶資訊 */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0",
                      isOverdue ? "bg-red-600 text-white" : isDueSoon ? "bg-amber-500 text-white" : "bg-stone-800 text-white"
                    )}>
                      {customer?.name?.charAt(0) || '學'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-stone-900 text-sm">{customer?.name || '未知學員'}</span>
                        <span className="text-xs text-stone-400 font-mono">{customer?.phone}</span>
                        {contract.contractNo && (
                          <span className="text-[10px] font-mono text-stone-400 bg-white px-1.5 py-0.5 rounded-md border border-stone-200">
                            {contract.contractNo}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        建立：
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

                  {/* RIGHT: 到期日 + 進度 + 按鈕 */}
                  <div className="flex items-center gap-3 self-end md:self-auto shrink-0">

                    {/* 到期日區塊 */}
                    <div className={cn(
                      "px-3 py-2 rounded-xl text-center min-w-[110px]",
                      isOverdue ? "bg-red-100/70 border border-red-200" :
                      isDueSoon ? "bg-amber-100/70 border border-amber-200" :
                      "bg-white border border-stone-200"
                    )}>
                      <p className="text-[9px] font-bold uppercase tracking-wider mb-0.5 text-stone-400">最近到期日</p>
                      {nearestDueDate ? (
                        <>
                          <p className={cn(
                            "text-xs font-mono font-black leading-tight",
                            isOverdue ? "text-red-700" : isDueSoon ? "text-amber-800" : "text-stone-800"
                          )}>
                            {format(nearestDueDate, 'yyyy/MM/dd')}
                          </p>
                          <p className={cn(
                            "text-[10px] font-bold mt-0.5",
                            isOverdue ? "text-red-600" : isDueSoon ? "text-amber-700" : "text-stone-400"
                          )}>
                            {isOverdue
                              ? `⚠ 已逾期 ${Math.abs(diffDays!)} 天`
                              : isDueSoon
                              ? (diffDays === 0 ? '今日到期' : `${diffDays} 天後到期`)
                              : `${diffDays} 天後`}
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-stone-400 italic">未設定</p>
                      )}
                    </div>

                    {/* 金額與進度條區塊 */}
                    <div className="min-w-[130px]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-stone-500 font-semibold">繳款進度</span>
                        <span className="text-[10px] font-black text-stone-700">{progressPct}%</span>
                      </div>
                      <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-stone-400">已繳</span>
                        <span className="text-[10px] font-black text-emerald-600">NT$ {paid.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-stone-400">待繳</span>
                        <span className="text-[10px] font-black text-orange-600">NT$ {remaining.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* 按鈕 */}
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedInstallmentContract(contract)
                        setSelectedInstallmentCustomer(customer || null)
                        setIsInstallmentManagerOpen(true)
                      }}
                      className={cn(
                        "text-xs font-bold rounded-xl h-9 px-3 transition-all shrink-0",
                        isOverdue ? "bg-red-600 hover:bg-red-700 text-white border-0" :
                        isDueSoon ? "bg-amber-500 hover:bg-amber-600 text-white border-0" :
                        "bg-stone-800 hover:bg-stone-900 text-white border-0"
                      )}
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

      {/* Customer Table */}
      <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-stone-800">
            {activeFilter === 'all' && '學員名單'}
            {activeFilter === 'active' && '合約有效學員名單'}
            {activeFilter === 'expiring' && '即將到期／堂數<5學員名單'}
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
            lessons={lessons}
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
