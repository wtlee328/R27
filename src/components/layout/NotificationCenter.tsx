import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, CheckCheck, Clock, AlertTriangle, X } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import type { AppNotification } from '@/types'
import { cn } from '@/lib/utils'

function timeAgo(timestamp: any): string {
  if (!timestamp) return ''
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (days > 0) return `${days} 天前`
  if (hours > 0) return `${hours} 小時前`
  if (minutes > 0) return `${minutes} 分鐘前`
  return '剛剛'
}

function NotificationIcon({ type }: { type: AppNotification['type'] }) {
  if (type === 'installment_overdue') {
    return <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
  }
  if (type === 'installment_due') {
    return <Clock className="h-4 w-4 text-amber-400 shrink-0" />
  }
  if (type === 'contract_expiring') {
    return <BellRing className="h-4 w-4 text-orange-400 shrink-0" />
  }
  return <Bell className="h-4 w-4 text-stone-400 shrink-0" />
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleNotificationClick(notif: AppNotification) {
    if (!notif.isRead) {
      await markAsRead(notif.id)
    }
    if (notif.customerId) {
      navigate('/')
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-all duration-200"
        aria-label="通知中心"
      >
        {unreadCount > 0 ? (
          <BellRing className="h-5 w-5 animate-[wiggle_0.5s_ease-in-out]" />
        ) : (
          <Bell className="h-5 w-5" />
        )}

        {/* Red dot badge */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[9px] font-bold text-white leading-none shadow-lg shadow-red-500/30 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-12 w-80 sm:w-96 bg-stone-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-400" />
              <span className="text-sm font-semibold text-stone-100">通知中心</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500 rounded-full text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-brand-400 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  全部已讀
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-stone-500 hover:text-stone-300 transition-colors rounded-md hover:bg-white/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="p-3 bg-white/5 rounded-full">
                  <Bell className="h-6 w-6 text-stone-600" />
                </div>
                <p className="text-sm text-stone-500">沒有通知</p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {notifications.map(notif => (
                  <li key={notif.id}>
                    <button
                      onClick={() => handleNotificationClick(notif)}
                      className={cn(
                        'w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-white/5',
                        !notif.isRead && 'bg-brand-500/5'
                      )}
                    >
                      {/* Icon */}
                      <div className={cn(
                        'mt-0.5 p-1.5 rounded-lg shrink-0',
                        notif.type === 'installment_overdue' ? 'bg-red-500/15' :
                        notif.type === 'installment_due' ? 'bg-amber-500/15' :
                        'bg-white/5'
                      )}>
                        <NotificationIcon type={notif.type} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            'text-[13px] font-medium leading-snug',
                            notif.isRead ? 'text-stone-400' : 'text-stone-100'
                          )}>
                            {notif.title}
                          </p>
                          {/* Unread indicator */}
                          {!notif.isRead && (
                            <span className="mt-1 w-2 h-2 rounded-full bg-red-500 shrink-0 shadow-sm shadow-red-500/50" />
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-stone-600 mt-1">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-white/10 bg-stone-950/50">
              <p className="text-center text-[11px] text-stone-600">
                共 {notifications.length} 則通知 · {unreadCount} 則未讀
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
