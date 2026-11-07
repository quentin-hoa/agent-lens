import type { Icon } from '@phosphor-icons/react'
import {
  Brain,
  ChatCenteredText,
  CheckCircle,
  CircleNotch,
  FileText,
  FolderOpen,
  Globe,
  ListMagnifyingGlass,
  MagnifyingGlass,
  MinusCircle,
  NotePencil,
  PauseCircle,
  PencilSimpleLine,
  Plugs,
  SealCheck,
  TerminalWindow,
  Toolbox,
  TreeStructure,
  Wrench,
  XCircle,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import type { Status } from './types'

export type ToolCat = 'web' | 'file' | 'shell' | 'output' | 'mcp' | 'meta' | 'agent'

const TOOLS: Record<string, { icon: Icon; cat: ToolCat; label?: string }> = {
  WebSearch: { icon: MagnifyingGlass, cat: 'web', label: 'Recherche web' },
  WebFetch: { icon: Globe, cat: 'web', label: 'Lecture de page' },
  Read: { icon: FileText, cat: 'file', label: 'Lecture de fichier' },
  Write: { icon: PencilSimpleLine, cat: 'file', label: 'Écriture' },
  Edit: { icon: PencilSimpleLine, cat: 'file', label: 'Modification' },
  NotebookEdit: { icon: PencilSimpleLine, cat: 'file' },
  Bash: { icon: TerminalWindow, cat: 'shell', label: 'Commande' },
  Grep: { icon: ListMagnifyingGlass, cat: 'file', label: 'Grep' },
  Glob: { icon: FolderOpen, cat: 'file', label: 'Glob' },
  ToolSearch: { icon: Toolbox, cat: 'meta', label: 'Chargement d’outils' },
  StructuredOutput: { icon: SealCheck, cat: 'output', label: 'Résultat rendu' },
  Agent: { icon: TreeStructure, cat: 'agent', label: 'Sous-agent' },
  Task: { icon: TreeStructure, cat: 'agent', label: 'Sous-agent' },
  TodoWrite: { icon: NotePencil, cat: 'meta' },
}

export function toolMeta(name: string | null | undefined) {
  if (!name) return { icon: Wrench, cat: 'meta' as ToolCat, label: '?' }
  const t = TOOLS[name]
  if (t) return { icon: t.icon, cat: t.cat, label: t.label || name }
  if (name.startsWith('mcp__')) return { icon: Plugs, cat: 'mcp' as ToolCat, label: name.split('__').slice(1).join(' · ') }
  return { icon: Wrench, cat: 'meta' as ToolCat, label: name }
}

export const toolLabel = (name: string | null | undefined) =>
  name && name.startsWith('mcp__') ? name.split('__').slice(1).join(' · ') : name || '?'

// teinte de la tuile d'icône selon la famille d'outil
export const CAT_STYLE: Record<ToolCat, string> = {
  web: 'text-[#7fa3ec] bg-[#7fa3ec]/12 ring-[#7fa3ec]/20',
  file: 'text-[#d6b25e] bg-[#d6b25e]/12 ring-[#d6b25e]/20',
  shell: 'text-fg-2 bg-surface-3/70 ring-line-strong',
  output: 'text-ok bg-ok/12 ring-ok/25',
  mcp: 'text-[#c08bd6] bg-[#c08bd6]/12 ring-[#c08bd6]/20',
  meta: 'text-fg-3 bg-surface-2 ring-line',
  agent: 'text-[#57b9a4] bg-[#57b9a4]/12 ring-[#57b9a4]/20',
}

export function ToolTile({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const m = toolMeta(name)
  const I = m.icon
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
        size === 'sm' ? 'size-6' : 'size-7',
        CAT_STYLE[m.cat],
      )}
    >
      <I size={size === 'sm' ? 13 : 15} weight="bold" />
    </span>
  )
}

export const EVENT_ICONS = { thinking: Brain, text: ChatCenteredText, prompt: NotePencil }

export function StatusIcon({ status, size = 16, className }: { status: Status | string | undefined; size?: number; className?: string }) {
  switch (status) {
    case 'running':
      return <CircleNotch size={size} weight="bold" className={clsx('shrink-0 animate-spin text-accent', className)} aria-label="en cours" />
    case 'done':
      return <CheckCircle size={size} weight="fill" className={clsx('shrink-0 text-ok', className)} aria-label="fini" />
    case 'error':
      return <XCircle size={size} weight="fill" className={clsx('shrink-0 text-bad', className)} aria-label="erreur" />
    case 'stale':
      return <PauseCircle size={size} weight="fill" className={clsx('shrink-0 text-warn', className)} aria-label="inactif" />
    case 'skipped':
      return <MinusCircle size={size} weight="fill" className={clsx('shrink-0 text-fg-3', className)} aria-label="sauté" />
    default:
      return <MinusCircle size={size} className={clsx('shrink-0 text-fg-3', className)} />
  }
}

export const STATUS_LABEL: Record<string, string> = {
  running: 'En cours',
  done: 'Fini',
  error: 'Erreur',
  stale: 'Inactif',
  skipped: 'Sauté',
  stalled: "À l'arrêt",
}
