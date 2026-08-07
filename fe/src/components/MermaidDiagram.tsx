import { useEffect, useId, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'neutral' })

export default function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)
    mermaid
      .render(`mermaid-${id}`, code)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [code, id])

  if (error) {
    return (
      <div className="text-sm text-red-600">
        <p>Couldn't render diagram:</p>
        <pre className="text-xs bg-muted p-2 rounded-md mt-1 overflow-x-auto">{error}</pre>
      </div>
    )
  }

  if (!svg) return <p className="text-sm text-muted-foreground">Rendering…</p>

  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
