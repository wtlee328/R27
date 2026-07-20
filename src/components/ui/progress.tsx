import * as React from 'react'
import { cn } from '../../lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  indicatorClassName?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-stone-100',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full w-full flex-1 bg-stone-900 transition-all duration-300 rounded-full',
          indicatorClassName
        )}
        style={{ transform: `translateX(-${Math.max(0, Math.min(100, 100 - (value || 0)))}%)` }}
      />
    </div>
  )
)
Progress.displayName = 'Progress'

export { Progress }
