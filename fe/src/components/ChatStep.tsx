import { useEffect, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ArrowRight } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import MermaidDiagram from '@/components/MermaidDiagram'
import StageActionBar from '@/components/StageActionBar'
import { api } from '@/lib/api'

export default function ChatStep({
  cardId,
  prdId,
  content,
  onContentChange,
  nextStage,
  continueLabel,
  onAdvance,
}: {
  cardId: string
  prdId: string
  content: string
  onContentChange: (content: string) => void
  nextStage: string
  continueLabel: string
  onAdvance: () => void
}) {
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [diagram, setDiagram] = useState<string | null>(null)
  const [diagramOpen, setDiagramOpen] = useState(false)
  const [diagramLoading, setDiagramLoading] = useState(false)
  const [diagramError, setDiagramError] = useState<string | null>(null)

  useEffect(() => {
    api.getPRD(cardId, prdId).then((prd) => setDiagram(prd.diagram))
  }, [cardId, prdId])

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
      await api.updatePRD(cardId, prdId, { content })
      await api.updateStage(cardId, nextStage, 'idle')
      onAdvance()
    } finally {
      setSaving(false)
    }
  }

  const previewHtml = preview ? DOMPurify.sanitize(marked.parse(content || '', { async: false })) : ''

  return (
    <div className="space-y-3">
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
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Draft appears here as you chat — or write it directly."
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={generateDiagram} disabled={diagramLoading || !content.trim()}>
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
      {diagramError && <p className="text-sm text-destructive">{diagramError}</p>}

      <StageActionBar
        turn="you"
        label={saving ? 'Saving…' : continueLabel}
        onClick={saveAndContinue}
        disabled={!content.trim() || saving}
        icon={ArrowRight}
      />
    </div>
  )
}
