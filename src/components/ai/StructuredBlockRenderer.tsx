import React from 'react'
import { Info, AlertTriangle } from 'lucide-react'
import type { StructuredAIBlock, StatCardData, TableComponentData, AlertBoxData } from '@/types/ai'
import { AITableRenderer } from './AITableRenderer'

interface StructuredBlockRendererProps {
  blocks: StructuredAIBlock[]
}

const colorMap: Record<string, { bg: string; border: string; text: string; sub: string }> = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    text: 'text-emerald-700 dark:text-emerald-400',
    sub: 'text-emerald-600/80 dark:text-emerald-400/70',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-800/60',
    text: 'text-red-700 dark:text-red-400',
    sub: 'text-red-600/80 dark:text-red-400/70',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-200 dark:border-purple-800/60',
    text: 'text-purple-700 dark:text-purple-400',
    sub: 'text-purple-600/80 dark:text-purple-400/70',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800/60',
    text: 'text-amber-700 dark:text-amber-400',
    sub: 'text-amber-600/80 dark:text-amber-400/70',
  },
  stone: {
    bg: 'bg-stone-50 dark:bg-stone-800/40',
    border: 'border-stone-200 dark:border-stone-800',
    text: 'text-stone-800 dark:text-stone-200',
    sub: 'text-stone-500 dark:text-stone-400',
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    border: 'border-orange-200 dark:border-orange-800/60',
    text: 'text-orange-700 dark:text-orange-400',
    sub: 'text-orange-600/80 dark:text-orange-400/70',
  },
}

export const StructuredBlockRenderer: React.FC<StructuredBlockRendererProps> = ({ blocks }) => {
  if (!blocks || blocks.length === 0) return null

  return (
    <div className="space-y-3 mt-2.5">
      {blocks.map((block, idx) => {
        if (block.type === 'stat_card_group') {
          const cards = block.data as StatCardData[]
          return (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-2">
              {cards.map((card, cIdx) => {
                const scheme = colorMap[card.color || 'stone'] || colorMap.stone
                return (
                  <div
                    key={cIdx}
                    className={`p-3 rounded-xl border ${scheme.border} ${scheme.bg} transition-all`}
                  >
                    <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 mb-0.5">
                      {card.title}
                    </div>
                    <div className={`text-base font-extrabold tracking-tight font-mono ${scheme.text}`}>
                      {card.value}
                    </div>
                    {card.subtitle && (
                      <div className={`text-[10px] mt-1 font-medium ${scheme.sub}`}>
                        {card.subtitle}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        }

        if (block.type === 'table') {
          return <AITableRenderer key={idx} data={block.data as TableComponentData} />
        }

        if (block.type === 'alert_box') {
          const alert = block.data as AlertBoxData
          const isWarning = alert.type === 'warning'
          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs leading-relaxed my-2 ${
                isWarning
                  ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                  : 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200'
              }`}
            >
              {isWarning ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold mb-0.5">{alert.title}</div>
                <div>{alert.message}</div>
              </div>
            </div>
          )
        }

        if (block.type === 'text') {
          return (
            <div key={idx} className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">
              {String(block.data)}
            </div>
          )
        }

        return null
      })}
    </div>
  )
}
