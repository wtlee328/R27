import { Loader2 } from 'lucide-react'

export function PageLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full p-8 space-y-4 animate-in fade-in duration-300">
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-stone-200 dark:border-stone-800" />
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin absolute" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-xs font-semibold text-stone-600 dark:text-stone-300 tracking-wide">載入模組中...</p>
        <p className="text-[10px] text-stone-400">正在準備頁面資料與介面</p>
      </div>
    </div>
  )
}
