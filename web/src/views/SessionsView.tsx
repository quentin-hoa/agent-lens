import { ArrowRight, Folder, FlowArrow, MagnifyingGlass, SquaresFour, TreeStructure } from '@phosphor-icons/react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/Shell'
import { EmptyState, LiveDot, Pill, ProgressBar, Skeleton, Toggle } from '../components/ui'
import { dayLabel, plural, when } from '../lib/format'
import { useStore } from '../lib/store'
import type { Session, SessionSource } from '../lib/types'

function SourceRow({ src }: { src: SessionSource }) {
  const isOpen = useStore((s) => s.open.includes(src.id))
  const openSource = useStore((s) => s.openSource)
  const I = src.kind === 'workflow' ? FlowArrow : TreeStructure
  return (
    <button
      onClick={() => openSource(src.id)}
      className="group grid w-full grid-cols-[36px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2/50 md:grid-cols-[36px_minmax(0,1fr)_170px_120px_auto]"
    >
      <span
        className={clsx(
          'flex size-9 items-center justify-center rounded-xl ring-1 ring-inset',
          src.kind === 'workflow' ? 'bg-accent/10 text-accent ring-accent/20' : 'bg-[#57b9a4]/10 text-[#57b9a4] ring-[#57b9a4]/20',
        )}
      >
        <I size={17} weight="bold" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-fg">{src.kind === 'workflow' ? src.name : 'Agents lancés par la session'}</span>
        <span className="block truncate font-mono text-[11.5px] text-fg-3">
          {src.kind === 'workflow' ? 'workflow' : 'agents'} · {src.id}
        </span>
      </span>
      <span className="col-span-2 md:col-span-1">
        <span className="mb-1.5 flex justify-between text-[12px] text-fg-3">
          <span>
            {src.done} / {plural(src.agents, 'agent fini', 'agents finis')}
          </span>
        </span>
        <ProgressBar value={src.done} max={src.agents} color={src.done >= src.agents ? 'var(--c-ok)' : undefined} />
      </span>
      <span className="hidden text-[12.5px] md:block">
        {src.live ? (
          <Pill tone="ok">
            <LiveDot />
            En cours
          </Pill>
        ) : (
          <span className="text-fg-3">{when(src.mtime)}</span>
        )}
      </span>
      <span
        className={clsx(
          'hidden h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium transition-colors md:inline-flex',
          isOpen ? 'bg-accent/12 text-accent' : 'border border-line-strong text-fg group-hover:bg-surface-2',
        )}
      >
        {isOpen ? 'Ouvert' : 'Ouvrir'}
        <ArrowRight size={13} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}

function SessionCard({ s, index }: { s: Session; index: number }) {
  const title = s.title || (s.first_prompt || '').slice(0, 100) || s.id.slice(0, 8)
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: Math.min(index, 10) * 0.035 }}
      className={clsx(
        'overflow-hidden rounded-2xl border bg-surface transition-colors duration-200',
        s.live ? 'border-accent/40' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex items-start gap-3.5 px-5 pt-4.5 pb-4">
        <span className="mt-[7px]">
          <LiveDot live={s.live} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="truncate text-[15.5px] font-semibold tracking-[-0.01em] text-fg">{title}</h3>
            <span className="shrink-0 text-[12.5px] text-fg-3">{when(s.mtime)}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-fg-3">
            <Folder size={13} />
            <span className="truncate font-mono">{s.cwd || s.project}</span>
          </div>
          {s.title && s.first_prompt && <p className="mt-2.5 line-clamp-2 max-w-[100ch] text-[13.5px] leading-relaxed text-fg-2">{s.first_prompt}</p>}
        </div>
      </div>
      <div className="divide-y divide-line border-t border-line">
        {s.sources.map((src) => (
          <SourceRow key={src.id} src={src} />
        ))}
      </div>
    </motion.article>
  )
}

export function SessionsView() {
  const sessions = useStore((s) => s.sessions)
  useStore((s) => Math.floor(s.tick / 30))
  const [q, setQ] = useState('')
  const [liveOnly, setLiveOnly] = useState(false)
  const groups = useMemo(() => {
    const f = q.trim().toLowerCase()
    const list = (sessions || []).filter(
      (s) =>
        (!liveOnly || s.live) &&
        (!f || [s.title, s.cwd, s.project, s.first_prompt, ...s.sources.map((x) => `${x.name} ${x.id}`)].join(' ').toLowerCase().includes(f)),
    )
    const out: [string, Session[]][] = []
    for (const s of list) {
      const d = dayLabel(s.mtime)
      const last = out[out.length - 1]
      if (last && last[0] === d) last[1].push(s)
      else out.push([d, [s]])
    }
    return out
  }, [sessions, q, liveOnly])
  const live = (sessions || []).filter((s) => s.live).length
  const nsrc = (sessions || []).reduce((n, s) => n + s.sources.length, 0)

  return (
    <div className="mx-auto max-w-[1120px] px-8 py-8">
      <PageHeader
        title="Sessions"
        right={
          <div className="flex items-center gap-2">
            <Toggle on={liveOnly} onClick={() => setLiveOnly(!liveOnly)}>
              <LiveDot live={liveOnly} />
              Actives seulement
            </Toggle>
            <label className="relative block">
              <MagnifyingGlass size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Titre, dossier, workflow…"
                className="h-8 w-64 rounded-lg border border-line bg-surface pr-3 pl-8.5 text-[13px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none"
              />
            </label>
          </div>
        }
      >
        {sessions ? (
          <>
            {plural(sessions.length, 'session Claude Code a', 'sessions Claude Code ont')} lancé des agents ou des workflows sur ce PC, {plural(nsrc, 'source', 'sources')} au total
            {live ? `, dont ${live} active${live > 1 ? 's' : ''} en ce moment` : ''}. Ouvre-en une, puis une autre : chacune garde son onglet en haut.
          </>
        ) : (
          'Recherche des sessions…'
        )}
      </PageHeader>

      {!sessions && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      )}
      {sessions && !groups.length && (
        <EmptyState icon={<SquaresFour size={22} />} title={sessions.length ? 'Aucune session ne correspond' : 'Aucune session avec des agents'}>
          {sessions.length
            ? 'Change le filtre ou désactive « Actives seulement ».'
            : 'Dès qu’une session Claude Code lance un agent ou un workflow, elle apparaît ici toute seule.'}
        </EmptyState>
      )}
      {groups.map(([day, list], gi) => (
        <section key={day} className="mb-9">
          <h3 className="mb-3 text-[12.5px] font-medium text-fg-3 first-letter:uppercase">{day}</h3>
          <div className="space-y-3">
            {list.map((s, i) => (
              <SessionCard key={s.id} s={s} index={gi * 3 + i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
