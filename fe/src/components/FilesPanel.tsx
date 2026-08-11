/* devpipe · design-system: design.md */
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'

type TreeNode = { name: string; path: string; children?: Map<string, TreeNode> }

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: new Map() }
  for (const path of paths) {
    const parts = path.split('/')
    let node = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const isFile = i === parts.length - 1
      acc = acc ? `${acc}/${parts[i]}` : parts[i]
      if (!node.children) node.children = new Map()
      let next = node.children.get(parts[i])
      if (!next) {
        next = { name: parts[i], path: acc, children: isFile ? undefined : new Map() }
        node.children.set(parts[i], next)
      }
      node = next
    }
  }
  return root
}

function TreeView({ node, depth = 0, onOpenFile }: { node: TreeNode; depth?: number; onOpenFile: (path: string) => void }) {
  const [open, setOpen] = useState(depth < 1)
  const isDir = !!node.children

  if (!isDir) {
    return (
      <button
        type="button"
        onClick={() => onOpenFile(node.path)}
        className="flex items-center gap-1.5 h-6 text-[12px] w-full text-left text-text-muted hover:bg-surface-hover hover:text-text focus-visible:bg-surface-hover active:translate-y-px transition-colors"
        style={{ paddingLeft: depth * 12 + 10 }}
      >
        <File size={11} className="shrink-0 text-text-faint" />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  const children = [...(node.children?.values() ?? [])].sort((a, b) => {
    if (!!a.children !== !!b.children) return a.children ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      {depth > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 h-6 text-[12px] w-full text-left hover:bg-surface-hover focus-visible:bg-surface-hover active:translate-y-px transition-colors"
          style={{ paddingLeft: (depth - 1) * 12 + 10 }}
        >
          {open ? <ChevronDown size={11} className="shrink-0 text-text-faint" /> : <ChevronRight size={11} className="shrink-0 text-text-faint" />}
          <Folder size={11} className="shrink-0 text-text-faint" />
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {(open || depth === 0) &&
        children.map((child) => <TreeView key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} />)}
    </div>
  )
}

// spec §86 Files tab — real worktree contents (tracked + untracked-not-
// ignored, via Rung 7's git ls-files-backed endpoint), not a fake tree.
export function FilesPanel({ worktreeId, onOpenFile }: { worktreeId: string; onOpenFile: (path: string) => void }) {
  const [paths, setPaths] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPaths(null)
    api
      .listFiles(worktreeId)
      .then(setPaths)
      .catch((e) => setError(String(e.message ?? e)))
  }, [worktreeId])

  const tree = useMemo(() => (paths ? buildTree(paths) : null), [paths])

  if (error) return <p className="p-3 text-[12px] text-error">{error}</p>
  if (!tree) return <SkeletonRows rows={8} className="p-2" />
  if (paths?.length === 0) return <p className="p-3 text-[12px] text-text-faint">No files.</p>

  return (
    <div className="py-1">
      <TreeView node={tree} onOpenFile={onOpenFile} />
    </div>
  )
}
