import React, { useState, useEffect } from 'react'

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
    <div className={`inline-flex items-center gap-1 bg-stone-50 p-1.5 rounded-xl border border-stone-200 ${className}`}>
      <span className="text-xs font-bold text-stone-500 pl-1">民國</span>
      <input
        type="number"
        placeholder="例: 87"
        value={rocYear}
        onChange={(e) => handleUpdate(e.target.value, month, day)}
        className="w-16 h-8 text-center text-xs font-black bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
      <span className="text-xs font-bold text-stone-500 pr-1">年</span>

      <input
        type="number"
        placeholder="5"
        min={1}
        max={12}
        value={month}
        onChange={(e) => handleUpdate(rocYear, e.target.value, day)}
        className="w-12 h-8 text-center text-xs font-black bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
      <span className="text-xs font-bold text-stone-500 pr-1">月</span>

      <input
        type="number"
        placeholder="12"
        min={1}
        max={31}
        value={day}
        onChange={(e) => handleUpdate(rocYear, month, e.target.value)}
        className="w-12 h-8 text-center text-xs font-black bg-white border border-stone-200 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
      />
      <span className="text-xs font-bold text-stone-500 pr-1">日</span>
    </div>
  )
}
