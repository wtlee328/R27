import React, { useState, useEffect } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { format } from 'date-fns'
import { Timestamp, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Customer, Contract } from '../../types'
import { 
  RiGroupLine, 
  RiTeamLine,
  RiUser3Line, 
  RiDeleteBinLine, 
  RiEditLine, 
  RiAddLine, 
  RiPhoneLine, 
  RiIdCardLine, 
  RiShieldCheckLine, 
  RiArrowRightSLine, 
  RiFileTextLine, 
  RiTimeLine, 
  RiCake2Line,
  RiMailLine,
  RiStethoscopeLine,
  RiHeartPulseLine,
  RiCalendarLine,
  RiHistoryLine,
} from '@remixicon/react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useCustomers } from '../../hooks/useCustomers'
import { cn, formatMinguoDate } from '@/lib/utils'

interface CustomerDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  onEditProfile: (customer: Customer) => void
  onCreateContract: (customer: Customer) => void
  onViewContract: (customer: Customer, contract: Contract) => void
  onDeleteCustomer?: (customer: Customer) => void
}

export function CustomerDetailsModal({
  open,
  onOpenChange,
  customer,
  onEditProfile,
  onCreateContract,
  onViewContract,
  onDeleteCustomer,
}: CustomerDetailsModalProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const { fetchCustomerContracts } = useCustomers()

  async function loadContracts() {
    if (!customer) return
    setLoading(true)
    try {
      const data = await fetchCustomerContracts(customer.id)
      setContracts(data)

      const partnerIds = new Set<string>()
      data.forEach(con => {
        const pId = con.customerIds && con.customerIds.length > 1
          ? con.customerIds.find(id => id !== customer.id)
          : con.sharedWithCustomerId
        if (pId && pId !== customer.id) {
          partnerIds.add(pId)
        }
      })
      
      if (partnerIds.size > 0) {
        const namesMap: Record<string, string> = { ...partnerNames }
        await Promise.all(
          Array.from(partnerIds).map(async (id) => {
            if (namesMap[id]) return
            try {
              const docSnap = await getDoc(doc(db, 'customers', id))
              if (docSnap.exists()) {
                namesMap[id] = docSnap.data().name
              }
            } catch (err) {
              console.error('Error fetching partner name:', err)
            }
          })
        )
        setPartnerNames(namesMap)
      }
    } catch (err) {
      console.error('Modal: Error loading contracts', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && customer) {
      loadContracts()
    }
  }, [open, customer])

  if (!customer) return null

  const getCustomerRemainingSessionsInContract = (con: Contract, customerId: string) => {
    if (con.contractType === 'group' && con.groupMemberQuotas?.[customerId]) {
      return con.groupMemberQuotas[customerId].remainingSessions
    }
    return con.remainingSessions
  }

  const checkIsMember = (con: Contract, customerId: string) => {
    if (!con || !customerId) return false
    if (con.customerId === customerId) return true
    if (con.sharedWithCustomerId === customerId) return true
    if (Array.isArray(con.customerIds) && con.customerIds.includes(customerId)) return true
    if (con.groupMemberQuotas && Boolean(con.groupMemberQuotas[customerId])) return true
    return false
  }

  const ongoingContracts = contracts.filter(con => {
    if (!checkIsMember(con, customer.id)) return false
    if (con.status === 'completed' || con.status === 'expired' || con.status === 'cancelled') return false
    const isDual = con.contractType === 'dual' || !!con.sharedWithCustomerId
    const isUnsigned = con.status === 'pending_signature' || !con.signatureDataUrl || (isDual && !con.secondarySignatureDataUrl)
    if (isUnsigned) return true
    const remaining = getCustomerRemainingSessionsInContract(con, customer.id)
    return remaining > 0
  })

  const pendingContract = contracts.find(con => {
    if (!checkIsMember(con, customer.id)) return false
    if (con.status === 'completed' || con.status === 'expired' || con.status === 'cancelled') return false
    const isDual = con.contractType === 'dual' || !!con.sharedWithCustomerId
    return con.status === 'pending_signature' || !con.signatureDataUrl || (isDual && !con.secondarySignatureDataUrl)
  })

  const hasMultiple = ongoingContracts.length >= 2
  const activeContract = pendingContract || ongoingContracts[0] || contracts[0] || null

  // Derive status for header badge: 無合約 / 待簽名 / 進行中 / 複數合約
  const headerBadge = (() => {
    if (pendingContract) return { label: '待簽名', color: 'bg-amber-500 text-white animate-pulse' }
    if (ongoingContracts.length === 0) return { label: '無合約', color: 'bg-stone-100 text-stone-500 border border-stone-200 font-bold' }
    if (hasMultiple) return { label: '複數合約', color: 'bg-purple-600 text-white font-bold' }
    return { label: '進行中', color: 'bg-emerald-600 text-white font-bold' }
  })()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl h-full p-0 flex flex-col bg-stone-50 overflow-hidden border-l border-stone-100">
        <SheetHeader className="sr-only">
          <SheetTitle>學員詳細檔案 - {customer.name}</SheetTitle>
          <SheetDescription>檢視學員的合約歷史與健康備註</SheetDescription>
        </SheetHeader>

        {/* ── Header ── */}
        <div className="bg-white border-b border-stone-100 shrink-0">
          {/* Top accent strip */}
          <div className="h-1 bg-gradient-to-r from-stone-900 via-stone-700 to-stone-500" />

          <div className="px-6 py-5 pr-14">
            <div className="flex items-start justify-between gap-4">
              {/* Avatar + Name */}
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-stone-900 flex items-center justify-center text-white text-xl font-black shadow-lg">
                    {customer.name.charAt(0)}
                  </div>
                  <span className={cn(
                    "absolute -bottom-1 -right-1 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm",
                    headerBadge.color
                  )}>
                    {headerBadge.label}
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-stone-900 leading-tight">{customer.name}</h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-stone-400 flex-wrap">
                    <span className="flex items-center gap-1 font-mono">
                      <RiPhoneLine className="w-3.5 h-3.5" />
                      {customer.phone}
                    </span>
                    {customer.idNumber && (
                      <span className="flex items-center gap-1 font-mono">
                        <RiIdCardLine className="w-3.5 h-3.5" />
                        {customer.idNumber}
                      </span>
                    )}
                    {customer.email && (
                      <span className="flex items-center gap-1 truncate max-w-[160px]">
                        <RiMailLine className="w-3.5 h-3.5 shrink-0" />
                        {customer.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 shrink-0 self-start">
                {onDeleteCustomer && (
                  <button
                    onClick={() => { onOpenChange(false); onDeleteCustomer(customer) }}
                    className="p-2 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="刪除客戶"
                  >
                    <RiDeleteBinLine className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => onEditProfile(customer)}
                  className="p-2 rounded-xl text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors"
                  title="編輯資料"
                >
                  <RiEditLine className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onCreateContract(customer)}
                  className="flex items-center gap-1.5 text-xs font-bold bg-stone-900 hover:bg-stone-700 text-white px-3.5 py-2 rounded-xl transition-colors shadow-sm"
                >
                  <RiAddLine className="w-4 h-4" /> 新增合約
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white px-6 border-b border-stone-100 shrink-0">
            <TabsList className="bg-transparent border-none p-0 gap-6 h-auto">
              {[
                { value: 'overview', label: '檔案總覽' },
                { value: 'contracts', label: `合約歷史 (${contracts.length})` },
                { value: 'medical', label: '健康狀況' },
              ].map(tab => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 data-[state=active]:text-stone-900 rounded-none py-3 px-0 font-bold text-xs text-stone-400 hover:text-stone-700 transition-colors"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── Overview Tab ── */}
            <TabsContent value="overview" className="mt-0 p-5 space-y-4">

              {/* Active Contract Card */}
              {activeContract ? (() => {
                const isGroup = activeContract.contractType === 'group'
                const isDual = activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId
                const activePartnerId = isDual
                  ? (activeContract.customerIds && activeContract.customerIds.length > 1
                      ? activeContract.customerIds.find(id => id !== customer.id)
                      : activeContract.sharedWithCustomerId)
                  : null
                const activePartnerName = activePartnerId ? partnerNames[activePartnerId] : null
                const isUnsigned = !activeContract.signatureDataUrl || (isDual && !activeContract.secondarySignatureDataUrl)
                
                let myRemaining = activeContract.remainingSessions
                let myTotal = activeContract.totalSessions
                if (isGroup && activeContract.groupMemberQuotas && activeContract.groupMemberQuotas[customer.id]) {
                  myRemaining = activeContract.groupMemberQuotas[customer.id].remainingSessions
                  myTotal = activeContract.groupMemberQuotas[customer.id].totalSessions
                }
                const remainingPct = myTotal ? Math.round((myRemaining / myTotal) * 100) : 0

                const isLightBg = isUnsigned || isDual || isGroup

                return (
                  <div
                    onClick={() => onViewContract(customer, activeContract)}
                    className={cn(
                      'rounded-2xl border p-5 cursor-pointer group transition-all hover:shadow-md relative overflow-hidden',
                      isUnsigned
                        ? 'bg-amber-50/70 border-amber-200/70 hover:border-amber-300'
                        : isGroup
                          ? 'bg-emerald-50/70 border-emerald-200/80 hover:border-emerald-300'
                          : isDual
                            ? 'bg-orange-50/50 border-orange-100 hover:border-orange-200'
                            : 'bg-stone-900 border-stone-800'
                    )}
                  >
                    {/* Background icon */}
                    <RiShieldCheckLine className={cn(
                      'absolute right-3 bottom-3 w-20 h-20 opacity-10 group-hover:opacity-15 transition-opacity',
                      isLightBg ? 'text-emerald-900' : 'text-white'
                    )} />

                    <div className="relative">
                      {/* Contract type badge row */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isUnsigned ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white px-2.5 py-1 rounded-full animate-pulse">
                              {isGroup ? <RiTeamLine className="w-3 h-3" /> : isDual ? <RiGroupLine className="w-3 h-3" /> : <RiUser3Line className="w-3 h-3" />}
                              {isGroup ? '團體課待簽名' : isDual ? '雙人待簽名' : '待簽名'}
                            </span>
                          ) : (
                            <span className={cn(
                              'inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm',
                              isGroup
                                ? 'bg-emerald-600 text-white'
                                : isDual
                                  ? 'bg-orange-500 text-white'
                                  : 'bg-stone-800 text-stone-200 border border-stone-700'
                            )}>
                              {isGroup ? <RiTeamLine className="w-3 h-3" /> : isDual ? <RiGroupLine className="w-3 h-3" /> : <RiUser3Line className="w-3 h-3" />}
                              {isGroup ? '團體合約' : isDual ? '雙人共享合約' : '一般合約'}
                            </span>
                          )}
                          {activePartnerName && (
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                              與 {activePartnerName} 共享
                            </span>
                          )}
                        </div>
                        <span className={cn(
                          'text-[10px] font-bold',
                          isLightBg ? 'text-stone-700' : 'text-white/70'
                        )}>
                          建立 {activeContract.createdAt instanceof Timestamp
                            ? format(activeContract.createdAt.toDate(), 'yyyy/MM/dd')
                            : '-'}
                        </span>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className={cn('text-[9px] font-black uppercase tracking-widest mb-0.5', isLightBg ? 'text-stone-700' : 'text-white/60')}>剩餘堂數</p>
                          <p className={cn('text-2xl font-black tabular-nums', isUnsigned ? 'text-amber-600' : isGroup ? 'text-emerald-950' : isDual ? 'text-orange-600' : 'text-white')}>
                            {myRemaining}
                            <span className={cn('text-xs font-bold ml-1', isLightBg ? 'text-stone-700' : 'text-white/70')}>
                              / {myTotal} 堂
                            </span>
                          </p>
                          {/* Progress bar */}
                          <div className={cn('mt-2 h-1.5 rounded-full overflow-hidden', isLightBg ? 'bg-emerald-200/60' : 'bg-white/20')}>
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                remainingPct <= 20 ? 'bg-red-500' : remainingPct <= 50 ? 'bg-amber-500' : isGroup ? 'bg-emerald-600' : isDual ? 'bg-orange-500' : 'bg-white'
                              )}
                              style={{ width: `${remainingPct}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <p className={cn('text-[9px] font-black uppercase tracking-widest mb-0.5', isLightBg ? 'text-stone-700' : 'text-white/60')}>合約到期</p>
                          <p className={cn('text-sm font-bold tabular-nums', isLightBg ? 'text-stone-900' : 'text-white')}>
                            {activeContract.endDate instanceof Timestamp
                              ? format(activeContract.endDate.toDate(), 'yyyy/MM/dd')
                              : '未知'}
                          </p>
                        </div>
                        <div className="flex justify-end items-end">
                          <span className={cn(
                            'text-xs font-bold flex items-center gap-0.5 transition-all group-hover:gap-1.5',
                            isLightBg ? 'text-stone-700 group-hover:text-stone-950' : 'text-white/70 group-hover:text-white'
                          )}>
                            檢視合約 <RiArrowRightSLine className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })() : (
                <div className="border-2 border-dashed border-stone-200 rounded-2xl p-8 text-center bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-3">
                    <RiFileTextLine className="w-6 h-6 text-stone-400" />
                  </div>
                  <p className="text-stone-500 font-semibold text-sm mb-3">目前沒有進行中的合約</p>
                  <button
                    onClick={() => onCreateContract(customer)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-stone-900 text-white px-4 py-2 rounded-xl hover:bg-stone-700 transition-colors"
                  >
                    <RiAddLine className="w-4 h-4" /> 立即新增合約
                  </button>
                </div>
              )}

              {/* Info Cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* Basic Info */}
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-xs space-y-3">
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                    <RiUser3Line className="w-3.5 h-3.5" /> 基本資訊
                  </h4>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-stone-400 font-semibold shrink-0">出生日期</span>
                      <span className="text-stone-800 font-mono font-bold text-right">{formatMinguoDate(customer.dateOfBirth)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-stone-400 font-semibold shrink-0">Email</span>
                      <span className="text-stone-800 font-semibold truncate max-w-[120px]">{customer.email || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-stone-400 font-semibold shrink-0">歷史總堂</span>
                      <span className="text-stone-800 font-black tabular-nums">{customer.historicalSessions} 堂</span>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-xs space-y-3">
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5">
                    <RiShieldCheckLine className="w-3.5 h-3.5" /> 緊急聯絡人
                  </h4>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-stone-400 font-semibold shrink-0">姓名</span>
                      <span className="text-stone-800 font-bold">{customer.emergencyContact.name || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-stone-400 font-semibold shrink-0">關係</span>
                      <span className="text-stone-800 font-bold">{customer.emergencyContact.relation || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-stone-400 font-semibold shrink-0">電話</span>
                      <span className="text-stone-800 font-mono font-bold">{customer.emergencyContact.phone || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Contracts Tab ── */}
            <TabsContent value="contracts" className="mt-0 p-5">
              <div className="space-y-2.5">
                {contracts.length === 0 ? (
                  <div className="py-16 text-center">
                    <RiFileTextLine className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                    <p className="text-stone-400 text-sm italic">查無合約歷史紀錄</p>
                  </div>
                ) : (
                  contracts.map((contract) => {
                    const isContractDual = contract.contractType === 'dual' || contract.sharedWithCustomerId
                    const partnerId = isContractDual
                      ? (contract.customerIds && contract.customerIds.length > 1
                          ? contract.customerIds.find(id => id !== customer.id)
                          : contract.sharedWithCustomerId)
                      : null
                    const partnerName = partnerId ? partnerNames[partnerId] : null
                    const isCompleted = contract.remainingSessions <= 0 || contract.status === 'completed'
                    const isExpired = contract.status === 'expired'
                    const isUnsigned = contract.status === 'pending_signature' || !contract.signatureDataUrl || (isContractDual && !contract.secondarySignatureDataUrl)
                    const isActive = !isCompleted && !isExpired && !isUnsigned

                    return (
                      <div
                        key={contract.id}
                        onClick={() => onViewContract(customer, contract)}
                        className="bg-white border border-stone-100 rounded-2xl p-4 hover:border-stone-300 hover:shadow-sm transition-all cursor-pointer group flex items-center gap-4"
                      >
                        {/* Icon */}
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                          isCompleted ? 'bg-blue-50 text-blue-600' : isUnsigned ? 'bg-amber-50 text-amber-600' : 'bg-stone-900 text-white'
                        )}>
                          <RiFileTextLine className="w-5 h-5" />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-stone-900 text-sm">{contract.totalSessions} 堂合約</span>
                            {isCompleted ? (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">已完成</span>
                            ) : isUnsigned ? (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500 text-white shadow-sm shadow-amber-500/20 flex items-center gap-1 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" /> 待簽名
                              </span>
                            ) : (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-500/20">進行中</span>
                            )}
                            {isContractDual && (
                              <span className="text-[10px] font-bold flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                                <RiGroupLine className="w-3 h-3" /> 雙人共享
                              </span>
                            )}
                            {contract.contractType === 'group' && (
                              <span className="text-[10px] font-bold flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <RiTeamLine className="w-3 h-3" /> 團體課
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-stone-400">
                            <span className="font-mono">
                              {contract.startDate instanceof Timestamp ? format(contract.startDate.toDate(), 'yyyy/MM/dd') : '...'} 
                              {' ~ '}
                              {contract.endDate instanceof Timestamp ? format(contract.endDate.toDate(), 'yyyy/MM/dd') : '...'}
                            </span>
                            {partnerName && <span className="text-orange-500 font-bold">共享: {partnerName}</span>}
                          </div>
                        </div>

                        {/* Remaining + arrow */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right hidden sm:block">
                            <p className="text-[9px] text-stone-400 font-black uppercase tracking-tighter">剩餘</p>
                            <p className="font-black text-stone-900 text-sm tabular-nums">{contract.remainingSessions} 堂</p>
                          </div>
                          <RiArrowRightSLine className="w-5 h-5 text-stone-300 group-hover:text-stone-700 transition-colors" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            {/* ── Medical Tab ── */}
            <TabsContent value="medical" className="mt-0 p-5">
              <div className="bg-white p-5 rounded-2xl border border-stone-100 shadow-xs space-y-6">
                <section>
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <RiHeartPulseLine className="w-3.5 h-3.5" /> 慢性病史
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalHistory.chronicConditions.length > 0 ? (
                      customer.medicalHistory.chronicConditions.map((cond, i) => (
                        <span key={i} className="text-xs font-bold bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full border border-stone-200">{cond}</span>
                      ))
                    ) : (
                      <span className="text-stone-400 text-xs italic">無相關紀錄</span>
                    )}
                  </div>
                </section>

                <div className="border-t border-stone-100" />
                
                <section>
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <RiStethoscopeLine className="w-3.5 h-3.5" /> 受傷紀錄
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalHistory.injuries.length > 0 ? (
                      customer.medicalHistory.injuries.map((inj, i) => (
                        <span key={i} className="text-xs font-bold bg-red-50 text-red-700 px-3 py-1.5 rounded-full border border-red-100">{inj}</span>
                      ))
                    ) : (
                      <span className="text-stone-400 text-xs italic">無相關紀錄</span>
                    )}
                  </div>
                </section>

                <div className="border-t border-stone-100" />

                <section>
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <RiFileTextLine className="w-3.5 h-3.5" /> 備註事項
                  </h4>
                  <p className="text-stone-600 text-xs leading-relaxed bg-stone-50 p-4 rounded-xl border border-stone-100">
                    {customer.medicalHistory.notes || '無額外備註'}
                  </p>
                </section>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
