import React from 'react'
import { Download, Table as TableIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TableComponentData, TableColumn } from '@/types/ai'

interface AITableRendererProps {
  data: TableComponentData
}

export const AITableRenderer: React.FC<AITableRendererProps> = ({ data }) => {
  const { title, columns, rows, summaryRow, totalCount } = data

  const handleExportCSV = () => {
    if (!rows || rows.length === 0) return

    const headers = columns.map((col) => `"${col.label.replace(/"/g, '""')}"`).join(',')
    const rowLines = rows.map((row) =>
      columns
        .map((col) => {
          const val = row[col.key] ?? ''
          return `"${String(val).replace(/"/g, '""')}"`
        })
        .join(',')
    )

    let csvContent = '\uFEFF' + headers + '\n' + rowLines.join('\n')

    if (summaryRow) {
      const summaryLine = columns
        .map((col) => {
          const val = summaryRow[col.key] ?? ''
          return `"${String(val).replace(/"/g, '""')}"`
        })
        .join(',')
      csvContent += '\n' + summaryLine
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `AI_會計明細_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const renderCellContent = (col: TableColumn, val: any) => {
    if (val === undefined || val === null || val === '') return '-'

    if (col.type === 'currency' && typeof val === 'number') {
      return (
        <span className={val < 0 ? 'text-red-600 font-semibold' : 'text-stone-900 dark:text-stone-100 font-medium font-mono'}>
          {val < 0 ? `-NT$ ${Math.abs(val).toLocaleString()}` : `NT$ ${val.toLocaleString()}`}
        </span>
      )
    }

    if (col.type === 'badge') {
      const strVal = String(val)
      if (strVal === '收入' || strVal === '已付清') {
        return <Badge variant="success">{strVal}</Badge>
      }
      if (strVal === '支出' || strVal === '有逾期') {
        return <Badge variant="destructive">{strVal}</Badge>
      }
      if (strVal === '分期中' || strVal === '分期付款') {
        return <Badge variant="warning">{strVal}</Badge>
      }
      return <Badge variant="outline">{strVal}</Badge>
    }

    return String(val)
  }

  return (
    <div className="my-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 overflow-hidden shadow-xs">
      {/* Table Header / Action bar */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-stone-50 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
            {title || `資料明細 (${totalCount} 筆)`}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="h-7 text-xs px-2.5 gap-1.5 text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
        >
          <Download className="w-3.5 h-3.5" />
          匯出 CSV
        </Button>
      </div>

      {/* Table Scrollable Container */}
      <div className="max-h-[320px] overflow-auto">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 bg-stone-100/90 dark:bg-stone-800/90 backdrop-blur-xs z-10">
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-stone-600 dark:text-stone-300 font-semibold py-2 px-3 ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow
                key={row.id || idx}
                className="hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors"
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={`py-2 px-3 ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {renderCellContent(col, row[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {/* Optional Summary Row */}
            {summaryRow && (
              <TableRow className="bg-stone-100/70 dark:bg-stone-800/80 font-bold border-t-2 border-stone-300 dark:border-stone-700">
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={`py-2.5 px-3 ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {renderCellContent(col, summaryRow[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
