import type { ProfitLossData, ProfitLossRow } from '../../types'

interface ProfitLossTableProps {
  data: ProfitLossData
  selectedMonth?: number | 'all'
}

export function ProfitLossTable({ data, selectedMonth }: ProfitLossTableProps) {
  const months = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

  const formatCurrency = (val: number | null) => {
    if (val === null || val === 0) return '-'
    return val.toLocaleString()
  }

  const renderRow = (row: ProfitLossRow, isBold = false) => (
    <tr key={row.category} className="hover:bg-stone-50/80 border-b border-stone-100 last:border-0 transition-colors duration-150">
      <td className={`px-5 py-2.5 ${isBold ? 'font-bold text-stone-900' : 'text-stone-700'}`}>{row.category}</td>
      {row.months.map((m, i) => {
        const isHighlighted = selectedMonth === i + 1
        return (
          <td
            key={i}
            className={`px-4 py-2.5 text-right tabular-nums transition-colors ${
              isHighlighted
                ? 'bg-amber-50/80 font-bold text-stone-950 border-x border-amber-200'
                : 'text-stone-500'
            }`}
          >
            {formatCurrency(m)}
          </td>
        )
      })}
      <td className={`px-5 py-2.5 text-right tabular-nums ${isBold ? 'font-bold text-stone-900' : 'font-medium text-stone-700'}`}>
        {formatCurrency(row.total)}
      </td>
    </tr>
  )

  const renderTotalRow = (label: string, totals: (number | null)[], isNet = false) => {
    const yearTotal = totals.reduce((a, b) => (a || 0) + (b || 0), 0)
    return (
      <tr className={`${isNet ? 'bg-stone-900 text-white' : 'bg-stone-100'} border-y border-stone-200`}>
        <td className="px-5 py-3 font-bold">{label}</td>
        {totals.map((m, i) => {
          const isHighlighted = selectedMonth === i + 1
          return (
            <td
              key={i}
              className={`px-4 py-3 text-right font-bold tabular-nums ${
                isHighlighted
                  ? isNet
                    ? 'bg-stone-800 text-amber-300 border-x border-stone-700'
                    : 'bg-amber-100/70 text-stone-950 border-x border-amber-300'
                  : isNet && m !== null
                  ? m >= 0
                    ? 'text-emerald-400'
                    : 'text-red-400'
                  : ''
              }`}
            >
              {formatCurrency(m)}
            </td>
          )
        })}
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

  return (
    <div className="border border-stone-200 rounded-2xl overflow-x-auto bg-white shadow-sm">
      <table className="w-full text-sm text-left min-w-[1000px]">
        <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-200">
          <tr>
            <th className="px-5 py-3.5 font-semibold text-xs uppercase tracking-wider w-48">科目名稱</th>
            {months.map((m, i) => {
              const isHighlighted = selectedMonth === i + 1
              return (
                <th
                  key={m}
                  className={`px-4 py-3.5 text-right font-semibold text-xs uppercase tracking-wider ${
                    isHighlighted ? 'bg-amber-100/80 text-amber-900 border-x border-amber-300 font-black' : ''
                  }`}
                >
                  {m}
                </th>
              )
            })}
            <th className="px-5 py-3.5 text-right font-semibold text-xs uppercase tracking-wider">總計</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={14} className="px-5 py-2.5 font-bold bg-emerald-50/60 text-emerald-800 text-xs uppercase tracking-wider border-b border-stone-200">
              營業收入
            </td>
          </tr>
          {data.income.length > 0 ? (
            data.income.map((row) => renderRow(row))
          ) : (
            <tr>
              <td colSpan={14} className="px-5 py-3 text-center text-stone-400">
                無收入資料
              </td>
            </tr>
          )}
          {renderTotalRow('營業收入合計', data.totalIncome)}

          <tr>
            <td colSpan={14} className="px-5 py-2.5 font-bold bg-red-50/60 text-red-800 text-xs uppercase tracking-wider border-b border-stone-200">
              營業支出
            </td>
          </tr>
          {data.expenses.length > 0 ? (
            data.expenses.map((row) => renderRow(row))
          ) : (
            <tr>
              <td colSpan={14} className="px-5 py-3 text-center text-stone-400">
                無支出資料
              </td>
            </tr>
          )}
          {renderTotalRow('營業支出合計', data.totalExpenses)}

          {renderTotalRow('本期損益', data.netIncome, true)}
        </tbody>
      </table>
    </div>
  )
}
