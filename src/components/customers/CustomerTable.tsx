import { useState, useMemo, useCallback } from 'react'
import type { Customer, Contract } from '../../types'
import { format } from 'date-fns'
import { RiGroupLine, RiUser3Line } from '@remixicon/react'
import { Badge } from '../ui/badge'
import { Search, Phone, Mail, FileText, ChevronRight, Clock, Cake } from 'lucide-react'
import { Input } from '../ui/input'
import { cn } from '@/lib/utils'

export function CustomerTable({ 
  customers,
  contracts,
  onView,
  trainers,
}: { 
  customers: Customer[] 
  contracts: Contract[]
  onView: (customer: Customer) => void
  trainers?: any[]
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTrainerId, setSelectedTrainerId] = useState('all')
  const [filterType, setFilterType] = useState<'all' | 'has-active' | 'no-active'>('all')
  const [sortBy, setSortBy] = useState<'default' | 'remaining-desc' | 'remaining-asc' | 'contract-date' | 'end-date' | 'birthday'>('default')

  const getCustomerActiveContract = useCallback((customerId: string) => {
    const customerContracts = contracts.filter(con => 
      con.customerId === customerId || 
      con.sharedWithCustomerId === customerId || 
      (con.customerIds && con.customerIds.includes(customerId))
    )
    const activeOrExpiring = customerContracts.find(con => con.status === 'active' || con.status === 'expiring')
    if (activeOrExpiring) return activeOrExpiring
    return customerContracts.find(con => con.status === 'expired')
  }, [contracts])

  const getCustomerLatestContract = useCallback((customerId: string) => {
    const customerContracts = contracts.filter(con => 
      con.customerId === customerId || con.sharedWithCustomerId === customerId || (con.customerIds && con.customerIds.includes(customerId))
    )
    if (customerContracts.length === 0) return null
    return [...customerContracts].sort((a, b) => {
      const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
      const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
      return tB - tA
    })[0]
  }, [contracts])

  const processedCustomers = useMemo(() => {
    // 1. Search text filter
    let result = customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm)
    )

    // 2. Trainer filter
    if (trainers && selectedTrainerId !== 'all') {
      result = result.filter(c => c.trainerId === selectedTrainerId)
    }

    // 3. Active contract status filter
    if (filterType === 'has-active') {
      result = result.filter(c => {
        return contracts.some(con => 
          (con.customerId === c.id || con.sharedWithCustomerId === c.id || (con.customerIds && con.customerIds.includes(c.id))) && 
          (con.status === 'active' || con.status === 'expiring')
        )
      })
    } else if (filterType === 'no-active') {
      result = result.filter(c => {
        return !contracts.some(con => 
          (con.customerId === c.id || con.sharedWithCustomerId === c.id || (con.customerIds && con.customerIds.includes(c.id))) && 
          (con.status === 'active' || con.status === 'expiring')
        )
      })
    }

    // 3. Sorting logic
    if (sortBy === 'remaining-desc') {
      result.sort((a, b) => {
        const activeA = getCustomerActiveContract(a.id)
        const activeB = getCustomerActiveContract(b.id)
        const remA = activeA ? activeA.remainingSessions : 0
        const remB = activeB ? activeB.remainingSessions : 0
        return remB - remA
      })
    } else if (sortBy === 'remaining-asc') {
      result.sort((a, b) => {
        const activeA = getCustomerActiveContract(a.id)
        const activeB = getCustomerActiveContract(b.id)
        const remA = activeA ? activeA.remainingSessions : 0
        const remB = activeB ? activeB.remainingSessions : 0
        return remA - remB
      })
    } else if (sortBy === 'contract-date') {
      result.sort((a, b) => {
        const latestA = getCustomerLatestContract(a.id)
        const latestB = getCustomerLatestContract(b.id)
        const timeA = latestA?.createdAt?.toMillis ? latestA.createdAt.toMillis() : 0
        const timeB = latestB?.createdAt?.toMillis ? latestB.createdAt.toMillis() : 0
        return timeB - timeA
      })
    } else if (sortBy === 'end-date') {
      result.sort((a, b) => {
        const activeA = getCustomerActiveContract(a.id)
        const activeB = getCustomerActiveContract(b.id)
        const timeA = activeA?.endDate?.toMillis ? activeA.endDate.toMillis() : Infinity
        const timeB = activeB?.endDate?.toMillis ? activeB.endDate.toMillis() : Infinity
        return timeA - timeB // Closest expiration first
      })
    } else if (sortBy === 'birthday') {
      result.sort((a, b) => {
        if (!a.dateOfBirth && !b.dateOfBirth) return 0
        if (!a.dateOfBirth) return 1
        if (!b.dateOfBirth) return -1
        const dobA = a.dateOfBirth.toDate()
        const dobB = b.dateOfBirth.toDate()
        
        if (dobA.getMonth() !== dobB.getMonth()) {
          return dobA.getMonth() - dobB.getMonth()
        }
        return dobA.getDate() - dobB.getDate()
      })
    }

    return result
  }, [customers, contracts, searchTerm, filterType, sortBy, getCustomerActiveContract, getCustomerLatestContract, trainers, selectedTrainerId])

  if (customers.length === 0) {
    return (
      <div className="py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-stone-200">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-stone-50 mb-4 text-stone-300">
          <Search className="w-8 h-8" />
        </div>
        <h3 className="text-stone-900 font-bold text-lg">尚無客戶資料</h3>
        <p className="text-stone-400 text-sm mt-1">點擊上方按鈕開始建立您的第一位客戶</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Search & Sort & Filter Header */}
      <div className="px-8 py-6 flex flex-col md:flex-row gap-4 justify-between items-center bg-white rounded-t-[2.5rem] border-b border-stone-100">
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <Input 
            placeholder="搜尋姓名或電話..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 h-11 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-stone-200 transition-all text-sm font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-end">
          {/* Trainer Filter */}
          {trainers && trainers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 font-bold shrink-0">指派教練</span>
              <select
                value={selectedTrainerId}
                onChange={(e) => setSelectedTrainerId(e.target.value)}
                className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-white font-medium text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-stone-400 transition-colors cursor-pointer outline-none shadow-sm"
              >
                <option value="all">全部教練</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 font-bold shrink-0">篩選合約</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-white font-medium text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-stone-400 transition-colors cursor-pointer outline-none shadow-sm"
            >
              <option value="all">全部學員</option>
              <option value="has-active">有有效合約</option>
              <option value="no-active">無有效合約/過期</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 font-bold shrink-0">排序方式</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-stone-200 rounded-xl px-3 py-2 text-xs bg-white font-medium text-stone-700 focus:ring-2 focus:ring-stone-400 focus:border-stone-400 transition-colors cursor-pointer outline-none shadow-sm"
            >
              <option value="default">預設排序</option>
              <option value="remaining-desc">剩餘堂數 (多 → 少)</option>
              <option value="remaining-asc">剩餘堂數 (少 → 多)</option>
              <option value="contract-date">合約建立日期</option>
              <option value="end-date">合約到期日期 (近 → 遠)</option>
              <option value="birthday">生日月份 (1月 → 12月)</option>
            </select>
          </div>

          <div className="hidden sm:block w-px h-4 bg-stone-200" />
          <span className="text-xs text-stone-400 font-black uppercase tracking-wider">Total: {processedCustomers.length}</span>
        </div>
      </div>

      {/* Modern List */}
      <div className="bg-white rounded-b-[2.5rem] overflow-hidden">
        {processedCustomers.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-stone-400 font-medium italic">找不到符合條件的學員</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {processedCustomers.map((c) => {
              const activeContract = getCustomerActiveContract(c.id)
              const partnerId = activeContract 
                ? (activeContract.customerIds && activeContract.customerIds.length > 1
                    ? activeContract.customerIds.find(id => id !== c.id)
                    : activeContract.sharedWithCustomerId)
                : null
              const partner = partnerId ? customers.find(cust => cust.id === partnerId) : null

              return (
                <div 
                  key={c.id}
                  onClick={() => onView(c)}
                  className="group flex flex-col lg:flex-row lg:items-center justify-between p-6 lg:px-8 hover:bg-stone-50/80 transition-all cursor-pointer relative"
                >
                  {/* Active Indicator on Hover */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-stone-900 opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Profile Section */}
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-600 text-xl font-black group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-bold text-stone-900 group-hover:text-stone-950 transition-colors">{c.name}</h3>
                        {activeContract ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {activeContract.status === 'expired' ? (
                              <Badge variant="secondary" className="bg-stone-100 text-stone-700 border-stone-200 text-[10px] py-0 px-2 h-5 flex items-center shrink-0 font-bold">
                                已到期
                              </Badge>
                            ) : (
                              <Badge variant="default" className={cn(
                                activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId
                                  ? "bg-stone-800 text-white" 
                                  : "bg-stone-900 text-white",
                                "text-[10px] py-0 px-2 h-5 flex items-center shrink-0 font-bold"
                              )}>
                                {activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId ? (
                                  <span className="flex items-center gap-1"><RiGroupLine className="w-3 h-3 text-orange-400" /> 雙人合約</span>
                                ) : (
                                  <span className="flex items-center gap-1"><RiUser3Line className="w-3 h-3 text-stone-300" /> 進行中</span>
                                )}
                              </Badge>
                            )}
                            {(activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId) && partner && (
                              <span className="text-[10px] text-stone-600 font-bold bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200 shrink-0">
                                與 {partner.name} 共享
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-stone-50 text-stone-400 border-stone-200 text-[10px] py-0 px-2 h-5 flex items-center shrink-0 font-bold">無有效合約</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-400 font-bold">
                        <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {c.phone}</span>
                        <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {c.email || '未填寫'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Section */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-6 sm:gap-10 mt-4 lg:mt-0">
                    {/* Remaining Sessions */}
                    <div className="space-y-1 min-w-[90px]">
                      <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.2em]">剩餘堂數</p>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-stone-400" />
                          <p className={cn(
                            "text-xs font-bold",
                            activeContract 
                              ? (activeContract.status === 'expired' ? "text-red-500" : "text-stone-700") 
                              : "text-stone-400 italic"
                          )}>
                            {activeContract ? `${activeContract.remainingSessions} / ${activeContract.totalSessions} 堂` : '無合約'}
                          </p>
                        </div>
                        {activeContract && (activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId) && (
                          <span className="text-[8px] text-purple-400 font-bold mt-0.5">(雙人共享額度)</span>
                        )}
                      </div>
                    </div>

                    {/* Expiration Date */}
                    <div className="space-y-1 min-w-[100px]">
                      <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.2em]">到期日期</p>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-stone-400" />
                        <p className={cn(
                          "text-xs font-bold",
                          activeContract 
                            ? (activeContract.status === 'expired' ? "text-red-500 font-semibold" : "text-stone-700") 
                            : "text-stone-400 italic"
                        )}>
                          {activeContract ? format(activeContract.endDate.toDate(), 'yyyy/MM/dd') : '無有效合約'}
                        </p>
                      </div>
                    </div>

                    {/* Birthday */}
                    <div className="space-y-1 min-w-[100px]">
                      <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.2em]">生日</p>
                      <div className="flex items-center gap-1.5">
                        <Cake className="w-3.5 h-3.5 text-stone-400" />
                        <p className="text-xs font-bold text-stone-700">
                          {c.dateOfBirth ? format(c.dateOfBirth.toDate(), 'yyyy/MM/dd') : '未提供'}
                        </p>
                      </div>
                    </div>

                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-stone-300 group-hover:text-stone-800 group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
