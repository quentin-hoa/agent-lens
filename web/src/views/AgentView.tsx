import {
  ArrowRight,
  ArrowsInSimple,
  ArrowsOutSimple,
  Brain,
  CaretDown,
  CaretRight,
  ChatCenteredText,
  CheckCircle,
  CircleNotch,
  Database,
  DownloadSimple,
  Gear,
  Lightning,
  MagnifyingGlass,
  NotePencil,
  Pulse,
  Robot,
  SealCheck,
  Wrench,
  X,
  XCircle,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bars } from '../components/Bars'
import { CodeBlock } from '../components/CodeBlock'
import { JsonView } from '../components/JsonView'
import { Markdown } from '../components/Markdown'
import { Button, CopyButton, EmptyState, LiveDuration, Panel, Pill, SectionTitle, Skeleton, Toggle, download } from '../components/ui'
import { api, imgUrl } from '../lib/api'
import { fmtDur, fmtMs, fmtNum, fmtTime, relT } from '../lib/format'
import { phaseColor, useCurAgentData, useCurState, useCurUI, useStore, type Kinds } from '../lib/store'
import { STATUS_LABEL, StatusIcon, ToolTile, toolMeta } from '../lib/tools'
import type { AgentData, AgentTab, Ev, EvHook, EvResult, EvTool } from '../lib/types'

const TABS: { id: AgentTab; label: string; icon: Icon }[] = [
  { id: 'fil', label: 'Fil', icon: Pulse },
  { id: 'prompt', label: 'Prompt', icon: NotePencil },
  { id: 'outils', label: 'Outils', icon: Wrench },
  { id: 'resultat', label: 'Résultat', icon: SealCheck },
  { id: 'systeme', label: 'Système', icon: Gear },
  { id: 'brut', label: 'Brut', icon: Database },
]

type Inp = Record<string, unknown>
const asInp = (v: unknown): Inp => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Inp) : {})
const str = (v: unknown) => (v == null ? '' : String(v))

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{label}</div>
      {children}
    </div>
  )
}

function Quote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg">{children}</p>
}

function ToolBody({ ev, result, hooks, wf, agentId }: { ev: EvTool; result?: EvResult; hooks?: EvHook[]; wf: string; agentId: string }) {
  const inp = asInp(ev.input)
  const [full, setFull] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  let input: ReactNode
  switch (ev.name) {
    case 'Bash':
      input = (
        <>
          <CodeBlock label="Commande" text={str(inp.command)} maxH={320} />
          {inp.description ? <p className="text-[13px] text-fg-3">{str(inp.description)}</p> : null}
        </>
      )
      break
    case 'WebFetch':
      input = (
        <>
          <Field label="Page">
            <a href={str(inp.url)} target="_blank" rel="noopener noreferrer" className="text-[13.5px] break-all text-accent hover:underline">
              {str(inp.url)}
            </a>
          </Field>
          <Field label="Question posée sur la page">
            <Quote>{str(inp.prompt)}</Quote>
          </Field>
        </>
      )
      break
    case 'WebSearch':
      input = (
        <Field label="Recherche">
          <div className="flex flex-wrap items-center gap-2">
            <Quote>{str(inp.query)}</Quote>
            {inp.mode ? <Pill>mode {str(inp.mode)}</Pill> : null}
          </div>
        </Field>
      )
      break
    case 'Read':
      input = (
        <Field label="Fichier lu">
          <code className="font-mono text-[12.5px] break-all text-fg">{str(inp.file_path)}</code>
          {inp.offset || inp.limit ? (
            <span className="ml-2 text-[12.5px] text-fg-3">
              à partir de la ligne {str(inp.offset || 1)}
              {inp.limit ? `, ${str(inp.limit)} lignes` : ''}
            </span>
          ) : null}
        </Field>
      )
      break
    case 'Write':
      input = (
        <>
          <Field label="Fichier écrit">
            <code className="font-mono text-[12.5px] break-all text-fg">{str(inp.file_path)}</code>
          </Field>
          <CodeBlock label="Contenu" text={str(inp.content)} maxH={360} />
        </>
      )
      break
    case 'Edit':
      input = (
        <>
          <Field label="Fichier modifié">
            <code className="font-mono text-[12.5px] break-all text-fg">{str(inp.file_path)}</code>
          </Field>
          <div className="grid gap-3 lg:grid-cols-2">
            <CodeBlock label="Avant" text={str(inp.old_string)} maxH={300} />
            <CodeBlock label="Après" text={str(inp.new_string)} maxH={300} />
          </div>
        </>
      )
      break
    case 'StructuredOutput':
      input = (
        <Field label="Résultat rendu au chef d’orchestre">
          <JsonView value={ev.input} />
        </Field>
      )
      break
    default:
      input = (
        <Field label="Entrée">
          <JsonView value={ev.input} />
        </Field>
      )
  }
  const loadFull = async () => {
    setLoading(true)
    try {
      const r = await api<{ text: string | null }>('/api/full', { wf, id: agentId, tu: ev.id })
      if (r.text != null) setFull(r.text)
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="space-y-4">
      {input}
      {hooks?.length ? (
        <div className="space-y-1.5">
          {hooks.map((hk) => (
            <div key={hk.i} className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[12.5px]">
              <Lightning size={14} weight="fill" className="mt-0.5 shrink-0 text-warn" />
              <span className="shrink-0 text-fg-3">{hk.name}</span>
              <span className="min-w-0 font-mono break-all text-fg-2">{hk.text}</span>
            </div>
          ))}
        </div>
      ) : null}
      {!result ? (
        <div className="flex items-center gap-2 text-[13px] text-fg-3">
          <CircleNotch size={14} weight="bold" className="animate-spin text-accent" />
          En attente du résultat…
        </div>
      ) : ev.name === 'StructuredOutput' ? (
        <div className={clsx('flex items-center gap-2 text-[13px]', result.err ? 'text-bad' : 'text-ok')}>
          {result.err ? <XCircle size={15} weight="fill" /> : <CheckCircle size={15} weight="fill" />}
          {result.err ? result.text : 'Résultat accepté par le workflow'}
        </div>
      ) : (
        <>
          {result.img?.length ? (
            <div className="flex flex-wrap gap-2.5">
              {result.img.map((n) => (
                <a key={n} href={imgUrl(wf, agentId, n)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-line transition-opacity hover:opacity-90">
                  <img src={imgUrl(wf, agentId, n)} loading="lazy" alt="Image lue par l'agent" className="max-h-56 max-w-72 object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <CodeBlock
            label={result.err ? 'Erreur' : 'Résultat'}
            tone={result.err ? 'bad' : 'neutral'}
            text={full ?? result.text}
            maxH={full ? null : 420}
            actions={
              result.trunc && full == null ? (
                <button onClick={loadFull} className="h-7 rounded-md px-2 text-[12px] font-medium text-accent hover:bg-surface-2">
                  {loading ? 'Chargement…' : `Tout afficher (${fmtNum(result.trunc)} caractères)`}
                </button>
              ) : null
            }
          />
        </>
      )}
    </div>
  )
}

function ToolCard({ ev, result, hooks, open, onToggle, wf, agentId }: { ev: EvTool; result?: EvResult; hooks?: EvHook[]; open: boolean; onToggle: (id: string) => void; wf: string; agentId: string }) {
  const meta = toolMeta(ev.name)
  const so = ev.name === 'StructuredOutput'
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-xl border bg-surface transition-colors duration-150',
        so ? 'border-ok/35' : result?.err ? 'border-bad/40' : open ? 'border-line-strong' : 'border-line hover:border-line-strong',
      )}
    >
      <button onClick={() => onToggle(ev.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left" title={ev.name}>
        <span className="shrink-0 text-[13px] font-semibold text-fg">{meta.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg-2">{ev.sum}</span>
        {hooks?.length ? <Pill className="!h-5 !px-2 !text-[11px]">hook</Pill> : null}
        {result?.ms != null && <span className="font-mono text-[11.5px] text-fg-3 tabular-nums">{fmtMs(result.ms)}</span>}
        {!result ? (
          <CircleNotch size={15} weight="bold" className="shrink-0 animate-spin text-accent" />
        ) : result.err ? (
          <XCircle size={16} weight="fill" className="shrink-0 text-bad" />
        ) : (
          <CheckCircle size={16} weight="fill" className="shrink-0 text-ok/80" />
        )}
        <CaretDown size={13} weight="bold" className={clsx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line px-4 py-4">
              <ToolBody ev={ev} result={result} hooks={hooks} wf={wf} agentId={agentId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PromptCard({ chars, prompt }: { chars: number; prompt: string | null }) {
  const setAgentTab = useStore((s) => s.setAgentTab)
  return (
    <div className="rounded-2xl border border-accent/25 bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[13.5px] font-semibold text-fg">
          Prompt donné à l'agent
          <span className="ml-2 font-normal text-fg-3">{fmtNum(chars)} caractères</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAgentTab('prompt')}>
          Lire en entier
          <ArrowRight size={13} weight="bold" />
        </Button>
      </div>
      <div className="relative mt-2.5 max-h-[140px] overflow-hidden">
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{(prompt || '').slice(0, 1400)}</p>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface to-transparent" />
      </div>
    </div>
  )
}

function Node({ children, tone }: { children: ReactNode; tone?: 'accent' }) {
  return (
    <span
      className={clsx(
        'relative z-[1] flex size-7 items-center justify-center rounded-full ring-1 ring-inset',
        tone === 'accent' ? 'bg-accent/15 text-accent ring-accent/30' : 'bg-surface-2 text-fg-3 ring-line-strong',
      )}
    >
      {children}
    </span>
  )
}

const FilRow = memo(function FilRow({
  ev,
  first,
  result,
  hooks,
  open,
  onToggle,
  wf,
  agentId,
  prompt,
}: {
  ev: Ev
  first: number | null
  result?: EvResult
  hooks?: EvHook[]
  open: boolean
  onToggle: (id: string) => void
  wf: string
  agentId: string
  prompt: string | null
}) {
  const row = (node: ReactNode, content: ReactNode) => (
    <li id={`ev-${ev.i}`} className="relative grid grid-cols-[60px_52px_minmax(0,1fr)] items-start rounded-xl">
      <span className="pt-[7px] text-right font-mono text-[11.5px] text-fg-3 tabular-nums" title={fmtTime(ev.t)}>
        {relT(first, ev.t)}
      </span>
      <span className="flex justify-center">{node}</span>
      <div className="min-w-0 pb-3">{content}</div>
    </li>
  )
  switch (ev.k) {
    case 'prompt':
      return row(
        <Node tone="accent">
          <NotePencil size={14} weight="bold" />
        </Node>,
        <PromptCard chars={ev.chars} prompt={prompt} />,
      )
    case 'thinking':
      return row(
        <span className="relative z-[1] mt-[11px] size-1.5 rounded-full bg-fg-3/60 ring-4 ring-canvas" />,
        <div className="flex items-center gap-2 pt-[5px] text-[12.5px] text-fg-3">
          <Brain size={14} />
          Réflexion
          {ev.ms ? <span className="font-mono tabular-nums">{fmtMs(ev.ms)}</span> : null}
          {ev.text ? <span className="ml-1 truncate italic">{ev.text}</span> : null}
        </div>,
      )
    case 'text':
      return row(
        <Node>
          <ChatCenteredText size={14} weight="bold" />
        </Node>,
        <div className="rounded-2xl border border-line bg-surface px-5 py-4">
          <Markdown className="!text-[14.5px]">{ev.text}</Markdown>
        </div>,
      )
    case 'tool':
      return row(
        <span className="relative z-[1] rounded-lg bg-canvas py-px">
          <ToolTile name={ev.name} />
        </span>,
        <ToolCard ev={ev} result={result} hooks={hooks} open={open} onToggle={onToggle} wf={wf} agentId={agentId} />,
      )
    case 'user':
      return row(
        <span className="relative z-[1] mt-[11px] size-1.5 rounded-full bg-fg-3/60 ring-4 ring-canvas" />,
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-3">
          <div className="mb-1.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">Message transmis à l'agent</div>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">{ev.text}</p>
        </div>,
      )
    case 'sys':
      return row(
        <span className="relative z-[1] mt-[11px] size-1.5 rounded-full bg-fg-3/40 ring-4 ring-canvas" />,
        <div className="flex min-w-0 items-center gap-2 pt-[3px] text-[12px] text-fg-3" title={ev.text}>
          <Pill className="!h-5 !text-[11px]">{ev.sub}</Pill>
          <span className="truncate font-mono">{ev.text}</span>
        </div>,
      )
    default:
      return null
  }
})

function visible(ev: Ev, kinds: Kinds) {
  switch (ev.k) {
    case 'result':
    case 'hook':
      return false
    case 'prompt':
      return true
    case 'thinking':
      return kinds.thinking
    case 'text':
      return kinds.text
    case 'tool':
      return kinds.tool || ev.name === 'StructuredOutput'
    default:
      return kinds.sys
  }
}

function matches(ev: Ev, f: string, d: AgentData) {
  const has = (s: unknown) => typeof s === 'string' && s.toLowerCase().includes(f)
  switch (ev.k) {
    case 'text':
    case 'user':
    case 'sys':
    case 'thinking':
      return has(ev.text)
    case 'tool':
      return has(ev.sum) || has(ev.name) || has(JSON.stringify(ev.input)) || has(d.results[ev.id]?.text)
    case 'prompt':
      return has(d.prompt)
    default:
      return false
  }
}

function Fil({ wf, id, d }: { wf: string; id: string; d: AgentData }) {
  const kinds = useStore((s) => s.kinds)
  const toggleKind = useStore((s) => s.toggleKind)
  const follow = useStore((s) => s.follow)
  const setFollow = useStore((s) => s.setFollow)
  const focus = useStore((s) => s.focus)
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const [q, setQ] = useState('')
  const onToggle = useCallback(
    (tid: string) =>
      setToggled((prev) => {
        const n = new Set(prev)
        if (n.has(tid)) n.delete(tid)
        else n.add(tid)
        return n
      }),
    [],
  )
  const isOpen = (ev: EvTool) => (ev.name === 'StructuredOutput' ? !toggled.has(ev.id) : toggled.has(ev.id))
  const items = useMemo(() => {
    const f = q.trim().toLowerCase()
    return d.events.filter((ev) => visible(ev, kinds) && (!f || matches(ev, f, d)))
  }, [d, kinds, q])

  const setAll = useCallback(
    (open: boolean) => {
      const tools = d.events.filter((e): e is EvTool => e.k === 'tool')
      setToggled(new Set(tools.filter((t) => (t.name === 'StructuredOutput' ? !open : open)).map((t) => t.id)))
    },
    [d.events],
  )

  useEffect(() => {
    const h = (e: Event) => setAll((e as CustomEvent<boolean>).detail)
    window.addEventListener('agents:expand', h)
    return () => window.removeEventListener('agents:expand', h)
  }, [setAll])

  useEffect(() => {
    if (!follow || d.status !== 'running') return
    const el = document.getElementById('main-scroll')
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 360) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [items.length, follow, d.status])

  useEffect(() => {
    if (!focus || focus.agent !== id) return
    const ev = d.events[focus.i]
    if (!ev) return
    const tid = ev.k === 'tool' || ev.k === 'result' || ev.k === 'hook' ? ev.id : null
    const target = tid && d.tools[tid] ? d.tools[tid].i : focus.i
    if (tid && d.tools[tid] && d.tools[tid].name !== 'StructuredOutput')
      setToggled((prev) => {
        const n = new Set(prev)
        n.add(tid)
        return n
      })
    useStore.setState({ focus: null })
    setTimeout(() => {
      const el = document.getElementById(`ev-${target}`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.remove('flash')
      void el.offsetWidth
      el.classList.add('flash')
    }, 120)
  }, [focus, d.events.length, d, id])

  const first = d.header?.first ?? null
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Toggle on={kinds.text} onClick={() => toggleKind('text')}>
          <ChatCenteredText size={14} />
          Messages
        </Toggle>
        <Toggle on={kinds.tool} onClick={() => toggleKind('tool')}>
          <Wrench size={14} />
          Outils
        </Toggle>
        <Toggle on={kinds.thinking} onClick={() => toggleKind('thinking')}>
          <Brain size={14} />
          Réflexion
        </Toggle>
        <Toggle on={kinds.sys} onClick={() => toggleKind('sys')}>
          <Gear size={14} />
          Système
        </Toggle>
        <label className="relative ml-1 block">
          <MagnifyingGlass size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer le fil"
            className="h-7 w-52 rounded-lg border border-line bg-surface pr-2 pl-8 text-[12.5px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none"
          />
        </label>
        <span className="flex-1" />
        <Toggle on={follow} onClick={() => setFollow(!follow)} title="Descendre tout seul quand l'agent avance (touche A)">
          <ArrowRight size={14} className="rotate-90" />
          Suivre
        </Toggle>
        <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
          <ArrowsOutSimple size={14} />
          Tout ouvrir
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
          <ArrowsInSimple size={14} />
          Tout fermer
        </Button>
      </div>
      <ol className="relative">
        <span className="absolute top-3 bottom-3 left-[85.5px] w-px bg-line" aria-hidden />
        {items.map((ev) => (
          <FilRow
            key={ev.i}
            ev={ev}
            first={first}
            result={ev.k === 'tool' ? d.results[ev.id] : undefined}
            hooks={ev.k === 'tool' ? d.hooks[ev.id] : undefined}
            open={ev.k === 'tool' ? isOpen(ev) : false}
            onToggle={onToggle}
            wf={wf}
            agentId={id}
            prompt={ev.k === 'prompt' ? d.prompt : null}
          />
        ))}
      </ol>
      {!items.length && <EmptyState icon={<Pulse size={22} />} title="Rien à afficher">Aucun événement ne correspond à ces filtres.</EmptyState>}
      {d.status === 'running' && (
        <div className="flex items-center gap-2.5 pt-2 pl-[73px] text-[13px] text-fg-3">
          <CircleNotch size={15} weight="bold" className="animate-spin text-accent" />
          L'agent travaille…
        </div>
      )}
    </div>
  )
}

function PromptTab({ d }: { d: AgentData }) {
  const [raw, setRaw] = useState(false)
  return (
    <div className="space-y-5">
      <Panel pad={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="text-[12.5px] text-fg-3">{fmtNum((d.prompt || '').length)} caractères</span>
          <div className="flex items-center gap-2">
            <Toggle on={raw} onClick={() => setRaw(!raw)}>
              Texte brut
            </Toggle>
            <CopyButton text={d.prompt} label="Copier" />
          </div>
        </div>
        <div className="px-8 py-7">
          {!d.prompt ? (
            <EmptyState icon={<NotePencil size={22} />} title="Pas de prompt trouvé" />
          ) : raw ? (
            <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-code">{d.prompt}</pre>
          ) : (
            <Markdown className="max-w-[82ch]">{d.prompt}</Markdown>
          )}
        </div>
      </Panel>
      {d.request && (
        <Panel pad={false}>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[13px] font-medium text-fg-2 hover:text-fg">
              <CaretRight size={12} weight="bold" className="transition-transform group-open:rotate-90" />
              Demande de l'utilisateur, relayée telle quelle à l'agent
            </summary>
            <div className="border-t border-line px-8 py-6">
              <p className="max-w-[90ch] text-[14px] leading-relaxed whitespace-pre-wrap text-fg-2">{d.request}</p>
            </div>
          </details>
        </Panel>
      )}
    </div>
  )
}

function OutilsTab({ d, id }: { d: AgentData; id: string }) {
  const openAgent = useStore((s) => s.openAgent)
  const tools = d.events.filter((e): e is EvTool => e.k === 'tool')
  const by: Record<string, number> = {}
  tools.forEach((t) => (by[t.name] = (by[t.name] || 0) + 1))
  const inp = (e: EvTool) => asInp(e.input)
  const known = ['WebSearch', 'WebFetch', 'Read', 'Bash', 'Grep', 'Glob', 'Write', 'Edit']
  const groups: { title: string; tool: string; rows: EvTool[]; main: (e: EvTool) => ReactNode; sub?: (e: EvTool) => ReactNode }[] = [
    { title: 'Recherches web', tool: 'WebSearch', rows: tools.filter((e) => e.name === 'WebSearch'), main: (e) => str(inp(e).query) },
    { title: 'Pages lues', tool: 'WebFetch', rows: tools.filter((e) => e.name === 'WebFetch'), main: (e) => str(inp(e).url), sub: (e) => str(inp(e).prompt) },
    { title: 'Fichiers lus', tool: 'Read', rows: tools.filter((e) => e.name === 'Read'), main: (e) => str(inp(e).file_path) },
    { title: 'Commandes', tool: 'Bash', rows: tools.filter((e) => e.name === 'Bash'), main: (e) => str(inp(e).description) || str(inp(e).command), sub: (e) => (inp(e).description ? str(inp(e).command) : '') },
    { title: 'Grep et Glob', tool: 'Grep', rows: tools.filter((e) => e.name === 'Grep' || e.name === 'Glob'), main: (e) => e.sum },
    { title: 'Fichiers écrits', tool: 'Write', rows: tools.filter((e) => e.name === 'Write' || e.name === 'Edit'), main: (e) => str(inp(e).file_path), sub: (e) => e.name },
    { title: 'Outils MCP', tool: 'mcp__x', rows: tools.filter((e) => e.name.startsWith('mcp__')), main: (e) => toolMeta(e.name).label, sub: (e) => JSON.stringify(e.input) },
    { title: 'Autres', tool: 'ToolSearch', rows: tools.filter((e) => !known.includes(e.name) && !e.name.startsWith('mcp__')), main: (e) => toolMeta(e.name).label, sub: (e) => e.sum },
  ]
  if (!tools.length) return <EmptyState icon={<Wrench size={22} />} title="Aucun outil utilisé pour l'instant" />
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel className="h-fit lg:sticky lg:top-20">
        <SectionTitle>Appels par outil</SectionTitle>
        <Bars items={Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, c]) => ({ key: n, value: c, label: toolMeta(n).label }))} />
      </Panel>
      <div className="space-y-5">
        {groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <Panel key={g.title} pad={false}>
              <div className="flex items-center gap-2.5 px-5 py-3.5">
                <ToolTile name={g.tool} size="sm" />
                <h3 className="text-[13.5px] font-semibold text-fg">{g.title}</h3>
                <span className="font-mono text-[12px] text-fg-3">{g.rows.length}</span>
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {g.rows.map((e) => {
                  const r = d.results[e.id]
                  return (
                    <li key={e.i}>
                      <button
                        onClick={() => openAgent(id, { focus: e.i })}
                        className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2/50"
                      >
                        <span className="pt-0.5">
                          {!r ? <CircleNotch size={14} className="animate-spin text-accent" /> : r.err ? <XCircle size={15} weight="fill" className="text-bad" /> : <CheckCircle size={15} weight="fill" className="text-ok/80" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-fg">{g.main(e)}</span>
                          {g.sub && g.sub(e) ? <span className="mt-0.5 block truncate text-[12px] text-fg-3">{g.sub(e)}</span> : null}
                        </span>
                        <span className="pt-0.5 font-mono text-[11.5px] text-fg-3 tabular-nums">{r?.ms != null ? fmtMs(r.ms) : ''}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
      </div>
    </div>
  )
}

function ResultTab({ d }: { d: AgentData }) {
  const fname = (d.label || 'agent').replace(/[^\w.-]+/g, '_')
  if (d.result != null)
    return (
      <Panel pad={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="text-[12.5px] text-fg-3">Valeur rendue au workflow</span>
          <div className="flex items-center gap-1">
            <CopyButton text={JSON.stringify(d.result, null, 2)} label="Copier le JSON" />
            <Button size="sm" variant="ghost" onClick={() => download(`${fname}-resultat.json`, JSON.stringify(d.result, null, 2), 'application/json')}>
              <DownloadSimple size={14} />
              Télécharger
            </Button>
          </div>
        </div>
        <div className="px-6 py-5">
          <JsonView value={d.result} />
        </div>
      </Panel>
    )
  if (d.resultText)
    return (
      <Panel pad={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="text-[12.5px] text-fg-3">{fmtNum(d.resultText.length)} caractères</span>
          <div className="flex items-center gap-1">
            <CopyButton text={d.resultText} label="Copier" />
            <Button size="sm" variant="ghost" onClick={() => download(`${fname}-resultat.md`, d.resultText || '')}>
              <DownloadSimple size={14} />
              Télécharger
            </Button>
          </div>
        </div>
        <div className="px-8 py-7">
          <Markdown className="max-w-[86ch]">{d.resultText}</Markdown>
        </div>
      </Panel>
    )
  return (
    <EmptyState icon={<SealCheck size={22} />} title={d.status === 'running' ? 'Pas encore de résultat' : 'Aucun résultat trouvé'}>
      {d.status === 'running' ? "L'agent travaille. Sa réponse apparaîtra ici dès qu'il l'aura rendue." : null}
    </EmptyState>
  )
}

interface SystemData {
  system: string[] | null
  tools: { name: string; description: string }[] | null
  context: { role: string; text: string }[] | null
  error?: string
}

function SystemTab({ wf, id }: { wf: string; id: string }) {
  const [data, setData] = useState<SystemData | null>(null)
  useEffect(() => {
    let alive = true
    setData(null)
    api<SystemData>('/api/system', { wf, id }).then((r) => alive && setData(r))
    return () => {
      alive = false
    }
  }, [wf, id])
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  const Acc = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/50">{title}</summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  )
  return (
    <div className="space-y-6">
      <Panel>
        <SectionTitle>Prompt système</SectionTitle>
        <div className="space-y-3">
          {(data.system || []).map((s, i) => (
            <CodeBlock key={i} label={`Bloc ${i + 1}`} text={s} maxH={380} />
          ))}
          {!data.system?.length && <p className="text-[13px] text-fg-3">Non trouvé.</p>}
        </div>
      </Panel>
      <Panel pad={false}>
        <div className="px-5 pt-4.5 pb-3.5">
          <h2 className="text-[13px] font-semibold text-fg">
            Outils fournis à l'agent <span className="ml-1 font-mono font-normal text-fg-3">{data.tools?.length || 0}</span>
          </h2>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {(data.tools || []).map((t) => (
            <li key={t.name}>
              <Acc
                title={
                  <>
                    <ToolTile name={t.name} size="sm" />
                    <span className="text-[13px] font-medium text-fg">{t.name}</span>
                    <CaretRight size={12} weight="bold" className="ml-auto text-fg-3 transition-transform group-open:rotate-90" />
                  </>
                }
              >
                <pre className="max-h-80 overflow-auto rounded-xl border border-line bg-surface-2/70 p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-code">{t.description}</pre>
              </Acc>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel pad={false}>
        <div className="px-5 pt-4.5 pb-3.5">
          <h2 className="text-[13px] font-semibold text-fg">Contexte injecté (CLAUDE.md, rappels)</h2>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {(data.context || []).map((c, i) => (
            <li key={i}>
              <Acc
                title={
                  <>
                    <Pill>{c.role}</Pill>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">{c.text.slice(0, 140).replace(/\s+/g, ' ')}</span>
                    <span className="font-mono text-[11.5px] text-fg-3">{fmtNum(c.text.length)}</span>
                    <CaretRight size={12} weight="bold" className="text-fg-3 transition-transform group-open:rotate-90" />
                  </>
                }
              >
                <pre className="max-h-96 overflow-auto rounded-xl border border-line bg-surface-2/70 p-3.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-code">{c.text}</pre>
              </Acc>
            </li>
          ))}
          {!data.context?.length && <li className="px-5 py-4 text-[13px] text-fg-3">Aucun.</li>}
        </ul>
      </Panel>
    </div>
  )
}

function exportMd(d: AgentData) {
  const h = d.header
  const fence = '```'
  const L = [
    `# ${d.label} (${d.phase})`,
    '',
    `- Statut : ${STATUS_LABEL[d.status] || d.status}`,
    `- Modèle : ${h?.model} · effort ${h?.effort}`,
    `- Début : ${fmtTime(h?.first)} · durée ${fmtDur((h?.last || 0) - (h?.first || 0))}`,
    `- Appels d'outils : ${h?.tools} · erreurs ${h?.errors}`,
    '',
    '## Prompt',
    '',
    d.prompt || '',
    '',
    '## Fil',
    '',
  ]
  for (const e of d.events) {
    if (e.k === 'text') L.push(e.text, '')
    else if (e.k === 'tool') {
      L.push(`### ${e.name} — ${e.sum || ''}`, '', fence + 'json', JSON.stringify(e.input, null, 2), fence, '')
      const r = d.results[e.id]
      if (r) L.push(r.err ? '**Erreur :**' : '**Résultat :**', '', fence, (r.text || '').slice(0, 6000), fence, '')
    }
  }
  if (d.result != null) L.push('## Résultat', '', fence + 'json', JSON.stringify(d.result, null, 2), fence)
  else if (d.resultText) L.push('## Résultat', '', d.resultText)
  download(`${(d.label || 'agent').replace(/[^\w.-]+/g, '_')}.md`, L.join('\n'))
}

function OpenAgents() {
  const ui = useCurUI()
  const st = useCurState()
  const bySrc = useStore((s) => (s.cur ? s.agents[s.cur] : undefined))
  const { openAgent, closeAgentTab } = useStore.getState()
  if (!ui || ui.tabs.length < 2) return null
  return (
    <div className="border-b border-line bg-panel/70">
      <div className="no-scrollbar mx-auto flex max-w-[1240px] items-center gap-1 overflow-x-auto px-8 py-2">
        <span className="mr-2 shrink-0 text-[12px] text-fg-3">Agents ouverts</span>
        {ui.tabs.map((tid) => {
          const a = st?.agents.find((x) => x.id === tid)
          const active = ui.agent === tid
          return (
            <div
              key={tid}
              onClick={() => openAgent(tid)}
              className={clsx(
                'group flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-lg pr-1 pl-2.5 text-[12.5px] font-medium transition-colors',
                active ? 'bg-surface-2 text-fg ring-1 ring-line-strong' : 'text-fg-3 hover:bg-surface-2/60 hover:text-fg',
              )}
            >
              <StatusIcon status={a?.status} size={13} />
              <span className="max-w-[220px] truncate">{a?.label || bySrc?.[tid]?.label || tid}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeAgentTab(tid)
                }}
                aria-label="Fermer"
                className="flex size-5 items-center justify-center rounded-md opacity-50 hover:bg-surface-3 hover:opacity-100"
              >
                <X size={10} weight="bold" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AgentView() {
  const cur = useStore((s) => s.cur)
  const ui = useCurUI()
  const id = ui?.agent || null
  const d = useCurAgentData()
  const st = useCurState()
  const tab = useStore((s) => s.agentTab)
  const setAgentTab = useStore((s) => s.setAgentTab)
  const setView = useStore((s) => s.setView)
  if (!cur || !id) return <EmptyState icon={<Robot size={22} />} title="Aucun agent ouvert">Choisis un agent dans la liste à gauche.</EmptyState>
  if (!d)
    return (
      <div className="mx-auto max-w-[1240px] space-y-5 px-8 py-8">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    )
  const h = d.header
  const tok = h?.tokens || {}
  const color = phaseColor(st?.phases, d.phase)
  const counts: Partial<Record<AgentTab, number>> = { outils: h?.tools, fil: d.events.filter((e) => e.k !== 'result' && e.k !== 'hook' && e.k !== 'sys').length }
  const metrics: [string, ReactNode][] = [
    ['Durée', d.status === 'running' ? <LiveDuration start={h?.first} /> : fmtDur((h?.last || 0) - (h?.first || 0))],
    ['Début', fmtTime(h?.first)],
    ["Appels d'outils", h?.tools ?? 0],
    ['Erreurs', h?.errors ? <span className="text-bad">{h.errors}</span> : 0],
    ['Réflexion', fmtDur((h?.thinking_ms || 0) / 1000)],
    ['Tokens générés', fmtNum(tok.out)],
    ['Tokens lus', fmtNum((tok.in || 0) + (tok.cache_read || 0) + (tok.cache_write || 0))],
    ['Requêtes API', h?.requests ?? 0],
  ]
  return (
    <div className="min-h-full">
      <OpenAgents />
      <div className="mx-auto max-w-[1240px] px-8 pt-7">
        <nav className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3">
          <button onClick={() => setView('overview')} className="truncate transition-colors hover:text-fg">
            {st?.name || 'Source'}
          </button>
          <CaretRight size={11} weight="bold" className="shrink-0" />
          <span className="shrink-0">{d.phase}</span>
          <CaretRight size={11} weight="bold" className="shrink-0" />
          <span className="truncate text-fg-2">{d.label}</span>
        </nav>
        <header className="mt-4 flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <StatusIcon status={d.status} size={26} />
              <h1 className="truncate text-[25px] leading-tight font-semibold tracking-[-0.02em] text-fg">{d.label}</h1>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
                <span className="size-1.5 rounded-full" style={{ background: color }} />
                {d.phase}
              </span>
              <Pill>{STATUS_LABEL[d.status] || d.status}</Pill>
              {h?.model && <Pill>{h.model}</Pill>}
              {h?.effort && <Pill>effort {h.effort}</Pill>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton text={d.prompt} label="Copier le prompt" className="!h-8.5 border border-line-strong !px-3 !text-[13px] !text-fg" />
            <Button onClick={() => exportMd(d)}>
              <DownloadSimple size={15} />
              Exporter en Markdown
            </Button>
          </div>
        </header>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4 2xl:grid-cols-8">
          {metrics.map(([l, v]) => (
            <div key={l} className="bg-surface px-4 py-3.5">
              <div className="truncate text-[12px] text-fg-3">{l}</div>
              <div className="mt-1 text-[17px] font-semibold tracking-[-0.01em] whitespace-nowrap text-fg tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="sticky top-0 z-20 mt-6 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center gap-0.5 overflow-x-auto px-8">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setAgentTab(t.id)}
                className={clsx('relative flex h-11 shrink-0 items-center gap-2 px-3 text-[13px] font-medium transition-colors', active ? 'text-fg' : 'text-fg-3 hover:text-fg')}
              >
                <t.icon size={15} weight={active ? 'fill' : 'regular'} />
                {t.label}
                {counts[t.id] != null && <span className="font-mono text-[11px] text-fg-3 tabular-nums">{counts[t.id]}</span>}
                {active && <motion.span layoutId="agent-tab" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mx-auto max-w-[1240px] px-8 pt-7 pb-28">
        {tab === 'fil' && <Fil wf={cur} id={id} d={d} />}
        {tab === 'prompt' && <PromptTab d={d} />}
        {tab === 'outils' && <OutilsTab d={d} id={id} />}
        {tab === 'resultat' && <ResultTab d={d} />}
        {tab === 'systeme' && <SystemTab wf={cur} id={id} />}
        {tab === 'brut' && (
          <Panel pad={false}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
              <span className="text-[12.5px] text-fg-3">{d.events.length} événements, les 200 derniers ci-dessous</span>
              <Button size="sm" variant="ghost" onClick={() => download(`${(d.label || 'agent').replace(/[^\w.-]+/g, '_')}-evenements.json`, JSON.stringify(d.events, null, 1), 'application/json')}>
                <DownloadSimple size={14} />
                Tout télécharger
              </Button>
            </div>
            <pre className="max-h-[75vh] overflow-auto px-5 py-4 font-mono text-[12px] leading-relaxed text-code">{JSON.stringify(d.events.slice(-200), null, 1)}</pre>
          </Panel>
        )}
      </div>
    </div>
  )
}
