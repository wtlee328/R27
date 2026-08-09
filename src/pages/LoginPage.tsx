import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ChevronLeft, ArrowRight } from 'lucide-react'
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
    accent: 'border-l-orange-400',
    accentBg: 'group-hover:bg-orange-500/5',
    dotColor: 'bg-orange-400',
    iconLetter: '管',
  },
  {
    id: 'r27-trainer' as const,
    label: 'R27 教練',
    sublabel: '銷課・體驗客・場租',
    accent: 'border-l-orange-500',
    accentBg: 'group-hover:bg-orange-500/5',
    dotColor: 'bg-orange-500',
    iconLetter: 'R',
  },
  {
    id: 'coffit-trainer' as const,
    label: 'Coffit 教練',
    sublabel: '銷課・體驗客・場租',
    accent: 'border-l-sky-400',
    accentBg: 'group-hover:bg-sky-500/5',
    dotColor: 'bg-sky-400',
    iconLetter: 'C',
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
      {/* Background decorative elements */}
      <div className="absolute inset-0 select-none pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-orange-600/8 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[700px] h-[700px] bg-sky-600/6 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-stone-500/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* ── Brand Header ── */}
        <div className="text-center mb-10 select-none space-y-5">
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
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-700 to-stone-700" />
            <span className="text-stone-600 text-xs font-bold tracking-widest uppercase px-1">×</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-stone-700 to-stone-700" />
          </div>

          {/* COFFIT Wordmark */}
          <div className="space-y-1.5">
            <p className="text-white/90 text-xl font-black tracking-[0.2em] uppercase">
              COFFIT
            </p>
            <p className="text-stone-500 text-[11px] tracking-[0.15em] uppercase font-medium">
              健身管理系統
            </p>
          </div>
        </div>

        {/* ── Card ── */}
        <div className="bg-stone-900/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/40 border border-stone-800/80 overflow-hidden">
          {!profile ? (
            /* ── Profile Selector ── */
            <div className="p-6">
              <div className="mb-5">
                <h2 className="text-sm font-bold text-stone-300 tracking-wide">選擇登入身份</h2>
              </div>
              <div className="space-y-2">
                {PROFILE_CONFIG.map((cfg) => (
                  <button
                    key={cfg.id}
                    onClick={() => handleSelectProfile(cfg.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border-l-[3px] ${cfg.accent} bg-stone-800/50 hover:bg-stone-800/90 transition-all duration-200 cursor-pointer group`}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <div className="font-bold text-stone-200 text-[13px] leading-tight group-hover:text-white transition-colors">
                        {cfg.label}
                      </div>
                      <div className="text-[11px] text-stone-500 mt-0.5 group-hover:text-stone-400 transition-colors">
                        {cfg.sublabel}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Login Form ── */
            <div className="p-6">
              <button
                type="button"
                onClick={() => { setProfile(null); setError(null); setIsRegister(false) }}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 transition-colors mb-5 -mt-1 cursor-pointer font-medium"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                返回
              </button>

              {/* Profile badge */}
              {(() => {
                const cfg = PROFILE_CONFIG.find(c => c.id === profile)
                return (
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-2 h-2 rounded-full ${cfg?.dotColor ?? 'bg-stone-400'} shrink-0`} />
                    <div>
                      <h2 className="text-sm font-bold text-stone-200">
                        {profile === 'admin' ? (isRegister ? '建立管理員帳號' : '管理員登入') : `${cfg?.label} 登入`}
                      </h2>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {profile === 'admin'
                          ? (isRegister ? '註冊後即可開始管理' : '登入您的管理員帳號以繼續')
                          : '請輸入教練密碼以繼續'
                        }
                      </p>
                    </div>
                  </div>
                )
              })()}

              <form onSubmit={handleSubmit} className="space-y-4">
                {profile === 'admin' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-stone-400 text-xs font-medium">電子郵件</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@r27.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-10 bg-stone-800/60 border-stone-700/60 focus:border-stone-500 focus:ring-stone-500/20 text-sm text-stone-200 placeholder:text-stone-600"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-stone-400 text-xs font-medium">密碼</Label>
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
                      className="pr-10 h-10 bg-stone-800/60 border-stone-700/60 focus:border-stone-500 focus:ring-stone-500/20 text-sm text-stone-200 placeholder:text-stone-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {isRegister && <p className="text-[10px] text-stone-500 mt-1">密碼長度建議至少 6 個字元</p>}
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2.5 border border-red-500/20">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 cursor-pointer text-sm font-bold bg-stone-200 text-stone-900 hover:bg-white transition-colors"
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
                <div className="mt-5 pt-5 border-t border-stone-800 text-center">
                  <button
                    type="button"
                    onClick={() => { setIsRegister(!isRegister); setError(null) }}
                    className="text-xs text-stone-500 hover:text-stone-300 transition-colors font-medium cursor-pointer"
                  >
                    {isRegister ? '已經有帳號了？點此登入' : '還沒有帳號？點此註冊管理員帳號'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-stone-700 mt-7 tracking-wider">
          © {new Date().getFullYear()} R27 FITNESS STATION × COFFIT
        </p>
      </div>
    </div>
  )
}
