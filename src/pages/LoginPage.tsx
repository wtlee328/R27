import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { signIn, signUp } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  const { user, loading: authLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Reactive redirection ──────────────────────────────────
  useEffect(() => {
    if (user && !authLoading) {
      navigate(from, { replace: true })
    }
  }, [user, authLoading, navigate, from])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isRegister) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      if (isRegister) {
        setError(err.code === 'auth/email-already-in-use' ? '此電子郵件已被註冊。' : '註冊失敗，請稍後再試。')
      } else {
        setError('電子郵件或密碼錯誤，請重試。')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-950 relative overflow-hidden p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-600/8 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-brand-400/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10 flex justify-center">
          <img src="/assets/logos/on-dark/logo.png" alt="R27 Logo" className="h-28 w-auto object-contain drop-shadow-2xl" />
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl shadow-black/20 border border-white/20 p-8">
          <h2 className="text-lg font-bold text-stone-800 mb-1">
            {isRegister ? '建立教練帳號' : '歡迎回來'}
          </h2>
          <p className="text-sm text-stone-500 mb-6">
            {isRegister ? '註冊後即可開始管理您的客戶' : '登入您的帳號以繼續'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ... email field ... */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-stone-600">電子郵件</Label>
              <Input
                id="email"
                type="email"
                placeholder="trainer@r27.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 bg-stone-50 border-stone-200 focus:border-brand-400 focus:ring-brand-400/20"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-stone-600">密碼</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10 h-11 bg-stone-50 border-stone-200 focus:border-brand-400 focus:ring-brand-400/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {isRegister && <p className="text-[10px] text-stone-400 mt-1">密碼長度建議至少 6 個字元</p>}
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2.5 border border-red-100">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-11"
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

          <div className="mt-6 pt-6 border-t border-stone-100 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister)
                setError(null)
              }}
              className="text-sm text-stone-500 hover:text-brand-600 transition-colors font-medium"
            >
              {isRegister ? '已經有帳號了？點此登入' : '還沒有帳號？點此註冊教練帳號'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-stone-600 mt-8">
          © {new Date().getFullYear()} R27+ FITNESS. All rights reserved.
        </p>
      </div>
    </div>
  )
}
