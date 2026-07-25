import { useState } from 'react'

interface ChannelDonutChartProps {
  channelCount: Record<string, number>
  totalCust: number
}

const CHANNEL_CONFIG: Record<string, { color: string; badgeBg: string; textColor: string }> = {
  Instagram: { color: '#E1306C', badgeBg: 'bg-rose-50 border-rose-200/80', textColor: 'text-rose-600' },
  Facebook: { color: '#1877F2', badgeBg: 'bg-blue-50 border-blue-200/80', textColor: 'text-blue-600' },
  'Google 搜尋': { color: '#EA4335', badgeBg: 'bg-red-50 border-red-200/80', textColor: 'text-red-600' },
  '親友/會員介紹': { color: '#F59E0B', badgeBg: 'bg-amber-50 border-amber-200/80', textColor: 'text-amber-600' },
  '路過/現場親洽': { color: '#10B981', badgeBg: 'bg-emerald-50 border-emerald-200/80', textColor: 'text-emerald-600' },
  舊客戶: { color: '#8B5CF6', badgeBg: 'bg-purple-50 border-purple-200/80', textColor: 'text-purple-600' },
  其他管道: { color: '#64748B', badgeBg: 'bg-slate-50 border-slate-200/80', textColor: 'text-slate-600' },
}

const DEFAULT_CONFIG = { color: '#94A3B8', badgeBg: 'bg-stone-50 border-stone-200', textColor: 'text-stone-600' }

export function ChannelDonutChart({ channelCount, totalCust }: ChannelDonutChartProps) {
  const [hoveredChannel, setHoveredChannel] = useState<string | null>(null)

  const entries = Object.entries(channelCount).filter(([_, count]) => count > 0)
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
        <svg width={size} height={size} className="transform -rotate-90 drop-shadow-xs">
          {/* Base Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
            fill="transparent"
          />

          {entries.length === 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#E2E8F0"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
          ) : (
            entries.map(([channel, count]) => {
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
                className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full mt-0.5"
                style={{ backgroundColor: `${activeChannelData.color}15`, color: activeChannelData.color }}
              >
                {activeChannelData.pct}%
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

      {/* Legend & Breakdown Grid */}
      <div className="flex-1 w-full space-y-2.5">
        {Object.entries(channelCount).map(([channel, count]) => {
          const pctNumber = (count / validTotal) * 100
          const pctStr = pctNumber.toFixed(1)
          const config = CHANNEL_CONFIG[channel] || DEFAULT_CONFIG
          const isHovered = hoveredChannel === channel

          return (
            <div
              key={channel}
              className={`p-2 rounded-xl transition-all border cursor-pointer ${
                isHovered
                  ? 'bg-stone-50 border-stone-300 shadow-2xs scale-[1.01]'
                  : 'bg-white border-stone-100 hover:bg-stone-50/60'
              }`}
              onMouseEnter={() => setHoveredChannel(channel)}
              onMouseLeave={() => setHoveredChannel(null)}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="font-bold text-stone-800">{channel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-stone-950">{count} 人</span>
                  <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${config.badgeBg} ${config.textColor}`}>
                    {pctStr}%
                  </span>
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
        })}
      </div>
    </div>
  )
}
