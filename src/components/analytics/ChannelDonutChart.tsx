import { useState } from 'react'

interface ChannelDonutChartProps {
  channelCount: Record<string, number>
  totalCust: number
}

// 柔和莫蘭迪配色 (Morandi Palette)
const CHANNEL_CONFIG: Record<string, { color: string; hoverColor: string }> = {
  Instagram: { color: '#D88A9A', hoverColor: '#C47787' },
  Facebook: { color: '#7B92AB', hoverColor: '#677E97' },
  'Google 搜尋': { color: '#D98A7D', hoverColor: '#C57669' },
  '親友/會員介紹': { color: '#E2AF6D', hoverColor: '#CE9B59' },
  '路過/現場親洽': { color: '#88A995', hoverColor: '#749581' },
  舊客戶: { color: '#A293B8', hoverColor: '#8E7FA4' },
  其他管道: { color: '#949E9E', hoverColor: '#808A8A' },
}

const DEFAULT_CONFIG = { color: '#A8B2B2', hoverColor: '#949E9E' }

export function ChannelDonutChart({ channelCount, totalCust }: ChannelDonutChartProps) {
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null)

  // 僅顯示人數大於 0 的項目 (Hide 0-count items)
  const activeEntries = Object.entries(channelCount).filter(([_, count]) => count > 0)
  const validTotal = totalCust > 0 ? totalCust : 1

  // Donut SVG parameters
  const size = 180
  const strokeWidth = 22
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  let accumulatedPercent = 0

  const activeChannelData = hoveredChannel
    ? {
        name: hoveredChannel,
        count: channelCount[hoveredChannel] || 0,
        pct: (((channelCount[hoveredChannel] || 0) / validTotal) * 100).toFixed(1),
        color: (CHANNEL_CONFIG[hoveredChannel] || DEFAULT_CONFIG).color,
      }
    : null

  return (
    <div className="flex flex-col md:flex-row items-center gap-6 pt-2 pb-1">
      {/* Donut Chart SVG */}
      <div className="relative shrink-0 flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Base Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            fill="transparent"
          />

          {activeEntries.length === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#E2E8F0"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
          ) : (
            activeEntries.map(([channel, count]) => {
              const pct = count / validTotal
              const dash = pct * circumference
              const gap = circumference - dash
              const offset = accumulatedPercent * circumference
              accumulatedPercent += pct

              const config = CHANNEL_CONFIG[channel] || DEFAULT_CONFIG
              const isHovered = hoveredChannel === channel

              return (
                <circle
                  key={channel}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={config.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offset}
                  fill="transparent"
                  className="transition-all duration-200 cursor-pointer origin-center"
                  style={{
                    opacity: hoveredChannel && !isHovered ? 0.35 : 1,
                  }}
                  onMouseEnter={() => setHoveredChannel(channel)}
                  onMouseLeave={() => setHoveredChannel(null)}
                />
              )
            })
          )}
        </svg>

        {/* Donut Center Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-2">
          {activeChannelData ? (
            <>
              <span className="text-[11px] font-bold text-stone-500 truncate max-w-[120px]">
                {activeChannelData.name}
              </span>
              <span className="text-xl font-black font-mono tracking-tight text-stone-900">
                {activeChannelData.count} <span className="text-xs font-normal text-stone-500">人</span>
              </span>
              <span
                className="text-[11px] font-bold font-mono mt-0.5"
                style={{ color: activeChannelData.color }}
              >
                ({activeChannelData.pct}%)
              </span>
            </>
          ) : (
            <>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">來客總數</span>
              <span className="text-2xl font-black font-mono tracking-tight text-stone-950">
                {totalCust} <span className="text-xs font-normal text-stone-500">人</span>
              </span>
              <span className="text-[10px] text-stone-400 font-medium">全渠道累計</span>
            </>
          )}
        </div>
      </div>

      {/* Legend & Breakdown Grid - 無外框 clean 風格 */}
      <div className="flex-1 w-full space-y-2">
        {activeEntries.length === 0 ? (
          <p className="text-xs text-stone-400 italic text-center py-4">目前尚無來客渠道數據</p>
        ) : (
          activeEntries.map(([channel, count]) => {
            const pctNumber = (count / validTotal) * 100
            const pctStr = pctNumber.toFixed(1)
            const config = CHANNEL_CONFIG[channel] || DEFAULT_CONFIG
            const isHovered = hoveredChannel === channel

            return (
              <div
                key={channel}
                className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                  isHovered ? 'bg-stone-100/80' : 'hover:bg-stone-50'
                }`}
                onMouseEnter={() => setHoveredChannel(channel)}
                onMouseLeave={() => setHoveredChannel(null)}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="font-bold text-stone-800">{channel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-bold text-stone-950">{count} 人</span>
                    <span className="text-stone-500 font-normal">({pctStr}%)</span>
                  </div>
                </div>
                <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pctNumber}%`,
                      backgroundColor: config.color,
                    }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
