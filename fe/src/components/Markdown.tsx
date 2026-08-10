import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Agent output is untrusted text, so it is parsed then sanitised before it
// ever reaches innerHTML. Both libraries are existing project dependencies.
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const parsed = marked.parse(text, { async: false, breaks: true }) as string
    return DOMPurify.sanitize(parsed)
  }, [text])

  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}
