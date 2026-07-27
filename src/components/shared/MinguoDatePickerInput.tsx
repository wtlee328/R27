import React, { useState, useEffect } from 'react'
import { RiCalendarLine } from '@remixicon/react'

interface MinguoDatePickerInputProps {
  value?: Date | string | null
  onChange: (d: Date | null) => void
  className?: string
}

export function MinguoDatePickerInput({
  value,
  onChange,
  className = ''
}: MinguoDatePickerInputProps) {
  const [rocYear, setRocYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')

  // Sync internal input fields whenever value changes externally
  useEffect(() => {
    if (!value) {
      setRocYear('')
      setMonth('')
      setDay('')
      return
    }
    const d = value instanceof Date ? value : new Date(value)
    if (isNaN(d.getTime())) {
      setRocYear('')
      setMonth('')
      setDay('')
      return
    }
    setRocYear((d.getFullYear() - 1911).toString())
    setMonth((d.getMonth() + 1).toString())
    setDay(d.getDate().toString())
  }, [value])

  const handleUpdate = (yStr: string, mStr: string, dStr: string) => {
    setRocYear(yStr)
    setMonth(mStr)
    setDay(dStr)

    const y = parseInt(yStr, 10)
    const m = parseInt(mStr, 10)
    const d = parseInt(dStr, 10)

    if (!yStr && !mStr && !dStr) {
      onChange(null)
      return
    }

    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const fullYear = 1911 + y
      const newD = new Date(fullYear, m - 1, d)
      if (!isNaN(newD.getTime())) {
        onChange(newD)
      }
    }
  }

  return (
    <div className={`flex items-center h-10 gap-0 bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden hover:border-stone-300 dark:hover:border-stone-600 focus-within:border-stone-400 dark:focus-within:border-stone-500 focus-within:ring-2 focus-within:ring-stone-900/8 dark:focus-within:ring-white/8 transition-all ${className}`}>
      {/* Calendar icon */}
      <div className="pl-3 pr-2 flex items-center shrink-0">
        <RiCalendarLine className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
      </div>

      {/* 民國年 */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500 whitespace-nowrap">民國</span>
        <input
          type="number"
          placeholder="113"
          value={rocYear}
          onChange={(e) => handleUpdate(e.target.value, month, day)}
          className="w-14 h-7 text-center text-xs font-bold bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-md text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-400"
        />
        <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500">年</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-2 shrink-0" />

      {/* 月 */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          placeholder="01"
          min={1}
          max={12}
          value={month}
          onChange={(e) => handleUpdate(rocYear, e.target.value, day)}
          className="w-10 h-7 text-center text-xs font-bold bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-md text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-400"
        />
        <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500">月</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-2 shrink-0" />

      {/* 日 */}
      <div className="flex items-center gap-1 pr-3 shrink-0">
        <input
          type="number"
          placeholder="15"
          min={1}
          max={31}
          value={day}
          onChange={(e) => handleUpdate(rocYear, month, e.target.value)}
          className="w-10 h-7 text-center text-xs font-bold bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-md text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-400"
        />
        <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500">日</span>
      </div>
    </div>
  )
}
