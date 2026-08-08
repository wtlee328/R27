import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Shield, Dumbbell, ChevronLeft } from 'lucide-react'
import { signIn, signUp } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'

type LoginProfile = 'admin' | 'r27-trainer' | 'coffit-trainer' | null

const TRAINER_EMAIL_MAP: Record<string, string> = {
  'r27-trainer': 'trainer-r27@r27app.com',
  'coffit-trainer': 'trainer-coffit@r27app.com',
}

const PROFILE_CONFIG = [
  {
    id: 'admin' as const,
    label: '管理員',
    sublabel: '全功能管理介面',
    icon: Shield,
    color: 'text-brand-500',
    bg: 'bg-brand-500/10 hover:bg-brand-500/20 border-brand-500/20',
    dot: 'bg-orange-500',
  },
  {
    id: 'r27-trainer' as const,
    label: 'R27 教練',
    sublabel: '銷課・體驗客・場租',
    icon: Dumbbell,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20',
    dot: 'bg-orange-500',
  },
  {
    id: 'coffit-trainer' as const,
    label: 'Coffit 教練',
    sublabel: '銷課・體驗客・場租',
    icon: Dumbbell,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20',
    dot: 'bg-sky-500',
  },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  const { user, loading: authLoading } = useAuthStore()
  const [profile, setProfile] = useState<LoginProfile>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user && !authLoading) {
      if (user.isSharedTrainerAccount) {
        navigate('/trainer/select', { replace: true })
      } else {
        navigate(from, { replace: true })
      }
    }
  }, [user, authLoading, navigate, from])

  function handleSelectProfile(p: LoginProfile) {
    setProfile(p)
    setError(null)
    setPassword('')
    if (p && p !== 'admin') {
      setEmail(TRAINER_EMAIL_MAP[p] || '')
    } else {
      setEmail('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const loginEmail = profile === 'admin' ? email : (TRAINER_EMAIL_MAP[profile!] || '')
      if (isRegister && profile === 'admin') {
        await signUp(loginEmail, password)
      } else {
        await signIn(loginEmail, password)
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      if (isRegister) {
        setError(err.code === 'auth/email-already-in-use' ? '此電子郵件已被註冊。' : '註冊失敗，請稍後再試。')
      } else {
        setError('密碼錯誤，請重試。')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-950 relative overflow-hidden p-4">
      {/* Background decorative blobs */}
      <div className="absolute inset-0 select-none pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-orange-600/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[700px] h-[700px] bg-sky-600/8 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-orange-400/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* ── Brand Header ── */}
        <div className="text-center mb-8 select-none space-y-5">
          {/* R27 Logo */}
          <div className="flex justify-center">
            <img
              src="/assets/logos/on-dark/logo.png"
              alt="R27 Logo"
              className="h-20 w-auto object-contain drop-shadow-2xl"
            />
          </div>

          {/* × Divider + COFFIT */}
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-600 to-stone-600" />
            <span className="text-stone-500 text-xs font-bold tracking-widest uppercase px-1">×</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-stone-600 to-stone-600" />
          </div>

          {/* COFFIT Wordmark */}
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              {/* Sky-blue accent bar */}
              <span className="inline-block w-4 h-0.5 rounded-full bg-sky-500" />
              <p className="text-white text-xl font-black tracking-[0.18em] uppercase">
                COFFIT
              </p>
              <span className="inline-block w-4 h-0.5 rounded-full bg-sky-500" />
            </div>
            <p className="text-stone-500 text-[11px] tracking-widest uppercase font-semibold">
              健身管理系統
            </p>
          </div>
        </div>

        {/* ── Card ── */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl shadow-black/30 border border-white/10 p-7">
          {!profile ? (
            /* ── Profile Selector ── */
            <>
              <div className="mb-5">
                <h2 className="text-base font-black text-stone-900 tracking-tight">選擇登入身份</h2>
                <p className="text-xs text-stone-400 mt-0.5">請選擇您的登入身份以繼續</p>
              </div>
              <div className="space-y-2.5">
                {PROFILE_CONFIG.map((cfg) => {
                  const Icon = cfg.icon
                  return (
                    <button
                      key={cfg.id}
                      onClick={() => handleSelectProfile(cfg.id)}
                      className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer group ${cfg.bg}`}
                    >
                      <div className="w-9 h-9 bg-white/80 rounded-lg shadow-sm flex items-center justify-center shrink-0 group-hover:shadow-md transition-shadow">
                        <Icon className={`h-4.5 w-4.5 ${cfg.color}`} style={{ width: '18px', height: '18px' }} />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="font-bold text-stone-800 text-sm leading-tight">{cfg.label}</div>
                        <div className="text-[11px] text-stone-500 mt-0.5">{cfg.sublabel}</div>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} opacity-60 group-hover:opacity-100 transition-opacity shrink-0`} />
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            /* ── Login Form ── */
            <>
              <button
                type="button"
                onClick={() => { setProfile(null); setError(null); setIsRegister(false) }}
                className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors mb-5 -mt-1 cursor-pointer font-semibold"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                返回選擇身份
              </button>

              {/* Profile badge */}
              <div className="flex items-center gap-2.5 mb-5">
                {(() => {
                  const cfg = PROFILE_CONFIG.find(c => c.id === profile)
                  const Icon = cfg?.icon || Shield
                  return (
                    <>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg?.bg ?? ''}`}>
                        <Icon className={`h-4 w-4 ${cfg?.color ?? ''}`} />
                      </div>
                      <div>
                        <h2 className="text-sm font-black text-stone-900">
                          {profile === 'admin' ? (isRegister ? '建立管理員帳號' : '管理員登入') : `${cfg?.label} 登入`}
                        </h2>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          {profile === 'admin'
                            ? (isRegister ? '註冊後即可開始管理' : '登入您的管理員帳號以繼續')
                            : '請輸入教練密碼以繼續'
                          }
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {profile === 'admin' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-stone-600 text-xs font-semibold">電子郵件</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@r27.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-10 bg-stone-50 border-stone-200 focus:border-brand-400 focus:ring-brand-400/20 text-sm"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-stone-600 text-xs font-semibold">密碼</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      autoFocus
                      className="pr-10 h-10 bg-stone-50 border-stone-200 focus:border-brand-400 focus:ring-brand-400/20 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isRegister && <p className="text-[10px] text-stone-400 mt-1">密碼長度建議至少 6 個字元</p>}
                </div>

                {error && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2.5 border border-red-100">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 cursor-pointer text-sm font-bold"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isRegister ? '註冊中...' : '登入中...'}
                    </>
                  ) : (isRegister ? '註冊' : '登入')}
                </Button>
              </form>

              {profile === 'admin' && (
                <div className="mt-5 pt-5 border-t border-stone-100 text-center">
                  <button
                    type="button"
                    onClick={() => { setIsRegister(!isRegister); setError(null) }}
                    className="text-xs text-stone-400 hover:text-brand-600 transition-colors font-semibold cursor-pointer"
                  >
                    {isRegister ? '已經有帳號了？點此登入' : '還沒有帳號？點此註冊管理員帳號'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-stone-600 mt-6 tracking-wide">
          © {new Date().getFullYear()} R27 FITNESS STATION × COFFIT. All rights reserved.
        </p>
      </div>
    </div>
  )
}
