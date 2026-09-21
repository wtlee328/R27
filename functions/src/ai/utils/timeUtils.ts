/**
 * 🇹🇼 Taiwan Timezone (Asia/Taipei, UTC+8) Utilities
 */

export interface TaipeiDateTimeInfo {
  year: number
  month: number
  day: number
  weekday: string
  dateStr: string // YYYY-MM-DD
  timeStr: string // HH:mm:ss
  fullString: string
  currentMonthStartDate: string // YYYY-MM-01
  lastMonthYear: number
  lastMonth: number
  threeMonthsAgoStartDate: string
  sixMonthsAgoStartDate: string
}

export function getTaipeiDateTimeInfo(): TaipeiDateTimeInfo {
  const now = new Date()

  // Format parts in Asia/Taipei timezone
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || ''

  const year = parseInt(getPart('year'), 10)
  const month = parseInt(getPart('month'), 10)
  const day = parseInt(getPart('day'), 10)
  const weekday = getPart('weekday')
  const hour = getPart('hour')
  const minute = getPart('minute')
  const second = getPart('second')

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const timeStr = `${hour}:${minute}:${second}`
  const fullString = `${year}年${month}月${day}日 (${weekday}) ${timeStr}`

  const currentMonthStartDate = `${year}-${String(month).padStart(2, '0')}-01`

  // Last month calculation
  let lastMonthYear = year
  let lastMonth = month - 1
  if (lastMonth === 0) {
    lastMonth = 12
    lastMonthYear = year - 1
  }

  // 3 months ago (including current month, e.g. if current is month 9: months 7, 8, 9)
  let threeMonthsAgoYear = year
  let threeMonthsAgoMonth = month - 2
  while (threeMonthsAgoMonth <= 0) {
    threeMonthsAgoMonth += 12
    threeMonthsAgoYear -= 1
  }
  const threeMonthsAgoStartDate = `${threeMonthsAgoYear}-${String(threeMonthsAgoMonth).padStart(2, '0')}-01`

  // 6 months ago (including current month, e.g. if current is month 9: months 4, 5, 6, 7, 8, 9)
  let sixMonthsAgoYear = year
  let sixMonthsAgoMonth = month - 5
  while (sixMonthsAgoMonth <= 0) {
    sixMonthsAgoMonth += 12
    sixMonthsAgoYear -= 1
  }
  const sixMonthsAgoStartDate = `${sixMonthsAgoYear}-${String(sixMonthsAgoMonth).padStart(2, '0')}-01`

  return {
    year,
    month,
    day,
    weekday,
    dateStr,
    timeStr,
    fullString,
    currentMonthStartDate,
    lastMonthYear,
    lastMonth,
    threeMonthsAgoStartDate,
    sixMonthsAgoStartDate,
  }
}

/**
 * Parses any date input (Firestore Timestamp, ISO string, Date object, or milliseconds)
 * into date components strictly formatted in Asia/Taipei timezone.
 */
export function parseToTaipeiDate(
  dateInput: any
): { dateStr: string; year: number; month: number; day: number } | null {
  if (!dateInput) return null

  // If already a YYYY-MM-DD format string
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput)) {
    const parts = dateInput.slice(0, 10).split('-').map(Number)
    return {
      dateStr: dateInput.slice(0, 10),
      year: parts[0],
      month: parts[1],
      day: parts[2],
    }
  }

  let dateObj: Date | null = null
  if (dateInput.toDate && typeof dateInput.toDate === 'function') {
    dateObj = dateInput.toDate()
  } else if (dateInput instanceof Date) {
    dateObj = dateInput
  } else if (typeof dateInput === 'number' || typeof dateInput === 'string') {
    dateObj = new Date(dateInput)
  }

  if (!dateObj || isNaN(dateObj.getTime())) return null

  const formatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(dateObj)
  const getPart = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const y = parseInt(getPart('year'), 10)
  const m = parseInt(getPart('month'), 10)
  const d = parseInt(getPart('day'), 10)

  return {
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    year: y,
    month: m,
    day: d,
  }
}
