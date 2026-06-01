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
