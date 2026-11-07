import {
  Bell,
  BellSlash,
  CaretRight,
  ChartLineUp,
  CircleNotch,
  Code,
  FlowArrow,
  Globe,
  ListBullets,
  MagnifyingGlass,
  Moon,
  Question,
  SquaresFour,
  Sun,
  TreeStructure,
  X,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { expLabel, fmtDur } from '../lib/format'
import { load, phaseColor, save, srcName, useCurState, useCurUI, useStore } from '../lib/store'
import { STATUS_LABEL, StatusIcon } from '../lib/tools'
import type { AgentSummary, SourceState, View } from '../lib/types'
import { IconButton, Kbd, LiveDot, LiveDuration, Pill, ProgressBar, Segmented, Skeleton } from './ui'

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--c-surface-2)" stroke="var(--c-line-strong)" />
      <circle cx="11" cy="16" r="3.2" fill="var(--c-accent)" />
      <circle cx="21.5" cy="10" r="2.3" fill="var(--c-fg)" />
      <circle cx="21.5" cy="22" r="2.3" fill="var(--c-fg)" />
      <path d="M13.7 14.6 19.4 11.1M13.7 17.4 19.4 20.9" stroke="var(--c-fg)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SourceTab({ id }: { id: string }) {
  const ref = useStore((s) => s.srcIndex[id])
  const active = useStore((s) => s.cur === id && s.view !== 'sessions' && s.view !== 'help')
  const openSource = useStore((s) => s.openSource)
  const closeSource = useStore((s) => s.closeSource)
  const I = ref?.kind === 'workflow' ? FlowArrow : TreeStructure
  return (
    <div
      onClick={() => openSource(id)}
      title={srcName(ref, id)}
      className={clsx(
        'group flex h-8 max-w-[260px] shrink-0 cursor-pointer items-center gap-2 rounded-lg pr-1 pl-2.5 text-[13px] font-medium transition-colors duration-150',
        active ? 'bg-surface-2 text-fg ring-1 ring-line-strong' : 'text-fg-2 hover:bg-surface-2/60 hover:text-fg',
      )}
    >
      {ref?.live ? <LiveDot /> : <I size={15} className="shrink-0 text-fg-3" />}
      <span className="truncate">{srcName(ref, id)}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          closeSource(id)
        }}
        aria-label="Fermer"
        className={clsx(
          'flex size-5 shrink-0 items-center justify-center rounded-md text-fg-3 transition-opacity hover:bg-surface-3 hover:text-fg',
          active ? 'opacity-70' : 'opacity-0 group-hover:opacity-70',
        )}
      >
        <X size={11} weight="bold" />
      </button>
    </div>
  )
}

export function TopBar() {
  const open = useStore((s) => s.open)
  const view = useStore((s) => s.view)
  const theme = useStore((s) => s.theme)
  const notify = useStore((s) => s.notify)
  const conn = useStore((s) => s.conn)
  const { setView, setTheme, setNotify, setPalette } = useStore.getState()
  const toggleNotify = async () => {
    if (!('Notification' in window)) return toast.warning('Notifications indisponibles dans ce navigateur')
    if (notify) {
      setNotify(false)
      return toast('Notifications coupées')
    }
    const p = await Notification.requestPermission()
    setNotify(p === 'granted')
    if (p === 'granted') toast.success('Notifications activées', { description: 'Fin de workflow, agent en erreur, arrêt.' })
    else toast.warning('Notifications refusées par le navigateur')
  }
  return (
    <header className="col-span-full flex h-[52px] items-center gap-2 border-b border-line bg-panel pr-3">
      <div className="flex w-14 shrink-0 items-center justify-center">
        <Logo />
      </div>
      <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setView('sessions')}
          className={clsx(
            'flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors',
            view === 'sessions' ? 'bg-surface-2 text-fg ring-1 ring-line-strong' : 'text-fg-2 hover:bg-surface-2/60 hover:text-fg',
          )}
        >
          <SquaresFour size={16} weight={view === 'sessions' ? 'fill' : 'regular'} />
          Sessions
        </button>
        {open.length > 0 && <span className="mx-1.5 h-5 w-px shrink-0 bg-line-strong" />}
        {open.map((id) => (
          <SourceTab key={id} id={id} />
        ))}
      </nav>
      <button
        onClick={() => setPalette(true)}
        className="hidden h-8 w-60 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2 lg:flex"
      >
        <MagnifyingGlass size={15} />
        <span className="flex-1 text-left">Aller à…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <span
        className={clsx('ml-1 flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px]', conn ? 'text-fg-3' : 'text-bad')}
        title={conn ? 'Connecté au serveur local' : 'Serveur injoignable : agents-panel est-il lancé ?'}
      >
        <span className={clsx('size-1.5 rounded-full', conn ? 'bg-ok' : 'bg-bad')} />
        <span className="hidden xl:inline">{conn ? 'Connecté' : 'Hors ligne'}</span>
      </span>
      <IconButton label={notify ? 'Couper les notifications' : 'Activer les notifications'} onClick={toggleNotify}>
        {notify ? <Bell size={18} weight="fill" /> : <BellSlash size={18} />}
      </IconButton>
      <IconButton label={theme === 'dark' ? 'Thème clair' : 'Thème sombre'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </IconButton>
    </header>
  )
}

const RAIL: { v: View; icon: typeof SquaresFour; label: string; key?: string; src?: boolean; wf?: boolean }[] = [
  { v: 'sessions', icon: SquaresFour, label: 'Sessions', key: 'G' },
  { v: 'overview', icon: ChartLineUp, label: "Vue d'ensemble", key: 'O', src: true },
  { v: 'sources', icon: Globe, label: 'Sources consultées', key: 'S', src: true },
  { v: 'search', icon: MagnifyingGlass, label: 'Rechercher partout', key: '/', src: true },
  { v: 'script', icon: Code, label: 'Script du workflow', src: true, wf: true },
  { v: 'journal', icon: ListBullets, label: 'Journal du workflow', src: true, wf: true },
]

function RailButton({ icon: I, label, k, active, disabled, onClick }: { icon: typeof SquaresFour; label: string; k?: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={clsx(
        'group relative flex size-10 items-center justify-center rounded-xl transition-colors duration-150 active:scale-[0.96]',
        active ? 'bg-surface-2 text-fg' : 'text-fg-3 hover:bg-surface-2/60 hover:text-fg',
        disabled && 'pointer-events-none opacity-25',
      )}
    >
      {active && <span className="absolute top-1/2 -left-2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
      <I size={20} weight={active ? 'fill' : 'regular'} />
      <span className="tip shadow-float absolute left-12 z-50 flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap text-fg">
        {label}
        {k && <Kbd>{k}</Kbd>}
      </span>
    </button>
  )
}

export function Rail() {
  const view = useStore((s) => s.view)
  const cur = useStore((s) => s.cur)
  const kind = useStore((s) => (s.cur ? s.srcIndex[s.cur]?.kind : undefined))
  const setView = useStore((s) => s.setView)
  return (
    <nav className="flex flex-col items-center gap-1.5 border-r border-line bg-panel py-3">
      {RAIL.map((it) => (
        <RailButton
          key={it.v}
          icon={it.icon}
          label={it.label}
          k={it.key}
          active={view === it.v || (it.v === 'overview' && view === 'agent')}
          disabled={(it.src && !cur) || (it.wf && kind !== 'workflow')}
          onClick={() => setView(it.v)}
        />
      ))}
      <div className="flex-1" />
      <RailButton icon={Question} label="Aide et raccourcis" k="?" active={view === 'help'} onClick={() => setView('help')} />
    </nav>
  )
}

export function StatusBadge({ status }: { status: SourceState['status'] }) {
  if (status === 'running')
    return (
      <Pill tone="accent">
        <CircleNotch size={12} weight="bold" className="animate-spin" />
        En cours
      </Pill>
    )
  if (status === 'done')
    return (
      <Pill tone="ok">
        <StatusIcon status="done" size={13} />
        Terminé
      </Pill>
    )
  return (
    <Pill tone="warn">
      <StatusIcon status="stale" size={13} />
      {STATUS_LABEL.stalled}
    </Pill>
  )
}

function AgentRow({ a, active }: { a: AgentSummary; active: boolean }) {
  const openAgent = useStore((s) => s.openAgent)
  return (
    <button
      onClick={() => openAgent(a.id)}
      title={a.last_action ? `${a.label}\n${a.last_action}` : a.label}
      className={clsx(
        'relative flex w-full items-center gap-2.5 rounded-lg py-[7px] pr-2.5 pl-7 text-left transition-colors duration-150',
        active ? 'bg-surface-2 text-fg' : 'text-fg-2 hover:bg-surface-2/50 hover:text-fg',
      )}
    >
      {active && <span className="absolute top-1/2 left-2.5 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
      <StatusIcon status={a.status} size={15} />
      <span className="min-w-0 flex-1 truncate text-[13px]">{a.label}</span>
      <span className="font-mono text-[11px] text-fg-3 tabular-nums">
        {a.status === 'running' ? <LiveDuration start={a.first} /> : fmtDur(a.dur)}
      </span>
    </button>
  )
}

type Filter = 'all' | 'running' | 'done' | 'problem'

export function Sidebar() {
  const st = useCurState()
  const ui = useCurUI()
  const view = useStore((s) => s.view)
  const [q, setQ] = useState('')
  const [f, setF] = useState<Filter>('all')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => load('collapsed', {}))
  if (!st)
    return (
      <aside className="space-y-3 border-r border-line bg-panel p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-2 w-full" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </aside>
    )
  // une erreur d'outil isolée (page 404…) est normale : « Alertes » = agent en erreur ou bloqué
  const problem = (a: AgentSummary) => a.status === 'error' || a.status === 'stale'
  const match = (a: AgentSummary) =>
    (!q || a.label.toLowerCase().includes(q.toLowerCase())) && (f === 'all' || (f === 'problem' ? problem(a) : a.status === f))
  const total = st.expected_total ? st.expected_total[0] : st.totals.agents
  const toggle = (t: string) => {
    const n = { ...collapsed, [t]: !collapsed[t] }
    setCollapsed(n)
    save('collapsed', n)
  }
  const KindIcon = st.kind === 'workflow' ? FlowArrow : TreeStructure
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line px-4 pt-4 pb-4">
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">
          <KindIcon size={13} weight="bold" />
          {st.kind === 'workflow' ? 'Workflow' : 'Agents de session'}
        </div>
        <h2 className="mt-1.5 line-clamp-2 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-fg">{st.name}</h2>
        {st.cwd && <p className="mt-1 truncate font-mono text-[11.5px] text-fg-3">{st.cwd}</p>}
        <div className="mt-3.5 flex items-center justify-between">
          <StatusBadge status={st.status} />
          <span className="font-mono text-[12px] text-fg-2">
            <LiveDuration start={st.started} end={st.status === 'done' ? st.last_activity : null} />
          </span>
        </div>
        <ProgressBar value={st.totals.done} max={total} running={st.totals.running} className="mt-3" />
        <div className="mt-1.5 flex justify-between text-[11.5px] text-fg-3">
          <span>
            {st.totals.done} finis sur {st.expected_total ? expLabel(st.expected_total) : st.totals.agents}
          </span>
          {st.totals.running > 0 && <span>{st.totals.running} en cours</span>}
        </div>
      </div>
      <div className="space-y-2.5 px-3 pt-3 pb-2">
        <label className="relative block">
          <MagnifyingGlass size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer les agents"
            className="h-8 w-full rounded-lg border border-line bg-surface pr-2 pl-8 text-[13px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none"
          />
        </label>
        <Segmented<Filter>
          size="sm"
          full
          value={f}
          onChange={setF}
          items={[
            { value: 'all', label: 'Tous', count: st.agents.length },
            { value: 'running', label: 'En cours', count: st.totals.running },
            { value: 'done', label: 'Finis', count: st.totals.done },
            { value: 'problem', label: 'Alertes', count: st.agents.filter(problem).length },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-8">
        {st.phases.map((p) => {
          const list = st.agents.filter((a) => a.phase === p.title && match(a))
          if (!list.length && (q || f !== 'all')) return null
          const color = phaseColor(st.phases, p.title)
          const isCollapsed = collapsed[p.title]
          return (
            <div key={p.title} className="mb-1.5">
              <button onClick={() => toggle(p.title)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2/50" title={p.detail}>
                <CaretRight size={10} weight="bold" className={clsx('text-fg-3 transition-transform duration-150', !isCollapsed && 'rotate-90')} />
                <span className="size-2 rounded-full" style={{ background: color }} />
                <span className="text-[12.5px] font-semibold text-fg">{p.title}</span>
                {p.running > 0 && <CircleNotch size={12} weight="bold" className="animate-spin text-accent" />}
                <span className="ml-auto font-mono text-[11.5px] text-fg-3 tabular-nums">
                  {p.done}/{p.expected ? expLabel(p.expected) : p.started}
                </span>
              </button>
              {!isCollapsed && (
                <div className="mt-0.5 space-y-px">
                  {list.length ? list.map((a) => <AgentRow key={a.id} a={a} active={view === 'agent' && ui?.agent === a.id} />) : <p className="py-1 pl-9 text-[12.5px] text-fg-3">En attente</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export function PageHeader({ eyebrow, title, children, right }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0 max-w-[82ch]">
        {eyebrow && <div className="mb-2.5 flex flex-wrap items-center gap-2.5 text-[12.5px] text-fg-3">{eyebrow}</div>}
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {children && <div className="mt-1.5 text-[14px] leading-relaxed text-fg-2">{children}</div>}
      </div>
      {right}
    </header>
  )
}
