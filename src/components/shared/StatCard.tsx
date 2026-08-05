import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon | any
  iconColor?: string
  iconBg?: string
  trend?: 'up' | 'down' | 'neutral'
  className?: string
  onClick?: () => void
  isActive?: boolean
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  className,
  onClick,
  isActive,
}: StatCardProps) {
  // Unified font size across all cards for clean visual alignment
  const valueFontSizeClass = 'text-xl font-black'

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-xl border border-stone-200/80 bg-white p-4 shadow-xs transition-all duration-200 flex flex-col justify-between min-w-0',
        isClickable ? 'cursor-pointer select-none hover:border-stone-400 active:scale-[0.99]' : '',
        isActive 
          ? 'border-stone-900 bg-stone-900 text-white shadow-sm ring-1 ring-stone-900' 
          : 'hover:shadow-sm',
        className
      )}
    >
      <div className="space-y-2 min-w-0">
        {/* Title & Icon Header Row */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <p className={cn(
            'text-[10px] sm:text-[11px] font-bold uppercase tracking-wider truncate flex-1 min-w-0',
            isActive ? 'text-stone-300' : 'text-stone-500'
          )}>
            {title}
          </p>
          {Icon && (
            <div className={cn(
              'p-1.5 rounded-lg shrink-0 transition-colors',
              isActive 
                ? 'bg-stone-800 text-stone-200' 
                : iconBg && iconColor
                  ? `${iconBg} ${iconColor}`
                  : 'bg-stone-100 text-stone-500 group-hover:bg-stone-200 group-hover:text-stone-800'
            )}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* Value: Full Width Single Line Display */}
        <div className="min-w-0 overflow-hidden">
          <p className={cn(
            'font-black tabular-nums tracking-tight whitespace-nowrap truncate',
            valueFontSizeClass,
            isActive ? 'text-white' : 'text-stone-950'
          )}>
            {value}
          </p>
        </div>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className={cn(
          'mt-2 text-[11px] font-medium truncate',
          isActive ? 'text-stone-300' : 'text-stone-500'
        )}>
          {subtitle}
        </p>
      )}
    </div>
  )
}
