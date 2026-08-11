/* devpipe · design-system: design.md */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  icon?: ReactNode
}

/** Small anchored menu. Closes on outside click, Escape, or selection. */
export function Menu({
  trigger,
  items,
  label,
  align = 'right',
}: {
  trigger: ReactNode
  items: MenuItem[]
  label: string
  /** Which edge the panel hangs from. Left-aligned menus opened from the
      left of a scrolling strip would otherwise render off-screen. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="p-0.5 rounded text-text-faint hover:text-text hover:bg-surface-hover active:translate-y-px transition-colors"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-1 z-30 min-w-[168px] bg-surface-elevated border border-border rounded-md py-1 shadow-lg`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (item.disabled) return
                setOpen(false)
                item.onSelect()
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.disabled ? '' : 'hover:bg-surface-hover focus-visible:bg-surface-hover active:translate-y-px'
              } ${item.danger ? 'text-error' : 'text-text'}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
