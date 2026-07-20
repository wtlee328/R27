import { useState, useMemo } from 'react'
import { RiHardDrive2Line } from '@remixicon/react'
import { 
  Database, 
  AlertTriangle, 
  Play, 
  CheckCircle2, 
  RefreshCw, 
  Cloud, 
  Calendar, 
  Download, 
  CheckSquare, 
  Square,
  FileText,
  Clock,
  ArrowRight
} from 'lucide-react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { toast } from 'sonner'
import { format } from 'date-fns'
import JSZip from 'jszip'
import { Label } from '../components/ui/label'

type ScopeType = 'all' | 'r27' | 'coffit'

interface BackupLog {
  collection: string
  count: number
  status: 'pending' | 'loading' | 'success' | 'empty' | 'error'
}

const MODULE_LABELS: Record<string, string> = {
  customers: '客戶檔案',
  lessonRecords: '教練銷課',
  finance: '會計管理 (合約與金流)',
  trialRecords: '體驗客資料',
  venueRentals: '場租管理明細',
  activityLogs: '系統操作記錄',
}

const MODULE_COLLECTIONS: Record<string, string[]> = {
  customers: ['customers'],
  lessonRecords: ['lessonRecords'],
  finance: ['contracts', 'cashFlowRecords'],
  trialRecords: ['trialRecords'],
  venueRentals: ['venueRentals'],
  activityLogs: ['activityLogs'],
}

export default function BackupPage() {
  const [selectedScope, setSelectedScope] = useState<ScopeType>('all')
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({
    customers: true,
    lessonRecords: true,
    finance: true,
    trialRecords: true,
    venueRentals: true,
    activityLogs: true,
  })

  // Google Drive Placeholder settings
  const [syncToGDrive, setSyncToGDrive] = useState(false)
  const [gdriveFolderId, setGdriveFolderId] = useState('R27_Coffit_Backups')
  const [backupSchedule, setBackupSchedule] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none')

  // Run status
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [logs, setLogs] = useState<BackupLog[]>([])
  const [progressPercent, setProgressPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Toggle helpers
  const handleSelectAll = () => {
    setSelectedModules({
      customers: true,
      lessonRecords: true,
      finance: true,
      trialRecords: true,
      venueRentals: true,
      activityLogs: true,
    })
  }

  const handleDeselectAll = () => {
    setSelectedModules({
      customers: false,
      lessonRecords: false,
      finance: false,
      trialRecords: false,
      venueRentals: false,
      activityLogs: false,
    })
  }

  const toggleModule = (key: string) => {
    setSelectedModules(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  // Count active modules
  const selectedModulesCount = useMemo(() => {
    return Object.values(selectedModules).filter(Boolean).length
  }, [selectedModules])

  // Convert raw objects list to reader-friendly CSV (with translated headers and mapping IDs to names)
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
      return String(val)
    }

    let headers: string[] = []
    let mapper: (row: any) => Record<string, any>

    switch (colName) {
      case 'customers':
        headers = [
          '姓名', '電話', '電子郵件', '身分證字號', '出生日期',
          '歷史上課堂數', '負責教練',
          '緊急聯絡人姓名', '與緊急聯絡人關係', '緊急聯絡人電話',
          '健康狀況與病史備註'
        ]
        mapper = (row) => ({
          '姓名': row.name || '',
          '電話': row.phone || '',
          '電子郵件': row.email || '',
          '身分證字號': row.idNumber || '',
          '出生日期': formatTime(row.dateOfBirth),
          '歷史上課堂數': row.historicalSessions ?? 0,
          '負責教練': trainerMap[row.trainerId] || '',
          '緊急聯絡人姓名': row.emergencyContact?.name || '',
          '與緊急聯絡人關係': row.emergencyContact?.relation || '',
          '緊急聯絡人電話': row.emergencyContact?.phone || '',
          '健康狀況與病史備註': row.medicalHistory?.notes || ''
        })
        break

      case 'lessonRecords':
        headers = ['學員姓名', '銷課教練', '上課時間', '扣除堂數', '課後備註']
        mapper = (row) => ({
          '學員姓名': row.customerName || '',
          '銷課教練': trainerMap[row.trainerId] || '',
          '上課時間': formatTime(row.sessionDate),
          '扣除堂數': row.sessionAmount ?? 0,
          '課後備註': row.notes || ''
        })
        break

      case 'contracts':
        headers = [
          '合約編號', '簽約學員', '負責教練', '合約類型', '總堂數',
          '剩餘堂數', '單堂費用 (NT$)', '合約總金額 (NT$)', '已繳款金額 (NT$)',
          '付款方式', '分期期數', '合約開始日期', '合約結束日期', '合約狀態'
        ]
        mapper = (row) => ({
          '合約編號': row.contractNo || '',
          '簽約學員': customerMap[row.customerId] || '',
          '負責教練': trainerMap[row.trainerId] || '',
          '合約類型': row.contractType === 'dual' ? '雙人' : '單人',
          '總堂數': row.totalSessions ?? 0,
          '剩餘堂數': row.remainingSessions ?? 0,
          '單堂費用 (NT$)': row.pricePerSession ?? 0,
          '合約總金額 (NT$)': row.totalAmount ?? 0,
          '已繳款金額 (NT$)': row.paidAmount ?? 0,
          '付款方式': row.paymentType === 'installments' ? '分期付款' : '單次付清',
          '分期期數': row.installmentCount || 1,
          '合約開始日期': formatTime(row.startDate),
          '合約結束日期': formatTime(row.endDate),
          '合約狀態': row.status === 'active' ? '執行中' :
                     row.status === 'expiring' ? '即將過期' :
                     row.status === 'expired' ? '已過期' : '已完成'
        })
        break

      case 'cashFlowRecords':
        headers = ['交易日期', '經手教練', '交易類型', '會計科目', '資金帳戶', '交易金額', '摘要說明', '備註說明']
        mapper = (row) => {
          const typeLabel = row.type === 'income' ? '收入 (+)' : row.type === 'expense' ? '支出 (-)' : '一般收支'
          const cat = row.category || row.creditCategory || row.debitCategory || ''
          const amt = row.amount ?? row.creditAmount ?? row.debitAmount ?? 0
          const acc = row.account || (row.debitCategory && ['現金', '銀行存款', '公司存款'].some(c => row.debitCategory.includes(c)) ? row.debitCategory : '公司存款')
          return {
            '交易日期': formatTime(row.date),
            '經手教練': trainerMap[row.trainerId] || '',
            '交易類型': typeLabel,
            '會計科目': cat,
            '資金帳戶': acc,
            '交易金額': amt,
            '摘要說明': row.description || '',
            '備註說明': row.notes || ''
          }
        }
        break

      case 'trialRecords':
        headers = ['客戶姓名', '聯絡電話', '電子郵件', '預約體驗日期', '負責教練', '成交結果', '諮詢備註']
        mapper = (row) => ({
          '客戶姓名': row.clientName || '',
          '聯絡電話': row.phone || '',
          '電子郵件': row.email || '',
          '預約體驗日期': formatTime(row.date),
          '負責教練': trainerMap[row.trainerId] || '',
          '成交結果': row.outcome === 'converted' ? '已成交' :
                     row.outcome === 'not_converted' ? '未成交' : '跟進中',
          '諮詢備註': row.notes || ''
        })
        break

      case 'venueRentals':
        headers = ['場租日期', '承租對象', '場租金額 (NT$)', '用途備註', '登記教練']
        mapper = (row) => ({
          '場租日期': formatTime(row.date),
          '承租對象': row.renterName || '',
          '場租金額 (NT$)': row.amount ?? 300,
          '用途備註': row.notes || '',
          '登記教練': trainerMap[row.trainerId] || ''
        })
        break

      case 'activityLogs':
        headers = ['操作時間', '操作人員 (教練)', '動作', '模組', '異動摘要說明']
        mapper = (row) => ({
          '操作時間': formatTime(row.timestamp),
          '操作人員 (教練)': row.trainerName || '',
          '動作': row.action === 'create' ? '新增' :
                 row.action === 'update' ? '修改' : '刪除',
          '模組': row.module === 'lessonRecords' ? '教練銷課' :
                 row.module === 'trialRecords' ? '體驗課' :
                 row.module === 'venueBookings' ? '場租預約' : '學員合約與檔案',
          '異動摘要說明': row.recordSummary || ''
        })
        break

      default:
        // Fallback: use generic keys if unknown
        const keys = Array.from(new Set(data.flatMap(item => Object.keys(item)))).filter(k => k !== 'id')
        headers = ['id', ...keys]
        mapper = (row) => {
          const item: Record<string, any> = { 'id': row.id }
          keys.forEach(k => {
            item[k] = row[k]
          })
          return item
        }
    }

    const csvRows = []
    
    // Header Row with double quotes escaping
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','))
    
    // Data Rows
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

  // Pre-configured upload to Google Drive API (For future integration)
  const uploadBackupToGoogleDrive = async (zipBlob: Blob, folderName: string): Promise<boolean> => {
    console.log(`[API STUB] Preparing upload of ${zipBlob.size} bytes to Google Drive folder: ${folderName}`)
    // This API structure is reserved. Once OAuth integration is ready, we will call Google Drive API.
    return new Promise((resolve) => setTimeout(() => resolve(true), 1500))
  }

  // Start backup process
  const runBackup = async () => {
    if (selectedModulesCount === 0) {
      toast.error('請至少選擇一個要備份的資料項目')
      return
    }

    setStatus('running')
    setProgressPercent(0)
    setErrorMsg(null)

    // Build initial log state
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
    setLogs(initialLogs)

    try {
      const zip = new JSZip()
      const jsonFolder = zip.folder('json')
      const csvFolder = zip.folder('csv')

      // Fetch lookup mappings for reader-friendly CSVs
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
        setLogs([...updatedLogs])

        // Fetching data
        const colRef = collection(db, logItem.collection)
        let snap
        if (selectedScope === 'all') {
          snap = await getDocs(colRef)
        } else {
          // Filter by centerId
          const q = query(colRef, where('centerId', '==', selectedScope))
          snap = await getDocs(q)
        }

        const dataList = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))

        logItem.count = dataList.length
        logItem.status = dataList.length > 0 ? 'success' : 'empty'

        const MODULE_CSV_FILENAMES: Record<string, string> = {
          customers: '客戶檔案',
          lessonRecords: '教練銷課',
          contracts: '會計管理_合約',
          cashFlowRecords: '會計管理_收支金流',
          trialRecords: '體驗客資料',
          venueRentals: '場租管理明細',
          activityLogs: '系統操作記錄',
        }

        if (dataList.length > 0) {
          // Write JSON
          jsonFolder?.file(`${logItem.collection}.json`, JSON.stringify(dataList, null, 2))
          
          // Write CSV with Chinese filename
          const csvContent = jsonToFriendlyCsv(logItem.collection, dataList, trainerMap, customerMap)
          const csvFilename = MODULE_CSV_FILENAMES[logItem.collection] || logItem.collection
          csvFolder?.file(`${csvFilename}.csv`, '\ufeff' + csvContent) // Prepend UTF-8 BOM for Excel Chinese compatibility
        }

        completedSteps++
        setProgressPercent(Math.round((completedSteps / totalSteps) * 80))
        setLogs([...updatedLogs])
      }

      // Generate Zip client-side
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      setProgressPercent(90)

      // Stub call for Google Drive synchronization
      if (syncToGDrive) {
        await uploadBackupToGoogleDrive(zipBlob, gdriveFolderId)
      }

      // Browser trigger download
      const dateStr = format(new Date(), 'yyyyMMdd_HHmmss')
      const scopeLabel = selectedScope === 'all' ? '全部場館' : selectedScope === 'r27' ? 'R27_Fitness' : 'Coffit_訓練中心'
      const filename = `系統備份_${scopeLabel}_${dateStr}.zip`

      const downloadUrl = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)

      setProgressPercent(100)
      setStatus('success')
      toast.success('備份包下載完成！')
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || '備份過程中發生未知錯誤')
      setStatus('error')
      toast.error('資料備份失敗，請檢視日誌')
    }
  }

  return (
    <div className="flex flex-col gap-8 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
            <RiHardDrive2Line className="w-6 h-6 text-orange-500" />
            資料備份
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            匯出系統資料以做備份或日後還原。支援匯出完整結構之 JSON 檔案，以及便於 Excel 閱讀之 CSV 檔案。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: Scope & Modules & GDrive Placeholder */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Scope */}
          <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <span className="bg-stone-100 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <h3 className="font-bold text-stone-800 text-sm">選擇備份範圍</h3>
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
                <h3 className="font-bold text-stone-800 text-sm">勾選備份項目</h3>
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

          {/* Step 3: Google Drive Sync & Scheduler Placeholder */}
          <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <span className="bg-stone-100 text-stone-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <Cloud className="w-4 h-4 text-stone-400" />
              <h3 className="font-bold text-stone-800 text-sm">雲端儲存空間同步與自動排程</h3>
              <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded-full font-bold ml-auto select-none">
                結構預留
              </span>
            </div>

            <div className="space-y-4">
              {/* Sync Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="gdrive-sync" className="text-stone-800 font-bold text-xs block">同步上傳至 Google Drive</Label>
                  <span className="text-[10px] text-stone-400 font-medium">備份完成後將同時把壓縮檔案上傳至您的雲端資料夾</span>
                </div>
                <input
                  type="checkbox"
                  id="gdrive-sync"
                  checked={syncToGDrive}
                  onChange={(e) => setSyncToGDrive(e.target.checked)}
                  className="w-9 h-5 bg-stone-200 checked:bg-brand-500 rounded-full transition-colors cursor-pointer appearance-none relative before:content-[''] before:absolute before:w-4 before:h-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-transform"
                />
              </div>

              {/* Folder ID */}
              {syncToGDrive && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <Label htmlFor="gdrive-folder" className="text-stone-700 font-bold text-xs">Google Drive 資料夾名稱</Label>
                  <input
                    type="text"
                    id="gdrive-folder"
                    value={gdriveFolderId}
                    onChange={(e) => setGdriveFolderId(e.target.value)}
                    className="w-full h-10 px-3 border border-stone-200 rounded-xl text-xs bg-white text-stone-800 font-medium focus:ring-2 focus:ring-brand-500/20 outline-none"
                    placeholder="請輸入雲端目錄名稱"
                  />
                </div>
              )}

              {/* Scheduler */}
              <div className="space-y-1.5 pt-2 border-t border-stone-100">
                <Label htmlFor="backup-schedule" className="text-stone-700 font-bold text-xs block">設定自動排程備份</Label>
                <div className="flex gap-2">
                  <select
                    id="backup-schedule"
                    value={backupSchedule}
                    onChange={(e) => setBackupSchedule(e.target.value as any)}
                    className="flex-1 bg-white border border-stone-200 text-stone-800 px-3 py-2 rounded-xl text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer font-bold h-9 outline-none"
                  >
                    <option value="none">無 (僅手動備份)</option>
                    <option value="daily">每日自動備份 (每晚 02:00)</option>
                    <option value="weekly">每週自動備份 (每週日凌晨)</option>
                    <option value="monthly">每月自動備份 (每月 1 號凌晨)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Summary & Execution panel */}
        <div className="lg:col-span-5 space-y-6">
          {/* Summary Card */}
          <div className="bg-stone-900 text-stone-100 p-6 rounded-[2.5rem] shadow-xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
            
            <h3 className="text-base font-bold flex items-center gap-2 border-b border-stone-800 pb-3">
              <span>📋</span>
              備份摘要與設定確認
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between border-b border-stone-800 pb-2.5">
                <span className="text-stone-400 font-medium">所選訓練中心</span>
                <span className="font-bold text-white">
                  {selectedScope === 'all' ? '全部場館 (R27 + Coffit)' : selectedScope === 'r27' ? 'R27 Fitness' : 'Coffit 訓練中心'}
                </span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2.5">
                <span className="text-stone-400 font-medium">備份項目數</span>
                <span className="font-bold text-white">{selectedModulesCount} / 6 項</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2.5">
                <span className="text-stone-400 font-medium">輸出格式</span>
                <span className="font-bold text-brand-400">JSON (還原結構) + CSV (Excel 表)</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-stone-400 font-medium">雲端同步</span>
                <span className={`font-bold ${syncToGDrive ? 'text-green-400' : 'text-stone-500'}`}>
                  {syncToGDrive ? '啟用 (預留結構)' : '未啟用'}
                </span>
              </div>
            </div>

            {/* Warn notice */}
            <div className="flex gap-2.5 p-3 rounded-2xl bg-stone-800 border border-stone-700/50 text-[10px] text-stone-300 leading-relaxed">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                備份產生的 ZIP 壓縮檔內含 <strong>json/</strong> 與 <strong>csv/</strong> 目錄。JSON 檔案保留完整資料結構型別，支援未來的「資料還原」功能，請將此備份檔妥善保存。
              </div>
            </div>

            {/* Launch Button */}
            <button
              type="button"
              onClick={runBackup}
              disabled={status === 'running'}
              className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 disabled:bg-stone-800 text-white disabled:text-stone-600 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-brand-500/20 cursor-pointer flex items-center justify-center gap-2"
            >
              {status === 'running' ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-white" />
                  <span>正在擷取資料庫並壓縮中 ({progressPercent}%)</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 text-white" />
                  <span>開始備份並下載 ZIP 檔案</span>
                </>
              )}
            </button>
          </div>

          {/* Progress / Logs Table */}
          {status !== 'idle' && (
            <div className="bg-white p-6 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <h4 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-stone-400" />
                  備份執行明細
                </h4>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  status === 'running' ? 'bg-amber-50 text-amber-600 animate-pulse' :
                  status === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>
                  {status === 'running' ? '備份中' : status === 'success' ? '完成' : '失敗'}
                </span>
              </div>

              {/* Progress Bar */}
              {status === 'running' && (
                <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-brand-500 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
              )}

              {/* Error Box */}
              {status === 'error' && errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-[10px] font-mono text-red-600 leading-relaxed whitespace-pre-wrap">
                  {errorMsg}
                </div>
              )}

              {/* Logs List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {logs.map((log, index) => (
                  <div key={log.collection + index} className="flex items-center justify-between text-xs py-1.5 border-b border-stone-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-stone-400" />
                      <span className="font-mono text-stone-600">{log.collection}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {log.status === 'pending' && <span className="text-[10px] text-stone-400 font-bold">排隊中</span>}
                      {log.status === 'loading' && (
                        <div className="flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 animate-spin text-brand-500" />
                          <span className="text-[10px] text-brand-500 font-bold">下載中</span>
                        </div>
                      )}
                      {log.status === 'success' && (
                        <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-bold">
                          完成 ({log.count} 筆)
                        </span>
                      )}
                      {log.status === 'empty' && (
                        <span className="text-[10px] bg-stone-50 text-stone-400 px-1.5 py-0.5 rounded font-bold">
                          無資料 (0 筆)
                        </span>
                      )}
                      {log.status === 'error' && (
                        <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold">
                          失敗
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
    </div>
  )
}
