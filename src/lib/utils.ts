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
