import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="rounded-full bg-orange-50 p-4 mb-4">
          <Icon className="h-8 w-8 text-orange-400" />
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-700">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-400 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
