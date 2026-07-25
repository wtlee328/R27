import React, { useMemo } from 'react'

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
  // Convert current value to Date object
  const dateObj = useMemo(() => {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    return isNaN(d.getTime()) ? null : d
  }, [value])

  const rocYear = dateObj ? (dateObj.getFullYear() - 1911).toString() : ''
  const month = dateObj ? (dateObj.getMonth() + 1).toString() : ''
  const day = dateObj ? dateObj.getDate().toString() : ''

  const datePickerValue = useMemo(() => {
    if (!dateObj) return ''
    const y = dateObj.getFullYear()
    const m = String(dateObj.getMonth() + 1).padStart(2, '0')
    const d = String(dateObj.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }, [dateObj])

  const updateDate = (yNum: number | null, mNum: number | null, dNum: number | null) => {
    if (yNum === null || mNum === null || dNum === null) return
    if (yNum <= 0 || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return
    const fullYear = 1911 + yNum
    const newD = new Date(fullYear, mNum - 1, dNum)
    if (!isNaN(newD.getTime())) {
      onChange(newD)
    }
  }

  const handleRocYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val) {
      onChange(null)
      return
    }
    const y = parseInt(val, 10)
    if (isNaN(y)) return
    const currentM = dateObj ? dateObj.getMonth() + 1 : 1
    const currentD = dateObj ? dateObj.getDate() : 1
    updateDate(y, currentM, currentD)
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const m = parseInt(val, 10)
    if (isNaN(m)) return
    const currentY = dateObj ? dateObj.getFullYear() - 1911 : 80
    const currentD = dateObj ? dateObj.getDate() : 1
    updateDate(currentY, m, currentD)
  }

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    const d = parseInt(val, 10)
    if (isNaN(d)) return
    const currentY = dateObj ? dateObj.getFullYear() - 1911 : 80
    const currentM = dateObj ? dateObj.getMonth() + 1 : 1
    updateDate(currentY, currentM, d)
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="flex items-center gap-1 bg-stone-50 p-1.5 rounded-xl border border-stone-200">
          <span className="text-xs font-bold text-stone-500 pl-1">民國</span>
          <input
            type="number"
            placeholder="例: 87"
            value={rocYear}
            onChange={handleRocYearChange}
            className="w-16 h-8 text-center text-xs font-black bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <span className="text-xs font-bold text-stone-500 pr-1">年</span>

          <input
            type="number"
            placeholder="5"
            min={1}
            max={12}
            value={month}
            onChange={handleMonthChange}
            className="w-12 h-8 text-center text-xs font-black bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <span className="text-xs font-bold text-stone-500 pr-1">月</span>

          <input
            type="number"
            placeholder="12"
            min={1}
            max={31}
            value={day}
            onChange={handleDayChange}
            className="w-12 h-8 text-center text-xs font-black bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          />
          <span className="text-xs font-bold text-stone-500 pr-1">日</span>
        </div>

        {/* Standard Picker Helper */}
        <input
          type="date"
          value={datePickerValue}
          onChange={(e) => {
            const val = e.target.value
            onChange(val ? new Date(val) : null)
          }}
          className="h-11 px-2.5 text-xs bg-stone-50 border border-stone-200 rounded-xl text-stone-700 font-medium cursor-pointer focus:bg-white focus:outline-none"
        />
      </div>

      {dateObj && (
        <div className="text-[11px] font-bold text-orange-800 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200/80 inline-flex items-center gap-1.5 shadow-2xs">
          <span>民國 {dateObj.getFullYear() - 1911} 年 {String(dateObj.getMonth() + 1).padStart(2, '0')} 月 {String(dateObj.getDate()).padStart(2, '0')} 日</span>
          <span className="text-stone-400 font-normal">({dateObj.getFullYear()} / {String(dateObj.getMonth() + 1).padStart(2, '0')} / {String(dateObj.getDate()).padStart(2, '0')})</span>
        </div>
      )}
    </div>
  )
}
