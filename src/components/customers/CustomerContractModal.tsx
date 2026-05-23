import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { format } from 'date-fns'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Customer, Contract } from '../../types'
import { Printer, X } from 'lucide-react'
import { Button } from '../ui/button'

interface CustomerContractModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  contract: Contract | null
}

export function CustomerContractModal({
  open,
  onOpenChange,
  customer,
  contract,
}: CustomerContractModalProps) {
  const [partner, setPartner] = React.useState<Customer | null>(null)

  React.useEffect(() => {
    const fetchPartner = async () => {
      if (!contract || !customer) {
        setPartner(null)
        return
      }
      const isDual = contract.contractType === 'dual' || contract.sharedWithCustomerId
      if (!isDual) {
        setPartner(null)
        return
      }
      const partnerId = contract.customerIds && contract.customerIds.length > 1
        ? contract.customerIds.find(id => id !== customer.id)
        : contract.sharedWithCustomerId
        
      if (partnerId) {
        try {
          const docSnap = await getDoc(doc(db, 'customers', partnerId))
          if (docSnap.exists()) {
            setPartner({ id: docSnap.id, ...docSnap.data() } as Customer)
          }
        } catch (err) {
          console.error('Error fetching partner in contract modal:', err)
        }
      }
    }
    fetchPartner()
  }, [contract, customer, open])

  if (!customer) return null

  const handlePrint = () => {
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden border-none bg-stone-100 shadow-2xl flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 pr-14 py-4 bg-white border-b border-stone-200 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-stone-800">客戶合約檢視</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              列印合約
            </Button>
          </div>
        </div>

          <div className="flex-1 bg-stone-100 p-8 overflow-y-auto print:p-0 print:bg-white">
            <div className="max-w-[210mm] mx-auto bg-white shadow-sm border border-stone-200 p-12 print:shadow-none print:border-none min-h-[297mm] flex flex-col">
              {/* Logo & Header */}
              <div className="flex flex-col items-center mb-10 text-center">
                <img src="/assets/logos/on-light/logo.png" alt="R27 Logo" className="w-48 h-auto mb-4" />
                <h1 className="text-3xl font-black text-stone-900 tracking-tight mb-1">R27 FITNESS STATION</h1>
                <p className="text-stone-500 font-medium tracking-[0.2em] text-xs uppercase">健身教練服務定型化契約</p>
              </div>

              {/* Contract Metadata */}
              <div className="grid grid-cols-2 gap-8 mb-8 pb-8 border-b-2 border-stone-100">
                <div className="space-y-4">
                  <h3 className="font-bold text-stone-900 text-sm border-l-4 border-brand-500 pl-3">
                    甲方（學員資訊）
                    {partner && <span className="ml-1 text-xs text-purple-600 font-bold">(雙人共享合約)</span>}
                  </h3>
                  
                  {/* Primary Customer */}
                  <div className="space-y-1">
                    {partner && <p className="text-[9px] text-stone-400 font-bold tracking-wider">【學員 A - 主簽署人】</p>}
                    <div className="grid grid-cols-3 gap-1 text-sm">
                      <span className="text-stone-400 font-medium">姓名</span>
                      <span className="col-span-2 text-stone-900 font-bold">{customer.name}</span>
                      <span className="text-stone-400 font-medium">電話</span>
                      <span className="col-span-2 text-stone-900 font-bold">{customer.phone}</span>
                      <span className="text-stone-400 font-medium">身分證</span>
                      <span className="col-span-2 text-stone-900 font-bold">{customer.idNumber || '──────'}</span>
                      <span className="text-stone-400 font-medium">Email</span>
                      <span className="col-span-2 text-stone-900 font-bold break-all text-xs">{customer.email || '──────'}</span>
                    </div>
                  </div>

                  {/* Partner Customer */}
                  {partner && (
                    <div className="space-y-1 pt-2 border-t border-dashed border-stone-200">
                      <p className="text-[9px] text-purple-500 font-bold tracking-wider">【學員 B - 共享成員】</p>
                      <div className="grid grid-cols-3 gap-1 text-sm">
                        <span className="text-stone-400 font-medium">姓名</span>
                        <span className="col-span-2 text-purple-950 font-bold">{partner.name}</span>
                        <span className="text-stone-400 font-medium">電話</span>
                        <span className="col-span-2 text-stone-900 font-bold">{partner.phone}</span>
                        <span className="text-stone-400 font-medium">身分證</span>
                        <span className="col-span-2 text-stone-900 font-bold">{partner.idNumber || '──────'}</span>
                        <span className="text-stone-400 font-medium">Email</span>
                        <span className="col-span-2 text-stone-900 font-bold break-all text-xs">{partner.email || '──────'}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <h3 className="font-bold text-stone-900 text-sm border-l-4 border-stone-300 pl-3">乙方（教練/中心資訊）</h3>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <span className="text-stone-400 font-medium">中心名稱</span>
                    <span className="col-span-2 text-stone-900 font-bold">紅二七健身有限公司</span>
                    <span className="text-stone-400 font-medium">負責人</span>
                    <span className="col-span-2 text-stone-900 font-bold">郭沛霖</span>
                    <span className="text-stone-400 font-medium">客服電話</span>
                    <span className="col-span-2 text-stone-900 font-bold">0905396658</span>
                    <span className="text-stone-400 font-medium">履約地址</span>
                    <span className="col-span-2 text-stone-900 font-bold text-xs leading-relaxed">新北市淡水區中正東路二段68號</span>
                  </div>
                </div>
              </div>

              {/* Contract Terms */}
              <div className="mb-10 flex-1">
                <h3 className="font-bold text-stone-900 text-sm mb-4">服務約定條款</h3>
                <div className="bg-stone-50 rounded-2xl p-6 border border-stone-200 text-[13px] leading-relaxed text-stone-600 space-y-4">
                  <p className="font-bold text-stone-900">第一條（服務內容與異動通知）</p>
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>乙方應依約定提供健身指導服務。</li>
                    <li>乙方所提供服務內容與時間如有異動，應於 24 小時前通知甲方。</li>
                    <li>通知方式：依甲方留存之電話、LINE 或電子郵件通知。</li>
                  </ol>

                  <p className="font-bold text-stone-900">第二條（預約與請假規則）</p>
                  <ol className="list-decimal pl-4 space-y-2">
                    <li>預約制：需事先預約（LINE、電話或電子郵件通知）。</li>
                    <li>請假時限：甲方取消或改期，應於課程開始前 24 小時通知乙方。</li>
                    <li>未依約請假：乙方得視為已上課，並扣除課程堂數。</li>
                  </ol>

                  {contract && (
                    <div className="mt-6 pt-6 border-t border-stone-200">
                      <p className="font-bold text-stone-900 mb-3 underline decoration-brand-500 decoration-2 underline-offset-4">本合約效力範圍</p>
                      <div className="grid grid-cols-2 gap-4 text-stone-900">
                        <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                          <p className="text-[10px] text-stone-400 uppercase font-bold mb-1">合約堂數</p>
                          <p className="text-lg font-black">{contract.totalSessions} 堂</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                          <p className="text-[10px] text-stone-400 uppercase font-bold mb-1">有效期限</p>
                          <p className="text-sm font-bold">
                            {format(contract.startDate.toDate(), 'yyyy/MM/dd')} - {format(contract.endDate.toDate(), 'yyyy/MM/dd')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Signature Section */}
              <div className="mt-auto pt-8 border-t-2 border-stone-900 flex justify-between items-end shrink-0">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-xs text-stone-400 uppercase font-bold tracking-widest">乙方蓋印</p>
                    <div className="w-32 h-32 border-2 border-brand-200 rounded-full flex items-center justify-center relative">
                      <div className="text-brand-500 font-bold text-center leading-tight border-2 border-brand-500 rounded-full w-24 h-24 flex flex-col items-center justify-center rotate-[-15deg]">
                        <span className="text-[10px]">R27 Fitness</span>
                        <span className="text-sm">合約專用章</span>
                        <span className="text-[8px]">{format(new Date(), 'yyyy.MM.dd')}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex gap-8 items-end">
                    {/* Primary Signature */}
                    <div className="space-y-2 text-right">
                      <p className="text-xs text-stone-400 uppercase font-bold tracking-widest">
                        {partner ? '甲方學員 A 簽署' : '甲方簽署確認'}
                      </p>
                      <div className="min-w-[180px] h-24 border-b-2 border-stone-200 flex items-center justify-end">
                        {contract?.signatureDataUrl ? (
                          <img src={contract.signatureDataUrl} alt="Signature A" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                        ) : (
                          <span className="text-stone-300 italic text-[11px]">( 尚未簽署 )</span>
                        )}
                      </div>
                    </div>

                    {/* Secondary Signature */}
                    {partner && (
                      <div className="space-y-2 text-right">
                        <p className="text-xs text-purple-400 uppercase font-bold tracking-widest">甲方學員 B 簽署</p>
                        <div className="min-w-[180px] h-24 border-b-2 border-stone-200 flex items-center justify-end">
                          {contract?.secondarySignatureDataUrl ? (
                            <img src={contract.secondarySignatureDataUrl} alt="Signature B" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                          ) : (
                            <span className="text-stone-300 italic text-[11px]">( 尚未簽署 )</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 text-right">簽署日期：{contract?.createdAt ? format(contract.createdAt.toDate(), 'yyyy/MM/dd HH:mm') : format(new Date(), 'yyyy/MM/dd')}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-stone-100 text-[10px] text-stone-400 flex justify-between">
                <span>R27 Fitness Station 客戶存查聯</span>
                <span>頁碼 1 / 1</span>
              </div>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  )
}
