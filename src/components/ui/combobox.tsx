"use client"

import * as React from "react"
import * as ReactDOM from "react-dom"
import { Check, ChevronsUpDown, Search, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ComboboxItem {
    value: string
    label: string
}

interface ComboboxProps {
    items: ComboboxItem[]
    value?: string
    onChange: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    emptyMessage?: string
    className?: string
    modal?: boolean
    // Creación rápida
    allowCreate?: boolean
    onCreateNew?: (searchTerm: string) => void
    createLabel?: string
}

export function Combobox({
    items,
    value,
    onChange,
    placeholder = "Seleccionar...",
    searchPlaceholder = "Buscar...",
    emptyMessage = "No se encontraron resultados.",
    className,
    allowCreate,
    onCreateNew,
    createLabel,
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const [isMobile, setIsMobile] = React.useState(false)
    const triggerRef = React.useRef<HTMLButtonElement>(null)
    const dropdownRef = React.useRef<HTMLDivElement>(null)
    const inputRef = React.useRef<HTMLInputElement>(null)
    const [dropdownStyle, setDropdownStyle] = React.useState<React.CSSProperties>({})

    const selectedItem = items.find((item) => item.value === value)

    const filteredItems = React.useMemo(() => {
        if (!search) return items
        const lower = search.toLowerCase()
        return items.filter((item) => item.label.toLowerCase().includes(lower))
    }, [items, search])

    // Detect mobile
    React.useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 640)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    // Calculate dropdown position when opening (desktop only)
    const updatePosition = React.useCallback(() => {
        if (!triggerRef.current || isMobile) return
        const rect = triggerRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const dropdownHeight = 320

        const showAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow

        setDropdownStyle({
            position: "fixed",
            left: rect.left,
            width: Math.max(rect.width, 280),
            ...(showAbove
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.bottom + 4 }),
            zIndex: 99999,
        })
    }, [isMobile])

    // Update position when open
    React.useEffect(() => {
        if (open && !isMobile) {
            updatePosition()
            window.addEventListener("scroll", updatePosition, true)
            window.addEventListener("resize", updatePosition)
            return () => {
                window.removeEventListener("scroll", updatePosition, true)
                window.removeEventListener("resize", updatePosition)
            }
        }
    }, [open, updatePosition, isMobile])

    // Close dropdown when clicking outside (desktop)
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (isMobile) return
            const target = event.target as Node
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setOpen(false)
                setSearch("")
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside)
            return () => document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [open, isMobile])

    // Focus input when dropdown opens
    React.useEffect(() => {
        if (open && inputRef.current) {
            requestAnimationFrame(() => {
                inputRef.current?.focus()
            })
        }
    }, [open])

    // Prevent body scroll when mobile drawer is open
    React.useEffect(() => {
        if (open && isMobile) {
            document.body.style.overflow = 'hidden'
            return () => { document.body.style.overflow = '' }
        }
    }, [open, isMobile])

    const handleSelect = (itemValue: string) => {
        onChange(itemValue)
        setOpen(false)
        setSearch("")
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setOpen(false)
            setSearch("")
        }
    }

    const handleCreateNew = () => {
        if (onCreateNew && search.trim()) {
            onCreateNew(search.trim())
            setOpen(false)
            setSearch("")
        }
    }

    // ====== CREATE BUTTON ======
    const createButton = allowCreate && onCreateNew && search.trim() ? (
        <button
            type="button"
            onClick={handleCreateNew}
            className={cn(
                "flex w-full items-center gap-2.5 px-3 text-sm font-medium transition-colors rounded-lg",
                "text-amber-700 bg-amber-50 hover:bg-amber-100",
                "dark:text-amber-300 dark:bg-amber-900/20 dark:hover:bg-amber-900/30",
                isMobile ? "py-3.5 min-h-[48px]" : "py-2.5"
            )}
        >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{createLabel || `Crear "${search.trim()}"`}</span>
        </button>
    ) : null

    // ====== ITEM LIST ======
    const renderItemList = () => (
        <>
            {filteredItems.map((item) => (
                <button
                    key={item.value}
                    type="button"
                    onClick={() => handleSelect(item.value)}
                    className={cn(
                        "relative flex w-full cursor-pointer select-none items-center rounded-lg outline-none transition-colors",
                        "hover:bg-amber-50 hover:text-amber-900 dark:hover:bg-amber-900/20 dark:hover:text-amber-300",
                        "active:bg-amber-100 dark:active:bg-amber-900/30",
                        value === item.value && "bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-300",
                        isMobile ? "px-4 py-3.5 min-h-[48px] text-base gap-3" : "px-2 py-2 text-sm gap-2"
                    )}
                >
                    <Check
                        className={cn(
                            "shrink-0",
                            isMobile ? "h-5 w-5" : "h-4 w-4",
                            value === item.value ? "opacity-100 text-amber-600" : "opacity-0"
                        )}
                    />
                    <span className="truncate">{item.label}</span>
                </button>
            ))}
        </>
    )

    // ====== MOBILE DRAWER ======
    const mobileDrawer = open && isMobile ? ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[99999] bg-black/50 animate-fade-in"
            onClick={() => { setOpen(false); setSearch("") }}
        >
            <div
                ref={dropdownRef}
                className="fixed bottom-0 left-0 right-0 z-[100000] bg-white dark:bg-gray-900 
                           rounded-t-2xl shadow-2xl flex flex-col animate-slide-up"
                style={{ maxHeight: '85vh' }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-gray-300 rounded-full dark:bg-gray-600" />
                </div>

                {/* Header with close */}
                <div className="flex items-center justify-between px-4 pb-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {placeholder}
                    </span>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); setSearch("") }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <X className="h-5 w-5 text-gray-400" />
                    </button>
                </div>

                {/* Search Input - larger for mobile */}
                <div className="px-4 pb-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full pl-10 pr-4 py-3 text-base rounded-xl border border-gray-200 
                                       bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-white
                                       focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none
                                       placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {filteredItems.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-base text-gray-500 dark:text-gray-400 mb-3">{emptyMessage}</p>
                            {createButton && (
                                <div className="px-2">{createButton}</div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-0.5">
                            {renderItemList()}
                            {/* Create button at bottom of results */}
                            {createButton && search.trim() && (
                                <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                                    {createButton}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Safe area for phones with home indicator */}
                <div className="h-safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
            </div>
        </div>,
        document.body
    ) : null

    // ====== DESKTOP DROPDOWN ======
    const desktopDropdown = open && !isMobile
        ? ReactDOM.createPortal(
            <div
                ref={dropdownRef}
                style={dropdownStyle}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
                onKeyDown={handleKeyDown}
            >
                {/* Search Input */}
                <div className="flex items-center border-b border-gray-200 px-3 dark:border-gray-700">
                    <Search className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
                    <input
                        ref={!isMobile ? inputRef : undefined}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                        autoComplete="off"
                    />
                </div>

                {/* Items List */}
                <div className="overflow-y-auto" style={{ maxHeight: "260px" }}>
                    {filteredItems.length === 0 ? (
                        <div className="py-4 text-center">
                            <p className="text-sm text-gray-500">{emptyMessage}</p>
                            {createButton && (
                                <div className="px-3 pt-2">{createButton}</div>
                            )}
                        </div>
                    ) : (
                        <div className="p-1">
                            {renderItemList()}
                            {/* Create button at bottom of results */}
                            {createButton && search.trim() && (
                                <div className="pt-1 mt-1 border-t border-gray-100 dark:border-gray-800">
                                    {createButton}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>,
            document.body
        )
        : null

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(!open)}
                className={cn(
                    "flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white",
                    "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500",
                    "dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700",
                    "min-h-[40px] sm:min-h-[40px] min-h-[44px]",
                    !value && "text-gray-500",
                    className
                )}
            >
                <span className="truncate">
                    {selectedItem ? selectedItem.label : placeholder}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>

            {/* Render appropriate dropdown */}
            {mobileDrawer}
            {desktopDropdown}
        </div>
    )
}
