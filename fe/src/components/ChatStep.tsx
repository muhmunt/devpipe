import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ArrowRight, Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import MermaidDiagram from '@/components/MermaidDiagram'
import { api } from '@/lib/api'
import type { ChatMessage, StreamEvent } from '@/lib/types'

function timeLabel(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const THINKING_PHRASES = [
  'Reading the brief…',
  'Thinking this through…',
  'Drafting…',
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

export default function ChatStep({
  cardId,
  prdId,
  stage,
  nextStage,
  continueLabel,
  onAdvance,
}: {
  cardId: string
  prdId: string
  stage: string
  nextStage: string
  continueLabel: string
  onAdvance: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [docContent, setDocContent] = useState('')
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [diagram, setDiagram] = useState<string | null>(null)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [diagramLoading, setDiagramLoading] = useState(false)
  const [diagramError, setDiagramError] = useState<string | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    const history = await api.listChat(cardId, stage, prdId)
    setMessages(history)
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')
    const prd = await api.getPRD(cardId, prdId)
    // Always resolve from the freshest source for *this* draft — otherwise
    // switching to a draft with no chat history and empty content leaves
    // the previous draft's text lingering in the editor.
    setDocContent(lastAssistant ? lastAssistant.content : prd.content)
    setDiagram(prd.diagram)
  }

  useEffect(() => {
    load()
  }, [cardId, stage, prdId])

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
        setDocContent(ev.data ?? '')
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

  // Rotate reassuring copy while the agent is thinking, so the panel never
  // looks like it's just frozen — especially before the first line lands.
  useEffect(() => {
    if (streaming == null) {
      setPhraseIdx(0)
      return
    }
    const id = setInterval(() => {
      setPhraseIdx((i) => Math.min(i + 1, THINKING_PHRASES.length - 1))
    }, 4000)
    return () => clearInterval(id)
  }, [streaming === null])

  const send = async () => {
    if (!input.trim()) return
    setError(null)
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, cardId, stage, docId: prdId, role: 'user', content: input, createdAt: '' },
    ])
    setStreaming('')
    const message = input
    setInput('')
    await api.sendChat(cardId, stage, message, docContent, prdId)
  }

  const generateDiagram = async () => {
    setDiagramLoading(true)
    setDiagramError(null)
    try {
      const prd = await api.generateDiagram(cardId, prdId)
      setDiagram(prd.diagram)
      setDiagramOpen(true)
    } catch (e) {
      setDiagramError(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagramLoading(false)
    }
  }

  const saveAndContinue = async () => {
    setSaving(true)
    try {
      await api.updatePRD(cardId, prdId, { content: docContent })
      await api.updateStage(cardId, nextStage, 'idle')
      onAdvance()
    } finally {
      setSaving(false)
    }
  }

  const loading = streaming !== null
  const previewHtml = preview ? DOMPurify.sanitize(marked.parse(docContent || '', { async: false })) : ''

  return (
    <div className="space-y-3">
      <div ref={transcriptRef} className="border border-border rounded-lg bg-card p-4 max-h-80 overflow-y-auto space-y-4">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            Chat with the agent to draft this — describe what you want, it'll write the doc below.
          </p>
        )}
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

      <div className="space-y-2">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest pl-1">
          Comment here to revise
        </label>
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

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Document · editable · markdown
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={preview ? 'outline' : 'default'}
              className="h-6 px-2 text-xs"
              onClick={() => setPreview(false)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={preview ? 'default' : 'outline'}
              className="h-6 px-2 text-xs"
              onClick={() => setPreview(true)}
            >
              Preview
            </Button>
          </div>
        </div>

        {preview ? (
          <div
            className="border rounded-md p-3 text-sm min-h-[190px] prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
          />
        ) : (
          <Textarea
            rows={8}
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            placeholder="Draft appears here as you chat — or write it directly."
          />
        )}
      </div>

      {stage === 'prd' && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={generateDiagram} disabled={diagramLoading || !docContent.trim()}>
            {diagramLoading ? 'Generating…' : diagram ? 'Regenerate Diagram' : 'Generate Diagram'}
          </Button>
          <Dialog open={diagramOpen} onOpenChange={setDiagramOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!diagram}>
                View Diagram
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>PRD Diagram</DialogTitle>
              </DialogHeader>
              {diagram && <MermaidDiagram code={diagram} />}
            </DialogContent>
          </Dialog>
        </div>
      )}
      {diagramError && <p className="text-sm text-destructive">{diagramError}</p>}

      <button
        type="button"
        onClick={saveAndContinue}
        disabled={!docContent.trim() || saving}
        className="btn-interactive focus-ring w-full bg-primary text-primary-foreground py-3 rounded font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving…' : continueLabel}
        {!saving && <ArrowRight className="size-4" />}
      </button>
    </div>
  )
}
