import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
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
  className,
  onClick,
  isActive,
}: StatCardProps) {
  const isClickable = !!onClick

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-xl border border-stone-200/80 bg-white p-5 shadow-xs transition-all duration-200',
        isClickable ? 'cursor-pointer select-none hover:border-stone-400 active:scale-[0.99]' : '',
        isActive 
          ? 'border-stone-900 bg-stone-900 text-white shadow-sm ring-1 ring-stone-900' 
          : 'hover:shadow-sm',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[11px] font-bold uppercase tracking-wider',
            isActive ? 'text-stone-300' : 'text-stone-500'
          )}>
            {title}
          </p>
          <p className={cn(
            'mt-2 text-2xl font-black truncate tabular-nums tracking-tight',
            isActive ? 'text-white' : 'text-stone-950'
          )}>
            {value}
          </p>
          {subtitle && (
            <p className={cn(
              'mt-1.5 text-xs font-medium truncate',
              isActive ? 'text-stone-300' : 'text-stone-500'
            )}>
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div className={cn(
            'p-2.5 rounded-lg border shrink-0 transition-colors',
            isActive 
              ? 'bg-stone-800 border-stone-700 text-white' 
              : 'bg-stone-50 border-stone-200/60 text-stone-700 group-hover:bg-stone-100 group-hover:text-stone-900'
          )}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  )
}
