import React from 'react'
import {
  Dialog,
  DialogContent,
} from '../ui/dialog'
import { format } from 'date-fns'
import { doc, getDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Customer, Contract } from '../../types'
import { Printer, X, Edit2, Trash2, Save, Plus, Trash, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useAuthStore } from '@/stores/authStore'

interface CustomerContractModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
  contract: Contract | null
  onContractUpdated?: () => void
}

const toDateString = (d: any) => {
  if (!d) return ''
  if (d.toDate && typeof d.toDate === 'function') {
    return d.toDate().toISOString().split('T')[0]
  }
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return ''
  return parsed.toISOString().split('T')[0]
}

export function CustomerContractModal({
  open,
  onOpenChange,
  customer,
  contract,
  onContractUpdated,
}: CustomerContractModalProps) {
  const [partner, setPartner] = React.useState<Customer | null>(null)
  
  // Admin & Editing states
  const { isAdmin } = useAuthStore()
  const [isEditing, setIsEditing] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  
  // Local edit states
  const [editTotalSessions, setEditTotalSessions] = React.useState<number>(0)
  const [editRemainingSessions, setEditRemainingSessions] = React.useState<number>(0)
  const [editTotalAmount, setEditTotalAmount] = React.useState<number>(0)
  const [editPaidAmount, setEditPaidAmount] = React.useState<number>(0)
  const [editStartDate, setEditStartDate] = React.useState<string>('')
  const [editEndDate, setEditEndDate] = React.useState<string>('')
  const [editPaymentType, setEditPaymentType] = React.useState<'single' | 'installments'>('single')
  const [editInstallmentCount, setEditInstallmentCount] = React.useState<number>(2)
  const [editInstallments, setEditInstallments] = React.useState<any[]>([])

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

  // Sync edit state
  React.useEffect(() => {
    if (contract && open) {
      setEditTotalSessions(contract.totalSessions || 0)
      setEditRemainingSessions(contract.remainingSessions || 0)
      setEditTotalAmount(contract.totalAmount || 0)
      setEditPaidAmount(contract.paidAmount || 0)
      setEditStartDate(toDateString(contract.startDate))
      setEditEndDate(toDateString(contract.endDate))
      setEditPaymentType(contract.paymentType || 'single')
      setEditInstallmentCount(contract.installmentCount || 2)
      
      const mappedInsts = (contract.installments || []).map((inst: any) => ({
        id: inst.id,
        amount: inst.amount,
        dueDate: toDateString(inst.dueDate),
        paidDate: toDateString(inst.paidDate),
        status: inst.status,
      }))
      setEditInstallments(mappedInsts)
    }
    if (!open) {
      setIsEditing(false)
      setIsDeleting(false)
    }
  }, [contract, open])

  if (!customer) return null

  const handlePrint = () => {
    window.print()
  }

  const handleAutoGenerateInstallments = () => {
    const total = editTotalAmount
    const count = editInstallmentCount
    if (count < 2 || count > 6) return
    const base = Math.floor(total / count)
    const remainder = total - base * count
    const amounts = Array(count).fill(base)
    for (let i = 0; i < remainder; i++) {
      amounts[i] += 1
    }
    
    const startD = editStartDate ? new Date(editStartDate) : new Date()
    const newInsts = Array.from({ length: count }, (_, idx) => {
      const d = new Date(startD)
      d.setMonth(d.getMonth() + idx)
      return {
        id: `inst-${idx + 1}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: amounts[idx],
        dueDate: d.toISOString().split('T')[0],
        paidDate: idx === 0 ? new Date().toISOString().split('T')[0] : '',
        status: idx === 0 ? 'paid' as const : 'pending' as const,
      }
    })
    setEditInstallments(newInsts)
  }

  const getValidationErrors = () => {
    const errors: string[] = []
    if (editTotalSessions <= 0) {
      errors.push('合約總堂數必須大於 0')
    }
    if (editRemainingSessions < 0) {
      errors.push('剩餘堂數不能為負數')
    }
    if (!editStartDate || !editEndDate) {
      errors.push('請選擇合約開始與結束日期')
    } else if (new Date(editStartDate) > new Date(editEndDate)) {
      errors.push('結束日期不能早於開始日期')
    }
    if (editPaymentType === 'installments') {
      if (editInstallments.length < 2 || editInstallments.length > 6) {
        errors.push('分期期數必須在 2 到 6 期之間')
      }
      const sum = editInstallments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
      if (Math.abs(sum - editTotalAmount) > 0.01) {
        errors.push(`分期總金額 (${sum.toLocaleString()} 元) 必須等於合約總金額 (${editTotalAmount.toLocaleString()} 元)`)
      }
      // Check due dates order
      for (let i = 0; i < editInstallments.length - 1; i++) {
        const curD = editInstallments[i].dueDate
        const nextD = editInstallments[i + 1].dueDate
        if (curD && nextD && new Date(curD) > new Date(nextD)) {
          errors.push(`第 ${i + 2} 期的應繳日期不能早於第 ${i + 1} 期`)
        }
      }
    }
    return errors
  }

  const handleSaveChanges = async () => {
    const errors = getValidationErrors()
    if (errors.length > 0) {
      alert(errors.join('\n'))
      return
    }
    
    if (!contract) return
    
    try {
      const contractRef = doc(db, 'contracts', contract.id)
      
      let finalPaidAmount = editPaidAmount
      let finalInstallments = []
      if (editPaymentType === 'installments') {
        finalPaidAmount = editInstallments
          .filter(inst => inst.status === 'paid')
          .reduce((acc, curr) => acc + Number(curr.amount), 0)
          
        finalInstallments = editInstallments.map((inst: any) => ({
          id: inst.id,
          amount: Number(inst.amount),
          status: inst.status,
          dueDate: Timestamp.fromDate(new Date(inst.dueDate)),
          paidDate: inst.status === 'paid' && inst.paidDate ? Timestamp.fromDate(new Date(inst.paidDate)) : null,
        }))
      }
      
      const updateData = {
        totalSessions: Number(editTotalSessions),
        remainingSessions: Number(editRemainingSessions),
        totalAmount: Number(editTotalAmount),
        paidAmount: finalPaidAmount,
        startDate: Timestamp.fromDate(new Date(editStartDate)),
        endDate: Timestamp.fromDate(new Date(editEndDate)),
        paymentType: editPaymentType,
        installmentCount: editPaymentType === 'installments' ? editInstallments.length : 1,
        installments: finalInstallments,
        updatedAt: serverTimestamp(),
      }
      
      await updateDoc(contractRef, updateData)
      setIsEditing(false)
      if (onContractUpdated) onContractUpdated()
      alert('合約更新成功！')
    } catch (err: any) {
      console.error('Error updating contract:', err)
      alert('儲存合約時發生錯誤：' + err.message)
    }
  }

  const handleDeleteContract = async () => {
    if (!contract) return
    
    try {
      const contractRef = doc(db, 'contracts', contract.id)
      await deleteDoc(contractRef)
      setIsDeleting(false)
      setIsEditing(false)
      onOpenChange(false)
      if (onContractUpdated) onContractUpdated()
      alert('合約已成功刪除！')
    } catch (err: any) {
      console.error('Error deleting contract:', err)
      alert('刪除合約時發生錯誤：' + err.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] p-0 overflow-hidden border-none bg-stone-100 shadow-2xl flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 pr-14 py-4 bg-white border-b border-stone-200 print:hidden shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-stone-800">
              {isEditing ? '編輯合約與付款設定' : '客戶合約檢視'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin() && !isDeleting && (
              <>
                <Button
                  variant={isEditing ? "outline" : "default"}
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="gap-1.5 text-xs font-bold"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  {isEditing ? '取消編輯' : '編輯合約'}
                </Button>
                
                {isEditing && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleting(true)}
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    刪除合約
                  </Button>
                )}
              </>
            )}
            
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 text-xs font-bold">
                <Printer className="w-4 h-4" />
                列印合約
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 bg-stone-100 p-8 overflow-y-auto print:p-0 print:bg-white">
          {isDeleting ? (
            <div className="bg-white max-w-[210mm] mx-auto shadow-sm border border-stone-200 p-12 rounded-2xl text-center space-y-6 flex flex-col justify-center items-center min-h-[300px]">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-600 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-stone-900">確認要刪除此合約嗎？</h3>
                <p className="text-sm text-stone-500 max-w-md">
                  此動作將永久從系統中移除此學員的合約記錄與所有繳費狀態，且無法復原。
                </p>
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setIsDeleting(false)} className="px-6 rounded-full font-bold">
                  取消
                </Button>
                <Button variant="destructive" onClick={handleDeleteContract} className="px-6 rounded-full font-bold shadow-lg shadow-red-100">
                  確定永久刪除
                </Button>
              </div>
            </div>
          ) : isEditing ? (
            /* Editing Layout */
            <div className="max-w-[210mm] mx-auto bg-white shadow-sm border border-stone-200 p-12 rounded-2xl flex flex-col space-y-8">
              <div className="border-b border-stone-100 pb-4 flex justify-between items-center">
                <div>
                  <h3 className="font-black text-lg text-stone-900">修改合約內容</h3>
                  <p className="text-xs text-stone-400">所有修改儲存後將即時套用至該學員檔案中</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="rounded-full">
                    取消
                  </Button>
                  <Button size="sm" onClick={handleSaveChanges} className="bg-stone-900 hover:bg-stone-800 text-white rounded-full gap-1.5 shadow-md">
                    <Save className="w-4 h-4" /> 儲存修改
                  </Button>
                </div>
              </div>

              {/* Edit Form Fields */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-600 block">合約總堂數 *</label>
                  <Input 
                    type="number" 
                    value={editTotalSessions} 
                    onChange={e => setEditTotalSessions(Number(e.target.value))} 
                    className="bg-stone-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-600 block">剩餘堂數 *</label>
                  <Input 
                    type="number" 
                    value={editRemainingSessions} 
                    onChange={e => setEditRemainingSessions(Number(e.target.value))} 
                    className="bg-stone-50"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-600 block">合約開始日期 *</label>
                  <Input 
                    type="date" 
                    value={editStartDate} 
                    onChange={e => setEditStartDate(e.target.value)} 
                    className="bg-stone-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-600 block">合約結束日期 *</label>
                  <Input 
                    type="date" 
                    value={editEndDate} 
                    onChange={e => setEditEndDate(e.target.value)} 
                    className="bg-stone-50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-600 block">付款方式 *</label>
                  <select 
                    value={editPaymentType} 
                    onChange={(e: any) => {
                      const type = e.target.value
                      setEditPaymentType(type)
                      if (type === 'installments' && editInstallments.length === 0) {
                        // Generate placeholders
                        setEditInstallments([
                          { id: `inst-1-${Date.now()}`, amount: Math.floor(editTotalAmount/2), dueDate: editStartDate, paidDate: editStartDate, status: 'paid' },
                          { id: `inst-2-${Date.now()}`, amount: editTotalAmount - Math.floor(editTotalAmount/2), dueDate: editStartDate, paidDate: '', status: 'pending' },
                        ])
                      }
                    }}
                    className="flex h-10 w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-1 text-sm shadow-sm transition-all focus:border-stone-500 focus:outline-none"
                  >
                    <option value="single">一次付清</option>
                    <option value="installments">分期付款</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-600 block">合約總金額 *</label>
                  <Input 
                    type="number" 
                    value={editTotalAmount} 
                    onChange={e => setEditTotalAmount(Number(e.target.value))} 
                    className="bg-stone-50"
                  />
                </div>

                {editPaymentType === 'single' && (
                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-stone-600 block">已收付金額 *</label>
                    <Input 
                      type="number" 
                      value={editPaidAmount} 
                      onChange={e => setEditPaidAmount(Number(e.target.value))} 
                      className="bg-stone-50"
                    />
                  </div>
                )}
              </div>

              {/* Installments configuration */}
              {editPaymentType === 'installments' && (
                <div className="border-t border-stone-100 pt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-extrabold text-sm text-stone-900">分期繳款設定</h4>
                      <p className="text-[10px] text-stone-400">自由調配每期金額與收款進度</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <label className="text-[11px] font-bold text-stone-500">預期期數</label>
                      <select 
                        value={editInstallmentCount} 
                        onChange={e => setEditInstallmentCount(Number(e.target.value))}
                        className="rounded border border-stone-200 bg-white text-xs px-2 py-1 focus:outline-none"
                      >
                        {[2,3,4,5,6].map(n => <option key={n} value={n}>{n} 期</option>)}
                      </select>
                      <Button variant="outline" size="sm" onClick={handleAutoGenerateInstallments} className="h-8 text-xs font-bold gap-1">
                        <RefreshCw className="w-3 h-3" /> 重設平均分期
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {editInstallments.map((inst, idx) => (
                      <div key={inst.id} className="grid grid-cols-12 gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200/50 items-end hover:border-stone-300 transition-colors">
                        <div className="col-span-2 flex flex-col justify-center">
                          <span className="text-[10px] font-bold text-stone-400 block mb-1">期別</span>
                          <span className="font-black text-stone-800 text-sm">第 {idx + 1} 期</span>
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] font-bold text-stone-400 block mb-1">應繳金額 *</label>
                          <Input 
                            type="number" 
                            value={inst.amount} 
                            onChange={e => {
                              const copy = [...editInstallments]
                              copy[idx].amount = Number(e.target.value)
                              setEditInstallments(copy)
                            }} 
                            className="h-9 text-xs bg-white" 
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] font-bold text-stone-400 block mb-1">應繳日期 *</label>
                          <Input 
                            type="date" 
                            value={inst.dueDate} 
                            onChange={e => {
                              const copy = [...editInstallments]
                              copy[idx].dueDate = e.target.value
                              setEditInstallments(copy)
                            }} 
                            className="h-9 text-xs bg-white" 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-stone-400 block mb-1">收款狀態</label>
                          <select 
                            value={inst.status} 
                            onChange={(e: any) => {
                              const val = e.target.value
                              const copy = [...editInstallments]
                              copy[idx].status = val
                              if (val === 'paid' && !copy[idx].paidDate) {
                                copy[idx].paidDate = new Date().toISOString().split('T')[0]
                              }
                              setEditInstallments(copy)
                            }}
                            className="flex h-9 w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-xs shadow-sm focus:outline-none"
                          >
                            <option value="pending">待收</option>
                            <option value="paid">已收</option>
                            <option value="overdue">逾期</option>
                          </select>
                        </div>
                        <div className="col-span-2 flex items-center gap-1.5 justify-end">
                          {inst.status === 'paid' && (
                            <div className="flex-1">
                              <label className="text-[9px] font-bold text-stone-400 block mb-1">實收日期</label>
                              <Input 
                                type="date" 
                                value={inst.paidDate} 
                                onChange={e => {
                                  const copy = [...editInstallments]
                                  copy[idx].paidDate = e.target.value
                                  setEditInstallments(copy)
                                }} 
                                className="h-9 text-[10px] bg-white px-1" 
                              />
                            </div>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              setEditInstallments(editInstallments.filter((_, i) => i !== idx))
                            }} 
                            className="h-9 w-9 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl"
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setEditInstallments([...editInstallments, {
                        id: `inst-added-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        amount: 0,
                        dueDate: new Date().toISOString().split('T')[0],
                        paidDate: '',
                        status: 'pending',
                      }])
                    }} 
                    className="w-full border-dashed gap-1.5 h-10 hover:bg-stone-50 rounded-xl"
                  >
                    <Plus className="w-4 h-4" /> 新增一期分期
                  </Button>

                  {/* Warning message if amounts don't match */}
                  {(() => {
                    const sum = editInstallments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
                    const diff = sum - editTotalAmount
                    return Math.abs(diff) > 0.01 ? (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 font-bold flex items-center gap-2.5 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        <span>目前各期分期加總為 NT$ {sum.toLocaleString()}，與合約總金額 NT$ {editTotalAmount.toLocaleString()} 不符，相差 {diff.toLocaleString()} 元。</span>
                      </div>
                    ) : (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-xs text-green-700 font-bold flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span>分期加總符合合約總金額！</span>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ) : (
            /* Original Contract Document Layout (Read-Only) */
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
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 text-[11px] print:max-h-none print:overflow-visible print:pr-0 border-b border-stone-200 pb-4">
                    <div className="text-center font-bold text-stone-700 pb-2 mb-2 text-xs border-b border-stone-150">
                      (以下內容請列印於第二頁之後，作為合約附件)
                      <br />
                      R27 Fitness 健身教練服務定型化契約條款
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第一條（服務內容與異動通知）</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>乙方應依約定提供健身指導服務。</li>
                        <li>乙方所提供服務內容與時間如有異動，應於 24小時前 通知甲方。</li>
                        <li>通知方式：依甲方留存之電話、LINE 或電子郵件通知，或官方社群網站。</li>
                        <li>若乙方未依約定時間通知，甲方得請求於 7 日內提供同意之補課方案。</li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第二條（預約與請假規則）</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>預約制：需事先預約（LINE、電話或電子郵件通知）</li>
                        <li>請假時限：甲方取消或改期，應於課程開始前 24 小時 通知乙方。（乙方於3日內無償補課）</li>
                        <li>未依約請假：乙方未依前項約定時間方式通知，在限期3日內提供甲方同意之補課方案</li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第三條（課程暫停/請假機制）</p>
                      <p className="pl-1 text-stone-600">甲方若有下列事由之一，提出證明文件後，乙方應於七個工作日內辦理暫停課程期限順延，停權期間免繳課程費用：</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>出國逾一個月。</li>
                        <li>傷害、疾病或身體不適致不宜運動。（未能事先提出者，得於事由發生後一個月內補辦）</li>
                        <li>懷孕、育嬰、侍親之需要。</li>
                        <li>服兵役。</li>
                        <li>職務異動或遷居。</li>
                        <li>其他不可歸責於甲方之事由（如疫情一級開設）。</li>
                        <li>甲方於本條暫停（停權）期間仍具有健身中心會員資格，且於會員期限屆滿仍未完成堂數者，無需補足會籍，得繼續完成剩餘堂數。</li>
                      </ol>
                      <p className="mt-1 pl-1 text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                        <strong>修正註記：</strong>因傷病暫停超過六個月，經醫師證明不能運動者，致需終止契約，甲方得依規定辦理退費，乙方不收取手續費。
                      </p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第四條（退費規定與計算公式）</p>
                      <p className="pl-1 text-stone-600">甲方得隨時通知乙方終止契約，退費標準依法規計算如下：</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>購買後七日內（未上課）：契約生效七日內尚未使用任何課程者，乙方應全額退還。如於7日內使用應適用第二款退費公式。</li>
                        <li>購買後七日以上（或已上課）：若甲方因個人因素欲終止契約，退費金額計算如下：應退金額 ＝ 實繳總金額 －（已使用堂數 × 每堂單價）
                          <ul className="list-disc pl-4 mt-0.5 text-stone-500 text-[10px]">
                            <li>已使用堂數包含：已上課堂數 + 曠課（未依規定請假）堂數。</li>
                            <li>每堂單價定義：契約總金額 ÷ (購買堂數 + 贈送堂數)。(註：贈送堂數一併納入分母計算，以確保消費者退費比例之公平)</li>
                          </ul>
                        </li>
                        <li>明確事先約定逐月分配使用堂數限制者：乙方應就剩餘之堂數乘以每堂平均價退費。但已到期且可歸責於甲方而未使用之堂數，得不予退費。</li>
                        <li>手續費（違約金）：辦理前項退費時，乙方得收取手續費。手續費金額為：應退金額 × 20%（但最高以新臺幣 9,000 元為上限）。</li>
                        <li>贈送課：贈送堂數不得超過總金額之 20%，退費時贈送堂數需一併納入計算。</li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第五條（不可歸責於消費者之終止與效果）</p>
                      <p className="pl-1 text-stone-600">若因下列事由終止契約，乙方應按比例退費，且不得收取手續費或違約金：</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>指定教練無法執行業務（如離職），且甲方不同意替換教練。</li>
                        <li>乙方變更履約地點，未經甲方同意。</li>
                        <li>乙方暫停營業、歇業，或因天災、政府法令等不可抗力因素導致無法履約。</li>
                        <li>甲方因不可歸責事由暫停課程超過一年。</li>
                        <li>累積教練服務契約量（含同一業者不同教練），已達每週平均逾五堂課。</li>
                        <li>退費規定：因前項第一款至第四款終止契約者，乙方不得收取手續費、違約金或任何名目費用。若因第五款（暫停課程超過一年）終止契約者，乙方得酌收手續費 $600。</li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第六條（不可歸責雙方事由之終止與效果）</p>
                      <p className="pl-1 text-stone-600">
                        因天災、戰亂、政府法令之新增或變更等不可抗力或其他不可歸責於雙方當事人之事由，致難以完成本契約之服務時，任何一方得終止契約，乙方應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費用、違約金或任何名目費用。
                      </p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第七條（可歸責消費者-業者終止契約）</p>
                      <p className="pl-1 text-stone-600">
                        甲方於期限屆滿前，得隨時終止。契約期限屆滿後，未使用剩餘堂數，乙方得不予退費。甲方有影響乙方營運之不當行為且情節重大，經勸告無效者，乙方得終止契約，並應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費、違約金或任何名目費用。
                      </p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第八條（可歸責業者事由之終止與效果）</p>
                      <p className="pl-1 text-stone-600">
                        因可歸責於乙方之事由致無法繼續提供約定服務，乙方應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費、違約金 or 任何名目之扣費。前項退費，乙方應準用第四條計算違約金（手續費）之標準，額外支付違約金予甲方。
                      </p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第九條（終止契約之通知及退款方式）</p>
                      <p className="pl-1 text-stone-600">
                        甲方得以書面或雙方事先約定方式（如LINE、電子郵件等）通知終止契約，通知到達乙方時立即生效。乙方應於甲方通知後 15 個「工作日」內，將應退款項擇 □現金 □轉帳 方式退還予甲方（乙方應於簽收或確認後出具證明交予甲方收執）。
                      </p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第十條（贈品約款及其效果）</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>
                          乙方提供對甲方之贈品價值總計新臺幣 ________ 元，包括：
                          <div className="flex gap-4 mt-1 font-semibold text-stone-500">
                            <span>□ 商品：________________</span>
                            <span>□ 課程堂數：____________</span>
                            <span>□ 其他：________________</span>
                          </div>
                        </li>
                        <li>
                          乙方以商品及其他內容為贈品者（其價值不得逾契約總金額百分之二十），於契約終止時，不得向甲方請求返還該贈品，或主張自應返還費用當中扣除該贈品價額。
                        </li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第十一條（契約讓與）</p>
                      <p className="pl-1 text-stone-600">
                        甲方經乙方同意，得將本契約讓與第三人（轉讓）。乙方得向甲方收取轉讓必要費用新台幣600元。
                      </p>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第七條 (消費資訊及廣告)</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>乙方之廣告，均為契約內容。</li>
                        <li>乙方應確保其廣告內容真實，其對甲方所應負義務不得低於前項廣告內容。</li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-bold text-stone-900">第十二條（爭議處理與管轄法院）</p>
                      <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                        <li>本契約未盡事宜，悉依中華民國法律及教育部公告之相關規範辦理。</li>
                        <li>甲乙雙方發生爭議時，甲方得依消費者保護法之規定申訴及申請調解，相關法令、習慣及誠信原則公平解決之。</li>
                        <li>本契約涉訟時，雙方同意以臺灣士林地方法院為第一審管轄法院（因履約地淡水屬士林地院管轄），但不得排除消費者保護法第四十七條及民事訴訟法第四百三十六條之九規定之小額訴訟管轄法院之適用。</li>
                      </ol>
                    </div>

                    <p className="text-right text-[10px] text-stone-400 font-bold mt-2">
                      本契約書一式兩份，甲乙雙方各執一份為憑。
                    </p>
                  </div>

                  {contract && (
                    <div className="mt-6 pt-6 border-t border-stone-200">
                      <p className="font-bold text-stone-900 mb-3 underline decoration-brand-500 decoration-2 underline-offset-4">本合約效力範圍與付款明細</p>
                      <div className="grid grid-cols-3 gap-4 text-stone-900 mb-4">
                        <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm">
                          <p className="text-[10px] text-stone-400 uppercase font-bold mb-1">合約堂數</p>
                          <p className="text-lg font-black">{contract.totalSessions} 堂 (剩餘 {contract.remainingSessions} 堂)</p>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-sm col-span-2">
                          <p className="text-[10px] text-stone-400 uppercase font-bold mb-1">有效期限</p>
                          <p className="text-sm font-bold">
                            {toDateString(contract.startDate) ? format(new Date(toDateString(contract.startDate)), 'yyyy/MM/dd') : ''} - {toDateString(contract.endDate) ? format(new Date(toDateString(contract.endDate)), 'yyyy/MM/dd') : ''}
                          </p>
                        </div>
                      </div>

                      {/* 付款方式與明細 */}
                      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-xs">
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-stone-100">
                          <div>
                            <span className="font-bold text-stone-900">付款方式：</span>
                            <span className="text-stone-600 font-bold">
                              {contract.paymentType === 'installments' ? `分期付款 (${contract.installmentCount || 2} 期)` : '一次付清'}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-stone-900">總金額：</span>
                            <span className="text-stone-900 font-extrabold">NT$ {(contract.totalAmount || 0).toLocaleString()}</span>
                            <span className="mx-2 text-stone-300">|</span>
                            <span className="font-bold text-stone-900">已付：</span>
                            <span className="text-green-600 font-extrabold">NT$ {(contract.paidAmount || 0).toLocaleString()}</span>
                          </div>
                        </div>

                        {contract.paymentType === 'installments' && contract.installments && contract.installments.length > 0 ? (
                          <div className="space-y-2">
                            <p className="font-bold text-[10px] text-stone-400 uppercase tracking-wider">分期繳款明細</p>
                            <div className="grid grid-cols-4 gap-2 text-[11px] font-bold text-stone-500 border-b border-stone-100 pb-1">
                              <div>期數</div>
                              <div>繳款金額</div>
                              <div>應繳日期</div>
                              <div className="text-right">狀態</div>
                            </div>
                            {contract.installments.map((inst: any, idx: number) => {
                              const dueDateStr = inst.dueDate?.toDate 
                                ? format(inst.dueDate.toDate(), 'yyyy/MM/dd') 
                                : format(new Date(inst.dueDate), 'yyyy/MM/dd');
                              const paidDateStr = inst.paidDate?.toDate
                                ? format(inst.paidDate.toDate(), 'yyyy/MM/dd')
                                : inst.paidDate ? format(new Date(inst.paidDate), 'yyyy/MM/dd') : '';

                              return (
                                <div key={inst.id || idx} className="grid grid-cols-4 gap-2 py-1 items-center border-b border-stone-50 last:border-0">
                                  <div className="text-stone-900 font-bold">第 {idx + 1} 期</div>
                                  <div className="text-stone-900 font-bold">NT$ {inst.amount.toLocaleString()}</div>
                                  <div>{dueDateStr}</div>
                                  <div className="text-right">
                                    {inst.status === 'paid' ? (
                                      <span className="text-green-600 bg-green-50 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
                                        已收 {paidDateStr && `(${paidDateStr})`}
                                      </span>
                                    ) : inst.status === 'overdue' ? (
                                      <span className="text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
                                        逾期
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
                                        待收
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[11px] text-green-600 font-bold flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 bg-green-500 rounded-full inline-block" />
                            <span>費用已於合約建立時一次付清</span>
                          </div>
                        )}
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
