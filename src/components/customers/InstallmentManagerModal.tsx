import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { format } from 'date-fns'
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Customer, Contract } from '../../types'
import { CheckCircle2, RotateCcw, Check, X } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'

interface InstallmentManagerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: Contract | null
  customer: Customer | null
  onUpdated?: () => void
}

interface InstallmentItem {
  id: string
  amount: number
  dueDate: Timestamp | Date | string | null | undefined
  paidDate?: Timestamp | Date | string | null | undefined
  status: 'paid' | 'pending' | 'overdue'
}

const formatInstallmentDate = (d: Timestamp | Date | string | null | undefined) => {
  if (!d) return ''
  if (d instanceof Timestamp) {
    return format(d.toDate(), 'yyyy-MM-dd')
  }
  if (d && typeof d === 'object' && 'toDate' in d) {
    const hasToDate = d as { toDate: () => Date }
    if (typeof hasToDate.toDate === 'function') {
      return format(hasToDate.toDate(), 'yyyy-MM-dd')
    }
  }
  const parsed = new Date(d as Date | string)
  if (isNaN(parsed.getTime())) return ''
  return format(parsed, 'yyyy-MM-dd')
}

export function InstallmentManagerModal({
  open,
  onOpenChange,
  contract,
  customer,
  onUpdated,
}: InstallmentManagerModalProps) {
  const [installments, setInstallments] = useState<InstallmentItem[]>([])
  const [loading, setLoading] = useState(false)

  // Sync internal state when contract changes
  useEffect(() => {
    if (contract && open) {
      const mapped = (contract.installments || []).map((inst: InstallmentItem) => ({
        id: inst.id,
        amount: inst.amount,
        dueDate: inst.dueDate,
        paidDate: inst.paidDate,
        status: inst.status,
      }))
      const timer = setTimeout(() => {
        setInstallments(mapped)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [contract, open])

  if (!contract || !customer) return null

  const totalAmount = contract.totalAmount || 0
  
  // Calculate dynamically from state
  const paidAmount = installments
    .filter(inst => inst.status === 'paid')
    .reduce((sum, inst) => sum + Number(inst.amount), 0)
  
  const pendingAmount = totalAmount - paidAmount

  const handleToggleInstallmentStatus = async (instId: string, action: 'pay' | 'refund') => {
    setLoading(true)
    try {
      const updatedInstallments = installments.map((inst) => {
        if (inst.id === instId) {
          if (action === 'pay') {
            return {
              ...inst,
              status: 'paid' as const,
              paidDate: Timestamp.now(),
            }
          } else {
            return {
              ...inst,
              status: 'pending' as const,
              paidDate: null,
            }
          }
        }
        return inst
      })

      // Recalculate paidAmount
      const newPaidAmount = updatedInstallments
        .filter(inst => inst.status === 'paid')
        .reduce((sum, inst) => sum + Number(inst.amount), 0)

      // Update Firestore
      const contractRef = doc(db, 'contracts', contract.id)
      await updateDoc(contractRef, {
        paidAmount: newPaidAmount,
        installments: updatedInstallments,
        updatedAt: serverTimestamp(),
      })

      // Update local state
      setInstallments(updatedInstallments)
      
      if (onUpdated) {
        onUpdated()
      }
    } catch (err) {
      console.error('Error updating installment payment:', err)
      alert('更新分期付款狀態失敗，請稍後再試。')
    } finally {
      setLoading(false)
    }
  }

  const paidCount = installments.filter(inst => inst.status === 'paid').length
  const totalCount = installments.length
  const pendingCount = totalCount - paidCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 rounded-3xl bg-stone-50 border border-stone-200 shadow-2xl flex flex-col gap-6 overflow-hidden">
        {/* Header */}
        <DialogHeader className="relative flex flex-row items-center gap-3 pr-8 shrink-0">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold text-stone-900">分期收款管理</DialogTitle>
          </div>
        </DialogHeader>

        {/* Customer & Contract Summary */}
        <div className="bg-white rounded-2xl border border-stone-200/60 p-4 space-y-2.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-stone-400 font-medium">客戶姓名</span>
            <span className="font-bold text-stone-850">{customer.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-400 font-medium">合約編號</span>
            <span className="font-mono font-bold text-red-800/90 text-xs">
              {contract.contractNo || contract.id}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-stone-100 pt-2.5">
            <span className="text-stone-400 font-medium">合約總額</span>
            <span className="font-black text-stone-900">NT$ {totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-400 font-medium">待收金額</span>
            <span className="font-black text-red-500">NT$ {pendingAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-400 font-medium">已收金額</span>
            <span className="font-black text-green-600">NT$ {paidAmount.toLocaleString()}</span>
          </div>
        </div>

        {/* Installments List */}
        <div className="flex-1 overflow-y-auto space-y-3 max-h-[35vh] pr-1">
          {installments.map((inst, idx) => {
            const isPaid = inst.status === 'paid'
            return (
              <div 
                key={inst.id || idx}
                className="bg-white rounded-2xl border border-stone-200/60 p-4 flex items-center justify-between gap-4 transition-all"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-850 text-sm">第 {idx + 1} 期</span>
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold",
                      isPaid 
                        ? "bg-green-50 text-green-700 border border-green-150" 
                        : "bg-amber-50 text-amber-700 border border-amber-150"
                    )}>
                      {isPaid ? '已收款' : '待收款'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-stone-400">
                    NT$ {inst.amount.toLocaleString()} | 應收 : {formatInstallmentDate(inst.dueDate)}
                  </p>
                </div>

                <div>
                  {isPaid ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() => handleToggleInstallmentStatus(inst.id, 'refund')}
                      className="h-8 text-xs font-bold text-stone-600 border-stone-200 hover:bg-stone-50 gap-1 rounded-xl"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      撤銷收款
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={loading}
                      onClick={() => handleToggleInstallmentStatus(inst.id, 'pay')}
                      className="h-8 text-xs font-bold bg-green-600 hover:bg-green-700 text-white gap-1 rounded-xl shadow-sm hover:shadow-md transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      確認收款
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Summary */}
        <div className="flex justify-between items-center text-xs font-bold text-stone-500 border-t border-stone-200/60 pt-4 shrink-0">
          <span>
            已收 {paidCount} 期 / 共 {totalCount} 期（待收 {pendingCount} 期）
          </span>
          <span className="text-stone-700">
            已收金額：NT$ {paidAmount.toLocaleString()}
          </span>
        </div>

        {/* Close button */}
        <Button 
          onClick={() => onOpenChange(false)}
          className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl font-bold text-sm shrink-0"
        >
          關閉
        </Button>
      </DialogContent>
    </Dialog>
  )
}
