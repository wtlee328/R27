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
  iconColor = 'text-brand-600',
  iconBg = 'bg-brand-50',
  className,
  onClick,
  isActive,
}: StatCardProps) {
  const isClickable = !!onClick

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-xl border p-5 shadow-sm overflow-hidden transition-all duration-300',
        isClickable ? 'cursor-pointer select-none active:scale-[0.98]' : '',
        isActive 
          ? 'border-stone-900 bg-stone-50/60 ring-2 ring-stone-900 shadow-md' 
          : 'border-stone-200/80 bg-white hover:shadow-md hover:border-stone-300',
        className
      )}
    >
      {/* Subtle gradient accent on hover */}
      {!isActive && (
        <div className="absolute inset-0 bg-gradient-to-br from-stone-50/0 to-stone-50/0 group-hover:from-stone-50/40 group-hover:to-transparent transition-all duration-500 pointer-events-none" />
      )}

      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-2xl font-bold text-stone-900 truncate tabular-nums">{value}</p>
          {subtitle && <p className="mt-1.5 text-xs text-stone-400">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={cn(
            'rounded-xl p-2.5 shrink-0 ml-3 transition-transform duration-300 group-hover:scale-110',
            isActive ? 'bg-stone-900 text-white' : iconBg
          )}>
            <Icon className={cn('h-5 w-5', isActive ? 'text-white' : iconColor)} />
          </div>
        )}
      </div>
    </div>
  )
}
