import { ChartBar } from '@phosphor-icons/react'
import { useState } from 'react'
import { fmtDur, fmtTime, nowS, expLabel } from '../lib/format'
import { phaseColor, useStore } from '../lib/store'
import { STATUS_LABEL, StatusIcon } from '../lib/tools'
import type { AgentSummary, SourceState } from '../lib/types'
import { EmptyState } from './ui'

const LABEL_W = 236

export function Gantt({ st }: { st: SourceState }) {
  useStore((s) => (st.status === 'done' ? 0 : s.tick))
  const openAgent = useStore((s) => s.openAgent)
  const [tip, setTip] = useState<{ a: AgentSummary; x: number; y: number } | null>(null)
  const ag = st.agents.filter((a) => a.first)
  if (!ag.length)
    return (
      <EmptyState icon={<ChartBar size={22} />} title="Aucun agent démarré">
        La chronologie se remplit dès que le premier agent commence.
      </EmptyState>
    )
  const now = nowS()
  const t0 = Math.min(...ag.map((a) => a.first as number))
  const t1 = Math.max(st.status === 'done' ? 0 : now, ...ag.map((a) => (a.last || a.first) as number))
  const span = Math.max(120, t1 - t0)
  const step = [60, 120, 300, 600, 900, 1800, 3600, 7200].find((s) => span / s <= 9) || 14400
  const ticks: number[] = []
  for (let s = 0; s <= span; s += step) ticks.push(s)
  const pos = (a: AgentSummary) => {
    const end = a.status === 'running' ? now : a.last || a.first || t0
    return { l: (((a.first as number) - t0) / span) * 100, w: Math.max(0.35, ((end - (a.first as number)) / span) * 100) }
  }
  const groups = st.phases
    .map((p) => ({ p, list: ag.filter((a) => a.phase === p.title).sort((a, b) => (a.first as number) - (b.first as number)) }))
    .filter((g) => g.list.length)
  const nowFrac = Math.min(1, (now - t0) / span)

  return (
    <div className="relative">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}>
        <div className="px-4 py-2 text-[11.5px] text-fg-3">début {fmtTime(t0, false)}</div>
        <div className="relative h-8 overflow-hidden">
          {ticks.map((s) => (
            <span key={s} className="absolute top-0 bottom-0 border-l border-line pl-1.5 font-mono text-[11px] leading-8 text-fg-3" style={{ left: `${(s / span) * 100}%` }}>
              {fmtTime(t0 + s, false)}
            </span>
          ))}
        </div>
      </div>
      <div className="relative max-h-[540px] overflow-y-auto" onMouseLeave={() => setTip(null)}>
        <div className="relative">
          {st.status !== 'done' && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-[1] w-px bg-bad/70"
              style={{ left: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${nowFrac})` }}
            />
          )}
          {groups.map(({ p, list }) => {
            const color = phaseColor(st.phases, p.title)
            return (
              <div key={p.title}>
                <div
                  className="sticky top-0 z-[2] grid items-center border-y border-line bg-surface/95 backdrop-blur-[2px]"
                  style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}
                >
                  <div className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-semibold text-fg">
                    <span className="size-2 rounded-full" style={{ background: color }} />
                    {p.title}
                    <span className="font-mono text-[11px] font-normal text-fg-3">
                      {p.done}/{p.expected ? expLabel(p.expected) : p.started}
                    </span>
                  </div>
                  <div />
                </div>
                {list.map((a) => {
                  const ps = pos(a)
                  return (
                    <div
                      key={a.id}
                      onClick={() => openAgent(a.id)}
                      onMouseMove={(e) => setTip({ a, x: e.clientX, y: e.clientY })}
                      className="grid h-8 cursor-pointer items-center transition-colors hover:bg-surface-2/70"
                      style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}
                    >
                      <div className="flex min-w-0 items-center gap-2 px-4 text-[12.5px] text-fg-2">
                        <StatusIcon status={a.status} size={13} />
                        <span className="truncate">{a.label}</span>
                      </div>
                      <div className="relative h-full">
                        <div
                          className={`absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${a.status === 'running' ? 'bar-running' : ''}`}
                          style={{
                            left: `${ps.l}%`,
                            width: `${ps.w}%`,
                            backgroundColor: color,
                            opacity: a.status === 'running' ? 0.95 : 0.8,
                            outline: a.status === 'error' || a.status === 'stale' ? '2px solid var(--c-bad)' : undefined,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      {tip && (
        <div
          className="shadow-float pointer-events-none fixed z-50 w-72 rounded-xl border border-line-strong bg-surface p-3.5 text-[12.5px]"
          style={{ left: Math.min(tip.x + 16, window.innerWidth - 300), top: Math.min(tip.y + 16, window.innerHeight - 170) }}
        >
          <div className="mb-2 flex items-center gap-2 font-medium text-fg">
            <StatusIcon status={tip.a.status} size={14} />
            <span className="truncate">{tip.a.label}</span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-fg-2">
            <dt className="text-fg-3">Statut</dt>
            <dd>{STATUS_LABEL[tip.a.status]}</dd>
            <dt className="text-fg-3">Début</dt>
            <dd className="font-mono tabular-nums">{fmtTime(tip.a.first)}</dd>
            <dt className="text-fg-3">Durée</dt>
            <dd className="font-mono tabular-nums">{fmtDur((tip.a.status === 'running' ? now : tip.a.last || 0) - (tip.a.first || 0))}</dd>
            <dt className="text-fg-3">Outils</dt>
            <dd className="font-mono tabular-nums">{tip.a.tools}</dd>
          </dl>
          {tip.a.last_action && <p className="mt-2 truncate border-t border-line pt-2 font-mono text-[11.5px] text-fg-3">{tip.a.last_action}</p>}
        </div>
      )}
    </div>
  )
}
