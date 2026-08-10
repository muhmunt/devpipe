import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
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

function TreeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1)
  const isDir = !!node.children

  if (!isDir) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-sm font-mono text-text-muted" style={{ paddingLeft: depth * 14 }}>
        <File size={12} className="shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
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
          className="flex items-center gap-1 py-0.5 text-sm font-mono w-full text-left hover:text-text"
          style={{ paddingLeft: (depth - 1) * 14 }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Folder size={12} />
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {(open || depth === 0) && children.map((child) => <TreeView key={child.path} node={child} depth={depth + 1} />)}
    </div>
  )
}

// spec §86 Files tab — real worktree contents (tracked + untracked-not-
// ignored, via Rung 7's git ls-files-backed endpoint), not a fake tree.
export function FilesPanel({ worktreeId }: { worktreeId: string }) {
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

  if (error) return <p className="text-sm text-error p-4">{error}</p>
  if (!tree) return <p className="text-sm text-text-muted p-4">Loading files...</p>
  if (paths?.length === 0) return <p className="text-sm text-text-muted p-4">No files.</p>

  return (
    <div className="border border-border rounded-lg p-3 max-h-[500px] overflow-y-auto">
      <TreeView node={tree} />
    </div>
  )
}
