import React, { ComponentType } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { cn } from '../../lib/utils'

export interface FilterOption {
  value: string | number
  label: string
}

export interface FilterDropdownProps {
  value: string | number
  onChange: (value: any) => void
  options: FilterOption[]
  label?: string
  icon?: ComponentType<{ className?: string }>
  className?: string
  align?: 'start' | 'center' | 'end'
}

export function FilterDropdown({
  value,
  onChange,
  options,
  label,
  icon: Icon,
  className,
  align = 'end',
}: FilterDropdownProps) {
  const selectedOption = options.find((opt) => String(opt.value) === String(value))
  const displayLabel = selectedOption ? selectedOption.label : String(value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 text-stone-800 transition-all text-xs font-bold select-none outline-none border border-stone-200 cursor-pointer dark:bg-[#232f3d] dark:hover:bg-[#2c3b4d] dark:text-stone-100 dark:border-stone-700 shadow-2xs',
            className
          )}
        >
          <div className="flex items-center gap-1.5 truncate">
            {Icon && <Icon className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
            <span className="truncate">{displayLabel}</span>
          </div>
          <ChevronDown className="h-3 w-3 text-stone-400 shrink-0 ml-1" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48 mt-1 max-h-64 overflow-y-auto z-50">
        {label && (
          <>
            <DropdownMenuLabel className="text-[11px] font-bold text-stone-400 dark:text-stone-400">{label}</DropdownMenuLabel>
            <DropdownMenuSeparator className="dark:bg-stone-700" />
          </>
        )}
        {options.map((option) => {
          const isSelected = String(value) === String(option.value)
          return (
            <DropdownMenuItem
              key={String(option.value)}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex items-center justify-between cursor-pointer text-xs py-2 px-2.5 font-bold rounded-lg transition-colors text-stone-700 dark:text-stone-200',
                isSelected
                  ? 'text-orange-600 bg-orange-50 focus:bg-orange-100 focus:text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 dark:focus:bg-orange-500/30 dark:focus:text-orange-300'
                  : 'focus:bg-stone-100 focus:text-stone-900 dark:focus:bg-stone-700/80 dark:focus:text-white'
              )}
            >
              <span className="truncate">{option.label}</span>
              {isSelected && <span className="text-[10px] text-orange-600 dark:text-orange-400 shrink-0 ml-2 font-black">✓</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
