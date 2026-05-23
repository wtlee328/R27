import React from 'react'
import { Settings, GripVertical, RotateCcw, ShieldAlert } from 'lucide-react'
import { Reorder } from 'framer-motion'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useMenuStore, ALL_NAV_ITEMS } from '@/stores/menuStore'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const order = useMenuStore((state) => state.order)
  const setOrder = useMenuStore((state) => state.setOrder)
  const resetOrder = useMenuStore((state) => state.resetOrder)

  const isAdmin = user?.role === 'admin'

  const [migrationLoading, setMigrationLoading] = React.useState(false)
  const [migrationStatus, setMigrationStatus] = React.useState<string | null>(null)

  const handleMigrate = async () => {
    setMigrationLoading(true)
    setMigrationStatus('開始遷移舊合約資料...')
    try {
      const contractsRef = collection(db, 'contracts')
      const contractsSnapshot = await getDocs(contractsRef)
      let migratedCount = 0
      let skippedCount = 0

      for (const docObj of contractsSnapshot.docs) {
        const data = docObj.data()
        if (!data.customerIds) {
          const customerIds = [data.customerId]
          if (data.sharedWithCustomerId) {
            customerIds.push(data.sharedWithCustomerId)
          }
          
          await updateDoc(doc(db, 'contracts', docObj.id), {
            customerIds: customerIds,
            contractType: data.sharedWithCustomerId ? 'dual' : 'single',
            primaryCustomerId: data.customerId
          })
          migratedCount++
        } else {
          skippedCount++
        }
      }
      setMigrationStatus(`遷移完成！成功升級 ${migratedCount} 份合約，跳過已升級的 ${skippedCount} 份合約。`)
    } catch (err: any) {
      console.error('Migration error:', err)
      setMigrationStatus(`遷移失敗：${err.message || String(err)}`)
    } finally {
      setMigrationLoading(false)
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
          <span className="p-2 bg-stone-100 rounded-xl inline-flex">
            <Settings className="h-6 w-6 text-stone-700" />
          </span>
          系統設定
        </h1>
        <p className="text-sm text-stone-500 mt-2 pl-1">
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

      {/* Database Migration Card for Admin */}
      {isAdmin && (
        <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden mt-6">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-yellow-500" />
          
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-lg font-bold text-stone-800">資料庫系統遷移工具</h2>
              <p className="text-xs text-stone-400 mt-1">
                將舊的單人合約結構升級為支援雙人合約的 `customerIds` 陣列結構。
              </p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-amber-50/30 border border-amber-200/40 rounded-xl flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-800">注意：此操作會修改現有資料</h4>
                <p className="text-[11px] text-amber-700/80 mt-1 leading-relaxed">
                  點擊下方按鈕將掃描 `contracts` 集合中所有未升級的合約，並為其初始化 `customerIds`、`contractType` 和 `primaryCustomerId` 欄位。此操作安全且可重複執行，不會覆蓋已升級的資料。
                </p>
              </div>
            </div>

            {migrationStatus && (
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono text-stone-600">
                {migrationStatus}
              </div>
            )}

            <Button
              onClick={handleMigrate}
              disabled={migrationLoading}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 rounded-xl transition-all"
            >
              {migrationLoading ? '正在遷移中...' : '執行合約資料結構升級 (Migrate)'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
