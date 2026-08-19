import { useState, useMemo, useEffect, useCallback } from 'react'
import { RiHardDrive2Line } from '@remixicon/react'
import { 
  Database, 
  AlertTriangle, 
  Play, 
  CheckCircle2, 
  RefreshCw, 
  Cloud, 
  Download, 
  CheckSquare, 
  Square,
  FileText,
  Clock,
  FileUp,
  Layers,
  ShieldAlert,
  RotateCcw,
  ExternalLink,
  Key,
  Check,
  LogOut,
  Settings
} from 'lucide-react'
import { collection, getDocs, doc, setDoc, Timestamp, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { toast } from 'sonner'
import { format } from 'date-fns'
import JSZip from 'jszip'
import { Label } from '../components/ui/label'
import {
  requestGoogleDriveToken,
  findOrCreateFolder,
  uploadFileToGoogleDrive,
  getStoredGoogleClientId,
  setStoredGoogleClientId,
  getStoredGoogleDriveToken,
  clearStoredGoogleDriveToken,
} from '../lib/googleDrive'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useAutoBackupScheduler } from '../hooks/useAutoBackupScheduler'

type ScopeType = 'all' | 'r27' | 'coffit'

interface BackupLog {
  collection: string
  count: number
  status: 'pending' | 'loading' | 'success' | 'empty' | 'error'
  message?: string
}

const MODULE_LABELS: Record<string, string> = {
  customers: '客戶檔案',
  lessonRecords: '教練銷課紀錄',
  finance: '會計管理 (合約與金流)',
  trainers: '教練與使用者權限',
  trialRecords: '體驗客與諮詢',
  venueRentals: '場租管理 (明細與對象)',
  activityLogs: '系統操作記錄',
  notifications: '系統通知消息',
}

const MODULE_COLLECTIONS: Record<string, string[]> = {
  customers: ['customers'],
  lessonRecords: ['lessonRecords'],
  finance: ['contracts', 'cashFlowRecords'],
  trainers: ['trainers', 'users'],
  trialRecords: ['trialRecords'],
  venueRentals: ['venueRentals', 'renterCustomers'],
  activityLogs: ['activityLogs'],
  notifications: ['notifications'],
}

const COLLECTION_DISPLAY_NAMES: Record<string, string> = {
  customers: '客戶檔案 (customers)',
  lessonRecords: '教練銷課紀錄 (lessonRecords)',
  contracts: '會計合約 (contracts)',
  cashFlowRecords: '收支金流 (cashFlowRecords)',
  trainers: '教練資料 (trainers)',
  users: '使用者帳號 (users)',
  trialRecords: '體驗客與諮詢 (trialRecords)',
  venueRentals: '場租紀錄 (venueRentals)',
  renterCustomers: '場租學員 (renterCustomers)',
  activityLogs: '系統操作記錄 (activityLogs)',
  notifications: '系統通知 (notifications)',
}

// Convert date strings or object seconds back to Firestore Timestamp for restore
const restoreTimestamps = (obj: any): any => {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(restoreTimestamps)

  // Handle Firestore Timestamp json format { seconds, nanoseconds }
  if ('seconds' in obj && typeof obj.seconds === 'number') {
    return new Timestamp(obj.seconds, obj.nanoseconds || 0)
  }

  const restored: Record<string, any> = {}
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && 'seconds' in val && typeof val.seconds === 'number') {
      restored[key] = new Timestamp(val.seconds, val.nanoseconds || 0)
    } else if (
      typeof val === 'string' &&
      /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}:\d{2}/.test(val) &&
      (key.toLowerCase().includes('date') || key.toLowerCase().includes('time') || key.endsWith('At'))
    ) {
      const parsedDate = new Date(val)
      if (!isNaN(parsedDate.getTime())) {
        restored[key] = Timestamp.fromDate(parsedDate)
      } else {
        restored[key] = val
      }
    } else if (typeof val === 'object') {
      restored[key] = restoreTimestamps(val)
    } else {
      restored[key] = val
    }
  }
  return restored
}

export default function BackupPage() {
  const [activeTab, setActiveTab] = useState<'cloud' | 'custom' | 'import'>('cloud')

  // Export Settings
  const [selectedScope, setSelectedScope] = useState<ScopeType>('all')
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({
    customers: true,
    lessonRecords: true,
    finance: true,
    trainers: true,
    trialRecords: true,
    venueRentals: true,
    activityLogs: true,
    notifications: true,
  })

  // Auto Backup Scheduler Hook
  const {
    config: autoConfig,
    isRunning: isAutoBackupRunning,
    updateFrequency,
    triggerTestScheduledBackup,
  } = useAutoBackupScheduler()

  // Google Drive Settings & OAuth Token State
  const initialSavedToken = useMemo(() => getStoredGoogleDriveToken(), [])
  const [googleToken, setGoogleToken] = useState<{ accessToken: string; expiresAt: number } | null>(initialSavedToken)
  const [syncToGDrive, setSyncToGDrive] = useState(() => Boolean(initialSavedToken))
  const [downloadLocalCopy, setDownloadLocalCopy] = useState(true)
  const [gdriveFolderId, setGdriveFolderId] = useState('R27_Coffit_Backups')
  const [googleClientId, setGoogleClientId] = useState<string>(() => getStoredGoogleClientId())
  const [clientIdInput, setClientIdInput] = useState<string>('')
  const [showClientIdModal, setShowClientIdModal] = useState<boolean>(false)
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false)
  const [lastUploadedDriveFile, setLastUploadedDriveFile] = useState<{ id: string; name: string; webViewLink?: string } | null>(null)

  // Export Run status
  const [exportStatus, setExportStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [exportLogs, setExportLogs] = useState<BackupLog[]>([])
  const [exportProgress, setExportProgress] = useState(0)
  const [exportErrorMsg, setExportErrorMsg] = useState<string | null>(null)

  // Restore/Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [parsedImportData, setParsedImportData] = useState<Record<string, any[]> | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'parsing' | 'ready' | 'restoring' | 'success' | 'error'>('idle')
  const [importLogs, setImportLogs] = useState<BackupLog[]>([])
  const [importProgress, setImportProgress] = useState(0)
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null)

  // ── Server-side Scheduled Backups State ──
  const [serverBackups, setServerBackups] = useState<any[]>([])
  const [loadingServerBackups, setLoadingServerBackups] = useState(false)
  const [isTriggeringServerBackup, setIsTriggeringServerBackup] = useState(false)
  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null)
  const [syncingBackupId, setSyncingBackupId] = useState<string | null>(null)

  const loadServerBackups = useCallback(async () => {
    setLoadingServerBackups(true)
    try {
      const q = query(collection(db, 'systemBackups'), orderBy('createdAt', 'desc'), limit(15))
      const snap = await getDocs(q)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setServerBackups(list)
    } catch (e: any) {
      console.warn('Failed to load server backups:', e)
    } finally {
      setLoadingServerBackups(false)
    }
  }, [])

  useEffect(() => {
    loadServerBackups()
  }, [loadServerBackups])

  // Helper to reconstruct Blob from Firestore chunks or base64
  const reconstructBackupBlob = async (backupId: string): Promise<Blob> => {
    const chunksQuery = query(collection(db, 'systemBackups', backupId, 'chunks'), orderBy('index', 'asc'))
    const snap = await getDocs(chunksQuery)

    let fullBase64 = ''
    if (!snap.empty) {
      const chunksData = snap.docs.map(d => d.data())
      chunksData.sort((a, b) => (a.index || 0) - (b.index || 0))
      fullBase64 = chunksData.map(c => c.data || '').join('')
    } else {
      const docItem = serverBackups.find(b => b.id === backupId)
      if (docItem && docItem.zipBase64) {
        fullBase64 = docItem.zipBase64
      }
    }

    if (!fullBase64) {
      throw new Error('找不到該備份的資料內容')
    }

    const byteCharacters = atob(fullBase64)
    const byteArrays = []
    const sliceSize = 512

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize)
      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }
      byteArrays.push(new Uint8Array(byteNumbers))
    }

    return new Blob(byteArrays, { type: 'application/zip' })
  }

  const handleDownloadServerBackup = async (item: any) => {
    setDownloadingBackupId(item.id)
    try {
      const blob = await reconstructBackupBlob(item.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.fileName || `系統備份_${item.id}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`已下載備份檔：${item.fileName}`)
    } catch (e: any) {
      toast.error(`下載失敗：${e.message || '未知錯誤'}`)
    } finally {
      setDownloadingBackupId(null)
    }
  }

  const handleSyncServerBackupToDrive = async (item: any) => {
    let token = googleToken
    if (!token || token.expiresAt <= Date.now()) {
      try {
        token = await requestGoogleDriveToken(googleClientId)
        setGoogleToken(token)
      } catch (err: any) {
        toast.error(`Google 授權失敗：${err.message}`)
        return
      }
    }

    setSyncingBackupId(item.id)
    try {
      const blob = await reconstructBackupBlob(item.id)
      const targetFolder = gdriveFolderId || '1-oBiAmVK9J-nK7gS2rn9GlQmq_fMxhFo'
      const folderId = await findOrCreateFolder(token.accessToken, targetFolder)
      const uploadRes = await uploadFileToGoogleDrive({
        accessToken: token.accessToken,
        folderId,
        fileName: item.fileName,
        mimeType: 'application/zip',
        blob,
      })
      toast.success(`已成功同步備份至您的 Google 雲端硬碟：${uploadRes.name}`)
      setLastUploadedDriveFile(uploadRes)
    } catch (e: any) {
      toast.error(`同步至 Google Drive 失敗：${e.message || '未知錯誤'}`)
    } finally {
      setSyncingBackupId(null)
    }
  }

  const handleTriggerServerBackupNow = async () => {
    setIsTriggeringServerBackup(true)
    toast.info('正在向伺服器發送備份指令，請稍候約 15~30 秒...')
    try {
      const res = await fetch('https://triggerbackuphttp-knxhsqimma-uc.a.run.app', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`雲端無人值守備份完成！${data.data?.message || ''}`)
        await loadServerBackups()
      } else {
        toast.error(`備份失敗：${data.error || '伺服器執行錯誤'}`)
      }
    } catch (e: any) {
      toast.error(`請求錯誤：${e.message || '連線逾時'}`)
    } finally {
      setIsTriggeringServerBackup(false)
    }
  }

  // Toggle helpers
  const handleSelectAll = () => {
    setSelectedModules({
      customers: true,
      lessonRecords: true,
      finance: true,
      trainers: true,
      trialRecords: true,
      venueRentals: true,
      activityLogs: true,
      notifications: true,
    })
  }

  const handleDeselectAll = () => {
    setSelectedModules({
      customers: false,
      lessonRecords: false,
      finance: false,
      trainers: false,
      trialRecords: false,
      venueRentals: false,
      activityLogs: false,
      notifications: false,
    })
  }

  const toggleModule = (key: string) => {
    setSelectedModules(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const selectedModulesCount = useMemo(() => {
    return Object.values(selectedModules).filter(Boolean).length
  }, [selectedModules])

  // Convert raw objects list to reader-friendly CSV (with translated headers and mapped IDs)
  const jsonToFriendlyCsv = (
    colName: string,
    data: any[],
    trainerMap: Record<string, string>,
    customerMap: Record<string, string>
  ): string => {
    if (!data || data.length === 0) return ''

    const formatTime = (val: any) => {
      if (!val) return ''
      if (val && typeof val === 'object' && val.seconds !== undefined) {
        const d = new Date(val.seconds * 1000)
        return format(d, 'yyyy-MM-dd HH:mm:ss')
      }
      if (val instanceof Date) {
        return format(val, 'yyyy-MM-dd HH:mm:ss')
      }
      const parsed = new Date(val)
      if (!isNaN(parsed.getTime())) {
        return format(parsed, 'yyyy-MM-dd HH:mm:ss')
      }
      return String(val)
    }

    const formatCenterId = (cid: any) => {
      if (!cid || cid === 'r27') return 'R27 Fitness'
      if (cid === 'coffit') return 'Coffit 訓練中心'
      return String(cid)
    }

    let headers: string[]
    let mapper: (row: any) => Record<string, any>

    switch (colName) {
      case 'customers':
        headers = [
          '學員ID', '場館類別', '姓名', '電話', '電子郵件', '身分證字號', '出生日期',
          '歷史上課堂數', '主指導教練', '副指導教練',
          '緊急聯絡人姓名', '與緊急聯絡人關係', '緊急聯絡人電話',
          '健康狀況與病史備註', '狀態', '建立時間'
        ]
        mapper = (row) => ({
          '學員ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '姓名': row.name || '',
          '電話': row.phone || '',
          '電子郵件': row.email || '',
          '身分證字號': row.idNumber || '',
          '出生日期': formatTime(row.dateOfBirth),
          '歷史上課堂數': row.historicalSessions ?? 0,
          '主指導教練': trainerMap[row.trainerId] || row.trainerId || '',
          '副指導教練': trainerMap[row.secondaryTrainerId] || row.secondaryTrainerId || '',
          '緊急聯絡人姓名': row.emergencyContact?.name || '',
          '與緊急聯絡人關係': row.emergencyContact?.relation || '',
          '緊急聯絡人電話': row.emergencyContact?.phone || '',
          '健康狀況與病史備註': row.medicalHistory?.notes || '',
          '狀態': row.status === 'archived' ? '已封存' : '正常',
          '建立時間': formatTime(row.createdAt)
        })
        break

      case 'lessonRecords':
        headers = [
          '銷課ID', '場館類別', '主要學員', '所有銷課扣堂學員', '合約ID/編號',
          '主銷課教練', '是否代課', '代課教練', '上課時間', '扣除總堂數',
          '銷課認列金額 (NT$)', '課後備註', '紀錄建立時間'
        ]
        mapper = (row) => {
          const deductionsStr = Array.isArray(row.deductions) && row.deductions.length > 0
            ? row.deductions.map((d: any) => `${d.customerName || customerMap[d.customerId] || d.customerId} (${d.sessionAmount || 1}堂)`).join('; ')
            : row.customerName || customerMap[row.customerId] || ''

          return {
            '銷課ID': row.id || '',
            '場館類別': formatCenterId(row.centerId),
            '主要學員': row.customerName || customerMap[row.customerId] || '',
            '所有銷課扣堂學員': deductionsStr,
            '合約ID/編號': row.contractId || '',
            '主銷課教練': trainerMap[row.trainerId] || row.trainerId || '',
            '是否代課': row.isSubstitute ? '是 (代課)' : '否',
            '代課教練': row.substituteTrainerId ? (trainerMap[row.substituteTrainerId] || row.substituteTrainerId) : '',
            '上課時間': formatTime(row.sessionDate),
            '扣除總堂數': row.sessionAmount ?? 1,
            '銷課認列金額 (NT$)': row.recognizedAmount ?? 0,
            '課後備註': row.notes || '',
            '紀錄建立時間': formatTime(row.createdAt)
          }
        }
        break

      case 'contracts':
        headers = [
          '合約ID', '場館類別', '合約編號', '合約類型', '主簽約學員', '綁定所有學員',
          '主指導教練', '副指導教練', '總堂數', '剩餘堂數', '單堂費用 (NT$)',
          '合約總金額 (NT$)', '已繳款金額 (NT$)', '付款方式', '分期期數',
          '分期繳費明細', '合約開始日期', '合約結束日期', '合約狀態', '建立時間'
        ]
        mapper = (row) => {
          let contractTypeLabel = '單人合約'
          if (row.contractType === 'dual' || (row.sharedWithCustomerId && row.contractType !== 'shared' && row.contractType !== 'group')) {
            contractTypeLabel = '雙人合約'
          } else if (row.contractType === 'shared') {
            contractTypeLabel = '共享合約'
          } else if (row.contractType === 'group') {
            contractTypeLabel = '團體合約'
          }

          const memberIds: string[] = Array.from(new Set([
            row.customerId,
            row.primaryCustomerId,
            row.sharedWithCustomerId,
            ...(Array.isArray(row.customerIds) ? row.customerIds : [])
          ].filter(Boolean)))
          const memberNames = memberIds.map(id => customerMap[id] || id).join(', ')

          const instStr = Array.isArray(row.installments) && row.installments.length > 0
            ? row.installments.map((inst: any, idx: number) => `第${idx+1}期 $${inst.amount} (${inst.status === 'paid' ? '已繳' : '未繳'})`).join('; ')
            : ''

          return {
            '合約ID': row.id || '',
            '場館類別': formatCenterId(row.centerId),
            '合約編號': row.contractNo || '',
            '合約類型': contractTypeLabel,
            '主簽約學員': customerMap[row.customerId || row.primaryCustomerId] || '',
            '綁定所有學員': memberNames,
            '主指導教練': trainerMap[row.trainerId] || row.trainerId || '',
            '副指導教練': trainerMap[row.secondaryTrainerId] || row.secondaryTrainerId || '',
            '總堂數': row.totalSessions ?? 0,
            '剩餘堂數': row.remainingSessions ?? 0,
            '單堂費用 (NT$)': row.pricePerSession ?? (row.totalSessions ? Math.round(row.totalAmount / row.totalSessions) : 0),
            '合約總金額 (NT$)': row.totalAmount ?? 0,
            '已繳款金額 (NT$)': row.paidAmount ?? 0,
            '付款方式': (row.paymentType === 'installments' || row.paymentType === 'installment') ? '分期付款' : '單次付清',
            '分期期數': row.installmentCount || (Array.isArray(row.installments) ? row.installments.length : 1),
            '分期繳費明細': instStr,
            '合約開始日期': formatTime(row.startDate),
            '合約結束日期': formatTime(row.endDate),
            '合約狀態': row.status === 'active' ? '執行中' :
                       row.status === 'expiring' ? '即將到期' :
                       row.status === 'expired' ? '已過期' :
                       row.status === 'completed' ? '已完課' : String(row.status || ''),
            '建立時間': formatTime(row.createdAt)
          }
        }
        break

      case 'cashFlowRecords':
        headers = ['流水號ID', '場館類別', '交易日期', '經手教練', '交易類型', '會計科目', '資金帳戶', '交易金額 (NT$)', '關聯合約ID', '摘要說明', '備註說明']
        mapper = (row) => {
          const typeLabel = row.type === 'income' ? '收入 (+)' : row.type === 'expense' ? '支出 (-)' : '一般收支'
          const cat = row.category || row.creditCategory || row.debitCategory || ''
          const amt = row.amount ?? row.creditAmount ?? row.debitAmount ?? 0
          const acc = row.account || (row.debitCategory && ['現金', '銀行存款', '公司存款'].some(c => row.debitCategory.includes(c)) ? row.debitCategory : '公司存款')
          return {
            '流水號ID': row.id || '',
            '場館類別': formatCenterId(row.centerId),
            '交易日期': formatTime(row.date),
            '經手教練': trainerMap[row.trainerId] || row.trainerId || '',
            '交易類型': typeLabel,
            '會計科目': cat,
            '資金帳戶': acc,
            '交易金額 (NT$)': amt,
            '關聯合約ID': row.contractId || '',
            '摘要說明': row.description || '',
            '備註說明': row.notes || ''
          }
        }
        break

      case 'trialRecords':
        headers = ['體驗ID', '場館類別', '客戶姓名', '聯絡電話', '電子郵件', '預約體驗日期', '負責教練', '成交結果', '諮詢備註']
        mapper = (row) => ({
          '體驗ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '客戶姓名': row.clientName || '',
          '聯絡電話': row.phone || '',
          '電子郵件': row.email || '',
          '預約體驗日期': formatTime(row.date),
          '負責教練': trainerMap[row.trainerId] || row.trainerId || '',
          '成交結果': row.outcome === 'converted' ? '已成交' :
                     row.outcome === 'not_converted' ? '未成交' : '跟進中',
          '諮詢備註': row.notes || ''
        })
        break

      case 'venueRentals':
        headers = ['場租ID', '場館類別', '場租日期', '承租對象', '場租金額 (NT$)', '用途備註', '登記教練']
        mapper = (row) => ({
          '場租ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '場租日期': formatTime(row.date),
          '承租對象': row.renterName || '',
          '場租金額 (NT$)': row.amount ?? 300,
          '用途備註': row.notes || '',
          '登記教練': trainerMap[row.trainerId] || row.trainerId || ''
        })
        break

      case 'trainers':
        headers = ['教練ID', '場館類別', '姓名', '角色權限', '聯絡電話', '電子郵件', '狀態']
        mapper = (row) => ({
          '教練ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '姓名': row.name || '',
          '角色權限': row.role === 'admin' ? '管理者' : '教練',
          '聯絡電話': row.phone || '',
          '電子郵件': row.email || '',
          '狀態': row.status === 'inactive' ? '離職/停用' : '在職/啟用'
        })
        break

      case 'users':
        headers = ['使用者ID', '姓名/顯示名稱', '帳號(Email)', '角色權限', '綁定教練ID', '狀態']
        mapper = (row) => ({
          '使用者ID': row.id || '',
          '姓名/顯示名稱': row.displayName || row.name || '',
          '帳號(Email)': row.email || '',
          '角色權限': row.role === 'admin' ? '最高管理者' : '教練',
          '綁定教練ID': row.trainerId || '',
          '狀態': row.disabled ? '停用' : '啟用'
        })
        break

      case 'renterCustomers':
        headers = ['場租學員ID', '場館類別', '姓名', '電話', '備註']
        mapper = (row) => ({
          '場租學員ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '姓名': row.name || '',
          '電話': row.phone || '',
          '備註': row.notes || ''
        })
        break

      case 'activityLogs':
        headers = ['紀錄ID', '場館類別', '操作時間', '操作人員 (教練)', '動作', '模組', '異動摘要說明']
        mapper = (row) => ({
          '紀錄ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '操作時間': formatTime(row.timestamp),
          '操作人員 (教練)': row.trainerName || trainerMap[row.trainerId] || '',
          '動作': row.action === 'create' ? '新增' :
                 row.action === 'update' ? '修改' : '刪除',
          '模組': row.module === 'lessonRecords' ? '教練銷課' :
                 row.module === 'trialRecords' ? '體驗課' :
                 row.module === 'venueBookings' ? '場租預約' : '學員合約與檔案',
          '異動摘要說明': row.recordSummary || ''
        })
        break

      case 'notifications':
        headers = ['通知ID', '場館類別', '標題', '內容', '類型', '狀態', '建立時間']
        mapper = (row) => ({
          '通知ID': row.id || '',
          '場館類別': formatCenterId(row.centerId),
          '標題': row.title || '',
          '內容': row.message || row.content || '',
          '類型': row.type || '',
          '狀態': row.read ? '已讀' : '未讀',
          '建立時間': formatTime(row.createdAt)
        })
        break

      default: {
        const keys = Array.from(new Set(data.flatMap(item => Object.keys(item)))).filter(k => k !== 'id')
        headers = ['id', ...keys]
        mapper = (row) => {
          const item: Record<string, any> = { 'id': row.id }
          keys.forEach(k => {
            item[k] = row[k]
          })
          return item
        }
        break
      }
    }

    const csvRows = []
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','))
    
    for (const row of data) {
      const mapped = mapper(row)
      const values = headers.map(header => {
        const val = mapped[header]
        let strVal = ''
        if (val !== undefined && val !== null) {
          strVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
        }
        return `"${strVal.replace(/"/g, '""')}"`
      })
      csvRows.push(values.join(','))
    }
    
    return csvRows.join('\n')
  }

  // Google Drive Connection Handlers
  const isGoogleConnected = Boolean(googleToken && googleToken.expiresAt > Date.now())

  const handleConnectGoogleDrive = async (overrideClientId?: string) => {
    const cId = overrideClientId || googleClientId
    if (!cId || cId.trim() === '') {
      setClientIdInput(cId || '')
      setShowClientIdModal(true)
      return
    }

    setIsAuthorizing(true)
    try {
      const res = await requestGoogleDriveToken(cId)
      setGoogleToken({
        accessToken: res.accessToken,
        expiresAt: Date.now() + res.expiresIn * 1000,
      })
      setSyncToGDrive(true)
      toast.success('Google Drive 授權成功！已為您啟用雲端同步備份。')
      setShowClientIdModal(false)
    } catch (err: any) {
      console.error('Google authorization error:', err)
      toast.error(`Google 授權失敗：${err.message || '未知錯誤'}`)
    } finally {
      setIsAuthorizing(false)
    }
  }

  const handleDisconnectGoogleDrive = () => {
    clearStoredGoogleDriveToken()
    setGoogleToken(null)
    setSyncToGDrive(false)
    setLastUploadedDriveFile(null)
    toast.info('已中斷 Google Drive 連結並清除授權')
  }

  const handleSaveClientId = () => {
    if (!clientIdInput.trim()) {
      toast.error('請輸入有效的 Client ID')
      return
    }
    setStoredGoogleClientId(clientIdInput.trim())
    setGoogleClientId(clientIdInput.trim())
    toast.success('已儲存 Google Client ID 設定')
    handleConnectGoogleDrive(clientIdInput.trim())
  }

  // Start backup export process
  const runBackup = async () => {
    if (selectedModulesCount === 0) {
      toast.error('請至少選擇一個要備份的資料項目')
      return
    }

    setExportStatus('running')
    setExportProgress(0)
    setExportErrorMsg(null)
    setLastUploadedDriveFile(null)

    const initialLogs: BackupLog[] = []
    Object.entries(selectedModules).forEach(([modKey, isChecked]) => {
      if (isChecked) {
        const cols = MODULE_COLLECTIONS[modKey] || []
        cols.forEach(c => {
          initialLogs.push({
            collection: c,
            count: 0,
            status: 'pending'
          })
        })
      }
    })
    setExportLogs(initialLogs)

    try {
      const zip = new JSZip()
      const jsonFolder = zip.folder('json')
      const csvFolder = zip.folder('csv')

      // Build trainer and customer name lookup maps
      const trainerMap: Record<string, string> = {}
      try {
        const trainerSnap = await getDocs(collection(db, 'trainers'))
        trainerSnap.docs.forEach(d => {
          trainerMap[d.id] = d.data().name || ''
        })
        const userSnap = await getDocs(collection(db, 'users'))
        userSnap.docs.forEach(d => {
          const udata = d.data()
          if (udata.displayName) {
            trainerMap[d.id] = udata.displayName
          }
        })
      } catch (e) {
        console.warn('Could not build trainer map:', e)
      }

      const customerMap: Record<string, string> = {}
      try {
        const customerSnap = await getDocs(collection(db, 'customers'))
        customerSnap.docs.forEach(d => {
          customerMap[d.id] = d.data().name || ''
        })
      } catch (e) {
        console.warn('Could not build customer map:', e)
      }

      let completedSteps = 0
      const totalSteps = initialLogs.length
      const updatedLogs = [...initialLogs]

      for (let i = 0; i < updatedLogs.length; i++) {
        const logItem = updatedLogs[i]
        logItem.status = 'loading'
        setExportLogs([...updatedLogs])

        try {
          const colRef = collection(db, logItem.collection)
          const snap = await getDocs(colRef)

          // Filter by scope safely
          const dataList = snap.docs
            .map(d => {
              const data = d.data()
              return {
                id: d.id,
                centerId: data.centerId || 'r27',
                ...data
              }
            })
            .filter(item => {
              if (selectedScope === 'all') return true
              if (selectedScope === 'r27') return !item.centerId || item.centerId === 'r27'
              return item.centerId === selectedScope
            })

          logItem.count = dataList.length
          logItem.status = dataList.length > 0 ? 'success' : 'empty'

          const MODULE_CSV_FILENAMES: Record<string, string> = {
            customers: '客戶檔案',
            lessonRecords: '教練銷課紀錄',
            contracts: '會計管理_合約',
            cashFlowRecords: '會計管理_收支金流',
            trainers: '教練檔案',
            users: '使用者帳號',
            trialRecords: '體驗客資料',
            venueRentals: '場租管理明細',
            renterCustomers: '場租學員資料',
            activityLogs: '系統操作記錄',
            notifications: '系統通知消息',
          }

          if (dataList.length > 0) {
            jsonFolder?.file(`${logItem.collection}.json`, JSON.stringify(dataList, null, 2))
            const csvContent = jsonToFriendlyCsv(logItem.collection, dataList, trainerMap, customerMap)
            const csvFilename = MODULE_CSV_FILENAMES[logItem.collection] || logItem.collection
            csvFolder?.file(`${csvFilename}.csv`, '\ufeff' + csvContent)
          }
        } catch (colErr: any) {
          console.warn(`Permission or fetch error on ${logItem.collection}:`, colErr)
          logItem.status = 'error'
          logItem.message = colErr?.message || '無權限存取'
        }

        completedSteps++
        setExportProgress(Math.round((completedSteps / totalSteps) * 80))
        setExportLogs([...updatedLogs])
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      setExportProgress(85)

      const dateStr = format(new Date(), 'yyyyMMdd_HHmmss')
      const scopeLabel = selectedScope === 'all' ? '全部場館' : selectedScope === 'r27' ? 'R27_Fitness' : 'Coffit_訓練中心'
      const filename = `系統備份_${scopeLabel}_${dateStr}.zip`

      if (syncToGDrive) {
        let token = googleToken?.accessToken
        const isTokenExpired = !googleToken || googleToken.expiresAt <= Date.now()
        
        if (isTokenExpired) {
          if (!googleClientId) {
            toast.error('請先設定 Google Client ID 以同步至 Google Drive')
            setShowClientIdModal(true)
          } else {
            try {
              const authRes = await requestGoogleDriveToken(googleClientId)
              token = authRes.accessToken
              setGoogleToken({
                accessToken: authRes.accessToken,
                expiresAt: Date.now() + authRes.expiresIn * 1000,
              })
            } catch (authErr: any) {
              toast.error(`無法取得 Google Drive 授權：${authErr.message}`)
            }
          }
        }

        if (token) {
          try {
            setExportProgress(90)
            const folderId = await findOrCreateFolder(token, gdriveFolderId || 'R27_Coffit_Backups')
            const driveFile = await uploadFileToGoogleDrive({
              accessToken: token,
              folderId,
              fileName: filename,
              mimeType: 'application/zip',
              blob: zipBlob,
            })
            setLastUploadedDriveFile(driveFile)
            setExportLogs(prev => [
              ...prev,
              {
                collection: 'Google Drive 雲端同步',
                count: 1,
                status: 'success',
                message: `已同步至 Google Drive (${driveFile.name})`,
              },
            ])
            toast.success('備份已同步上傳至 Google Drive！')
          } catch (uploadErr: any) {
            console.error('Google Drive sync error:', uploadErr)
            setExportLogs(prev => [
              ...prev,
              {
                collection: 'Google Drive 雲端同步',
                count: 0,
                status: 'error',
                message: uploadErr.message || '上傳失敗',
              },
            ])
            toast.error(`Google Drive 同步失敗：${uploadErr.message}`)
          }
        }
      }
      if (downloadLocalCopy || !syncToGDrive) {
        const downloadUrl = URL.createObjectURL(zipBlob)
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      }

      setExportProgress(100)
      setExportStatus('success')
      if (syncToGDrive && lastUploadedDriveFile) {
        toast.success(downloadLocalCopy ? '備份已成功上傳至 Google Drive 並下載本地副本！' : '備份已成功上傳至 Google Drive！')
      } else if (syncToGDrive) {
        toast.success('備份完成！')
      } else {
        toast.success('備份包下載完成！')
      }
    } catch (err: any) {
      console.error(err)
      setExportErrorMsg(err.message || '備份過程中發生未知錯誤')
      setExportStatus('error')
      toast.error('資料備份失敗，請檢視日誌')
    }
  }

  // Handle uploaded backup package (.zip or .json)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    setImportStatus('parsing')
    setImportErrorMsg(null)

    try {
      const collectionsData: Record<string, any[]> = {}

      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file)
        const jsonFiles = Object.keys(zip.files).filter(filename => 
          filename.startsWith('json/') && filename.endsWith('.json') && !zip.files[filename].dir
        )

        if (jsonFiles.length === 0) {
          throw new Error('壓縮檔內未找到 json/ 資料夾或 .json 檔案')
        }

        for (const filePath of jsonFiles) {
          const colName = filePath.replace('json/', '').replace('.json', '')
          const content = await zip.files[filePath].async('string')
          try {
            const arr = JSON.parse(content)
            if (Array.isArray(arr)) {
              collectionsData[colName] = arr
            }
          } catch (err) {
            console.warn(`Could not parse JSON for ${filePath}`)
          }
        }
      } else if (file.name.endsWith('.json')) {
        const content = await file.text()
        const arr = JSON.parse(content)
        const colName = file.name.replace('.json', '')
        if (Array.isArray(arr)) {
          collectionsData[colName] = arr
        }
      } else {
        throw new Error('不支援的檔案格式，請上傳 ZIP 備份包或 JSON 檔案')
      }

      if (Object.keys(collectionsData).length === 0) {
        throw new Error('備份檔案中未包含可還原的有效資料集合')
      }

      setParsedImportData(collectionsData)
      setImportStatus('ready')
      toast.success('備份檔案解析完成，請確認還原內容')
    } catch (err: any) {
      console.error(err)
      setImportStatus('error')
      setImportErrorMsg(err.message || '解析備份檔案失敗')
      toast.error('檔案解析失敗')
    }
  }

  // Run database restoration
  const runRestore = async () => {
    if (!parsedImportData || Object.keys(parsedImportData).length === 0) {
      toast.error('尚無可還原的備份資料')
      return
    }

    if (!window.confirm('確定要執行資料庫還原嗎？這將會更新或寫入現有資料庫資料，建議先下載備份！')) {
      return
    }

    setImportStatus('restoring')
    setImportProgress(0)
    setImportErrorMsg(null)

    const initialLogs: BackupLog[] = Object.entries(parsedImportData).map(([colName, list]) => ({
      collection: colName,
      count: list.length,
      status: 'pending'
    }))
    setImportLogs(initialLogs)

    try {
      let completedSteps = 0
      const totalSteps = initialLogs.length
      const updatedLogs = [...initialLogs]

      for (let i = 0; i < updatedLogs.length; i++) {
        const logItem = updatedLogs[i]
        logItem.status = 'loading'
        setImportLogs([...updatedLogs])

        const list = parsedImportData[logItem.collection] || []
        let restoredCount = 0

        for (const rawItem of list) {
          if (!rawItem.id) continue
          const docId = String(rawItem.id)
          const dataToSave = restoreTimestamps(rawItem)
          
          const docRef = doc(db, logItem.collection, docId)
          await setDoc(docRef, dataToSave, { merge: true })
          restoredCount++
        }

        logItem.count = restoredCount
        logItem.status = 'success'
        completedSteps++
        setImportProgress(Math.round((completedSteps / totalSteps) * 100))
        setImportLogs([...updatedLogs])
      }

      setImportStatus('success')
      toast.success('資料還原與匯入成功完成！')
    } catch (err: any) {
      console.error(err)
      setImportErrorMsg(err.message || '資料庫還原過程中發生錯誤')
      setImportStatus('error')
      toast.error('資料還原失敗，請檢查權限與日誌')
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiHardDrive2Line className="w-6 h-6 text-orange-500" />
            資料備份與還原管理
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            完整備份與還原系統學員、銷課、合約、金流與教練設定資料。
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-stone-100/90 rounded-2xl border border-stone-200/60 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('cloud')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'cloud'
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            雲端自動備份與歷史
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            自訂模組手動匯出
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <FileUp className="w-3.5 h-3.5" />
            資料還原與匯入
          </button>
        </div>
      </div>

      {/* ── Active Tab 1: Cloud Automated Backups & History (Default Overview) ── */}
      {activeTab === 'cloud' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Top Hero Banner */}
          <div className="bg-stone-900 text-white p-6 md:p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

            <div className="space-y-3 max-w-xl relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[11px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                每日凌晨 02:00 自動排程備份：已啟用 (Cloud Scheduler)
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                全系統雲端自動備份中心
              </h2>
              <p className="text-xs text-stone-300 leading-relaxed">
                系統每天凌晨自動為您封存客戶、銷課、合約、金流等 11 個資料庫模組（2,700+ 筆資料）至 Firebase 雲端空間。您亦可隨時手動觸發立即建立最新存檔，或一鍵同步至 Google Drive。
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-stone-400">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                  <span>最新備份：</span>
                  <span className="font-bold text-white font-mono">
                    {serverBackups[0]?.createdAt?.toDate
                      ? format(serverBackups[0].createdAt.toDate(), 'yyyy/MM/dd HH:mm')
                      : '已就緒'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-stone-400" />
                  <span>最新筆數：</span>
                  <span className="font-bold text-brand-400 font-mono">
                    {serverBackups[0]?.totalRecordCount
                      ? `${Number(serverBackups[0].totalRecordCount).toLocaleString()} 筆`
                      : '全模組'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-stone-400" />
                  <span>Google Drive：</span>
                  <span className={`font-bold ${isGoogleConnected ? 'text-emerald-400' : 'text-stone-400'}`}>
                    {isGoogleConnected ? '已授權連結' : '未連結'}
                  </span>
                </div>
              </div>
            </div>

            {/* Prominent Primary Action Button */}
            <div className="relative z-10 shrink-0">
              <Button
                size="lg"
                onClick={handleTriggerServerBackupNow}
                disabled={isTriggeringServerBackup}
                className="w-full md:w-auto px-6 py-6 bg-brand-500 hover:bg-brand-600 text-white rounded-2xl text-sm font-black shadow-xl shadow-brand-500/25 gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {isTriggeringServerBackup ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>正在建立雲端備份包 (約需 15 秒)...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 text-white" />
                    <span>⚡️ 立即手動建立最新備份</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Backup Archives Table */}
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-base">雲端備份歷史紀錄存檔庫</h3>
                  <p className="text-xs text-stone-500">
                    點擊「下載 ZIP」可直接下載至電腦；點擊「同步至 Google Drive」可將該份備份推送到您的 Google 雲端資料夾
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadServerBackups}
                disabled={loadingServerBackups}
                className="rounded-xl text-xs font-bold gap-1.5 h-9 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingServerBackups ? 'animate-spin' : ''}`} />
                <span>重新整理清單</span>
              </Button>
            </div>

            {loadingServerBackups ? (
              <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-stone-300" />
                <span className="text-xs font-medium">正在載入雲端備份紀錄...</span>
              </div>
            ) : serverBackups.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center bg-stone-50/60 rounded-2xl border border-dashed border-stone-200">
                <Database className="w-8 h-8 text-stone-300 mb-2" />
                <p className="text-xs font-bold text-stone-600">目前尚無備份紀錄</p>
                <p className="text-[11px] text-stone-400 mt-0.5">點擊上方「立即手動建立最新備份」即可建立第一筆雲端存檔！</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-400 font-bold border-b border-stone-100">
                      <th className="pb-3 px-2 font-medium">備份時間</th>
                      <th className="pb-3 px-2 font-medium">檔案名稱</th>
                      <th className="pb-3 px-2 font-medium">資料筆數</th>
                      <th className="pb-3 px-2 font-medium">檔案大小</th>
                      <th className="pb-3 px-2 font-medium">備份模式</th>
                      <th className="pb-3 px-2 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {serverBackups.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3 px-2 font-mono font-bold text-stone-800">
                          {item.createdAt?.toDate ? format(item.createdAt.toDate(), 'yyyy/MM/dd HH:mm:ss') : item.id}
                        </td>
                        <td className="py-3 px-2 font-mono text-stone-600 max-w-[220px] truncate">
                          {item.fileName}
                        </td>
                        <td className="py-3 px-2 font-bold text-stone-800">
                          {item.totalRecordCount ? Number(item.totalRecordCount).toLocaleString() : 0} 筆
                        </td>
                        <td className="py-3 px-2 text-stone-500 font-mono">
                          {item.sizeBytes ? `${(item.sizeBytes / 1024).toFixed(1)} KB` : '-'}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.isManual ? 'bg-amber-50 text-amber-700 border border-amber-200/60' : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          }`}>
                            {item.isManual ? '手動觸發' : '每日排程'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadServerBackup(item)}
                              disabled={downloadingBackupId === item.id}
                              className="rounded-xl text-[11px] font-bold h-8 px-2.5 gap-1 text-stone-700 hover:text-stone-900 cursor-pointer"
                            >
                              {downloadingBackupId === item.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3 text-stone-500" />
                              )}
                              <span>下載 ZIP</span>
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSyncServerBackupToDrive(item)}
                              disabled={syncingBackupId === item.id}
                              className="rounded-xl text-[11px] font-bold h-8 px-2.5 gap-1 bg-brand-500 hover:bg-brand-600 text-white cursor-pointer shadow-sm"
                            >
                              {syncingBackupId === item.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Cloud className="w-3 h-3 text-white" />
                              )}
                              <span>同步至 Google Drive</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Google Drive Integration & Folder Settings Card */}
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-800 text-sm">Google 雲端硬碟 (Google Drive) 同步設定</h3>
                  <p className="text-[11px] text-stone-500">連結您的 Google 帳號後，可在歷史清單隨時一鍵將備份封存至個人或公司 Google 雲端資料夾</p>
                </div>
              </div>

              <div>
                {isGoogleConnected ? (
                  <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已連結 Google Drive
                  </span>
                ) : (
                  <span className="text-[10px] bg-stone-100 border border-stone-200 text-stone-500 px-2.5 py-1 rounded-full font-bold">
                    未連結
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
                <Label htmlFor="gdrive-folder-cfg" className="text-stone-700 font-bold text-xs">
                  目標資料夾名稱或 Folder ID
                </Label>
                <Input
                  id="gdrive-folder-cfg"
                  value={gdriveFolderId}
                  onChange={(e) => setGdriveFolderId(e.target.value)}
                  placeholder="例如：1-oBiAmVK9J-nK7gS2rn9GlQmq_fMxhFo 或 R27_Backups"
                  className="h-10 text-xs bg-white"
                />
                <p className="text-[10px] text-stone-400">已預設連結至您的共享資料夾（亦可自訂名稱）。</p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800">Google 授權管理</span>
                  <button
                    type="button"
                    onClick={() => {
                      setClientIdInput(googleClientId || '')
                      setShowClientIdModal(true)
                    }}
                    className="text-[11px] text-stone-500 hover:text-stone-800 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-stone-400" />
                    <span>自訂 Client ID</span>
                  </button>
                </div>

                {!isGoogleConnected ? (
                  <Button
                    onClick={() => handleConnectGoogleDrive()}
                    disabled={isAuthorizing}
                    className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold gap-2 h-10 cursor-pointer"
                  >
                    {isAuthorizing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>正在請求 Google 授權...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-3.5 h-3.5 text-brand-400" />
                        <span>立即連結 Google 帳號授權</span>
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleConnectGoogleDrive()}
                      className="flex-1 rounded-xl text-xs font-bold h-10 cursor-pointer"
                    >
                      重新授權
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDisconnectGoogleDrive}
                      className="rounded-xl text-xs font-bold h-10 text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      中斷連結
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Tab 2: Custom Manual Export ── */}
      {activeTab === 'custom' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
          {/* Left Form: Scope & Modules */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Scope */}
            <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <span className="bg-stone-100 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <h3 className="font-bold text-stone-800 text-sm">選擇匯出範圍</h3>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {(['all', 'r27', 'coffit'] as const).map(scope => {
                  const label = scope === 'all' ? '全部場館' : scope === 'r27' ? 'R27 Fitness' : 'Coffit 訓練中心'
                  const isSelected = selectedScope === scope
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setSelectedScope(scope)}
                      className={`py-3.5 px-3 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-stone-950 border-stone-950 text-white shadow-md' 
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      <span>{label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isSelected ? 'bg-white/20 text-white/90' : 'bg-stone-50 text-stone-400'
                      }`}>
                        {scope === 'all' ? 'R27 + Coffit' : scope.toUpperCase()}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 2: Content Selection */}
            <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="bg-stone-100 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                  <h3 className="font-bold text-stone-800 text-sm">勾選匯出項目</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs font-bold text-brand-500 hover:text-brand-600 cursor-pointer transition-colors"
                  >
                    全選
                  </button>
                  <span className="text-stone-300 text-xs">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="text-xs font-bold text-stone-400 hover:text-stone-500 cursor-pointer transition-colors"
                  >
                    全不選
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(MODULE_LABELS).map(([key, label]) => {
                  const isChecked = selectedModules[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleModule(key)}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 select-none ${
                        isChecked 
                          ? 'border-brand-500 bg-brand-50/20 text-stone-900' 
                          : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="h-5 w-5 text-brand-500 shrink-0" />
                      ) : (
                        <Square className="h-5 w-5 text-stone-300 shrink-0" />
                      )}
                      <span className="text-xs font-bold">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Summary & Execution panel */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-stone-900 text-stone-100 p-6 rounded-[2.5rem] shadow-xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              
              <h3 className="text-base font-bold flex items-center gap-2 border-b border-stone-800 pb-3">
                <span>📋</span>
                自訂匯出確認
              </h3>

              <div className="space-y-4 text-xs">
                <div className="flex justify-between border-b border-stone-800 pb-2.5">
                  <span className="text-stone-400 font-medium">所選訓練中心</span>
                  <span className="font-bold text-white">
                    {selectedScope === 'all' ? '全部場館 (R27 + Coffit)' : selectedScope === 'r27' ? 'R27 Fitness' : 'Coffit 訓練中心'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2.5">
                  <span className="text-stone-400 font-medium">匯出項目數</span>
                  <span className="font-bold text-white">{selectedModulesCount} / {Object.keys(MODULE_LABELS).length} 項</span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2.5">
                  <span className="text-stone-400 font-medium">輸出格式</span>
                  <span className="font-bold text-brand-400">JSON (還原結構) + CSV (Excel 表)</span>
                </div>
              </div>

              <div className="flex gap-2.5 p-3 rounded-2xl bg-stone-800 border border-stone-700/50 text-[10px] text-stone-300 leading-relaxed">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div>
                  產生之 ZIP 壓縮檔內含 <strong>json/</strong> 與 <strong>csv/</strong> 目錄，可供報表統計或重新匯入。
                </div>
              </div>

              <button
                type="button"
                onClick={runBackup}
                disabled={exportStatus === 'running'}
                className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-stone-800 text-white disabled:text-stone-600 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20 cursor-pointer flex items-center justify-center gap-2"
              >
                {exportStatus === 'running' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>正在擷取並打包中 ({exportProgress}%)</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 text-white" />
                    <span>開始自訂匯出並下載 (.zip)</span>
                  </>
                )}
              </button>
            </div>

            {/* Progress / Logs Table */}
            {exportStatus !== 'idle' && (
              <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h4 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-stone-400" />
                    匯出執行明細
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    exportStatus === 'running' ? 'bg-amber-50 text-amber-600 animate-pulse' :
                    exportStatus === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {exportStatus === 'running' ? '處理中' : exportStatus === 'success' ? '完成' : '失敗'}
                  </span>
                </div>

                {exportStatus === 'running' && (
                  <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-brand-500 h-full transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                  </div>
                )}

                {exportStatus === 'error' && exportErrorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] font-mono text-red-600 leading-relaxed whitespace-pre-wrap">
                    {exportErrorMsg}
                  </div>
                )}

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {exportLogs.map((log, index) => (
                    <div key={log.collection + index} className="flex items-center justify-between text-xs py-1.5 border-b border-stone-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span className="font-mono text-stone-600">{COLLECTION_DISPLAY_NAMES[log.collection] || log.collection}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {log.status === 'pending' && <span className="text-[10px] text-stone-400 font-bold">排隊中</span>}
                        {log.status === 'loading' && (
                          <div className="flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin text-brand-500" />
                            <span className="text-[10px] text-brand-500 font-bold">處理中</span>
                          </div>
                        )}
                        {log.status === 'success' && (
                          <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold">
                            {log.message || `完成 (${log.count} 筆)`}
                          </span>
                        )}
                        {log.status === 'empty' && (
                          <span className="text-[10px] bg-stone-50 text-stone-400 px-1.5 py-0.5 rounded font-bold">
                            無資料 (0 筆)
                          </span>
                        )}
                        {log.status === 'error' && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold">
                            {log.message || '失敗'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Active Tab 2: Import & Restore ── */}
      {activeTab === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
          {/* Left: Upload Box & File Info */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
                <span className="bg-stone-100 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <h3 className="font-bold text-stone-800 text-sm">選擇備份檔案</h3>
              </div>

              {/* Upload Drop Area */}
              <div className="relative border-2 border-dashed border-stone-200 hover:border-brand-500 rounded-2xl p-8 text-center transition-all bg-stone-50/50 hover:bg-brand-50/10">
                <input
                  type="file"
                  accept=".zip,.json"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-800">
                      {importFile ? importFile.name : '點擊上傳備份檔 (.zip 或 .json)'}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-1">
                      支援先前導出的系統 ZIP 備份包或單一集合 JSON 檔案
                    </p>
                  </div>
                </div>
              </div>

              {importStatus === 'parsing' && (
                <div className="p-4 bg-amber-50 rounded-2xl flex items-center gap-2 text-xs font-bold text-amber-700 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  正在解析備份檔案內容...
                </div>
              )}

              {importStatus === 'error' && importErrorMsg && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-mono text-red-600 leading-relaxed">
                  {importErrorMsg}
                </div>
              )}
            </div>

            {/* Parsed Data Preview */}
            {parsedImportData && (
              <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4 text-stone-500" />
                    解析成功：檢測到 {Object.keys(parsedImportData).length} 個資料集合
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                    預備還原
                  </span>
                </div>

                <div className="divide-y divide-stone-100 text-xs">
                  {Object.entries(parsedImportData).map(([colName, list]) => (
                    <div key={colName} className="py-2.5 flex items-center justify-between">
                      <span className="font-mono text-stone-700 font-bold">
                        {COLLECTION_DISPLAY_NAMES[colName] || colName}
                      </span>
                      <span className="font-mono font-bold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full">
                        {list.length} 筆資料
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Confirmation & Restore Execution */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-stone-900 text-stone-100 p-6 rounded-[2.5rem] shadow-xl space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-orange-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
              
              <h3 className="text-base font-bold flex items-center gap-2 border-b border-stone-800 pb-3">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                還原作業警示與確認
              </h3>

              <div className="space-y-3 text-xs leading-relaxed text-stone-300">
                <p>
                  1. 還原過程將以 Document ID 為基準進行資料覆蓋或新增 (`setDoc merge`)，完整維持學員、合約與銷課紀錄間的關聯關係。
                </p>
                <p>
                  2. 日期與 Timestamp 物件將會自動轉換，維持系統日期搜尋與計算的精確度。
                </p>
              </div>

              <button
                type="button"
                onClick={runRestore}
                disabled={!parsedImportData || importStatus === 'restoring'}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 disabled:bg-stone-800 text-white disabled:text-stone-600 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-orange-600/20 cursor-pointer flex items-center justify-center gap-2"
              >
                {importStatus === 'restoring' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    <span>正在還原寫入資料庫 ({importProgress}%)</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 text-white" />
                    <span>開始執行資料還原</span>
                  </>
                )}
              </button>
            </div>

            {/* Restore Logs Progress */}
            {importStatus === 'restoring' || importStatus === 'success' ? (
              <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h4 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-stone-400" />
                    資料還原執行進度
                  </h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    importStatus === 'restoring' ? 'bg-amber-50 text-amber-600 animate-pulse' :
                    importStatus === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {importStatus === 'restoring' ? '還原中' : importStatus === 'success' ? '完成' : '失敗'}
                  </span>
                </div>

                <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-orange-600 h-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {importLogs.map((log, index) => (
                    <div key={log.collection + index} className="flex items-center justify-between text-xs py-1.5 border-b border-stone-50 last:border-0">
                      <span className="font-mono text-stone-600">{COLLECTION_DISPLAY_NAMES[log.collection] || log.collection}</span>
                      {log.status === 'success' ? (
                        <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold">
                          還原完成 ({log.count} 筆)
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-bold">處理中...</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Google OAuth Client ID Configuration Modal */}
      <Dialog open={showClientIdModal} onOpenChange={setShowClientIdModal}>
        <DialogContent className="max-w-md bg-white border border-stone-200 shadow-2xl rounded-2xl p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-stone-900 font-black text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-500" />
              設定 Google OAuth Client ID
            </DialogTitle>
            <DialogDescription className="text-stone-500 text-xs leading-relaxed">
              若要讓系統能直接將備份檔案傳送至您的 Google Drive，需要設定 Google Cloud 的 OAuth 2.0 Web Client ID。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1.5 leading-relaxed">
              <p className="font-bold text-stone-800">如何取得 Google Client ID：</p>
              <ol className="list-decimal list-inside space-y-1 text-stone-600">
                <li>至 <span className="font-mono text-brand-600">console.cloud.google.com</span> 選擇專案。</li>
                <li>前往「憑證 (Credentials)」建立「OAuth 2.0 Client ID (網頁應用程式)」。</li>
                <li>於已授權的 JavaScript 來源加入您的網站網址。</li>
                <li>複製 Client ID 並貼在下方欄位。</li>
              </ol>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-id-input" className="text-stone-700 font-bold text-xs">
                Google OAuth Client ID *
              </Label>
              <Input
                id="client-id-input"
                type="text"
                placeholder="例如：xxxxxx.apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                className="h-10 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowClientIdModal(false)}
              className="text-xs"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSaveClientId}
              className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold"
            >
              儲存並開始授權
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
