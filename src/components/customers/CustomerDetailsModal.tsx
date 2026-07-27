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
  RiMailLine
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

  const activeContract = contracts.find(c => c.status === 'active') || contracts[0]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl h-full p-0 flex flex-col bg-stone-50 overflow-hidden border-l border-stone-200">
        <SheetHeader className="sr-only">
          <SheetTitle>學員詳細檔案 - {customer.name}</SheetTitle>
          <SheetDescription>檢視學員的合約歷史與健康備註</SheetDescription>
        </SheetHeader>

        {/* Header Bar */}
        <div className="bg-white px-6 pr-14 py-6 border-b border-stone-200">
          <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-stone-900 flex items-center justify-center text-white text-xl font-black shadow-md shrink-0">
                {customer.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-bold text-stone-900">{customer.name}</h2>
                  {activeContract ? (
                    activeContract.status === 'expired' ? (
                      <Badge variant="secondary" className="bg-stone-100 text-stone-700 border-stone-200 text-xs py-0.5 px-2 font-bold">已到期</Badge>
                    ) : (!activeContract.signatureDataUrl || ((activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId) && !activeContract.secondarySignatureDataUrl)) ? (
                      <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-0.5 px-2 font-bold animate-pulse">待簽名</Badge>
                    ) : (
                      <Badge className="bg-emerald-600 text-white text-xs py-0.5 px-2 font-bold">進行中</Badge>
                    )
                  ) : (
                    <Badge variant="outline" className="bg-stone-50 text-stone-400 border-stone-200 text-xs py-0.5 px-2 font-bold">無有效合約</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-stone-500 flex-wrap">
                  <span className="flex items-center gap-1 font-mono">
                    <RiPhoneLine className="w-3.5 h-3.5 text-stone-400" />
                    {customer.phone}
                  </span>
                  {customer.idNumber && (
                    <>
                      <span className="text-stone-300">|</span>
                      <span className="flex items-center gap-1 font-mono">
                        <RiIdCardLine className="w-3.5 h-3.5 text-stone-400" />
                        ID: {customer.idNumber}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Top Right Action Buttons (Remix Icons) */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {onDeleteCustomer && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    onDeleteCustomer(customer)
                  }}
                  className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl"
                >
                  <RiDeleteBinLine className="w-4 h-4" /> 刪除客戶
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onEditProfile(customer)} 
                className="gap-1.5 border-stone-200 text-stone-700 hover:bg-stone-100 text-xs font-bold rounded-xl"
              >
                <RiEditLine className="w-4 h-4 text-stone-500" /> 編輯資料
              </Button>
              <Button 
                size="sm" 
                onClick={() => onCreateContract(customer)} 
                className="gap-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shadow-sm"
              >
                <RiAddLine className="w-4 h-4" /> 新增合約
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs & Content */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white px-6 pt-2 border-b border-stone-200 shrink-0">
            <TabsList className="bg-transparent border-none p-0 gap-6">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 rounded-none pb-3 px-0 font-bold text-xs"
              >
                檔案總覽
              </TabsTrigger>
              <TabsTrigger 
                value="contracts" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 rounded-none pb-3 px-0 font-bold text-xs"
              >
                合約歷史 ({contracts.length})
              </TabsTrigger>
              <TabsTrigger 
                value="medical" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-stone-900 rounded-none pb-3 px-0 font-bold text-xs"
              >
                健康狀況
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="overview" className="mt-0 space-y-6">
              {activeContract ? (
                (() => {
                  const isDual = activeContract.contractType === 'dual' || activeContract.sharedWithCustomerId
                  const activePartnerId = isDual
                    ? (activeContract.customerIds && activeContract.customerIds.length > 1
                        ? activeContract.customerIds.find(id => id !== customer.id)
                        : activeContract.sharedWithCustomerId)
                    : null
                  const activePartnerName = activePartnerId ? partnerNames[activePartnerId] : null
                  const isUnsigned = !activeContract.signatureDataUrl || (isDual && !activeContract.secondarySignatureDataUrl)

                  return (
                    <div className={cn(
                      "border rounded-2xl p-5 relative overflow-hidden group",
                      isDual 
                        ? "bg-orange-50/50 border-orange-100" 
                        : "bg-emerald-50/50 border-emerald-100"
                    )}>
                      <div className="absolute right-0 top-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                        <RiShieldCheckLine className={cn("w-32 h-32", isDual ? "text-orange-500" : "text-emerald-600")} />
                      </div>
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {isUnsigned ? (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white border-none flex items-center gap-1 text-xs font-bold animate-pulse">
                              {isDual ? <><RiGroupLine className="w-3.5 h-3.5 text-amber-200" /> 雙人待簽名合約</> : <><RiUser3Line className="w-3.5 h-3.5 text-amber-200" /> 待簽名合約</>}
                            </Badge>
                          ) : (
                            <Badge className={cn("text-white border-none flex items-center gap-1 text-xs", isDual ? "bg-stone-900" : "bg-stone-950")}>
                              {isDual ? <><RiGroupLine className="w-3.5 h-3.5 text-orange-400" /> 雙人進行中合約</> : <><RiUser3Line className="w-3.5 h-3.5 text-stone-300" /> 進行中合約</>}
                            </Badge>
                          )}
                          {isDual && activePartnerName && (
                            <Badge variant="outline" className="bg-orange-100/60 text-orange-700 border-orange-200 text-[10px]">
                              與 {activePartnerName} 共享額度
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-stone-400 font-medium">
                          建立於 {activeContract.createdAt instanceof Timestamp 
                            ? format(activeContract.createdAt.toDate(), 'yyyy/MM/dd') 
                            : '-'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-6 items-center">
                        <div>
                          <p className="text-[10px] text-stone-400 uppercase font-black tracking-wider mb-1">剩餘堂數</p>
                          <p className={cn("text-xl font-black tabular-nums", isDual ? "text-orange-600" : "text-emerald-700")}>
                            {activeContract.remainingSessions} / {activeContract.totalSessions} <span className="text-xs font-normal">堂</span>
                          </p>
                          {isDual && <span className="text-[10px] text-orange-500 font-bold">(雙人共享)</span>}
                        </div>
                        <div>
                          <p className="text-[10px] text-stone-400 uppercase font-black tracking-wider mb-1">合約期限</p>
                          <p className="text-xs font-bold text-stone-700 tabular-nums">
                            {activeContract.endDate instanceof Timestamp 
                              ? format(activeContract.endDate.toDate(), 'yyyy/MM/dd') 
                              : '未知'} 到期
                          </p>
                        </div>
                        <div className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => onViewContract(customer, activeContract)} 
                            className={cn(
                              "gap-1 font-bold text-xs rounded-xl",
                              isDual 
                                ? "text-orange-600 hover:text-orange-700 hover:bg-orange-100/50" 
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50"
                            )}
                          >
                            檢視合約 <RiArrowRightSLine className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="bg-stone-100 border border-dashed border-stone-300 rounded-2xl p-8 text-center">
                  <p className="text-stone-500 font-medium text-sm mb-3">目前沒有進行中的合約</p>
                  <Button variant="outline" size="sm" onClick={() => onCreateContract(customer)} className="text-xs font-bold rounded-xl">
                    <RiAddLine className="w-4 h-4 mr-1" /> 立即新增合約
                  </Button>
                </div>
              )}

              {/* Basic Info Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <RiUser3Line className="w-3.5 h-3.5 text-stone-500" /> 基本資訊
                  </h4>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400 font-bold">電子郵件</span>
                      <span className="text-stone-900 font-semibold truncate max-w-[150px]">{customer.email || '未提供'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400 font-bold">出生日期</span>
                      <span className="text-stone-900 font-mono font-semibold">
                        {formatMinguoDate(customer.dateOfBirth)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400 font-bold">歷史總堂數</span>
                      <span className="text-stone-900 font-bold tabular-nums">{customer.historicalSessions} 堂</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <RiShieldCheckLine className="w-3.5 h-3.5 text-stone-500" /> 緊急聯絡人
                  </h4>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400 font-bold">聯絡姓名</span>
                      <span className="text-stone-900 font-semibold">{customer.emergencyContact.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400 font-bold">關係</span>
                      <span className="text-stone-900 font-semibold">{customer.emergencyContact.relation}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400 font-bold">聯絡電話</span>
                      <span className="text-stone-900 font-mono font-semibold">{customer.emergencyContact.phone}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contracts" className="mt-0">
              <div className="space-y-3">
                {contracts.length === 0 ? (
                  <p className="text-center py-12 text-stone-400 italic text-sm">查無合約歷史紀錄</p>
                ) : (
                  contracts.map((contract) => {
                    const isContractDual = contract.contractType === 'dual' || contract.sharedWithCustomerId
                    const partnerId = isContractDual
                      ? (contract.customerIds && contract.customerIds.length > 1
                          ? contract.customerIds.find(id => id !== customer.id)
                          : contract.sharedWithCustomerId)
                      : null
                    const partnerName = partnerId ? partnerNames[partnerId] : null

                    return (
                      <div 
                        key={contract.id}
                        onClick={() => onViewContract(customer, contract)}
                        className="bg-white p-4.5 rounded-2xl border border-stone-200 shadow-xs hover:border-stone-400 transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                            contract.status === 'active' 
                              ? (isContractDual ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600') 
                              : 'bg-stone-100 text-stone-400'
                          }`}>
                            <RiFileTextLine className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="font-bold text-stone-900 text-sm">{contract.totalSessions} 堂課程合約</h5>
                              <Badge 
                                variant={contract.status === 'active' ? 'default' : 'secondary'} 
                                className={cn(
                                  "text-[10px] py-0 font-bold",
                                  contract.status === 'active' && isContractDual ? "bg-orange-500 hover:bg-orange-600" : "bg-stone-900 text-white"
                                )}
                              >
                                {contract.status === 'active' ? '進行中' : '已結束'}
                              </Badge>
                              {!contract.signatureDataUrl && (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] py-0 px-2 h-5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> 待簽名
                                </Badge>
                              )}
                              {isContractDual && (
                                <Badge variant="outline" className="bg-stone-100 text-stone-800 border-stone-200 text-[10px] py-0 px-2 h-5 flex items-center gap-1">
                                  <RiGroupLine className="w-3 h-3 text-orange-500" /> 雙人合約
                                </Badge>
                              )}
                              {isContractDual && partnerName && (
                                <span className="text-[10px] text-orange-500 font-bold">
                                  (共享人: {partnerName})
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-400 mt-1 font-mono">
                              效期：{contract.startDate instanceof Timestamp ? format(contract.startDate.toDate(), 'yyyy/MM/dd') : '...'} ~ {contract.endDate instanceof Timestamp ? format(contract.endDate.toDate(), 'yyyy/MM/dd') : '...'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <div className="hidden sm:block">
                            <p className="text-[9px] text-stone-400 font-black uppercase tracking-tighter">剩餘</p>
                            <p className="font-black text-stone-900 text-sm tabular-nums">{contract.remainingSessions} 堂</p>
                          </div>
                          <RiArrowRightSLine className="w-5 h-5 text-stone-300 group-hover:text-stone-800 transition-colors" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="medical" className="mt-0">
              <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-6">
                <section>
                  <h4 className="text-xs font-bold text-stone-900 mb-3 border-l-4 border-stone-900 pl-3">慢性病史</h4>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalHistory.chronicConditions.length > 0 ? (
                      customer.medicalHistory.chronicConditions.map((cond, i) => (
                        <Badge key={i} variant="outline" className="bg-stone-50 border-stone-200 text-stone-600 text-xs">{cond}</Badge>
                      ))
                    ) : (
                      <span className="text-stone-400 text-xs italic">無相關紀錄</span>
                    )}
                  </div>
                </section>
                
                <section>
                  <h4 className="text-xs font-bold text-stone-900 mb-3 border-l-4 border-stone-900 pl-3">受傷紀錄</h4>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalHistory.injuries.length > 0 ? (
                      customer.medicalHistory.injuries.map((inj, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50 border-red-100 text-red-600 text-xs">{inj}</Badge>
                      ))
                    ) : (
                      <span className="text-stone-400 text-xs italic">無相關紀錄</span>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-xs font-bold text-stone-900 mb-3 border-l-4 border-stone-900 pl-3">備註事項</h4>
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
