/* devpipe · design-system: design.md */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  icon?: ReactNode
  /** Trailing hint, e.g. a shortcut or a state note. */
  hint?: string
}

/**
 * Small anchored menu. Closes on outside click, Escape, or selection.
 *
 * The panel renders in a portal rather than next to its trigger. An absolutely
 * positioned child is still clipped by any ancestor that scrolls, and this
 * menu is opened from exactly those places — the tab strip (overflow-x-auto)
 * and the sidebar's scrolling lists. Anchored to the trigger's viewport
 * rectangle, nothing upstream can cut it off.
 */
export function Menu({
  trigger,
  items,
  label,
  align = 'right',
  /** Numbers each row 1..9, as a launcher does. */
  numbered = false,
  footer,
  triggerClassName,
}: {
  trigger: ReactNode
  items: MenuItem[]
  label: string
  align?: 'left' | 'right'
  numbered?: boolean
  footer?: ReactNode
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
  }, [])

  useLayoutEffect(() => {
    if (open) measure()
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // The trigger moves when the strip scrolls or the window resizes, and a
    // portal doesn't follow it on its own.
    const reposition = () => measure()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, measure])

  // Keep the panel inside the viewport: a menu opened near the right edge
  // would otherwise hang off-screen, which is the same failure as being
  // clipped, just from a different direction.
  const WIDTH = 232
  const left = rect
    ? Math.min(Math.max(8, align === 'left' ? rect.left : rect.right - WIDTH), window.innerWidth - WIDTH - 8)
    : 0

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={
          triggerClassName ??
          'p-0.5 rounded text-text-faint hover:text-text hover:bg-surface-hover active:translate-y-px transition-colors'
        }
      >
        {trigger}
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', top: rect.bottom + 4, left, width: WIDTH }}
            className="z-50 bg-surface-elevated border border-border rounded-lg py-1 shadow-lg overflow-hidden"
          >
            {items.map((item, i) => (
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
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.disabled ? '' : 'hover:bg-surface-hover focus-visible:bg-surface-hover'
                } ${item.danger ? 'text-error' : 'text-text'}`}
              >
                {numbered && (
                  <span className="w-3 shrink-0 text-[11px] text-text-faint tnum">{i < 9 ? i + 1 : ''}</span>
                )}
                {item.icon && <span className="shrink-0 grid place-items-center text-text-muted">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
                {item.hint && <span className="ml-auto shrink-0 text-[11px] text-text-faint">{item.hint}</span>}
              </button>
            ))}
            {footer && (
              <div className="mt-1 border-t border-border px-2.5 py-1.5 text-[11px] text-text-faint">{footer}</div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
