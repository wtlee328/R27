import { Database, CloudOff } from 'lucide-react'

export default function BackupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">數據管理</h1>
        <p className="text-sm text-stone-500 mt-1">匯出或匯入系統資料</p>
      </div>
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-20 flex flex-col items-center justify-center gap-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-stone-100">
          <Database className="h-6 w-6 text-stone-400" />
        </div>
        <div className="text-center">
          <p className="text-stone-600 font-medium">開發中</p>
          <p className="text-stone-400 text-sm mt-1">此功能即將上線，敬請期待</p>
        </div>
      </div>
    </div>
  )
}
