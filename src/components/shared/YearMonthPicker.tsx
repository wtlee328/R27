import React, { useMemo, useCallback } from 'react'
import {
  RiCalendarLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
} from '@remixicon/react'
import { cn } from '@/lib/utils'

export interface YearMonthPickerProps {
  /** 模式 A: 字串格式 'yyyy/MM' 或 'all' 或 'yyyy-MM' */
  value?: string
  onChange?: (value: string) => void

  /** 模式 B: 分開的數字年份與月份 */
  year?: number
  month?: number | 'all'
  onYearChange?: (year: number) => void
  onMonthChange?: (month: number | 'all') => void
  onYearMonthChange?: (year: number, month: number | 'all') => void

  /** 可選年份清單 */
  availableYears?: number[]
  /** 是否允許選擇全年度 (預設 true) */
  allowAllMonths?: boolean
  /** 全年度選項文字 (預設 '全年度') */
  allMonthsLabel?: string
  /** 額外樣式類別 */
  className?: string
}

export function YearMonthPicker({
  value,
  onChange,
  year,
  month,
  onYearChange,
  onMonthChange,
  onYearMonthChange,
  availableYears,
  allowAllMonths = true,
  allMonthsLabel = '全年度',
  className,
}: YearMonthPickerProps) {
  const now = useMemo(() => new Date(), [])

  // 解析當前年份與月份
  const { currentYear, currentMonth, delimiter } = useMemo(() => {
    let y = year !== undefined ? year : now.getFullYear()
    let m: number | 'all' = month !== undefined ? month : (now.getMonth() + 1)
    let delim = '/'

    if (value !== undefined) {
      if (value === 'all') {
        m = 'all'
        y = year !== undefined ? year : now.getFullYear()
      } else {
        delim = value.includes('-') ? '-' : '/'
        const parts = value.split(delim)
        if (parts.length === 2) {
          const parsedY = Number(parts[0])
          const parsedM = Number(parts[1])
          if (!isNaN(parsedY)) y = parsedY
          if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) m = parsedM
        }
      }
    }

    return { currentYear: y, currentMonth: m, delimiter: delim }
  }, [value, year, month, now])

  // 可選年份動態生成
  const computedYears = useMemo(() => {
    const set = new Set<number>()
    const cy = now.getFullYear()
    ;[cy + 1, cy, cy - 1, cy - 2, cy - 3].forEach(y => set.add(y))
    if (availableYears) {
      availableYears.forEach(y => set.add(y))
    }
    set.add(currentYear)
    return Array.from(set).sort((a, b) => b - a)
  }, [now, availableYears, currentYear])

  const triggerChange = useCallback((newYear: number, newMonth: number | 'all') => {
    onYearMonthChange?.(newYear, newMonth)
    onYearChange?.(newYear)
    onMonthChange?.(newMonth)

    if (onChange) {
      if (newMonth === 'all') {
        onChange('all')
      } else {
        const mm = String(newMonth).padStart(2, '0')
        onChange(`${newYear}${delimiter}${mm}`)
      }
    }
  }, [onYearMonthChange, onYearChange, onMonthChange, onChange, delimiter])

  const handlePrev = () => {
    if (currentMonth === 'all') {
      triggerChange(currentYear - 1, 'all')
    } else if (currentMonth === 1) {
      triggerChange(currentYear - 1, 12)
    } else {
      triggerChange(currentYear, (currentMonth as number) - 1)
    }
  }

  const handleNext = () => {
    if (currentMonth === 'all') {
      triggerChange(currentYear + 1, 'all')
    } else if (currentMonth === 12) {
      triggerChange(currentYear + 1, 1)
    } else {
      triggerChange(currentYear, (currentMonth as number) + 1)
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center bg-white border border-stone-200/90 rounded-xl p-1 shadow-2xs select-none",
        className
      )}
    >
      {/* 上一月箭頭 */}
      <button
        type="button"
        onClick={handlePrev}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 active:scale-95 transition-all cursor-pointer"
        title="上一月"
      >
        <RiArrowLeftSLine className="w-4 h-4" />
      </button>

      {/* 年月選擇主體 */}
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <RiCalendarLine className="w-3.5 h-3.5 text-orange-500 shrink-0" />

        {/* 年份下拉選單 */}
        <div className="relative inline-flex items-center">
          <select
            value={currentYear}
            onChange={(e) => triggerChange(Number(e.target.value), currentMonth)}
            className="appearance-none bg-transparent pr-4 text-xs font-bold text-stone-800 hover:text-orange-600 focus:outline-none cursor-pointer transition-colors"
          >
            {computedYears.map(y => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
          <RiArrowDownSLine className="w-3 h-3 text-stone-400 pointer-events-none absolute right-0" />
        </div>

        <span className="text-stone-300 font-light text-xs">/</span>

        {/* 月份下拉選單 */}
        <div className="relative inline-flex items-center">
          <select
            value={currentMonth}
            onChange={(e) => {
              const val = e.target.value === 'all' ? 'all' : Number(e.target.value)
              triggerChange(currentYear, val)
            }}
            className="appearance-none bg-transparent pr-4 text-xs font-bold text-stone-800 hover:text-orange-600 focus:outline-none cursor-pointer transition-colors"
          >
            {allowAllMonths && (
              <option value="all">{allMonthsLabel}</option>
            )}
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m} 月</option>
            ))}
          </select>
          <RiArrowDownSLine className="w-3 h-3 text-stone-400 pointer-events-none absolute right-0" />
        </div>
      </div>

      {/* 下一月箭頭 */}
      <button
        type="button"
        onClick={handleNext}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 active:scale-95 transition-all cursor-pointer"
        title="下一月"
      >
        <RiArrowRightSLine className="w-4 h-4" />
      </button>
    </div>
  )
}
