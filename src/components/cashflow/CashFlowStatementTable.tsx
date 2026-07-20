import React from 'react'
import type { CashFlowRecord } from '../../types'
import { normalizeCashFlowRecord } from './CashFlowTable'

interface CategoryCashFlow {
  category: string
  inflow: number
  outflow: number
  net: number
}

interface ActivityGroup {
  id: 'operating' | 'investing' | 'financing'
  title: string
  subtitle: string
  colorBadge: string
  headerBg: string
  categories: CategoryCashFlow[]
  totalInflow: number
  totalOutflow: number
  netTotal: number
}

interface CashFlowStatementTableProps {
  records: CashFlowRecord[]
  monthLabel?: string
}

export function CashFlowStatementTable({ records, monthLabel }: CashFlowStatementTableProps) {
  // Define category to activity mapping
  const operatingCategoryNames = [
    '課程收入',
    '課程收入（實際收入）',
    '體驗收入',
    '場租收入',
    '拳擊團課/贈與課程',
    '房租',
    '薪資',
    '水電',
    '行銷',
    '會計',
    '網路',
    '雜項',
    '公司福利',
    '保險',
    '營業稅',
  ]

  const investingCategoryNames = ['器材', '新光AED', '攤提']

  // Aggregate inflow and outflow per category using normalized record data
  const categoryMap = new Map<string, { inflow: number; outflow: number }>()

  records.map(normalizeCashFlowRecord).forEach((r) => {
    const cat = r.category || '一般收支'
    const current = categoryMap.get(cat) || { inflow: 0, outflow: 0 }

    if (r.type === 'income') {
      categoryMap.set(cat, {
        ...current,
        inflow: current.inflow + (r.amount || 0),
      })
    } else {
      categoryMap.set(cat, {
        ...current,
        outflow: current.outflow + (r.amount || 0),
      })
    }
  })

  // Group into Operating, Investing, and Financing activities
  const operatingList: CategoryCashFlow[] = []
  const investingList: CategoryCashFlow[] = []
  const financingList: CategoryCashFlow[] = []

  categoryMap.forEach((data, cat) => {
    const net = data.inflow - data.outflow
    const item: CategoryCashFlow = {
      category: cat,
      inflow: data.inflow,
      outflow: data.outflow,
      net,
    }

    if (operatingCategoryNames.includes(cat)) {
      operatingList.push(item)
    } else if (investingCategoryNames.includes(cat)) {
      investingList.push(item)
    } else {
      financingList.push(item)
    }
  })

  const buildGroup = (
    id: 'operating' | 'investing' | 'financing',
    title: string,
    subtitle: string,
    colorBadge: string,
    headerBg: string,
    categories: CategoryCashFlow[]
  ): ActivityGroup => {
    const totalInflow = categories.reduce((sum, c) => sum + c.inflow, 0)
    const totalOutflow = categories.reduce((sum, c) => sum + c.outflow, 0)
    return {
      id,
      title,
      subtitle,
      colorBadge,
      headerBg,
      categories,
      totalInflow,
      totalOutflow,
      netTotal: totalInflow - totalOutflow,
    }
  }

  const groups: ActivityGroup[] = [
    buildGroup(
      'operating',
      '一、營業活動之現金流量',
      '包含本業課程、體驗課、場租收入與各項日常營運開支',
      'bg-emerald-100 text-emerald-800 border-emerald-200',
      'bg-emerald-50/60 text-emerald-950 border-emerald-100',
      operatingList
    ),
    buildGroup(
      'investing',
      '二、投資活動之現金流量',
      '包含健身器材購置、AED 設備、裝潢建置與資產攤提',
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-blue-50/60 text-blue-950 border-blue-100',
      investingList
    ),
    buildGroup(
      'financing',
      '三、籌資活動之現金流量',
      '包含業主資本投入、業主往來取回、融資借貸與預收款項變動',
      'bg-amber-100 text-amber-900 border-amber-200',
      'bg-amber-50/60 text-amber-950 border-amber-100',
      financingList
    ),
  ]

  const grandTotalInflow = groups.reduce((sum, g) => sum + g.totalInflow, 0)
  const grandTotalOutflow = groups.reduce((sum, g) => sum + g.totalOutflow, 0)
  const netCashChange = grandTotalInflow - grandTotalOutflow

  return (
    <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white shadow-sm space-y-0">
      {/* Table Header */}
      <div className="bg-stone-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold tracking-tight">現金流量表 {monthLabel ? `（${monthLabel}）` : ''}</h3>
          <p className="text-xs text-stone-400 mt-0.5">依據營業、投資與籌資三大活動，呈列實質現金流入與流出變動</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-stone-400 block font-medium">本期現金淨變動額</span>
          <span className={`text-base font-black font-mono ${netCashChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {netCashChange >= 0 ? `+$${netCashChange.toLocaleString()}` : `-$${Math.abs(netCashChange).toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-stone-100/90 text-stone-700 border-b border-stone-200">
            <tr>
              <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider">會計項目</th>
              <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider text-right text-emerald-700">現金流入 (+)</th>
              <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider text-right text-red-700">現金流出 (-)</th>
              <th className="px-6 py-3.5 font-bold text-xs uppercase tracking-wider text-right text-stone-800">淨現金流量</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {records.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-stone-400 text-xs font-medium">
                  該時段尚無現金收支交易紀錄
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <React.Fragment key={group.id}>
                  {/* Activity Group Header */}
                  <tr className={group.headerBg}>
                    <td colSpan={4} className="px-6 py-3 font-bold border-t border-b border-stone-200/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${group.colorBadge}`}>
                            {group.title}
                          </span>
                          <span className="text-[11px] text-stone-500 hidden md:inline font-normal">
                            {group.subtitle}
                          </span>
                        </div>
                        <div className="text-xs font-mono font-bold text-stone-700">
                          活動淨額: <span className={group.netTotal >= 0 ? 'text-emerald-700 font-black' : 'text-red-700 font-black'}>
                            {group.netTotal >= 0 ? `+$${group.netTotal.toLocaleString()}` : `-$${Math.abs(group.netTotal).toLocaleString()}`}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Group Items */}
                  {group.categories.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-2.5 text-stone-400 text-xs italic">
                        尚無此活動之現金流量紀錄
                      </td>
                    </tr>
                  ) : (
                    group.categories.map((item) => (
                      <tr key={item.category} className="hover:bg-stone-50/80 transition-colors">
                        <td className="px-8 py-3 text-stone-800 font-bold">
                          {item.category}
                        </td>
                        <td className="px-6 py-3 text-right font-mono font-medium text-emerald-600 tabular-nums">
                          {item.inflow > 0 ? `+$${item.inflow.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-3 text-right font-mono font-medium text-red-500 tabular-nums">
                          {item.outflow > 0 ? `-$${item.outflow.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-6 py-3 text-right font-mono font-bold text-stone-900 tabular-nums">
                          {item.net >= 0 ? `+$${item.net.toLocaleString()}` : `-$${Math.abs(item.net).toLocaleString()}`}
                        </td>
                      </tr>
                    ))
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>

          {/* Table Footer Summary */}
          <tfoot className="bg-stone-100/90 border-t-2 border-stone-300">
            <tr>
              <td className="px-6 py-4 font-black text-stone-900">
                本期現金及存款淨變動總額 (Net Cash Change)
              </td>
              <td className="px-6 py-4 text-right font-mono font-black text-emerald-700 text-sm tabular-nums">
                +${grandTotalInflow.toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right font-mono font-black text-red-700 text-sm tabular-nums">
                -${grandTotalOutflow.toLocaleString()}
              </td>
              <td className={`px-6 py-4 text-right font-mono font-black text-base tabular-nums ${netCashChange >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {netCashChange >= 0 ? `+$${netCashChange.toLocaleString()}` : `-$${Math.abs(netCashChange).toLocaleString()}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
