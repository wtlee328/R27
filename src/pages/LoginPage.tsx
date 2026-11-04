import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ChevronLeft, ArrowRight } from 'lucide-react'
import { signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import type { CenterId } from '@/stores/centerStore'

type LoginRole = 'admin' | 'trainer' | null

const TRAINER_EMAIL_MAP: Record<CenterId, string> = {
  hongshulin_branch: 'trainer-hongshulin@r27app.com',
  tianmu_branch: 'trainer-tianmu@r27app.com',
}

interface SelectorOption {
  id: string
  label: string
  sublabel: string
  dotColor: string
  glowColor: string
  glowColorStrong: string
}

const ROLE_OPTIONS: SelectorOption[] = [
  {
    id: 'admin',
    label: '管理員',
    sublabel: '全功能管理介面',
    dotColor: 'bg-white',
    glowColor: 'rgba(255,255,255,0.15)',
    glowColorStrong: 'rgba(255,255,255,0.35)',
  },
  {
    id: 'trainer',
    label: '教練',
    sublabel: '銷課・體驗客・場租',
    dotColor: 'bg-orange-500',
    glowColor: 'rgba(249,115,22,0.18)',
    glowColorStrong: 'rgba(249,115,22,0.30)',
  },
]

const BRANCH_OPTIONS: (SelectorOption & { id: CenterId })[] = [
  {
    id: 'hongshulin_branch',
    label: 'R27 紅樹林店',
    sublabel: '紅樹林店教練專區・銷課・體驗客・場租',
    dotColor: 'bg-orange-500',
    glowColor: 'rgba(249,115,22,0.18)',
    glowColorStrong: 'rgba(249,115,22,0.30)',
  },
  {
    id: 'tianmu_branch',
    label: 'R27 天母店',
    sublabel: '天母店教練專區・銷課・體驗客・場租',
    dotColor: 'bg-sky-400',
    glowColor: 'rgba(56,189,248,0.15)',
    glowColorStrong: 'rgba(56,189,248,0.28)',
  },
]

function OptionButton({ cfg, onClick }: { cfg: SelectorOption; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-stone-700/40 border border-stone-600/40 cursor-pointer group transition-all duration-300"
      style={{
        boxShadow: hovered
          ? `0 0 0 1px ${cfg.glowColorStrong}, 0 0 18px 4px ${cfg.glowColor}, inset 0 0 12px 0px ${cfg.glowColor}`
          : '0 0 0 1px transparent',
        backgroundColor: hovered ? 'rgba(255,255,255,0.04)' : undefined,
      }}
    >
      <div className="flex-1 text-left min-w-0">
        <div
          className="font-bold text-[13px] leading-tight transition-colors duration-200"
          style={{ color: hovered ? '#ffffff' : '#d4d0ca' }}
        >
          {cfg.label}
        </div>
        <div
          className="text-[11px] mt-0.5 transition-colors duration-200"
          style={{ color: hovered ? '#a8a29e' : '#57534e' }}
        >
          {cfg.sublabel}
        </div>
      </div>
      <ArrowRight
        className="w-4 h-4 shrink-0 transition-all duration-200"
        style={{
          color: hovered ? '#a8a29e' : '#44403c',
          transform: hovered ? 'translateX(2px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  const { user, loading: authLoading } = useAuthStore()
  const [role, setRole] = useState<LoginRole>(null)
  const [branch, setBranch] = useState<CenterId | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  function handleSelectRole(selectedRole: LoginRole) {
    setRole(selectedRole)
    setBranch(null)
    setError(null)
    setPassword('')
    setEmail('')
  }

  function handleSelectBranch(selectedBranch: CenterId) {
    setBranch(selectedBranch)
    setError(null)
    setPassword('')
    setEmail(TRAINER_EMAIL_MAP[selectedBranch] || '')
  }

  function handleBack() {
    setError(null)
    setPassword('')
    if (role === 'trainer' && branch) {
      setBranch(null)
      setEmail('')
    } else {
      setRole(null)
      setBranch(null)
      setEmail('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const loginEmail =
        role === 'admin'
          ? email
          : branch
            ? TRAINER_EMAIL_MAP[branch]
            : ''
      await signIn(loginEmail, password)
    } catch (err: any) {
      console.error('Auth error:', err)
      setError('帳號或密碼錯誤，請重試。')
      setLoading(false)
    }
  }

  const selectedBranchCfg = branch ? BRANCH_OPTIONS.find((b) => b.id === branch) : null

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4" style={{ background: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #1c1917 100%)' }}>
      {/* Background decorative elements */}
      <div className="absolute inset-0 select-none pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-[700px] h-[700px] rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" style={{ background: 'radial-gradient(circle, rgba(234,88,12,0.38) 0%, transparent 65%)' }} />
        <div className="absolute bottom-0 right-0 w-[800px] h-[800px] rounded-full blur-3xl translate-x-1/3 translate-y-1/3" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.28) 0%, transparent 65%)' }} />
        <div className="absolute top-1/2 left-1/2 w-[550px] h-[550px] rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" style={{ background: 'radial-gradient(circle, rgba(168,162,158,0.18) 0%, transparent 65%)' }} />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* ── Brand Header ── */}
        <div className="text-center mb-10 select-none space-y-4">
          {/* R27 Logo */}
          <div className="flex justify-center">
            <img
              src="/assets/logos/on-dark/logo.png"
              alt="R27 Logo"
              className="h-20 w-auto object-contain drop-shadow-2xl"
            />
          </div>

          <div className="space-y-1">
            <p className="text-stone-400 text-[11px] tracking-[0.2em] uppercase font-semibold">
              健身管理系統
            </p>
          </div>
        </div>

        {/* ── Card ── */}
        <div className="bg-stone-800/70 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/50 border border-stone-700/60 overflow-hidden">
          {!role ? (
            /* ── Step 1: Role Selector ── */
            <div className="p-6">
              <div className="mb-5">
                <h2 className="text-sm font-bold text-stone-300 tracking-wide">選擇登入角色</h2>
              </div>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((cfg) => (
                  <OptionButton
                    key={cfg.id}
                    cfg={cfg}
                    onClick={() => handleSelectRole(cfg.id as LoginRole)}
                  />
                ))}
              </div>
            </div>
          ) : role === 'trainer' && !branch ? (
            /* ── Step 2: Branch Selector (for Trainers) ── */
            <div className="p-6">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 transition-colors mb-5 -mt-1 cursor-pointer font-medium"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                返回選擇角色
              </button>
              <div className="mb-5">
                <h2 className="text-sm font-bold text-stone-200 tracking-wide">選擇所屬分店</h2>
                <p className="text-[11px] text-stone-500 mt-0.5">請選擇您所屬的 R27 分店以繼續登入</p>
              </div>
              <div className="space-y-2">
                {BRANCH_OPTIONS.map((cfg) => (
                  <OptionButton
                    key={cfg.id}
                    cfg={cfg}
                    onClick={() => handleSelectBranch(cfg.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* ── Step 3 / Admin: Login Form ── */
            <div className="p-6">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-300 transition-colors mb-5 -mt-1 cursor-pointer font-medium"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {role === 'trainer' ? '返回選擇分店' : '返回選擇角色'}
              </button>

              {/* Profile badge */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className={`w-2 h-2 rounded-full ${
                    role === 'admin' ? 'bg-white' : (selectedBranchCfg?.dotColor ?? 'bg-orange-500')
                  } shrink-0`}
                />
                <div>
                  <h2 className="text-sm font-bold text-stone-200">
                    {role === 'admin' ? '管理員登入' : `${selectedBranchCfg?.label ?? 'R27'} 教練登入`}
                  </h2>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {role === 'admin'
                      ? '請輸入管理員帳號與密碼以繼續'
                      : '請輸入教練密碼以繼續'
                    }
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {role === 'admin' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-stone-400 text-xs font-medium">管理員電子郵件</Label>
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
                      登入中...
                    </>
                  ) : '登入'}
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-stone-700 mt-7 tracking-wider">
          © {new Date().getFullYear()} R27 FITNESS STATION
        </p>
      </div>
    </div>
  )
}
