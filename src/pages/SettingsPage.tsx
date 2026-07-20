import React from 'react'
import { Settings, GripVertical, RotateCcw, Clock, Lock, Check } from 'lucide-react'
import { RiSettings4Line } from '@remixicon/react'
import { Reorder } from 'framer-motion'
import { collection, getDocs, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore'
import { db, firebaseConfig } from '@/lib/firebase'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, updatePassword } from 'firebase/auth'
import { useAuthStore } from '@/stores/authStore'
import { useMenuStore, ALL_NAV_ITEMS } from '@/stores/menuStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const order = useMenuStore((state) => state.order)
  const setOrder = useMenuStore((state) => state.setOrder)
  const resetOrder = useMenuStore((state) => state.resetOrder)

  const isAdmin = user?.role === 'admin'


  // Operating Hours states (0 is Sunday, 1 is Monday, ..., 6 is Saturday)
  const [r27Hours, setR27Hours] = React.useState<Record<string, { startTime: string; endTime: string }>>({
    '0': { startTime: '09:00', endTime: '05:00' },
    '1': { startTime: '09:00', endTime: '05:00' },
    '2': { startTime: '09:00', endTime: '05:00' },
    '3': { startTime: '09:00', endTime: '05:00' },
    '4': { startTime: '09:00', endTime: '05:00' },
    '5': { startTime: '09:00', endTime: '05:00' },
    '6': { startTime: '09:00', endTime: '05:00' },
  })
  const [coffitHours, setCoffitHours] = React.useState<Record<string, { startTime: string; endTime: string }>>({
    '0': { startTime: '09:00', endTime: '05:00' },
    '1': { startTime: '09:00', endTime: '05:00' },
    '2': { startTime: '09:00', endTime: '05:00' },
    '3': { startTime: '09:00', endTime: '05:00' },
    '4': { startTime: '09:00', endTime: '05:00' },
    '5': { startTime: '09:00', endTime: '05:00' },
    '6': { startTime: '09:00', endTime: '05:00' },
  })
  const [hoursLoading, setHoursLoading] = React.useState(false)
  const [hoursStatus, setHoursStatus] = React.useState<string | null>(null)

  // Trainer Password states
  const [pwCenter, setPwCenter] = React.useState<'r27' | 'coffit'>('r27')
  const [currentPw, setCurrentPw] = React.useState('')
  const [newPw, setNewPw] = React.useState('')
  const [pwLoading, setPwLoading] = React.useState(false)
  const [pwStatus, setPwStatus] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Load Operating Hours
  React.useEffect(() => {
    if (!isAdmin) return
    async function loadHours() {
      try {
        const docSnap = await getDoc(doc(db, 'systemConfig', 'operatingHours'))
        if (docSnap.exists()) {
          const data = docSnap.data()
          
          const defaultWeek = {
            '0': { startTime: '09:00', endTime: '05:00' },
            '1': { startTime: '09:00', endTime: '05:00' },
            '2': { startTime: '09:00', endTime: '05:00' },
            '3': { startTime: '09:00', endTime: '05:00' },
            '4': { startTime: '09:00', endTime: '05:00' },
            '5': { startTime: '09:00', endTime: '05:00' },
            '6': { startTime: '09:00', endTime: '05:00' },
          }

          if (data.r27) {
            // Backward compatibility
            if (data.r27.startTime) {
              const mapped = { ...defaultWeek }
              for (let i = 0; i <= 6; i++) {
                mapped[String(i)] = {
                  startTime: data.r27.startTime,
                  endTime: data.r27.endTime || '05:00'
                }
              }
              setR27Hours(mapped)
            } else {
              setR27Hours({ ...defaultWeek, ...data.r27 })
            }
          }
          if (data.coffit) {
            // Backward compatibility
            if (data.coffit.startTime) {
              const mapped = { ...defaultWeek }
              for (let i = 0; i <= 6; i++) {
                mapped[String(i)] = {
                  startTime: data.coffit.startTime,
                  endTime: data.coffit.endTime || '05:00'
                }
              }
              setCoffitHours(mapped)
            } else {
              setCoffitHours({ ...defaultWeek, ...data.coffit })
            }
          }
        }
      } catch (err) {
        console.error('Error loading operating hours:', err)
      }
    }
    loadHours()
  }, [isAdmin])

  const handleSaveHours = async () => {
    setHoursLoading(true)
    setHoursStatus(null)
    try {
      await setDoc(doc(db, 'systemConfig', 'operatingHours'), {
        r27: r27Hours,
        coffit: coffitHours,
      })
      setHoursStatus('營業時間設定已成功儲存！')
      setTimeout(() => setHoursStatus(null), 3000)
    } catch (err: any) {
      console.error(err)
      setHoursStatus(`儲存失敗：${err.message || String(err)}`)
    } finally {
      setHoursLoading(false)
    }
  }

  const handleChangeTrainerPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPw || !newPw) return

    setPwLoading(true)
    setPwStatus(null)

    const trainerEmail = pwCenter === 'r27' ? 'trainer-r27@r27app.com' : 'trainer-coffit@r27app.com'

    // We initialize a secondary App client-side, log in to update the password, then delete it.
    let secondaryApp
    try {
      secondaryApp = initializeApp(firebaseConfig, 'SecondaryAuthUpdate')
      const secondaryAuth = getAuth(secondaryApp)
      
      // Sign in as trainer
      await signInWithEmailAndPassword(secondaryAuth, trainerEmail, currentPw)
      
      // Update password
      if (secondaryAuth.currentUser) {
        await updatePassword(secondaryAuth.currentUser, newPw)
      } else {
        throw new Error('未成功載入教練使用者資訊')
      }

      setPwStatus({ type: 'success', message: `${pwCenter === 'r27' ? 'R27' : 'Coffit'} 教練密碼更新成功！` })
      setCurrentPw('')
      setNewPw('')
    } catch (err: any) {
      console.error('Error changing trainer password:', err)
      let msg = '密碼更新失敗，請檢查目前密碼是否正確。'
      if (err.code === 'auth/weak-password') {
        msg = '新密碼強度不足，長度建議至少 6 個字元。'
      }
      setPwStatus({ type: 'error', message: msg })
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp)
        } catch (e) {
          console.error(e)
        }
      }
      setPwLoading(false)
    }
  }


  // Filter items based on user role
  const visibleItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin
    return true
  })

  // Get current order of visible items
  const sortedVisibleItems = order
    .map((id) => visibleItems.find((item) => item.id === id))
    .filter((item): item is typeof ALL_NAV_ITEMS[0] => !!item)

  // Local state for ultra-smooth drag (prevents heavy global re-renders and localStorage synchronous write blocks on every pixel of movement)
  const [localItems, setLocalItems] = React.useState<typeof ALL_NAV_ITEMS>(sortedVisibleItems)

  // Sync local items when global order changes (e.g. on Reset)
  React.useEffect(() => {
    setLocalItems(sortedVisibleItems)
  }, [order])

  // Commit the final order to the global Zustand store and localStorage when the drag gestures conclude
  const handleDragEnd = () => {
    const newOrderOfVisibleIds = localItems.map((item) => item.id)
    // Keep any hidden/unpermitted items at their original relative positions
    const hiddenIds = order.filter((id) => !visibleItems.some((item) => item.id === id))
    const finalOrder = [...newOrderOfVisibleIds, ...hiddenIds]
    setOrder(finalOrder)
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
          <RiSettings4Line className="w-6 h-6 text-orange-500" />
          系統設定
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          個人化調整您的系統介面與導覽選單排版
        </p>
      </div>

      {/* Main Settings Card */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-stone-900 via-stone-800 to-stone-700" />

        <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-100">
          <div>
            <h2 className="text-lg font-bold text-stone-800">導覽選單排序</h2>
            <p className="text-xs text-stone-400 mt-1">
              拖曳項目以調整左側邊欄的選單順序（即時生效，精確無特效）
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetOrder}
            className="text-stone-500 hover:text-stone-900 hover:bg-stone-50 font-bold gap-1.5 rounded-lg border-stone-200 shadow-sm"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重設順序
          </Button>
        </div>

        {/* Reorderable List */}
        <Reorder.Group
          axis="y"
          values={localItems}
          onReorder={setLocalItems}
          className="flex flex-col gap-2.5"
        >
          {localItems.map((item) => {
            const Icon = item.icon
            return (
              <Reorder.Item
                key={item.id}
                value={item}
                onDragEnd={handleDragEnd}
                dragElastic={0} // Prevents rubber-banding past bounds
                dragMomentum={false} // Removes sliding momentum inertia for instant 1:1 cursor lock
                className="group relative flex items-center justify-between p-4 bg-stone-50/50 hover:bg-white border border-stone-200/60 hover:border-stone-300 rounded-xl shadow-sm cursor-grab active:cursor-grabbing select-none z-50"
                // Snappy, rigid, linear layout movement instead of loose springs
                transition={{ type: 'tween', duration: 0.12, ease: 'easeOut' }}
                // Extremely clean lifting drop-shadow, no scaling or bouncy color transforms
                whileDrag={{
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                  backgroundColor: '#ffffff'
                }}
              >
                <div className="flex items-center gap-3.5">
                  <span className="p-2 bg-white rounded-lg border border-stone-200/50 text-stone-500 group-hover:text-stone-800 transition-colors shadow-sm">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <span className="font-bold text-stone-700 group-hover:text-stone-900 transition-colors text-sm">
                      {item.label}
                    </span>
                    {item.adminOnly && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60 uppercase tracking-wider">
                        管理員專屬
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400 group-hover:text-stone-500 transition-colors font-medium mr-2">
                    拖曳調整
                  </span>
                  <GripVertical className="h-4 w-4 text-stone-300 group-hover:text-stone-500 transition-colors shrink-0" />
                </div>
              </Reorder.Item>
            )
          })}
        </Reorder.Group>

        {/* Hint for Trainers */}
        {!isAdmin && (
          <div className="mt-6 flex items-start gap-3 p-4 bg-amber-50/30 border border-amber-200/40 rounded-xl">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-800">您目前以教練身份登入</h4>
              <p className="text-[11px] text-amber-700/80 mt-1 leading-relaxed">
                只有管理員能看見並排列「會計管理」、「場租管理」與「數據管理」等管理功能。您可以隨意排列您的個人視圖選單。
              </p>
            </div>
          </div>
        )}
      </div>


      {/* Operating Hours Card */}
      {isAdmin && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden mt-6">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-stone-900 via-stone-800 to-stone-700" />
          
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <Clock className="h-5 w-5 text-stone-600" />
                場館營業時間設定
              </h2>
              <p className="text-xs text-stone-400 mt-1">
                設定 R27 與 Coffit 的場租營業時段（預設為 09:00 - 05:00）
              </p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* R27 Operating Hours */}
              <div className="space-y-4 p-4 bg-stone-50/50 rounded-xl border border-stone-200/60">
                <h3 className="text-sm font-bold text-stone-800 border-b border-stone-200/40 pb-1.5 flex justify-between">
                  <span>R27 Fitness</span>
                  <span className="text-[10px] text-stone-400 font-normal">開始 / 結束 (當天)</span>
                </h3>
                <div className="space-y-3 pb-1">
                  {[
                    { key: '1', label: '週一' },
                    { key: '2', label: '週二' },
                    { key: '3', label: '週三' },
                    { key: '4', label: '週四' },
                    { key: '5', label: '週五' },
                    { key: '6', label: '週六' },
                    { key: '0', label: '週日' },
                  ].map((day) => (
                    <div key={day.key} className="grid grid-cols-3 gap-2 items-center text-xs">
                      <span className="font-bold text-stone-600">{day.label}</span>
                      <Input
                        type="text"
                        placeholder="09:00"
                        value={r27Hours[day.key]?.startTime || '09:00'}
                        onChange={(e) => {
                          setR27Hours({
                            ...r27Hours,
                            [day.key]: {
                              ...(r27Hours[day.key] || { endTime: '05:00' }),
                              startTime: e.target.value,
                            },
                          })
                        }}
                        className="bg-white border-stone-200 h-8 text-[11px] px-2"
                      />
                      <Input
                        type="text"
                        placeholder="05:00"
                        value={r27Hours[day.key]?.endTime || '05:00'}
                        onChange={(e) => {
                          setR27Hours({
                            ...r27Hours,
                            [day.key]: {
                              ...(r27Hours[day.key] || { startTime: '09:00' }),
                              endTime: e.target.value,
                            },
                          })
                        }}
                        className="bg-white border-stone-200 h-8 text-[11px] px-2"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Coffit Operating Hours */}
              <div className="space-y-4 p-4 bg-stone-50/50 rounded-xl border border-stone-200/60">
                <h3 className="text-sm font-bold text-stone-800 border-b border-stone-200/40 pb-1.5 flex justify-between">
                  <span>Coffit</span>
                  <span className="text-[10px] text-stone-400 font-normal">開始 / 結束 (當天)</span>
                </h3>
                <div className="space-y-3 pb-1">
                  {[
                    { key: '1', label: '週一' },
                    { key: '2', label: '週二' },
                    { key: '3', label: '週三' },
                    { key: '4', label: '週四' },
                    { key: '5', label: '週五' },
                    { key: '6', label: '週六' },
                    { key: '0', label: '週日' },
                  ].map((day) => (
                    <div key={day.key} className="grid grid-cols-3 gap-2 items-center text-xs">
                      <span className="font-bold text-stone-600">{day.label}</span>
                      <Input
                        type="text"
                        placeholder="09:00"
                        value={coffitHours[day.key]?.startTime || '09:00'}
                        onChange={(e) => {
                          setCoffitHours({
                            ...coffitHours,
                            [day.key]: {
                              ...(coffitHours[day.key] || { endTime: '05:00' }),
                              startTime: e.target.value,
                            },
                          })
                        }}
                        className="bg-white border-stone-200 h-8 text-[11px] px-2"
                      />
                      <Input
                        type="text"
                        placeholder="05:00"
                        value={coffitHours[day.key]?.endTime || '05:00'}
                        onChange={(e) => {
                          setCoffitHours({
                            ...coffitHours,
                            [day.key]: {
                              ...(coffitHours[day.key] || { startTime: '09:00' }),
                              endTime: e.target.value,
                            },
                          })
                        }}
                        className="bg-white border-stone-200 h-8 text-[11px] px-2"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {hoursStatus && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0" />
                <span>{hoursStatus}</span>
              </div>
            )}

            <Button
              onClick={handleSaveHours}
              disabled={hoursLoading}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer"
            >
              {hoursLoading ? '儲存中...' : '儲存營業時間'}
            </Button>
          </div>
        </div>
      )}

      {/* Trainer Password Management Card */}
      {isAdmin && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden mt-6">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-stone-900 via-stone-800 to-stone-700" />
          
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <Lock className="h-5 w-5 text-stone-600" />
                教練帳號密碼管理
              </h2>
              <p className="text-xs text-stone-400 mt-1">
                修改 R27 或 Coffit 教練專屬之共享登入密碼
              </p>
            </div>
          </div>
          
          <form onSubmit={handleChangeTrainerPassword} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5 col-span-3">
                <Label className="text-xs font-bold text-stone-700">選擇場館帳號</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name="pwCenter"
                      checked={pwCenter === 'r27'}
                      onChange={() => setPwCenter('r27')}
                      className="text-brand-500 focus:ring-brand-500"
                    />
                    <span>R27 (trainer-r27@r27app.com)</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name="pwCenter"
                      checked={pwCenter === 'coffit'}
                      onChange={() => setPwCenter('coffit')}
                      className="text-brand-500 focus:ring-brand-500"
                    />
                    <span>Coffit (trainer-coffit@r27app.com)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5 col-span-3 md:col-span-1.5">
                <Label htmlFor="currentPw" className="text-xs font-bold text-stone-700">目前教練密碼 *</Label>
                <Input
                  id="currentPw"
                  type="password"
                  required
                  placeholder="請輸入目前的密碼"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="bg-white border-stone-200"
                />
              </div>

              <div className="space-y-1.5 col-span-3 md:col-span-1.5">
                <Label htmlFor="newPw" className="text-xs font-bold text-stone-700">新教練密碼 *</Label>
                <Input
                  id="newPw"
                  type="password"
                  required
                  placeholder="輸入 6 位數以上之新密碼"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="bg-white border-stone-200"
                />
              </div>
            </div>

            {pwStatus && (
              <div className={`p-3 border rounded-xl text-xs flex items-center gap-2 ${
                pwStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {pwStatus.type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <ShieldAlert className="h-4 w-4 shrink-0" />}
                <span>{pwStatus.message}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={pwLoading}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer animate-fade-in"
            >
              {pwLoading ? '更新密碼中...' : '更新教練密碼'}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
