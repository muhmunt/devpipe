import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { api } from '@/lib/api'
import type { ChatMessage, StreamEvent } from '@/lib/types'

function timeLabel(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const THINKING_PHRASES = [
  'Thinking this through…',
  'Working out the scenario…',
  'Still thinking…',
  'Almost there…',
]

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce" />
    </span>
  )
}

// Chat-only brief editor — no separate document panel. Used for stages where
// the conversation itself IS the execution prompt (e.g. describing a
// simulation scenario before running it), rather than producing a doc like
// PRD/Plan do.
export default function BriefChat({
  cardId,
  stage,
  placeholder,
  emptyHint,
}: {
  cardId: string
  stage: string
  placeholder: string
  emptyHint: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const history = await api.listChat(cardId, stage)
    setMessages(history)
  }

  useEffect(() => {
    load()
  }, [cardId, stage])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== stage) return
      if (ev.type === 'chat_delta' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + ev.line))
      } else if (ev.type === 'chat' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + '\n' + ev.line))
      } else if (ev.type === 'chat_done') {
        setStreaming(null)
        load()
      } else if (ev.type === 'error') {
        setStreaming(null)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId, stage])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages, streaming])

  useEffect(() => {
    if (streaming == null) {
      setPhraseIdx(0)
      return
    }
    const id = setInterval(() => setPhraseIdx((i) => Math.min(i + 1, THINKING_PHRASES.length - 1)), 4000)
    return () => clearInterval(id)
  }, [streaming === null])

  const send = async () => {
    if (!input.trim()) return
    setError(null)
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, cardId, stage, docId: null, role: 'user', content: input, createdAt: '' },
    ])
    setStreaming('')
    const message = input
    setInput('')
    await api.sendChat(cardId, stage, message, '')
  }

  const loading = streaming !== null

  return (
    <div className="space-y-3">
      <div ref={transcriptRef} className="border border-border rounded-lg bg-card p-4 max-h-64 overflow-y-auto space-y-4">
        {messages.length === 0 && !loading && <p className="text-sm text-muted-foreground">{emptyHint}</p>}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex flex-col items-end">
              <div className="max-w-[85%] min-w-0 break-words bg-secondary border border-border px-4 py-2.5 rounded-xl rounded-tr-none text-sm leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 mr-1">You{m.createdAt ? ` · ${timeLabel(m.createdAt)}` : ''}</span>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start">
              <div className="max-w-[85%] min-w-0 break-words bg-popover border border-border px-4 py-2.5 rounded-xl rounded-tl-none text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 ml-1">Agent{m.createdAt ? ` · ${timeLabel(m.createdAt)}` : ''}</span>
            </div>
          ),
        )}
        {loading && (
          <div className="flex flex-col items-start">
            <div className="max-w-[85%] min-w-0 break-words bg-popover border border-border px-4 py-2.5 rounded-xl rounded-tl-none text-sm text-muted-foreground">
              {streaming || (
                <>
                  {THINKING_PHRASES[phraseIdx]}
                  <ThinkingDots />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="relative">
        <input
          className="w-full bg-input border border-border rounded-lg pl-4 pr-11 py-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors duration-(--dur-short) ease-(--ease-out)"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && send()}
          disabled={loading}
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center text-primary hover:opacity-80 disabled:opacity-30 transition-colors"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  )
}
