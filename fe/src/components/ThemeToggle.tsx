import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { theme, type Theme } from '@/lib/theme'

export default function ThemeToggle() {
  const [current, setCurrent] = useState<Theme>('light')

  useEffect(() => {
    setCurrent(theme.get())
  }, [])

  const toggle = () => {
    const next: Theme = current === 'dark' ? 'light' : 'dark'
    theme.set(next)
    setCurrent(next)
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Toggle theme">
      {current === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
