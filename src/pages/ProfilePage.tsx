import { useAuthStore } from '@/stores/authStore'
import { User } from 'lucide-react'
import { RiUser3Line } from '@remixicon/react'

export default function ProfilePage() {
  const { user } = useAuthStore()

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
          <RiUser3Line className="w-6 h-6 text-orange-500" />
          個人資訊
        </h1>
        <p className="text-sm text-stone-500 mt-1">查看您的帳號詳情</p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-8 flex flex-col gap-6 shadow-sm">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/25">
            <User className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-stone-900">{user?.displayName || '未設定名稱'}</h2>
            <p className="text-stone-500 mt-0.5">{user?.email}</p>
            <div className="mt-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200/60">
                {user?.role === 'admin' ? '系統管理員' : '健身教練'}
              </span>
            </div>
          </div>
        </div>
        
        <hr className="border-stone-100" />
        
        <div>
          <h3 className="text-lg font-semibold text-stone-900 mb-4">帳號詳細資訊</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
            <div className="bg-stone-50 rounded-lg p-4">
              <dt className="text-xs font-semibold text-stone-500 uppercase tracking-wider">使用者 ID</dt>
              <dd className="mt-1.5 text-sm text-stone-900 font-mono truncate">{user?.uid}</dd>
            </div>
            <div className="bg-stone-50 rounded-lg p-4">
              <dt className="text-xs font-semibold text-stone-500 uppercase tracking-wider">帳號建立時間</dt>
              <dd className="mt-1.5 text-sm text-stone-900">
                {user?.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleString() : '-'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
