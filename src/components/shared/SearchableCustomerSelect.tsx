import React, { useState, useRef, useEffect, useMemo } from 'react'
import { RiUserLine, RiSearchLine, RiCloseLine, RiCheckLine, RiPhoneLine, RiArrowDownSLine, RiUserSearchLine } from '@remixicon/react'
import { cn } from '@/lib/utils'

export interface CustomerOption {
  id: string
  name: string
  phone?: string
  isSubstitute?: boolean
  [key: string]: any
}

interface SearchableCustomerSelectProps {
  customers: CustomerOption[]
  value?: string | null
  onChange: (id: string, customer?: CustomerOption) => void
  placeholder?: string
  disabled?: boolean
  disabledMessage?: string
  className?: string
  excludeIds?: string[]
  size?: 'sm' | 'md'
  showPhone?: boolean
}

export const SearchableCustomerSelect: React.FC<SearchableCustomerSelectProps> = ({
  customers,
  value,
  onChange,
  placeholder = '-- 請搜尋或選擇學員 --',
  disabled = false,
  disabledMessage,
  className,
  excludeIds = [],
  size = 'md',
  showPhone = true,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === value)
  }, [customers, value])

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return customers.filter((c) => {
      if (excludeIds.includes(c.id)) return false
      if (!term) return true
      const nameMatch = c.name?.toLowerCase().includes(term)
      const phoneMatch = c.phone?.toLowerCase().includes(term)
      return nameMatch || phoneMatch
    })
  }, [customers, searchTerm, excludeIds])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchTerm('')
    }
  }, [isOpen])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleSelect = (customer: CustomerOption) => {
    onChange(customer.id, customer)
    setIsOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('', undefined)
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', isOpen && 'z-50', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 text-left rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 px-3 transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/20',
          size === 'sm' ? 'h-9 text-xs' : 'h-10 text-sm',
          disabled && 'opacity-50 cursor-not-allowed bg-stone-100 dark:bg-stone-900',
          isOpen && 'border-orange-500 ring-2 ring-orange-500/20'
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
          <RiUserLine className="w-4 h-4 text-stone-400 shrink-0" />
          {selectedCustomer ? (
            <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
              {selectedCustomer.name}
              {showPhone && selectedCustomer.phone ? (
                <span className="ml-1.5 text-xs text-stone-400 font-normal">({selectedCustomer.phone})</span>
              ) : null}
            </span>
          ) : (
            <span className="text-stone-400 truncate">
              {disabled && disabledMessage ? disabledMessage : placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-stone-400">
          {selectedCustomer && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-full transition-colors"
              title="清除選擇"
            >
              <RiCloseLine className="w-4 h-4 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200" />
            </span>
          )}
          <RiArrowDownSLine className={cn('w-4 h-4 transition-transform duration-200', isOpen && 'rotate-180')} />
        </div>
      </button>

      {/* Search Popover Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Bar */}
          <div className="p-2 border-b border-stone-100 dark:border-stone-700 bg-stone-50/50 dark:bg-stone-900/50">
            <div className="relative">
              <RiSearchLine className="w-4 h-4 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="輸入姓名或電話搜尋..."
                className="w-full h-8 pl-8 pr-7 text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-800 dark:text-stone-200 placeholder-stone-400 focus:outline-none focus:border-orange-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <RiCloseLine className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Customer List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-stone-50 dark:divide-stone-700/50">
            {filteredCustomers.length === 0 ? (
              <div className="px-4 py-5 text-xs text-stone-400 text-center flex flex-col items-center gap-1.5">
                <RiUserSearchLine className="w-5 h-5 text-stone-300 dark:text-stone-600" />
                {searchTerm ? '找不到符合的學員' : '無可選學員'}
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const isSelected = c.id === value
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-orange-50/60 dark:hover:bg-stone-700/60 flex items-center justify-between gap-2',
                      isSelected && 'bg-orange-50 dark:bg-stone-700/80 font-semibold'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold',
                          isSelected
                            ? 'bg-orange-500 text-white'
                            : 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300'
                        )}
                      >
                        {c.name ? c.name.charAt(0) : '?'}
                      </div>
                      <div className="min-w-0 truncate">
                        <div className="text-stone-900 dark:text-stone-100 flex items-center gap-1.5 truncate">
                          <span>{c.name}</span>
                          {c.isSubstitute && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-1 py-0.2 rounded">
                              代課
                            </span>
                          )}
                        </div>
                        {showPhone && c.phone && (
                          <div className="text-[10px] text-stone-400 flex items-center gap-1 mt-0.5">
                            <RiPhoneLine className="w-3 h-3 shrink-0" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && <RiCheckLine className="w-4 h-4 text-orange-500 shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
