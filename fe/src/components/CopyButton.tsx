/* devpipe · design-system: design.md */
import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

// Copying is silent — nothing on screen changes — so the button has to say
// it worked itself. It reverts after a moment rather than staying "Copied",
// which would leave a stale claim on screen for the rest of the session.
export function CopyButton({
  text,
  label = 'Copy',
  className = '',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setFailed(false)
    } catch {
      // Clipboard access is refused outside a secure context, and silently
      // doing nothing would look like a broken button.
      setFailed(true)
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setCopied(false)
      setFailed(false)
    }, 1600)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={failed ? 'Copy failed' : copied ? 'Copied' : label}
      title={failed ? "Couldn't reach the clipboard" : label}
      className={`copy-btn inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[11px] text-text-muted hover:text-text hover:bg-surface-hover active:translate-y-px transition-colors ${className}`}
    >
      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
      {failed ? 'Failed' : copied ? 'Copied' : null}
    </button>
  )
}
