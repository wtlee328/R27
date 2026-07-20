import React from 'react'
import type { ProfitLossData, ProfitLossRow } from '../../types'

interface ProfitLossTableProps {
  data: ProfitLossData
  selectedMonth?: number | 'all'
}

export function ProfitLossTable({ data, selectedMonth = 'all' }: ProfitLossTableProps) {
  const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

  // Determine base revenue for percentage calculation
  const targetMonthIndex = typeof selectedMonth === 'number' ? selectedMonth - 1 : null
  const baseRevenue =
    targetMonthIndex !== null
      ? data.totalIncome[targetMonthIndex] || 0
      : data.totalIncome.reduce((a, b) => (a || 0) + (b || 0), 0)

  const formatCurrency = (val: number | null) => {
    if (val === null || val === 0) return '-'
    return val.toLocaleString()
  }

  const formatPercentage = (val: number | null) => {
    if (val === null || val === 0 || !baseRevenue || baseRevenue <= 0) return '-'
    const pct = (val / baseRevenue) * 100
    return `${pct.toFixed(2)}%`
  }

  const renderRow = (row: ProfitLossRow, isBold = false) => {
    return (
      <tr key={row.category} className="hover:bg-stone-50/80 border-b border-stone-100 last:border-0 transition-colors duration-150">
        <td className={`px-5 py-2.5 ${isBold ? 'font-bold text-stone-900' : 'text-stone-700'}`}>{row.category}</td>
        {row.months.map((m, i) => {
          const isHighlighted = targetMonthIndex === i
          return (
            <React.Fragment key={i}>
              <td
                className={`px-4 py-2.5 text-right tabular-nums transition-colors ${
                  isHighlighted
                    ? 'bg-amber-50/80 font-bold text-stone-950 border-l border-amber-200'
                    : 'text-stone-500'
                }`}
              >
                {formatCurrency(m)}
              </td>
              {/* If this month is the selected target month, insert percentage column directly next to it */}
              {isHighlighted && (
                <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-900 bg-amber-100/70 border-r border-amber-300 tabular-nums">
                  {formatPercentage(m)}
                </td>
              )}
            </React.Fragment>
          )
        })}

        {/* If viewing all months, display full-year percentage right before total */}
        {targetMonthIndex === null && (
          <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-900 bg-amber-50/90 border-x border-amber-300 tabular-nums">
            {formatPercentage(row.total)}
          </td>
        )}

        <td className={`px-5 py-2.5 text-right tabular-nums ${isBold ? 'font-bold text-stone-900' : 'font-medium text-stone-700'}`}>
          {formatCurrency(row.total)}
        </td>
      </tr>
    )
  }

  const renderTotalRow = (label: string, totals: (number | null)[], isNet = false) => {
    const yearTotal = totals.reduce((a, b) => (a || 0) + (b || 0), 0)

    return (
      <tr className={`${isNet ? 'bg-stone-900 text-white' : 'bg-stone-100'} border-y border-stone-200`}>
        <td className="px-5 py-3 font-bold">{label}</td>
        {totals.map((m, i) => {
          const isHighlighted = targetMonthIndex === i
          return (
            <React.Fragment key={i}>
              <td
                className={`px-4 py-3 text-right font-bold tabular-nums ${
                  isHighlighted
                    ? isNet
                      ? 'bg-stone-800 text-amber-300 border-l border-stone-700'
                      : 'bg-amber-100/70 text-stone-950 border-l border-amber-300'
                    : isNet && m !== null
                    ? m >= 0
                      ? 'text-emerald-400'
                      : 'text-red-400'
                    : ''
                }`}
              >
                {formatCurrency(m)}
              </td>
              {/* Insert percentage directly next to selected month's total */}
              {isHighlighted && (
                <td
                  className={`px-4 py-3 text-right font-mono font-black border-r tabular-nums ${
                    isNet
                      ? 'bg-stone-800 text-amber-300 border-stone-700'
                      : 'bg-amber-200/80 text-stone-950 border-amber-300'
                  }`}
                >
                  {formatPercentage(m)}
                </td>
              )}
            </React.Fragment>
          )
        })}

        {/* Full year percentage column if all months selected */}
        {targetMonthIndex === null && (
          <td
            className={`px-4 py-3 text-right font-mono font-black border-x tabular-nums ${
              isNet
                ? 'bg-stone-800 text-amber-300 border-stone-700'
                : 'bg-amber-100/90 text-stone-950 border-amber-300'
            }`}
          >
            {formatPercentage(yearTotal)}
          </td>
        )}

        <td
          className={`px-5 py-3 text-right font-bold tabular-nums ${
            isNet ? (yearTotal >= 0 ? 'text-emerald-400' : 'text-red-400') : ''
          }`}
        >
          {formatCurrency(yearTotal)}
        </td>
      </tr>
    )
  }

  const colSpanCount = targetMonthIndex !== null ? 15 : 15

  return (
    <div className="border border-stone-200 rounded-2xl overflow-x-auto bg-white shadow-sm">
      <table className="w-full text-sm text-left min-w-[1100px]">
        <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
          <tr>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider w-48">科目名稱</th>
            {months.map((m, i) => {
              const isHighlighted = targetMonthIndex === i
              return (
                <React.Fragment key={m}>
                  <th
                    className={`px-4 py-3.5 text-right font-semibold text-xs uppercase tracking-wider ${
                      isHighlighted ? 'bg-amber-100/80 text-amber-900 border-l border-amber-300 font-black' : ''
                    }`}
                  >
                    {m}
                  </th>
                  {/* Insert % column header right next to selected month */}
                  {isHighlighted && (
                    <th className="px-3 py-3.5 text-right font-black text-xs uppercase tracking-wider bg-amber-200/80 text-amber-950 border-r border-amber-300 font-mono">
                      {m}占比 (%)
                    </th>
                  )}
                </React.Fragment>
              )
            })}
            {targetMonthIndex === null && (
              <th className="px-4 py-3.5 text-right font-black text-xs uppercase tracking-wider bg-amber-100 text-amber-950 border-x border-amber-300">
                年度占比 (%)
              </th>
            )}
            <th className="px-5 py-3.5 text-right font-semibold text-xs uppercase tracking-wider">總計</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={colSpanCount} className="px-5 py-2.5 font-bold bg-emerald-50/60 text-emerald-800 text-xs uppercase tracking-wider border-b border-stone-200">
              一、營業收入
            </td>
          </tr>
          {data.income.length > 0 ? (
            data.income.map((row) => renderRow(row))
          ) : (
            <tr>
              <td colSpan={colSpanCount} className="px-5 py-3 text-center text-stone-400">
                無收入資料
              </td>
            </tr>
          )}
          {renderTotalRow('營業收入合計 (實際總收入)', data.totalIncome)}

          <tr>
            <td colSpan={colSpanCount} className="px-5 py-2.5 font-bold bg-red-50/60 text-red-800 text-xs uppercase tracking-wider border-b border-stone-200">
              二、營業支出
            </td>
          </tr>
          {data.expenses.length > 0 ? (
            data.expenses.map((row) => renderRow(row))
          ) : (
            <tr>
              <td colSpan={colSpanCount} className="px-5 py-3 text-center text-stone-400">
                無支出資料
              </td>
            </tr>
          )}
          {renderTotalRow('營業支出小計', data.totalExpenses)}

          {renderTotalRow('三、本期損益 (收益淨額)', data.netIncome, true)}
        </tbody>
      </table>
    </div>
  )
}
