import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dumbbell, ArrowRight, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useCenterStore } from '@/stores/centerStore'
import { useTrainerProfileStore } from '@/stores/trainerProfileStore'
import { useTrainers } from '@/hooks/useTrainers'
import { signOut } from '@/lib/auth'

export default function TrainerSelectPage() {
  const { user } = useAuthStore()
  const { setCenterId } = useCenterStore()
  const { setSelectedTrainer } = useTrainerProfileStore()
  const navigate = useNavigate()

  // Sync centerId from the logged-in shared account
  useEffect(() => {
    if (user?.centerId) {
      setCenterId(user.centerId as any)
    }
  }, [user, setCenterId])

  const { trainers, loading } = useTrainers()

  const centerLabel = user?.centerId === 'coffit' ? 'Coffit' : 'R27 Fitness'

  function handleSelect(id: string, name: string) {
    setSelectedTrainer(id, name)
    navigate('/trainer/lessons', { replace: true })
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-600/8 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
      </div>

      <div className="relative w-full max-w-lg animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8 flex justify-center select-none">
          <img src="/assets/logos/on-dark/logo.png" alt="R27 Logo" className="h-24 w-auto object-contain drop-shadow-2xl" />
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl shadow-black/20 border border-white/20 p-8">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-stone-900">選擇教練身份</h2>
                <p className="text-stone-500 text-sm mt-1">
                  {centerLabel} 教練入口 — 請選擇您的教練帳號
                </p>
              </div>
              <span className="text-xs bg-stone-100 text-stone-500 font-semibold px-3 py-1.5 rounded-full border border-stone-200">
                {centerLabel}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-stone-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : trainers.length === 0 ? (
            <div className="text-center py-12 text-stone-400">
              <Dumbbell className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">尚未設定任何教練</p>
              <p className="text-xs mt-1">請聯絡管理員新增教練帳號</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trainers.map((trainer) => (
                <button
                  key={trainer.id}
                  onClick={() => handleSelect(trainer.id, trainer.name)}
                  className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-stone-200 hover:border-brand-400 hover:bg-brand-50/30 transition-all duration-150 cursor-pointer group text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center shrink-0 group-hover:bg-brand-500 transition-colors">
                      <Dumbbell className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="font-bold text-stone-900 text-sm">{trainer.name}</div>
                      {trainer.email && (
                        <div className="text-xs text-stone-500 mt-0.5">{trainer.email}</div>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-stone-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>
          )}

          {/* Sign out link */}
          <div className="mt-6 pt-5 border-t border-stone-100 flex justify-center">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition-colors cursor-pointer font-medium"
            >
              <LogOut className="h-3.5 w-3.5" />
              登出
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-stone-600 mt-6">
          © {new Date().getFullYear()} R27+ FITNESS. All rights reserved.
        </p>
      </div>
    </div>
  )
}
