import { useState, useMemo } from 'react'
import type { VenueRental } from '../../types'
import { format } from 'date-fns'
import { 
  RiArrowUpSLine, 
  RiArrowDownSLine, 
  RiArrowUpDownLine, 
  RiDeleteBinLine, 
  RiBuilding4Line 
} from '@remixicon/react'

export function VenueTable({
  rentals,
  onDelete,
  onRowClick,
}: {
  rentals: VenueRental[]
  onDelete?: (id: string, cashFlowRecordId: string) => void
  onRowClick?: (rental: VenueRental) => void
}) {
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc')

  // Handle header sorting click
  const handleSort = (field: 'date' | 'amount') => {
    if (field === 'date') {
      setSortBy(prev => prev === 'date-desc' ? 'date-asc' : 'date-desc')
    } else {
      setSortBy(prev => prev === 'amount-desc' ? 'amount-asc' : 'amount-desc')
    }
  }

  // Sort rentals in memory
  const sortedRentals = useMemo(() => {
    return [...rentals].sort((a, b) => {
      if (sortBy === 'date-desc') {
        const tA = a.date?.toMillis() || 0
        const tB = b.date?.toMillis() || 0
        return tB - tA
      }
      if (sortBy === 'date-asc') {
        const tA = a.date?.toMillis() || 0
        const tB = b.date?.toMillis() || 0
        return tA - tB
      }
      if (sortBy === 'amount-desc') {
        return b.amount - a.amount
      }
      if (sortBy === 'amount-asc') {
        return a.amount - b.amount
      }
      return 0
    })
  }, [rentals, sortBy])

  if (rentals.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center bg-white">
        <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
          <RiBuilding4Line className="w-6 h-6 text-stone-400" />
        </div>
        <p className="text-stone-500 text-sm font-medium">目前沒有場租資料</p>
        <p className="text-stone-400 text-xs mt-1">點擊上方按鈕新增場租紀錄</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto bg-white">
      <table className="w-full text-sm text-left">
        <thead className="bg-stone-50/80 border-b border-stone-200">
          <tr>
            <th 
              className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider cursor-pointer hover:bg-stone-100/50 transition-colors select-none"
              onClick={() => handleSort('date')}
            >
              <div className="flex items-center gap-1">
                日期
                {sortBy === 'date-desc' && <RiArrowDownSLine className="h-4 w-4 text-stone-500" />}
                {sortBy === 'date-asc' && <RiArrowUpSLine className="h-4 w-4 text-stone-500" />}
                {!sortBy.startsWith('date') && <RiArrowUpDownLine className="h-3.5 w-3.5 text-stone-300" />}
              </div>
            </th>
            <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">承租教練</th>
            <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">外部租借人</th>
            <th 
              className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider text-right cursor-pointer hover:bg-stone-100/50 transition-colors select-none"
              onClick={() => handleSort('amount')}
            >
              <div className="flex items-center justify-end gap-1">
                金額
                {sortBy === 'amount-desc' && <RiArrowDownSLine className="h-4 w-4 text-stone-500" />}
                {sortBy === 'amount-asc' && <RiArrowUpSLine className="h-4 w-4 text-stone-500" />}
                {!sortBy.startsWith('amount') && <RiArrowUpDownLine className="h-3.5 w-3.5 text-stone-300" />}
              </div>
            </th>
            <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider">備註</th>
            {onDelete && <th className="px-5 py-3.5 text-[10px] font-black text-stone-400 uppercase tracking-wider text-right">操作</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50">
          {sortedRentals.map((r) => {
            const parts = r.renterName ? r.renterName.split(' - ') : []
            const trainerName = parts[0] || '未知教練'
            const externalRenter = parts.slice(1).join(' - ') || '-'

            return (
              <tr 
                key={r.id} 
                onClick={() => onRowClick?.(r)}
                className="group hover:bg-stone-50/60 transition-colors duration-150 cursor-pointer"
              >
                <td className="px-5 py-3.5 text-stone-500 tabular-nums">
                  {r.date ? format(r.date.toDate(), 'yyyy/MM/dd') : '-'}
                </td>
                <td className="px-5 py-3.5 font-medium text-stone-900">{trainerName}</td>
                <td className="px-5 py-3.5 text-stone-500">{externalRenter}</td>
                <td className="px-5 py-3.5 text-right text-emerald-600 font-semibold tabular-nums">
                  NT$ {r.amount.toLocaleString()}
                </td>
                <td className="px-5 py-3.5 text-stone-500">{r.notes}</td>
                {onDelete && (
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex justify-end">
                      <button
                        className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full flex items-center justify-center text-stone-300 hover:text-red-600 hover:bg-red-50 transition-all"
                        onClick={(e) => { 
                          e.stopPropagation()
                          if (window.confirm('確定要刪除這筆場租紀錄嗎？系統將同步刪除關聯的現金流量紀錄。')) { 
                            onDelete(r.id, r.cashFlowRecordId) 
                          } 
                        }}
                      >
                        <RiDeleteBinLine className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
