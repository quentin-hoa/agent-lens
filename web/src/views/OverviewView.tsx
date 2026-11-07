import { Check, CircleNotch, Clock, Coins, Folder, Lightning, Robot, Wrench } from '@phosphor-icons/react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Bars } from '../components/Bars'
import { Gantt } from '../components/Gantt'
import { PageHeader, StatusBadge } from '../components/Shell'
import { LiveDot, LiveDuration, Panel, Pill, ProgressBar, SectionTitle, Skeleton } from '../components/ui'
import { expLabel, fmtNum, fmtTime, when } from '../lib/format'
import { phaseColor, useCurState, useStore } from '../lib/store'
import { ToolTile, toolLabel, toolMeta } from '../lib/tools'
import type { SourceState } from '../lib/types'

function Kpi({ icon, label, value, sub, children }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4.5">
      <div className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.02em] text-fg tabular-nums">{value}</div>
      {sub && <div className="mt-2 truncate text-[12.5px] text-fg-3">{sub}</div>}
      {children}
    </div>
  )
}

function KpiStrip({ st }: { st: SourceState }) {
  const t = st.totals
  const tok = t.tokens || {}
  const total = st.expected_total ? st.expected_total[0] : t.agents
  const current = st.phases.find((p) => p.running > 0) || st.phases.find((p) => !p.expected || p.done < p.expected[0])
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 2xl:grid-cols-6">
      <Kpi icon={<Robot size={14} />} label="Agents finis" value={<>{t.done}<span className="ml-1 text-[16px] font-medium text-fg-3">/ {st.expected_total ? expLabel(st.expected_total) : t.agents}</span></>}>
        <ProgressBar value={t.done} max={total} running={t.running} className="mt-3" />
      </Kpi>
      <Kpi icon={<CircleNotch size={14} />} label="En cours" value={t.running} sub={t.error ? <span className="text-bad">{t.error} en alerte</span> : `${t.agents} lancés`} />
      <Kpi icon={<Wrench size={14} />} label="Appels d'outils" value={fmtNum(t.tools)} sub={`${fmtNum(t.searches)} rech. · ${fmtNum(t.fetches)} pages`} />
      <Kpi icon={<Coins size={14} />} label="Tokens générés" value={fmtNum(tok.out)} sub={`${fmtNum(tok.cache_read)} relus en cache`} />
      <Kpi icon={<Lightning size={14} />} label="Phase en cours" value={<span className="text-[22px]">{st.status === 'done' ? 'Terminé' : current?.title || '–'}</span>} sub={current && st.status !== 'done' ? `${current.done} / ${current.expected ? expLabel(current.expected) : current.started}` : undefined} />
      <Kpi icon={<Clock size={14} />} label="Dernière activité" value={<span className="text-[22px]">{when(st.last_activity)}</span>} sub={fmtTime(st.last_activity)} />
    </div>
  )
}

function Phases({ st }: { st: SourceState }) {
  return (
    <Panel className="px-6 py-5">
      <SectionTitle>Phases</SectionTitle>
      <ol className="flex items-start overflow-x-auto pb-1">
        {st.phases.map((p, i) => {
          const max = p.expected ? p.expected[0] : Math.max(1, p.started)
          const complete = p.started > 0 && p.done >= max && p.running === 0
          const active = p.running > 0
          const color = phaseColor(st.phases, p.title)
          return (
            <li key={p.title} className="flex min-w-[100px] flex-1 flex-col">
              <div className="flex items-center">
                <span
                  className={clsx(
                    'flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors',
                    complete && 'bg-ok/15 text-ok ring-ok/30',
                    active && 'bg-accent/15 text-accent ring-accent/35',
                    !complete && !active && 'bg-surface-2 text-fg-3 ring-line-strong',
                  )}
                >
                  {complete ? <Check size={13} weight="bold" /> : active ? <CircleNotch size={13} weight="bold" className="animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                {i < st.phases.length - 1 && <span className={clsx('mx-2 h-px flex-1', complete ? 'bg-ok/40' : 'bg-line-strong')} />}
              </div>
              <div className="mt-3 pr-4">
                <div className={clsx('text-[13.5px] font-medium', active || complete ? 'text-fg' : 'text-fg-2')}>{p.title}</div>
                <div className="mt-0.5 font-mono text-[12px] text-fg-3 tabular-nums">
                  {p.done} / {p.expected ? expLabel(p.expected) : p.started}
                </div>
                <ProgressBar className="mt-2.5" value={p.done} max={max} running={p.running} color={color} />
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

function Feed({ st }: { st: SourceState }) {
  const openAgent = useStore((s) => s.openAgent)
  return (
    <Panel pad={false} className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-5 pt-4.5 pb-3.5">
        <h2 className="text-[13px] font-semibold text-fg">Activité en direct</h2>
        {st.totals.running > 0 && (
          <Pill tone="ok">
            <LiveDot />
            {st.totals.running} agents au travail
          </Pill>
        )}
      </div>
      <ul className="max-h-[620px] divide-y divide-line overflow-y-auto border-t border-line">
        <AnimatePresence initial={false}>
          {st.feed.map((f) => (
            <motion.li
              key={`${f.agent}-${f.i}`}
              layout="position"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <button
                onClick={() => openAgent(f.agent, { focus: f.i })}
                className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-surface-2/50"
              >
                <ToolTile name={f.tool} size="sm" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: phaseColor(st.phases, f.phase) }} />
                    <span className="truncate">{f.label}</span>
                    <span className="shrink-0 font-normal text-fg-3">{toolMeta(f.tool).label}</span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[12px] text-fg-2">{f.sum || toolLabel(f.tool)}</span>
                </span>
                <span className="font-mono text-[11.5px] text-fg-3 tabular-nums">{fmtTime(f.t)}</span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {!st.feed.length && <li className="px-5 py-10 text-center text-[13px] text-fg-3">Aucune action pour l'instant.</li>}
      </ul>
    </Panel>
  )
}

export function OverviewView() {
  const st = useCurState()
  const openAgent = useStore((s) => s.openAgent)
  if (!st)
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-[520px]" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  const topAgents = [...st.agents].filter((a) => a.tokens?.out).sort((a, b) => (b.tokens.out || 0) - (a.tokens.out || 0)).slice(0, 10)
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-8">
      <PageHeader
        eyebrow={
          <>
            <StatusBadge status={st.status} />
            <span>{st.kind === 'workflow' ? 'Workflow' : 'Agents de session'}</span>
            <span className="font-mono">{st.id}</span>
          </>
        }
        title={st.name}
        right={
          <div className="text-right">
            <div className="text-[12.5px] text-fg-3">Durée</div>
            <div className="mt-1 font-mono text-[30px] leading-none font-medium tracking-tight text-fg tabular-nums">
              <LiveDuration start={st.started} end={st.status === 'done' ? st.last_activity : null} />
            </div>
            <div className="mt-1.5 text-[12.5px] text-fg-3">depuis {fmtTime(st.started, false)}</div>
          </div>
        }
      >
        <p>{st.description}</p>
        {st.cwd && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[12px] text-fg-3">
            <Folder size={13} />
            {st.cwd}
          </p>
        )}
      </PageHeader>

      <KpiStrip st={st} />
      {st.phases.length > 1 && <Phases st={st} />}

      <Panel pad={false}>
        <div className="flex items-center justify-between px-5 pt-4.5 pb-3.5">
          <h2 className="text-[13px] font-semibold text-fg">Chronologie</h2>
          <span className="text-[12px] text-fg-3">Une ligne par agent. Clic pour l'ouvrir.</span>
        </div>
        <Gantt st={st} />
      </Panel>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Feed st={st} />
        <div className="space-y-6">
          <Panel>
            <SectionTitle>Outils utilisés</SectionTitle>
            <Bars items={st.by_tool.slice(0, 9).map(([n, c]) => ({ key: n, value: c, label: toolMeta(n).label }))} />
          </Panel>
          <Panel>
            <SectionTitle>Sites les plus lus</SectionTitle>
            <Bars items={st.domains.slice(0, 9).map(([d, c]) => ({ key: d, value: c, label: d }))} color="#7fa3ec" />
          </Panel>
          <Panel>
            <SectionTitle>Tokens générés par agent</SectionTitle>
            <Bars
              items={topAgents.map((a) => ({
                key: a.id,
                value: a.tokens.out || 0,
                label: (
                  <button className="truncate hover:text-fg hover:underline" onClick={() => openAgent(a.id)}>
                    {a.label}
                  </button>
                ),
              }))}
              color="var(--c-fg-3)"
            />
          </Panel>
        </div>
      </div>
    </div>
  )
}
