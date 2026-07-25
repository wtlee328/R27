import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import type { Timestamp } from 'firebase/firestore'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Date helpers ─────────────────────────────────────────────
export function tsToDate(ts: Timestamp): Date {
  return ts.toDate()
}

export function formatDate(ts: Timestamp | null | undefined, fmt = 'yyyy/MM/dd'): string {
  if (!ts) return '—'
  return format(ts.toDate(), fmt, { locale: zhTW })
}

export function formatMinguoDate(val: Timestamp | Date | string | null | undefined, formatStyle: 'full' | 'slash' = 'full'): string {
  if (!val) return '未提供'
  let d: Date
  if (val && typeof (val as any).toDate === 'function') {
    d = (val as Timestamp).toDate()
  } else if (val instanceof Date) {
    d = val
  } else if (typeof val === 'string') {
    d = new Date(val)
  } else {
    return '未提供'
  }
  if (isNaN(d.getTime())) return '未提供'
  const rocYear = d.getFullYear() - 1911
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  if (formatStyle === 'slash') {
    return `民國 ${rocYear}/${month}/${day}`
  }
  return `民國 ${rocYear} 年 ${month} 月 ${day} 日`
}

export function formatMonth(ts: Timestamp): string {
  return format(ts.toDate(), 'yyyy年M月', { locale: zhTW })
}

export function daysUntil(ts: Timestamp): number {
  return differenceInDays(ts.toDate(), new Date())
}

export function isBirthdayThisMonth(ts: Timestamp): boolean {
  const date = ts.toDate()
  return date.getMonth() === new Date().getMonth()
}

// ─── Number helpers ───────────────────────────────────────────
export function formatCurrency(amount: number): string {
  return `NT$ ${amount.toLocaleString('zh-TW')}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('zh-TW')
}

// ─── String helpers ───────────────────────────────────────────
export function maskIdNumber(id: string): string {
  if (id.length < 4) return id
  return id.slice(0, 3) + '****' + id.slice(-3)
}
