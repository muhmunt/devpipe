import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { tasksToNumberedList } from '@/lib/chatFormat'
import type { ChatMessage, StreamEvent } from '@/lib/types'

export type ChatScope = {
  stage: string
  docId: string | null
  label: string
  emptyHint: string
}

const GENERAL_SCOPE: ChatScope = {
  stage: 'general',
  docId: null,
  label: 'General',
  emptyHint: 'Ask the agent anything about this card.',
}

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

// The one chat surface for the whole card. Auto-scopes to whatever
// accordion stage is open (the `scope` prop, derived in CardDetail); a
// manual pin lets the user stick to the card-wide General thread instead.
// Replaces the inline chats that used to live in ChatStep/PlanStep/
// BriefChat — this is now where every revision-triggering message goes.
export default function CardChatSidebar({
  cardId,
  cardTitle,
  scope,
  prdContent,
  onDocRevised,
  onPlanRevised,
}: {
  cardId: string
  cardTitle: string
  scope: ChatScope
  prdContent?: string
  onDocRevised?: (content: string) => void
  onPlanRevised?: () => void
}) {
  const [pinned, setPinned] = useState(false)
  const effectiveScope = pinned ? GENERAL_SCOPE : scope

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // A doc-scoped stage (prd/plan) with no active draft yet has nothing to
  // revise — disable sending instead of erroring.
  const scopeUnavailable =
    (effectiveScope.stage === 'prd' || effectiveScope.stage === 'plan') && !effectiveScope.docId

  useEffect(() => {
    if (scopeUnavailable) {
      setMessages([])
      return
    }
    api.listChat(cardId, effectiveScope.stage, effectiveScope.docId ?? undefined).then(setMessages)
  }, [cardId, effectiveScope.stage, effectiveScope.docId, scopeUnavailable])

  useEffect(() => {
    const es = new EventSource(api.streamUrl(cardId))
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.stage !== effectiveScope.stage) return
      if (ev.type === 'chat_delta' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + ev.line))
      } else if (ev.type === 'chat' && ev.line != null) {
        setStreaming((prev) => (prev == null ? ev.line! : prev + '\n' + ev.line))
      } else if (ev.type === 'chat_done') {
        setStreaming(null)
        api.listChat(cardId, effectiveScope.stage, effectiveScope.docId ?? undefined).then(setMessages)
        if (effectiveScope.stage === 'prd') onDocRevised?.(ev.data ?? '')
        if (effectiveScope.stage === 'plan') onPlanRevised?.()
      } else if (ev.type === 'error') {
        setStreaming(null)
        setError(ev.data ?? 'agent failed')
      }
    }
    return () => es.close()
  }, [cardId, effectiveScope.stage, effectiveScope.docId, onDocRevised, onPlanRevised])

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

  // What the agent sees as "the current state" alongside the message —
  // the live (possibly unsaved) PRD text for prd scope, a fresh fetch of
  // the plan's tasks for plan scope (tasks always auto-save, so a fresh
  // fetch is always correct there), nothing for general/simulating.
  const buildCurrentDoc = async () => {
    if (effectiveScope.stage === 'prd') return prdContent ?? ''
    if (effectiveScope.stage === 'plan' && effectiveScope.docId) {
      const plan = await api.getPlan(cardId, effectiveScope.docId)
      return tasksToNumberedList(plan.tasks)
    }
    return ''
  }

  const send = async () => {
    if (!input.trim() || scopeUnavailable) return
    setError(null)
    const stage = effectiveScope.stage
    const docId = effectiveScope.docId
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, cardId, stage, docId, role: 'user', content: input, createdAt: '' },
    ])
    setStreaming('')
    const message = input
    setInput('')
    const currentDoc = await buildCurrentDoc()
    await api.sendChat(cardId, stage, message, currentDoc, docId ?? undefined)
  }

  const loading = streaming !== null

  return (
    <div className="flex flex-col h-full min-w-0 bg-card">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0 min-w-0">
        <MessageSquare className="size-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate flex-1">
          {cardTitle}
        </span>
        <button
          type="button"
          onClick={() => setPinned((p) => !p)}
          className="focus-ring shrink-0 text-[9px] font-mono uppercase tracking-wide px-2 py-1 rounded border border-border text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
          title={pinned ? 'Click to auto-follow the open stage' : 'Click to pin to General'}
        >
          {pinned ? 'General' : `Auto: ${scope.label}`}
        </button>
      </div>

      <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {scopeUnavailable && (
          <p className="text-sm text-muted-foreground">
            Create a {effectiveScope.label.toLowerCase()} to start chatting — use the draft picker above.
          </p>
        )}
        {!scopeUnavailable && messages.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">{effectiveScope.emptyHint}</p>
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
            className="w-full bg-input border border-border rounded-lg pl-4 pr-11 py-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-colors duration-(--dur-short) ease-(--ease-out) disabled:opacity-40"
            placeholder={
              effectiveScope.stage === 'prd' || effectiveScope.stage === 'plan'
                ? 'Message the agent — replies revise this document…'
                : 'Message the agent…'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && send()}
            disabled={loading || scopeUnavailable}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim() || scopeUnavailable}
            className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center text-primary hover:opacity-80 disabled:opacity-30 transition-colors"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
