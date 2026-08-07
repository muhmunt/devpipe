import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { api } from '@/lib/api'
import type { ChatMessage, StreamEvent } from '@/lib/types'

// Pseudo-stage for the card-wide assistant thread — deliberately not one of
// the real pipeline STAGES, so it never collides with ChatStep/PlanStep/
// BriefChat's per-stage chat_messages rows.
const CARD_STAGE = 'general'

function timeLabel(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const THINKING_PHRASES = [
  'Thinking this through…',
  'Reading the card…',
  'Still working on it…',
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

// Persistent, card-wide chat surface — one thread for the whole card,
// independent of which pipeline step is currently open. Additive to (not a
// replacement for) the doc-editing chat already embedded in ChatStep/
// PlanStep/BriefChat for prd/plan/simulating.
export default function CardChatSidebar({ cardId, cardTitle }: { cardId: string; cardTitle: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.listChat(cardId, CARD_STAGE).then(setMessages)
  }, [cardId])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== CARD_STAGE) return
      if (ev.type === 'chat_delta' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + ev.line))
      } else if (ev.type === 'chat' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + '\n' + ev.line))
      } else if (ev.type === 'chat_done') {
        setStreaming(null)
        api.listChat(cardId, CARD_STAGE).then(setMessages)
      } else if (ev.type === 'error') {
        setStreaming(null)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId])

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
      { id: `local-${Date.now()}`, cardId, stage: CARD_STAGE, docId: null, role: 'user', content: input, createdAt: '' },
    ])
    setStreaming('')
    const message = input
    setInput('')
    await api.sendChat(cardId, CARD_STAGE, message, '')
  }

  const loading = streaming !== null

  return (
    <div className="flex flex-col h-full min-w-0 bg-card">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0 min-w-0">
        <MessageSquare className="size-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">
          Chat — {cardTitle}
        </span>
      </div>

      <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">Ask the agent anything about this card.</p>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex flex-col items-end">
              <div className="max-w-[90%] min-w-0 break-words bg-secondary border border-border px-4 py-2.5 rounded-xl rounded-tr-none text-sm leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 mr-1">
                You{m.createdAt ? ` · ${timeLabel(m.createdAt)}` : ''}
              </span>
            </div>
          ) : (
            <div key={m.id} className="flex flex-col items-start">
              <div className="max-w-[90%] min-w-0 break-words bg-popover border border-border px-4 py-2.5 rounded-xl rounded-tl-none text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {m.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 ml-1">
                Agent{m.createdAt ? ` · ${timeLabel(m.createdAt)}` : ''}
              </span>
            </div>
          ),
        )}
        {loading && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] min-w-0 break-words bg-popover border border-border px-4 py-2.5 rounded-xl rounded-tl-none text-sm text-muted-foreground">
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

      {error && <p className="text-sm text-destructive px-4 pb-2">{error}</p>}

      <div className="p-4 border-t border-border shrink-0">
        <div className="relative">
          <input
            className="w-full bg-input border border-border rounded-lg pl-4 pr-11 py-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors duration-(--dur-short) ease-(--ease-out)"
            placeholder="Message the agent…"
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
    </div>
  )
}
