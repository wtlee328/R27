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
import { RiGroupLine, RiUser3Line } from '@remixicon/react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { 
  User, 
  FileText, 
  History, 
  Plus, 
  Calendar, 
  ShieldCheck, 
  CreditCard,
  ChevronRight,
  Clock
} from 'lucide-react'
import { useCustomers } from '../../hooks/useCustomers'
import { cn } from '@/lib/utils'

interface CustomerDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  onEditProfile: (customer: Customer) => void
  onCreateContract: (customer: Customer) => void
  onViewContract: (customer: Customer, contract: Contract) => void
}

export function CustomerDetailsModal({
  open,
  onOpenChange,
  customer,
  onEditProfile,
  onCreateContract,
  onViewContract,
}: CustomerDetailsModalProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [partnerNames, setPartnerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const { fetchCustomerContracts } = useCustomers()

  async function loadContracts() {
    if (!customer) return
    setLoading(true)
    console.log('Modal: Loading contracts for', customer.name)
    try {
      const data = await fetchCustomerContracts(customer.id)
      console.log('Modal: Received contracts', data)
      setContracts(data)

      // Fetch partner names if there are dual contracts
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

  // Find active contract, or just use the most recent one if no active found
  const activeContract = contracts.find(c => c.status === 'active') || contracts[0]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl h-full p-0 flex flex-col bg-stone-50 overflow-hidden border-l border-stone-200">
        <SheetHeader className="sr-only">
          <SheetTitle>學員詳細檔案 - {customer.name}</SheetTitle>
          <SheetDescription>檢視學員的合約歷史與健康備註</SheetDescription>
        </SheetHeader>
        <div className="bg-white px-6 pr-14 py-6 border-b border-stone-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-brand-200">
                {customer.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-stone-900">{customer.name}</h2>
                <div className="flex items-center gap-3 mt-1.5 text-sm text-stone-500">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {customer.phone}</span>
                  <span className="w-1 h-1 rounded-full bg-stone-300" />
                  <span>ID: {customer.idNumber}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEditProfile(customer)} className="gap-2 border-stone-200 shadow-sm">
                <User className="w-4 h-4 text-stone-500" /> 編輯資料
              </Button>
              <Button size="sm" onClick={() => onCreateContract(customer)} className="gap-2 shadow-lg shadow-brand-100">
                <Plus className="w-4 h-4" /> 新增合約
              </Button>
            </div>
          </div>
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white px-8 pt-2 border-b border-stone-200 shrink-0">
            <TabsList className="bg-transparent border-none p-0 gap-8">
              <TabsTrigger 
                value="overview" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-500 rounded-none pb-3 px-0 font-bold"
              >
                檔案總覽
              </TabsTrigger>
              <TabsTrigger 
                value="contracts" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-500 rounded-none pb-3 px-0 font-bold"
              >
                合約歷史 ({contracts.length})
              </TabsTrigger>
              <TabsTrigger 
                value="medical" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-brand-500 rounded-none pb-3 px-0 font-bold"
              >
                健康狀況
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
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

                  return (
                    <div className={cn(
                      "border rounded-2xl p-6 relative overflow-hidden group",
                      isDual 
                        ? "bg-purple-50/50 border-purple-100" 
                        : "bg-emerald-50/50 border-emerald-100"
                    )}>
                      <div className="absolute right-0 top-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
                        <ShieldCheck className={cn("w-32 h-32", isDual ? "text-purple-600" : "text-emerald-600")} />
                      </div>
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-white border-none flex items-center gap-1", isDual ? "bg-stone-900" : "bg-stone-950")}>
                            {isDual ? <><RiGroupLine className="w-3.5 h-3.5 text-orange-400" /> 雙人進行中合約</> : <><RiUser3Line className="w-3.5 h-3.5 text-stone-300" /> 進行中合約</>}
                          </Badge>
                          {isDual && activePartnerName && (
                            <Badge variant="outline" className="bg-purple-100/60 text-purple-700 border-purple-200 text-[10px]">
                              與 {activePartnerName} 共享額度
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-stone-400 font-medium">
                          建立於 {activeContract.createdAt instanceof Timestamp 
                            ? format(activeContract.createdAt.toDate(), 'yyyy/MM/dd') 
                            : '讀取中...'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-8">
                        <div>
                          <p className="text-xs text-stone-400 uppercase font-bold tracking-wider mb-1">剩餘堂數</p>
                          <p className={cn("text-2xl font-black", isDual ? "text-purple-700" : "text-emerald-700")}>
                            {activeContract.remainingSessions} / {activeContract.totalSessions}
                          </p>
                          {isDual && <span className="text-[10px] text-purple-400 font-bold">(雙人共享)</span>}
                        </div>
                        <div>
                          <p className="text-xs text-stone-400 uppercase font-bold tracking-wider mb-1">合約期限</p>
                          <p className="text-sm font-bold text-stone-700">
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
                              "gap-1 font-bold",
                              isDual 
                                ? "text-purple-600 hover:text-purple-700 hover:bg-purple-100/50" 
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50"
                            )}
                          >
                            檢視完整合約 <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="bg-stone-100 border border-dashed border-stone-300 rounded-2xl p-8 text-center">
                  <p className="text-stone-500 font-medium mb-3">目前沒有進行中的合約</p>
                  <Button variant="outline" size="sm" onClick={() => onCreateContract(customer)}>
                    立即新增合約
                  </Button>
                </div>
              )}

              {/* Basic Info Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <User className="w-3 h-3" /> 基本資訊
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-sm">電子郵件</span>
                      <span className="text-stone-900 text-sm font-medium">{customer.email || '未提供'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-sm">出生日期</span>
                      <span className="text-stone-900 text-sm font-medium">
                        {customer.dateOfBirth instanceof Timestamp 
                          ? format(customer.dateOfBirth.toDate(), 'yyyy/MM/dd') 
                          : '未知'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-sm">歷史總堂數</span>
                      <span className="text-stone-900 text-sm font-medium">{customer.historicalSessions} 堂</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3" /> 緊急聯絡人
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-sm">聯絡姓名</span>
                      <span className="text-stone-900 text-sm font-medium">{customer.emergencyContact.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-sm">關係</span>
                      <span className="text-stone-900 text-sm font-medium">{customer.emergencyContact.relation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-400 text-sm">聯絡電話</span>
                      <span className="text-stone-900 text-sm font-medium">{customer.emergencyContact.phone}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contracts" className="mt-0">
              <div className="space-y-4">
                {contracts.length === 0 ? (
                  <p className="text-center py-12 text-stone-400 italic">查無合約歷史紀錄</p>
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
                        className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:border-brand-300 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            contract.status === 'active' 
                              ? (isContractDual ? 'bg-purple-50 text-purple-600' : 'bg-emerald-50 text-emerald-600') 
                              : 'bg-stone-50 text-stone-400'
                          }`}>
                            <FileText className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="font-bold text-stone-900">{contract.totalSessions} 堂課程合約</h5>
                              <Badge 
                                variant={contract.status === 'active' ? 'default' : 'secondary'} 
                                className={cn(
                                  "text-[10px] py-0",
                                  contract.status === 'active' && isContractDual && "bg-purple-500 hover:bg-purple-600"
                                )}
                              >
                                {contract.status === 'active' ? '進行中' : '已結束'}
                              </Badge>
                              {isContractDual && (
                                <Badge variant="outline" className="bg-stone-100 text-stone-800 border-stone-200 text-[10px] py-0 px-2 h-5 flex items-center gap-1">
                                  <RiGroupLine className="w-3 h-3 text-orange-500" /> 雙人合約
                                </Badge>
                              )}
                              {isContractDual && partnerName && (
                                <span className="text-[10px] text-purple-400 font-bold">
                                  (共享人: {partnerName})
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500 mt-1">
                              效期：{contract.startDate instanceof Timestamp ? format(contract.startDate.toDate(), 'yyyy/MM/dd') : '...'} ~ {contract.endDate instanceof Timestamp ? format(contract.endDate.toDate(), 'yyyy/MM/dd') : '...'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <div className="hidden sm:block">
                            <p className="text-xs text-stone-400 font-bold uppercase tracking-tighter">剩餘</p>
                            <p className="font-black text-stone-900">{contract.remainingSessions} 堂</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-brand-500 transition-colors" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="medical" className="mt-0">
              <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-8">
                <section>
                  <h4 className="text-sm font-bold text-stone-900 mb-4 border-l-4 border-brand-500 pl-3">慢性病史</h4>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalHistory.chronicConditions.length > 0 ? (
                      customer.medicalHistory.chronicConditions.map((cond, i) => (
                        <Badge key={i} variant="outline" className="bg-stone-50 border-stone-200 text-stone-600">{cond}</Badge>
                      ))
                    ) : (
                      <span className="text-stone-400 text-sm italic">無相關紀錄</span>
                    )}
                  </div>
                </section>
                
                <section>
                  <h4 className="text-sm font-bold text-stone-900 mb-4 border-l-4 border-brand-500 pl-3">受傷紀錄</h4>
                  <div className="flex flex-wrap gap-2">
                    {customer.medicalHistory.injuries.length > 0 ? (
                      customer.medicalHistory.injuries.map((inj, i) => (
                        <Badge key={i} variant="outline" className="bg-red-50 border-red-100 text-red-600">{inj}</Badge>
                      ))
                    ) : (
                      <span className="text-stone-400 text-sm italic">無相關紀錄</span>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-bold text-stone-900 mb-4 border-l-4 border-brand-500 pl-3">備註事項</h4>
                  <p className="text-stone-600 text-sm leading-relaxed bg-stone-50 p-4 rounded-xl border border-stone-100">
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
