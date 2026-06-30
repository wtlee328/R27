import { useState } from 'react'
import { Database, AlertTriangle, Play, CheckCircle2, RefreshCw } from 'lucide-react'
import { collection, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { toast } from 'sonner'

interface MigrationLog {
  collection: string
  processed: number
  updated: number
}

export default function BackupPage() {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [logs, setLogs] = useState<MigrationLog[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const runMigration = async () => {
    if (!window.confirm('確定要執行場館欄位資料庫遷移？這將會更新所有沒有 centerId 欄位的現有資料，預設場館為 R27 Fitness。')) {
      return
    }

    setStatus('running')
    setLogs([])
    setErrorMsg(null)

    const collectionsToMigrate = [
      'users',
      'trainers',
      'customers',
      'contracts',
      'lessonRecords',
      'cashFlowRecords',
      'trialRecords',
      'venueRentals',
      'notifications',
      'renterCustomers'
    ]

    try {
      const newLogs: MigrationLog[] = []

      for (const colName of collectionsToMigrate) {
        console.log(`Migrating collection: ${colName}...`)
        const colRef = collection(db, colName)
        const snap = await getDocs(colRef)
        
        let processed = 0
        let updated = 0
        
        // Split into batches of 400 to be safe (Firestore limit is 500)
        let batch = writeBatch(db)
        let batchCount = 0

        for (const docSnap of snap.docs) {
          processed++
          const data = docSnap.data()
          
          // Only update if centerId is missing
          if (!data.centerId) {
            const docRef = doc(db, colName, docSnap.id)
            batch.update(docRef, {
              centerId: 'r27',
              updatedAt: serverTimestamp()
            })
            batchCount++
            updated++

            if (batchCount >= 400) {
              await batch.commit()
              batch = writeBatch(db)
              batchCount = 0
            }
          }
        }

        if (batchCount > 0) {
          await batch.commit()
        }

        newLogs.push({
          collection: colName,
          processed,
          updated
        })
        setLogs([...newLogs])
      }

      setStatus('success')
      toast.success('資料庫遷移完成！')
    } catch (err: any) {
      console.error('Migration error:', err)
      setErrorMsg(err.message || '資料庫遷移過程中發生錯誤')
      setStatus('error')
      toast.error('資料庫遷移失敗')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">數據管理</h1>
        <p className="text-sm text-stone-500 mt-1">執行資料庫維護、欄位遷移與數據備份</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm flex flex-col gap-6">
        <div className="flex items-start gap-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-800">場館支援遷移 (Multi-Center Migration)</h4>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">
              此工具將會掃描所有資料庫表格，並為所有現存沒有 <strong>centerId</strong> 的文檔添加預設值 <code>"r27"</code>。
              請於發布新版本或需要同步現有數據至 R27 場館時點擊執行。此動作不可逆，請謹慎操作。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 pt-6">
          <div>
            <p className="text-sm font-medium text-stone-700">場館欄位資料庫更新</p>
            <p className="text-xs text-stone-500 mt-0.5">目前受影響表格數：10</p>
          </div>
          
          <button
            onClick={runMigration}
            disabled={status === 'running'}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:bg-stone-200 text-white disabled:text-stone-400 rounded-lg text-sm font-medium transition-all shadow-sm shadow-brand-500/10 cursor-pointer"
          >
            {status === 'running' ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>正在遷移中...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                <span>執行資料庫遷移</span>
              </>
            )}
          </button>
        </div>

        {status === 'running' && (
          <div className="border-t border-stone-100 pt-6">
            <p className="text-xs font-semibold text-stone-700 mb-3">執行進度：</p>
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto bg-stone-50 p-4 border border-stone-200 rounded-lg">
              <p className="text-xs text-stone-500 animate-pulse">正在掃描資料庫...</p>
            </div>
          </div>
        )}

        {(status === 'success' || logs.length > 0) && (
          <div className="border-t border-stone-100 pt-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-semibold">
                {status === 'success' ? '遷移順利完成！' : '正在執行遷移中...'}
              </span>
            </div>
            
            <div className="border border-stone-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold">
                    <th className="p-3">資料表名稱</th>
                    <th className="p-3 text-right">已掃描筆數</th>
                    <th className="p-3 text-right">已更新 (r27) 筆數</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.collection} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="p-3 font-mono text-stone-600">{log.collection}</td>
                      <td className="p-3 text-right text-stone-500">{log.processed}</td>
                      <td className="p-3 text-right font-semibold text-brand-600">{log.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {status === 'error' && errorMsg && (
          <div className="border-t border-stone-100 pt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <p className="font-semibold mb-1">錯誤資訊：</p>
            <p className="font-mono leading-relaxed">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  )
}
