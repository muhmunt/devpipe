import { useEffect, useState } from 'react'

/**
 * Shell layout tiers (design.md §6). Named after what the shell *does* at that
 * width, not after device classes, because the same width means the same
 * layout whether it's a phone, a split window, or a narrow browser.
 */
export type Tier = 'full' | 'overlayPanel' | 'drawerNav' | 'tooNarrow'

function tierFor(width: number): Tier {
  if (width < 768) return 'tooNarrow'
  if (width < 1024) return 'drawerNav'
  if (width < 1280) return 'overlayPanel'
  return 'full'
}

/** Live shell tier. Uses matchMedia rather than a resize listener so it only
 *  fires on an actual tier change, not on every pixel of a drag. */
export function useTier(): Tier {
  const [tier, setTier] = useState<Tier>(() =>
    typeof window === 'undefined' ? 'full' : tierFor(window.innerWidth),
  )

  useEffect(() => {
    const queries = [
      window.matchMedia('(min-width: 1280px)'),
      window.matchMedia('(min-width: 1024px)'),
      window.matchMedia('(min-width: 768px)'),
    ]
    const sync = () => setTier(tierFor(window.innerWidth))
    queries.forEach((q) => q.addEventListener('change', sync))
    sync()
    return () => queries.forEach((q) => q.removeEventListener('change', sync))
  }, [])

  return tier
}
