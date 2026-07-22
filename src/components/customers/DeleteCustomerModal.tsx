import React, { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { AlertTriangle, Trash2, ShieldAlert, ArrowRight, User, Users, FileText } from 'lucide-react'
import type { Customer, Contract } from '../../types'
import { cn } from '../../lib/utils'

interface DeleteCustomerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  contracts: Contract[]
  customers: Customer[]
  onConfirmDelete: (customerId: string) => Promise<void>
}

export function DeleteCustomerModal({
  open,
  onOpenChange,
  customer,
  contracts,
  customers,
  onConfirmDelete,
}: DeleteCustomerModalProps) {
  const [loading, setLoading] = useState(false)

  // Customer map lookup
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>()
    customers.forEach((c) => map.set(c.id, c))
    return map
  }, [customers])

  // Linked Contracts Analysis
  const contractAnalysis = useMemo(() => {
    if (!customer) return { singleContracts: [], dualContracts: [] }

    const linked = contracts.filter((c) => {
      const isPrimary = c.customerId === customer.id || c.primaryCustomerId === customer.id
      const isShared = c.sharedWithCustomerId === customer.id || c.partnerId === customer.id
      const isInIds = Array.isArray(c.customerIds) && c.customerIds.includes(customer.id)
      return isPrimary || isShared || isInIds
    })

    const singleContracts: Contract[] = []
    const dualContracts: { contract: Contract; partnerName: string }[] = []

    linked.forEach((c) => {
      const isDual =
        c.contractType === 'dual' ||
        Boolean(c.sharedWithCustomerId) ||
        Boolean(c.partnerId) ||
        (c.customerIds && c.customerIds.length > 1)

      if (isDual) {
        let partnerId: string | null = null
        if (c.customerId !== customer.id && c.customerId) {
          partnerId = c.customerId
        } else if (c.sharedWithCustomerId && c.sharedWithCustomerId !== customer.id) {
          partnerId = c.sharedWithCustomerId
        } else if (c.partnerId && c.partnerId !== customer.id) {
          partnerId = c.partnerId
        } else if (c.customerIds && Array.isArray(c.customerIds)) {
          partnerId = c.customerIds.find((id) => id !== customer.id) || null
        }

        const partnerName = partnerId ? customerMap.get(partnerId)?.name || '合夥學員' : '合夥學員'
        dualContracts.push({ contract: c, partnerName })
      } else {
        singleContracts.push(c)
      }
    })

    return { singleContracts, dualContracts }
  }, [customer, contracts, customerMap])

  const handleDelete = async () => {
    if (!customer) return
    setLoading(true)
    try {
      await onConfirmDelete(customer.id)
      onOpenChange(false)
    } catch (err) {
      console.error('Delete customer error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!customer) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-stone-200">
        {/* Header Icon */}
        <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
          <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <DialogTitle className="text-lg font-black text-stone-900">
              確定刪除客戶「{customer.name}」？
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-500 mt-0.5">
              此操作無法復原，請確認受影響的連帶合約處理方式
            </DialogDescription>
          </div>
        </div>

        {/* Customer Profile Summary */}
        <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-200/60 my-3 flex items-center justify-between text-xs">
          <div>
            <p className="font-bold text-stone-900">{customer.name}</p>
            <p className="text-stone-500 font-mono text-[11px] mt-0.5">{customer.phone || '未提供電話'}</p>
          </div>
          <span className="text-[10px] font-bold bg-stone-200/80 text-stone-700 px-2 py-0.5 rounded-md">
            ID: {customer.id.slice(0, 8)}
          </span>
        </div>

        {/* Linked Contract Impacts */}
        <div className="space-y-2.5 my-3 text-xs">
          <p className="font-bold text-stone-800 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-orange-500" />
            系統自動整合邏輯：
          </p>

          {/* Impact 1: Single Contracts Deletion */}
          <div className="p-3 bg-red-50/60 border border-red-200/60 rounded-xl space-y-1">
            <div className="flex items-center justify-between font-bold text-red-950">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-600" />
                單人合約處理
              </span>
              <span className="text-red-700 bg-red-100 px-2 py-0.2 rounded text-[10px]">
                共 {contractAnalysis.singleContracts.length} 筆
              </span>
            </div>
            <p className="text-[11px] text-red-700">
              {contractAnalysis.singleContracts.length > 0
                ? `包含編號 [${contractAnalysis.singleContracts.map((c) => c.contractNo || '未命名').join(', ')}] 等單人合約將被一併移除。`
                : '該學員目前無獨立持有的單人合約。'}
            </p>
          </div>

          {/* Impact 2: Dual Contracts Conversion to Single */}
          <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-xl space-y-1">
            <div className="flex items-center justify-between font-bold text-amber-950">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-amber-600" />
                雙人合約轉單人
              </span>
              <span className="text-amber-800 bg-amber-100 px-2 py-0.2 rounded text-[10px]">
                共 {contractAnalysis.dualContracts.length} 筆
              </span>
            </div>
            <p className="text-[11px] text-amber-800">
              {contractAnalysis.dualContracts.length > 0 ? (
                <span>
                  雙人合約將解鎖為單人合約，由合夥夥伴獨自持有：
                  <span className="block font-bold mt-1 text-amber-900">
                    {contractAnalysis.dualContracts
                      .map((d) => `• 合約 ${d.contract.contractNo || ''} ➔ 轉為 ${d.partnerName} 獨自持有`)
                      .join('\n')}
                  </span>
                </span>
              ) : (
                '該學員目前無進行中的雙人共享合約。'
              )}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-xs font-bold rounded-xl px-4 py-2"
          >
            取消
          </Button>
          <Button
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl px-4 py-2 flex items-center gap-1.5 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? '刪除處理中...' : '確認刪除客戶'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
