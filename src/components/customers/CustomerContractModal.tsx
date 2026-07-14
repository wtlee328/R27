import React from 'react'
import { createPortal } from 'react-dom'
import {
  Dialog,
  DialogContent,
} from '../ui/dialog'
import { format } from 'date-fns'
import { doc, getDoc, updateDoc, deleteDoc, Timestamp, serverTimestamp, collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Customer, Contract } from '../../types'
import { Printer, X, Edit2, Trash2, Save, Plus, Trash, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useAuthStore } from '@/stores/authStore'
import { useCenterStore } from '@/stores/centerStore'

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
  const { isAdmin, isTrainer } = useAuthStore()
  const { centerId } = useCenterStore()
  const contractCenterId = contract?.centerId || centerId
  const brandName = contractCenterId === 'coffit' ? 'Coffit' : 'R27 Fitness'
  const brandNameStation = contractCenterId === 'coffit' ? 'Coffit Station' : 'R27 Fitness Station'
  const brandNameAbbr = contractCenterId === 'coffit' ? 'Coffit' : 'R27健身站'

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
  const [editTrainerId, setEditTrainerId] = React.useState<string>('')
  const [editSecondaryTrainerId, setEditSecondaryTrainerId] = React.useState<string | null>(null)
  const [trainers, setTrainers] = React.useState<any[]>([])
  const [isOneToTwo, setIsOneToTwo] = React.useState<boolean>(true)

  // New Taiwanese Contract Form States
  const [editContractNo, setEditContractNo] = React.useState<string>('')
  const [editReviewYear, setEditReviewYear] = React.useState<number>(new Date().getFullYear() - 1911)
  const [editReviewMonth, setEditReviewMonth] = React.useState<number>(new Date().getMonth() + 1)
  const [editReviewDay, setEditReviewDay] = React.useState<number>(new Date().getDate())
  
  const [editBirthDate, setEditBirthDate] = React.useState<string>('')
  const [editEmergencyName, setEditEmergencyName] = React.useState<string>('')
  const [editEmergencyRelation, setEditEmergencyRelation] = React.useState<string>('')
  const [editEmergencyPhone, setEditEmergencyPhone] = React.useState<string>('')

  const [editPartnerBirthDate, setEditPartnerBirthDate] = React.useState<string>('')
  const [editPartnerEmergencyName, setEditPartnerEmergencyName] = React.useState<string>('')
  const [editPartnerEmergencyRelation, setEditPartnerEmergencyRelation] = React.useState<string>('')
  const [editPartnerEmergencyPhone, setEditPartnerEmergencyPhone] = React.useState<string>('')

  const [editCoachRatio, setEditCoachRatio] = React.useState<number>(1)
  const [editMonthlyDueDay, setEditMonthlyDueDay] = React.useState<number>(5)
  const [editMonthlyDueAmount, setEditMonthlyDueAmount] = React.useState<number>(0)

  React.useEffect(() => {
    const fetchTrainers = async () => {
      try {
        const snap = await getDocs(collection(db, 'trainers'))
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setTrainers(list)
      } catch (err) {
        console.error('Error fetching trainers in contract view modal:', err)
      }
    }
    if (open) {
      fetchTrainers()
    }
  }, [open])

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
    if (contract && open && customer) {
      setEditTotalSessions(contract.totalSessions || 0)
      setEditRemainingSessions(contract.remainingSessions || 0)
      setEditTotalAmount(contract.totalAmount || 0)
      setEditPaidAmount(contract.paidAmount || 0)
      setEditStartDate(toDateString(contract.startDate))
      setEditEndDate(toDateString(contract.endDate))
      setEditPaymentType(contract.paymentType || 'single')
      setEditInstallmentCount(contract.installmentCount || 2)
      setEditTrainerId(contract.trainerId || '')
      setEditSecondaryTrainerId(contract.secondaryTrainerId || null)
      setIsOneToTwo(!contract.secondaryTrainerId || contract.secondaryTrainerId === contract.trainerId)
      
      const mappedInsts = (contract.installments || []).map((inst: any) => ({
        id: inst.id,
        amount: inst.amount,
        dueDate: toDateString(inst.dueDate),
        paidDate: toDateString(inst.paidDate),
        status: inst.status,
      }))
      setEditInstallments(mappedInsts)

      // Sync Taiwanese Contract Form States
      setEditContractNo(contract.contractNo || contract.id || '')
      
      const createdDate = contract.createdAt ? contract.createdAt.toDate() : new Date()
      setEditReviewYear(contract.reviewYear || createdDate.getFullYear() - 1911)
      setEditReviewMonth(contract.reviewMonth || createdDate.getMonth() + 1)
      setEditReviewDay(contract.reviewDay || createdDate.getDate())
      
      setEditBirthDate(customer.dateOfBirth ? toDateString(customer.dateOfBirth) : '')
      setEditEmergencyName(customer.emergencyContact?.name || '')
      setEditEmergencyRelation(customer.emergencyContact?.relation || '')
      setEditEmergencyPhone(customer.emergencyContact?.phone || '')

      setEditCoachRatio(contract.coachRatio || (contract.contractType === 'dual' ? 2 : 1))
      setEditMonthlyDueDay(contract.monthlyDueDay || 5)
      setEditMonthlyDueAmount(contract.monthlyDueAmount || 0)
    }
    if (!open) {
      setIsEditing(false)
      setIsDeleting(false)
    }
  }, [contract, open, customer])

  // Sync partner fields once loaded
  React.useEffect(() => {
    if (partner) {
      setEditPartnerBirthDate(partner.dateOfBirth ? toDateString(partner.dateOfBirth) : '')
      setEditPartnerEmergencyName(partner.emergencyContact?.name || '')
      setEditPartnerEmergencyRelation(partner.emergencyContact?.relation || '')
      setEditPartnerEmergencyPhone(partner.emergencyContact?.phone || '')
    } else {
      setEditPartnerBirthDate('')
      setEditPartnerEmergencyName('')
      setEditPartnerEmergencyRelation('')
      setEditPartnerEmergencyPhone('')
    }
  }, [partner])

  if (!customer) return null

  const handlePrint = () => {
    window.print()
  }

  const handleAutoGenerateInstallments = () => {
    const total = editTotalAmount
    const count = editInstallmentCount
    if (count < 2 || count > 16) return
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
    if (Number(editRemainingSessions) > Number(editTotalSessions)) {
      errors.push('剩餘堂數不能大於總堂數')
    }
    if (!editStartDate || !editEndDate) {
      errors.push('請選擇合約開始與結束日期')
    } else if (new Date(editStartDate) > new Date(editEndDate)) {
      errors.push('結束日期不能早於開始日期')
    }
    if (editPaymentType === 'installments') {
      if (editInstallments.length < 2 || editInstallments.length > 16) {
        errors.push('分期期數必須在 2 到 16 期之間')
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
        trainerId: editTrainerId,
        secondaryTrainerId: editSecondaryTrainerId,
        
        contractNo: editContractNo,
        reviewYear: Number(editReviewYear),
        reviewMonth: Number(editReviewMonth),
        reviewDay: Number(editReviewDay),
        coachRatio: Number(editCoachRatio),
        monthlyDueDay: Number(editMonthlyDueDay),
        monthlyDueAmount: Number(editMonthlyDueAmount),
        
        updatedAt: serverTimestamp(),
      }
      
      await updateDoc(contractRef, updateData)

      // Sync Customer A's trainer and profile fields
      const customerUpdate: any = {
        updatedAt: serverTimestamp()
      }
      if (editTrainerId) customerUpdate.trainerId = editTrainerId
      if (editBirthDate) customerUpdate.dateOfBirth = Timestamp.fromDate(new Date(editBirthDate))
      if (editEmergencyName || editEmergencyRelation || editEmergencyPhone) {
        customerUpdate.emergencyContact = {
          name: editEmergencyName,
          relation: editEmergencyRelation,
          phone: editEmergencyPhone,
        }
      }
      try {
        await updateDoc(doc(db, 'customers', customer.id), customerUpdate)
      } catch (err) {
        console.error('Failed to sync Customer A profile:', err)
      }

      // Sync Customer B's trainer and profile fields if dual
      const isDual = contract.contractType === 'dual' || contract.sharedWithCustomerId
      const partnerId = contract.customerIds && contract.customerIds.length > 1
        ? contract.customerIds.find(id => id !== customer.id)
        : contract.sharedWithCustomerId

      if (isDual && partnerId) {
        const syncTrainerId = editSecondaryTrainerId || editTrainerId
        const partnerUpdate: any = {
          updatedAt: serverTimestamp()
        }
        if (syncTrainerId) partnerUpdate.trainerId = syncTrainerId
        if (editPartnerBirthDate) partnerUpdate.dateOfBirth = Timestamp.fromDate(new Date(editPartnerBirthDate))
        if (editPartnerEmergencyName || editPartnerEmergencyRelation || editPartnerEmergencyPhone) {
          partnerUpdate.emergencyContact = {
            name: editPartnerEmergencyName,
            relation: editPartnerEmergencyRelation,
            phone: editPartnerEmergencyPhone,
          }
        }
        try {
          await updateDoc(doc(db, 'customers', partnerId), partnerUpdate)
        } catch (err) {
          console.error('Failed to sync Customer B profile:', err)
        }
      }

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

  const parseDateString = (dateStr: string) => {
    if (!dateStr) return { y: '', m: '', d: '' }
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return { y: (Number(parts[0]) - 1911).toString(), m: parts[1], d: parts[2] }
    }
    return { y: '', m: '', d: '' }
  }

  const renderContractSheet = () => {
    return (
      <div className="printable-contract-sheet max-w-[210mm] mx-auto bg-white shadow-lg border border-stone-200 p-12 print:shadow-none print:border-none min-h-[297mm] flex flex-col font-serif text-stone-850 text-xs leading-relaxed space-y-6 select-text print:p-0 print:text-[11px] print:leading-normal relative">

              {/* Main Document Header */}
              <div className="text-center space-y-2 border-b-2 border-stone-800 pb-4">
                <h1 className="text-2xl font-black text-stone-900 tracking-tight">{brandName} 健身教練課程契約書</h1>
                <div className="flex justify-between text-[11px] font-bold text-stone-600 print:text-[10px]">
                  <span>紅二七健身有限公司</span>
                  <div>
                    <span>合約編號：</span>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={editContractNo} 
                        onChange={e => setEditContractNo(e.target.value)}
                        className="border-b border-stone-400 bg-stone-50 px-1 py-0.5 font-bold w-36 text-center focus:outline-none focus:bg-white focus:border-brand-500" 
                        placeholder="請輸入合約編號"
                      />
                    ) : (
                      <span className="border-b border-stone-300 font-bold px-1">{editContractNo || contract?.id || '未設定'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 契約審閱權確認 */}
              <div className="border border-stone-300 bg-stone-50/50 p-4 rounded-xl space-y-2.5">
                <h3 className="font-black text-stone-900 text-xs border-b border-stone-200 pb-1.5 flex items-center justify-between">
                  <span>契約審閱權確認</span>
                  <span className="text-[10px] text-stone-400 font-normal">（請於確認條款後簽名）</span>
                </h3>
                <p className="indent-6 leading-relaxed">
                  本契約於中華民國{' '}
                  {isEditing ? (
                    <>
                      <input 
                        type="number" 
                        value={editReviewYear} 
                        onChange={e => setEditReviewYear(Number(e.target.value))}
                        className="w-12 border-b border-stone-400 bg-stone-50 text-center focus:outline-none" 
                      />{' '}年{' '}
                      <input 
                        type="number" 
                        value={editReviewMonth} 
                        onChange={e => setEditReviewMonth(Number(e.target.value))}
                        className="w-8 border-b border-stone-400 bg-stone-50 text-center focus:outline-none" 
                      />{' '}月{' '}
                      <input 
                        type="number" 
                        value={editReviewDay} 
                        onChange={e => setEditReviewDay(Number(e.target.value))}
                        className="w-8 border-b border-stone-400 bg-stone-50 text-center focus:outline-none" 
                      />
                    </>
                  ) : (
                    <>
                      <span className="font-bold underline px-1">{editReviewYear}</span> 年{' '}
                      <span className="font-bold underline px-1">{editReviewMonth}</span> 月{' '}
                      <span className="font-bold underline px-1">{editReviewDay}</span>
                    </>
                  )}{' '}日交由消費者審閱。
                </p>
                <p className="indent-6 font-bold text-stone-900">
                  甲方確認已享有 <span className="underline font-black mx-0.5">三日以上</span> 之契約審閱期間，並充分瞭解本契約條款內容。
                </p>
                <div className="flex justify-end items-center gap-4 pt-1.5">
                  <span className="font-black text-stone-700">簽名確認：</span>
                  <div className="w-40 h-10 border-b border-stone-400 flex items-center justify-center">
                    {contract?.signatureDataUrl ? (
                      <img src={contract.signatureDataUrl} alt="Signature A" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                    ) : (
                      <span className="text-stone-300 italic text-[10px]">(請於合約末端簽署)</span>
                    )}
                  </div>
                  <span className="text-[10px] text-stone-500 font-bold">(請務必簽名)</span>
                </div>
              </div>

              {/* 立契約書人 */}
              <div className="space-y-3">
                <h3 className="font-black text-stone-900 text-xs border-b-2 border-stone-800 pb-1 flex items-center justify-between">
                  <span>立契約書人</span>
                  {partner && <span className="text-[10px] text-purple-600 font-bold">👥 雙人共享合約模式</span>}
                </h3>
                
                {/* 甲方: 主學員 */}
                <div className="space-y-2.5">
                  <div className="font-bold text-stone-850 bg-stone-100 px-2 py-0.5 rounded text-[11px] flex justify-between">
                    <span>會員姓名（簡稱甲方）{partner && ' - 學員 A'}</span>
                  </div>
                  <div className="grid grid-cols-6 gap-x-2 gap-y-2 text-stone-700">
                    <div className="col-span-2">
                      <span>姓名：</span>
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{customer.name}</span>
                    </div>
                    <div className="col-span-2">
                      <span>身分證字號：</span>
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{customer.idNumber || '──────'}</span>
                    </div>
                    <div className="col-span-2">
                      <span>生日：</span>
                      {isEditing ? (
                        <input 
                          type="date" 
                          value={editBirthDate} 
                          onChange={e => setEditBirthDate(e.target.value)}
                          className="border-b border-stone-400 bg-stone-50 text-[11px] w-28 focus:outline-none focus:bg-white focus:border-brand-500"
                        />
                      ) : (
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[80px]">{editBirthDate || '──────'}</span>
                      )}
                    </div>

                    <div className="col-span-3">
                      <span>電話：</span>
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[160px]">{customer.phone}</span>
                    </div>
                    <div className="col-span-3">
                      <span>電子郵件：</span>
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[180px] break-all">{customer.email || '──────'}</span>
                    </div>

                    <div className="col-span-2">
                      <span>緊急聯絡人：</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editEmergencyName} 
                          onChange={e => setEditEmergencyName(e.target.value)}
                          className="border-b border-stone-400 bg-stone-50 w-20 focus:outline-none" 
                        />
                      ) : (
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[60px]">{editEmergencyName || '──────'}</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span>關係：</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editEmergencyRelation} 
                          onChange={e => setEditEmergencyRelation(e.target.value)}
                          className="border-b border-stone-400 bg-stone-50 w-16 focus:outline-none" 
                        />
                      ) : (
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[40px]">{editEmergencyRelation || '──────'}</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span>電話：</span>
                      {isEditing ? (
                        <input 
                          type="text" 
                          value={editEmergencyPhone} 
                          onChange={e => setEditEmergencyPhone(e.target.value)}
                          className="border-b border-stone-400 bg-stone-50 w-28 focus:outline-none" 
                        />
                      ) : (
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[90px]">{editEmergencyPhone || '──────'}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 甲方: 學員 B (Partner) if dual */}
                {partner && (
                  <div className="space-y-2.5 pt-2 border-t border-dashed border-stone-200">
                    <div className="font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded text-[11px]">
                      <span>會員姓名（簡稱甲方） - 學員 B</span>
                    </div>
                    <div className="grid grid-cols-6 gap-x-2 gap-y-2 text-stone-700">
                      <div className="col-span-2">
                        <span>姓名：</span>
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{partner.name}</span>
                      </div>
                      <div className="col-span-2">
                        <span>身分證字號：</span>
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[100px]">{partner.idNumber || '──────'}</span>
                      </div>
                      <div className="col-span-2">
                        <span>生日：</span>
                        {isEditing ? (
                          <input 
                            type="date" 
                            value={editPartnerBirthDate} 
                            onChange={e => setEditPartnerBirthDate(e.target.value)}
                            className="border-b border-stone-400 bg-stone-50 text-[11px] w-28 focus:outline-none"
                          />
                        ) : (
                          <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[80px]">{editPartnerBirthDate || '──────'}</span>
                        )}
                      </div>

                      <div className="col-span-3">
                        <span>電話：</span>
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[160px]">{partner.phone}</span>
                      </div>
                      <div className="col-span-3">
                        <span>電子郵件：</span>
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[180px] break-all">{partner.email || '──────'}</span>
                      </div>

                      <div className="col-span-2">
                        <span>緊急聯絡人：</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editPartnerEmergencyName} 
                            onChange={e => setEditPartnerEmergencyName(e.target.value)}
                            className="border-b border-stone-400 bg-stone-50 w-20 focus:outline-none" 
                          />
                        ) : (
                          <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[60px]">{editPartnerEmergencyName || '──────'}</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span>關係：</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editPartnerEmergencyRelation} 
                            onChange={e => setEditPartnerEmergencyRelation(e.target.value)}
                            className="border-b border-stone-400 bg-stone-50 w-16 focus:outline-none" 
                          />
                        ) : (
                          <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[40px]">{editPartnerEmergencyRelation || '──────'}</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span>電話：</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editPartnerEmergencyPhone} 
                            onChange={e => setEditPartnerEmergencyPhone(e.target.value)}
                            className="border-b border-stone-400 bg-stone-50 w-28 focus:outline-none" 
                          />
                        ) : (
                          <span className="font-bold text-stone-900 border-b border-stone-200 px-1 inline-block min-w-[90px]">{editPartnerEmergencyPhone || '──────'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 乙方 */}
                <div className="space-y-2 pt-2 border-t border-dashed border-stone-200 text-stone-700">
                  <div className="font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                    <span>{brandNameAbbr}（簡稱乙方）</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>公司名稱：<span className="font-bold text-stone-950">紅二七健身有限公司 ({brandNameStation})</span></div>
                    <div>負責人：<span className="font-bold text-stone-950">郭沛霖</span></div>
                    <div>電話：<span className="font-bold text-stone-950">0905396658</span></div>
                    <div className="col-span-2">營業/履約地址：<span className="font-bold text-stone-950">新北市淡水區中正東路二段68號</span></div>
                    <div>網址：<span className="font-bold text-stone-950 underline font-mono text-[10px]">https://www.instagram.com/r27fitness</span></div>
                    <div className="col-span-3">公共意外責任險：<span className="font-bold text-stone-950">已投保（效期：114/11/21-115/11/21）</span></div>
                  </div>
                </div>
              </div>

              {/* 課程內容與費用明細 */}
              <div className="space-y-3">
                <h3 className="font-black text-stone-900 text-xs border-b-2 border-stone-800 pb-1">課程內容與費用明細</h3>
                <div className="grid grid-cols-12 gap-x-3 gap-y-3.5 text-stone-700">
                  <div className="col-span-6 flex items-center">
                    <span>課程名稱：</span>
                    <span className="font-bold text-stone-900 border-b border-stone-200 px-1">一對一私人教練課程</span>
                  </div>
                  <div className="col-span-6 flex items-center">
                    <span>教練比例：{(!partner || isOneToTwo) ? '1' : '2'} 位教練對 </span>
                    {isEditing ? (
                      <input 
                        type="number" 
                        value={editCoachRatio} 
                        onChange={e => setEditCoachRatio(Number(e.target.value))}
                        className="w-10 border-b border-stone-400 bg-stone-50 text-center font-bold focus:outline-none" 
                      />
                    ) : (
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-2 underline">{editCoachRatio}</span>
                    )}
                    <span> 位學員</span>
                  </div>

                  {/* Designated Coach */}
                  <div className="col-span-12 flex flex-wrap items-center gap-1.5 border-b border-stone-100 pb-2">
                    <span className="font-bold text-stone-800">指定教練：</span>
                    {isEditing ? (
                      <div className="flex items-center gap-4 bg-stone-50 p-2 rounded-xl border border-stone-200 flex-1">
                        {partner ? (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                id="isOneToTwoEditDoc" 
                                checked={isOneToTwo} 
                                onChange={e => {
                                  const checked = e.target.checked
                                  setIsOneToTwo(checked)
                                  if (checked) {
                                    setEditSecondaryTrainerId(editTrainerId)
                                  } else {
                                    setEditSecondaryTrainerId(trainers[0]?.id || '')
                                  }
                                }} 
                                className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4" 
                              />
                              <label htmlFor="isOneToTwoEditDoc" className="text-xs font-bold text-stone-700 cursor-pointer">
                                👥 1對2 同時間上課（共用同一位教練）
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-[10px] text-stone-500 font-bold block mb-1">學員 A ({customer.name}) 教練</span>
                                <select 
                                  value={editTrainerId} 
                                  onChange={e => {
                                    const val = e.target.value
                                    setEditTrainerId(val)
                                    if (isOneToTwo) setEditSecondaryTrainerId(val)
                                  }}
                                  className="w-full h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs"
                                >
                                  {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                              </div>
                              {!isOneToTwo && (
                                <div>
                                  <span className="text-[10px] text-purple-600 font-bold block mb-1">學員 B ({partner.name}) 教練</span>
                                  <select 
                                    value={editSecondaryTrainerId || ''} 
                                    onChange={e => setEditSecondaryTrainerId(e.target.value)}
                                    className="w-full h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs"
                                  >
                                    {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <select 
                            value={editTrainerId} 
                            onChange={e => setEditTrainerId(e.target.value)}
                            className="w-full h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs"
                          >
                            <option value="">不指定</option>
                            {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                      </div>
                    ) : (
                      <span className="font-bold text-stone-900 bg-stone-50 px-2 py-1 rounded border border-stone-150">
                        {(() => {
                          const coachA = trainers.find(t => t.id === editTrainerId)?.name || '未指定';
                          const coachB = trainers.find(t => t.id === editSecondaryTrainerId)?.name;
                          if (!editTrainerId) return '□ 不指定';
                          if (!partner) return `☑ 指定教練（姓名：${coachA}）`;
                          if (isOneToTwo || !coachB || editSecondaryTrainerId === editTrainerId) {
                            return `☑ 指定教練（姓名：${coachA} - 1對2 同教練）`;
                          }
                          return `☑ 指定教練（學員 A: ${coachA} / 學員 B: ${coachB}）`;
                        })()}
                      </span>
                    )}
                  </div>

                  {/* Sessions & Amount Fields */}
                  <div className="col-span-4 flex items-center">
                    <span>購買堂數：購 </span>
                    {isEditing ? (
                      <input 
                        type="number" 
                        value={editTotalSessions} 
                        onChange={e => setEditTotalSessions(Number(e.target.value))}
                        className="w-14 border-b border-stone-400 bg-stone-50 text-center font-bold focus:outline-none" 
                      />
                    ) : (
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-2 underline">{editTotalSessions}</span>
                    )}
                    <span> 買堂。</span>
                  </div>

                  <div className="col-span-4 flex items-center">
                    <span>契約總金額：新台幣 $ </span>
                    {isEditing ? (
                      <input 
                        type="number" 
                        value={editTotalAmount} 
                        onChange={e => setEditTotalAmount(Number(e.target.value))}
                        className="w-20 border-b border-stone-400 bg-stone-50 text-center font-bold focus:outline-none" 
                      />
                    ) : (
                      <span className="font-bold text-stone-900 border-b border-stone-200 px-2 underline">{(editTotalAmount || 0).toLocaleString()}</span>
                    )}
                    <span> 元</span>
                  </div>

                  <div className="col-span-4 flex items-center">
                    <span>每堂單價：新台幣 $ </span>
                    <span className="font-bold text-stone-900 border-b border-stone-200 px-2 underline">
                      {editTotalSessions > 0 ? Math.round(editTotalAmount / editTotalSessions).toLocaleString() : '0'}
                    </span>
                    <span> 元</span>
                  </div>
                  
                  <div className="col-span-12 text-[10px] text-stone-400 font-bold italic mt-[-6px]">
                    （註：此單價為日後若發生「退費」時的計算基準)
                  </div>

                  {/* Course Duration */}
                  <div className="col-span-12 flex items-center gap-1">
                    <span>課程期限：自 </span>
                    {isEditing ? (
                      <input 
                        type="date" 
                        value={editStartDate} 
                        onChange={e => setEditStartDate(e.target.value)}
                        className="border-b border-stone-400 bg-stone-50 text-xs w-28 focus:outline-none" 
                      />
                    ) : (
                      <>
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1">{parseDateString(editStartDate).y}</span> 年{' '}
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1">{parseDateString(editStartDate).m}</span> 月{' '}
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1">{parseDateString(editStartDate).d}</span>
                      </>
                    )}
                    <span> 日 起至 </span>
                    {isEditing ? (
                      <input 
                        type="date" 
                        value={editEndDate} 
                        onChange={e => setEditEndDate(e.target.value)}
                        className="border-b border-stone-400 bg-stone-50 text-xs w-28 focus:outline-none" 
                      />
                    ) : (
                      <>
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1">{parseDateString(editEndDate).y}</span> 年{' '}
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1">{parseDateString(editEndDate).m}</span> 月{' '}
                        <span className="font-bold text-stone-900 border-b border-stone-200 px-1">{parseDateString(editEndDate).d}</span>
                      </>
                    )}
                    <span> 日止</span>
                  </div>

                  {/* Payment Type */}
                  <div className="col-span-12 space-y-2 bg-stone-50/50 p-3.5 rounded-xl border border-stone-200">
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-stone-800">付款方式：</span>
                      {isEditing ? (
                        <div className="flex gap-4">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input 
                              type="radio" 
                              name="paymentTypeEdit" 
                              checked={editPaymentType === 'single'} 
                              onChange={() => {
                                setEditPaymentType('single')
                                setEditPaidAmount(editTotalAmount)
                              }}
                            />
                            一次付清
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input 
                              type="radio" 
                              name="paymentTypeEdit" 
                              checked={editPaymentType === 'installments'} 
                              onChange={() => {
                                setEditPaymentType('installments')
                                if (editInstallments.length === 0) {
                                  setEditInstallments([
                                    { id: `inst-1-${Date.now()}`, amount: Math.floor(editTotalAmount/2), dueDate: editStartDate, paidDate: editStartDate, status: 'paid' },
                                    { id: `inst-2-${Date.now()}`, amount: editTotalAmount - Math.floor(editTotalAmount/2), dueDate: editStartDate, paidDate: '', status: 'pending' },
                                  ])
                                }
                              }}
                            />
                            分期付款
                          </label>
                        </div>
                      ) : (
                        <span className="font-bold text-stone-900">
                          {editPaymentType === 'installments' ? '☑ 轉帳 (分期繳)' : '☑ 一次付清'}
                        </span>
                      )}
                    </div>

                    {editPaymentType === 'installments' ? (
                      <div className="space-y-3 pt-2 border-t border-stone-200/60">
                        {/* Installments Table Editor (Editing mode) */}
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] text-stone-400 font-bold uppercase">分期繳費明細編輯</span>
                              <div className="flex items-center gap-2">
                                <select 
                                  value={editInstallmentCount} 
                                  onChange={e => setEditInstallmentCount(Number(e.target.value))}
                                  className="rounded border border-stone-200 bg-white text-xs px-2 py-0.5 focus:outline-none"
                                >
                                  {Array.from({ length: 15 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n} 期</option>)}
                                </select>
                                <Button variant="outline" size="sm" onClick={handleAutoGenerateInstallments} className="h-6 text-[10px] font-bold py-0 px-2">
                                  自動分配
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {editInstallments.map((inst, idx) => (
                                <div key={inst.id} className="grid grid-cols-12 gap-2 bg-white p-2 rounded-lg border border-stone-200 items-center">
                                  <div className="col-span-2 font-bold text-xs text-stone-700">第 {idx + 1} 期</div>
                                  <div className="col-span-3">
                                    <Input 
                                      type="number" 
                                      value={inst.amount} 
                                      onChange={e => {
                                        const copy = [...editInstallments]
                                        copy[idx].amount = Number(e.target.value)
                                        setEditInstallments(copy)
                                      }}
                                      className="h-7 text-xs px-1" 
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <Input 
                                      type="date" 
                                      value={inst.dueDate} 
                                      onChange={e => {
                                        const copy = [...editInstallments]
                                        copy[idx].dueDate = e.target.value
                                        setEditInstallments(copy)
                                      }}
                                      className="h-7 text-xs px-1" 
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <select 
                                      value={inst.status} 
                                      onChange={e => {
                                        const copy = [...editInstallments]
                                        copy[idx].status = e.target.value
                                        if (e.target.value === 'paid' && !copy[idx].paidDate) {
                                          copy[idx].paidDate = new Date().toISOString().split('T')[0]
                                        }
                                        setEditInstallments(copy)
                                      }}
                                      className="h-7 text-xs w-full bg-white rounded border border-stone-200"
                                    >
                                      <option value="pending">待收</option>
                                      <option value="paid">已收</option>
                                      <option value="overdue">逾期</option>
                                    </select>
                                  </div>
                                  <div className="col-span-2 flex justify-end">
                                    <Button 
                                      type="button"
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => setEditInstallments(editInstallments.filter((_, i) => i !== idx))}
                                      className="h-7 w-7 text-red-500 hover:bg-red-50"
                                    >
                                      <Trash className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                              
                              {/* Validation sum notice */}
                              {(() => {
                                const sum = editInstallments.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0)
                                const diff = sum - editTotalAmount
                                return Math.abs(diff) > 0.01 ? (
                                  <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-600 font-bold animate-pulse">
                                    分期加總 ({sum.toLocaleString()}) 與合約總金額 ({editTotalAmount.toLocaleString()}) 不符，相差 {diff.toLocaleString()} 元。
                                  </div>
                                ) : (
                                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-[10px] text-green-700 font-bold">
                                    分期加總金額完全正確！
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        ) : (
                          /* Installment details (Read-only mode) */
                          <div className="space-y-1.5 text-xs text-stone-600">
                            <p className="font-bold text-[10px] text-stone-400 uppercase">分期明細：</p>
                            <div className="grid grid-cols-4 gap-2 border-b border-stone-200 pb-1 font-bold text-stone-500">
                              <div>期數</div>
                              <div>繳款金額</div>
                              <div>應繳日期</div>
                              <div className="text-right">狀態</div>
                            </div>
                            {editInstallments.map((inst, idx) => (
                              <div key={inst.id || idx} className="grid grid-cols-4 gap-2 py-0.5 text-stone-850">
                                <div className="font-bold">第 {idx + 1} 期</div>
                                <div className="font-bold">NT$ {inst.amount.toLocaleString()}</div>
                                <div>{inst.dueDate}</div>
                                <div className="text-right font-bold">
                                  {inst.status === 'paid' ? (
                                    <span className="text-green-600">已收 {inst.paidDate && `(${inst.paidDate})`}</span>
                                  ) : inst.status === 'overdue' ? (
                                    <span className="text-red-500">逾期</span>
                                  ) : (
                                    <span className="text-amber-600">待收</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-stone-400 font-bold pl-1 pt-1">
                        一次付清模式 {isEditing && `(已付額: ${editPaidAmount} 元)`}
                      </div>
                    )}

                    <div className="pt-2 text-[10px] text-stone-500 border-t border-stone-200/50 leading-relaxed font-mono">
                      （匯款資訊：台北富邦012 05430240590000 請備註姓名）
                    </div>
                  </div>
                </div>
              </div>

              {/* Signatures & Approvals */}
              <div className="pt-6 border-t-2 border-stone-900 flex justify-between items-end shrink-0">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest">乙方蓋印</p>
                    <div className="w-24 h-24 border-2 border-brand-200 rounded-full flex items-center justify-center relative">
                      <div className="text-brand-500 font-bold text-center leading-tight border-2 border-brand-500 rounded-full w-20 h-20 flex flex-col items-center justify-center rotate-[-15deg]">
                        <span className="text-[8px]">{brandName}</span>
                        <span className="text-xs font-black">合約專用章</span>
                        <span className="text-[7px]">{contract?.createdAt ? format(contract.createdAt.toDate(), 'yyyy.MM.dd') : format(new Date(), 'yyyy.MM.dd')}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4 text-right">
                  <div className="flex gap-6 items-end">
                    {/* Primary Signature */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest">
                        {partner ? '甲方學員 A 簽名' : '會員簽名'}
                      </p>
                      <div className="min-w-[140px] h-16 border-b border-stone-300 flex items-center justify-end">
                        {contract?.signatureDataUrl ? (
                          <img src={contract.signatureDataUrl} alt="Signature A" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                        ) : (
                          <span className="text-stone-300 italic text-[10px]">( 尚未簽署 )</span>
                        )}
                      </div>
                    </div>

                    {/* Secondary Signature */}
                    {partner && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-purple-400 uppercase font-bold tracking-widest">甲方學員 B 簽名</p>
                        <div className="min-w-[140px] h-16 border-b border-stone-300 flex items-center justify-end">
                          {contract?.secondarySignatureDataUrl ? (
                            <img src={contract.secondarySignatureDataUrl} alt="Signature B" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                          ) : (
                            <span className="text-stone-300 italic text-[10px]">( 尚未簽署 )</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Coach Signature */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-stone-400 uppercase font-bold tracking-widest">教練簽名</p>
                      <div className="min-w-[140px] h-16 border-b border-stone-300 flex items-center justify-center font-black text-xs text-stone-900 border-dashed border-stone-200">
                        {trainers.find(t => t.id === editTrainerId)?.name || '（經手教練）'}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-400">
                    日期：中華民國{' '}
                    <span className="font-bold underline px-1">{editReviewYear}</span> 年{' '}
                    <span className="font-bold underline px-1">{editReviewMonth}</span> 月{' '}
                    <span className="font-bold underline px-1">{editReviewDay}</span> 日
                  </p>
                  <p className="text-[10px] font-bold text-stone-900">雙方同意本契約內容（含後附詳細條款）</p>
                </div>
              </div>

              {/* APPENDIX / TERMS (後附詳細條款) */}
              <div className="border-t-2 border-stone-200 pt-8 print:break-before-page">
                <div className="bg-stone-50 rounded-2xl p-6 border border-stone-200 text-[10px] leading-relaxed text-stone-600 space-y-4">
                  <div className="text-center font-bold text-stone-700 pb-2 mb-2 border-b border-stone-250">
                    {brandName} 健身教練服務定型化契約條款
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第一條（服務內容與異動通知）</p>
                    <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                      <li>乙方應依約定提供健身指導服務。</li>
                      <li>乙方所提供服務內容與時間如有異動，應於 24小時前 通知甲方。</li>
                      <li>通知方式：依甲方留存之電話、LINE 或電子郵件通知，或公告於官方社群網站。</li>
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
                    <p className="pl-1">甲方若有下列事由之一，提出證明文件後，乙方應於七個工作日內辦理暫停課程期限順延，停權期間免繳課程費用：</p>
                    <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                      <li>出國逾一個月。</li>
                      <li>傷害、疾病或身體不適致不宜運動。（未能事先提出者，得於事由發生後一個月內補辦）</li>
                      <li>懷孕、育嬰、侍親之需要。</li>
                      <li>服兵役。</li>
                      <li>職務異動或遷居。</li>
                      <li>其他不可歸責於甲方之事由（如疫情一級開設）。</li>
                      <li>甲方於本條暫停（停權）期間仍具有健身中心會員資格，且於會員期限屆滿仍未完成堂數者，無需補足會籍，得繼續完成剩餘堂數。</li>
                    </ol>
                    <p className="mt-1 pl-1 text-[9px] text-amber-700 bg-amber-50 p-1 border border-amber-200">
                      <strong>註：修正：</strong>因傷病暫停超過六個月，經醫師證明不能運動者，致需終止契約，甲方得依規定辦理退費，乙方不收取手續費。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第四條（退費規定與計算公式）</p>
                    <p className="pl-1">甲方得隨時通知乙方終止契約，退費標準依法規計算如下：</p>
                    <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                      <li>購買後七日內（未上課）：契約生效七日內尚未使用任何課程者，乙方應全額退還。如於7日內使用應適用第二款退費公式。</li>
                      <li>購買後七日以上（或已上課）：若甲方因個人因素欲終止契約，退費金額計算如下：應退金額 ＝ 實繳總金額 －（已使用堂數 × 每堂單價）
                        <ul className="list-disc pl-4 mt-0.5 text-stone-500 text-[9px]">
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
                    <p className="pl-1">若因下列事由終止契約，乙方應按比例退費，且不得收取手續費或違約金：</p>
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
                    <p className="pl-1">
                      因天災、戰亂、政府法令之新增或變更等不可抗力或其他不可歸責於雙方當事人之事由，致難以完成本契約之服務時，任何一方得終止契約，乙方應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費用、違約金或任何名目費用。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第七條（可歸責消費者-業者終止契約）</p>
                    <p className="pl-1">
                      甲方於期限屆滿前，得隨時終止。契約期限屆滿後，未使用剩餘堂數，乙方得不予退費。甲方有影響乙方營運之不當行為且情節重大，經勸告無效者，乙方得終止契約，並應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費、違約金或任何名目費用。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第八條（可歸責業者事由之終止與效果）</p>
                    <p className="pl-1">
                      因可歸責於乙方之事由致無法繼續提供約定服務，乙方應依未服務之堂數（含所贈與服務堂數）計算餘額退還予甲方，不得收取手續費、違約金或任何名目之扣費。前項退費，乙方應準用第四條計算違約金（手續費）之標準，額外支付違約金予甲方。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第九條（終止契約之通知及退款方式）</p>
                    <p className="pl-1">
                      甲方得以書面或雙方事先約定方式（如LINE、電子郵件等）通知終止契約，通知到達乙方時立即生效。乙方應應於甲方通知後 15 個「工作日」內，將應退款項擇 □現金 □轉帳 方式退還予甲方（乙方應於簽收或確認後出具證明交予甲方收執）。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第十條（贈品約款及其效果）</p>
                    <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                      <li>
                        乙方提供對甲方之贈品價值總計新臺幣 ________ 元，包括：
                        <div className="flex gap-4 mt-1 text-stone-500 font-semibold">
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
                    <p className="pl-1">
                      甲方經乙方同意，得將本契約讓與第三人（轉讓）。乙方得向甲方收取轉讓必要費用新台幣600元。
                    </p>
                  </div>

                  <div>
                    <p className="font-bold text-stone-900">第十二條（爭議處理與管轄法院）</p>
                    <ol className="list-decimal pl-4 space-y-0.5 mt-0.5">
                      <li>本契約未盡事宜，悉依中華民國法律及教育部公告之相關規範辦理。</li>
                      <li>甲乙雙方發生爭議時，甲方得依消費者保護法之規定申訴及申請調解，相關法令、習慣及誠信原則公平解決之。</li>
                      <li>本契約涉訟時，雙方同意以臺灣士林地方法院為第一審管轄法院（因履約地淡水屬士林地院管轄），但不得排除消費者保護法第四十七條及民事訴訟法第四百三十六條之九規定之小額訴訟管轄法院之適用。</li>
                    </ol>
                  </div>

                  <p className="text-right text-[9px] text-stone-400 font-bold mt-2">
                    本契約書乙式兩份，甲乙雙方各執一份為憑。
                  </p>
                </div>
              </div>

              {/* Document Footer */}
              <div className="mt-8 pt-4 border-t border-stone-100 text-[10px] text-stone-400 flex justify-between print:hidden shrink-0">
                <span>{brandNameStation} 客戶存查聯</span>
                <span>頁碼 1 / 1</span>
              </div>
            </div>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="contract-modal-content max-w-4xl h-[90vh] p-0 overflow-hidden border-none bg-stone-100 shadow-2xl flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 pr-14 py-4 bg-white border-b border-stone-200 print:hidden shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-stone-800">
                {isEditing ? '編輯合約與付款設定' : '客戶合約檢視'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {(isAdmin() || isTrainer()) && !isDeleting && (
                <>
                  {isEditing && (
                    <Button
                      onClick={handleSaveChanges}
                      size="sm"
                      className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-md gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      儲存變更
                    </Button>
                  )}

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
            ) : (
              renderContractSheet()
            )}
            {/* Bottom spacer for editing mode comfort */}
            {isEditing && <div className="h-48 print:hidden" />}
          </div>
        </DialogContent>
      </Dialog>
      {open && createPortal(
        <div className="print-only-contract">
          {renderContractSheet()}
        </div>,
        document.body
      )}
    </>
  )
}
