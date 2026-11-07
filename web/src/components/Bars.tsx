import type { ReactNode } from 'react'
import { fmtNum } from '../lib/format'

export function Bars({ items, fmt = fmtNum, color }: { items: { label: ReactNode; value: number; key: string }[]; fmt?: (n: number) => string; color?: string }) {
  if (!items.length) return <p className="py-4 text-[13px] text-fg-3">Rien pour l'instant.</p>
  const max = Math.max(...items.map((x) => x.value)) || 1
  return (
    <ul className="space-y-2.5">
      {items.map((x) => (
        <li key={x.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
          <span className="min-w-0 truncate text-[13px] text-fg-2">{x.label}</span>
          <span className="font-mono text-[12px] text-fg-3 tabular-nums">{fmt(x.value)}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-3/70">
            <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, (x.value / max) * 100)}%`, background: color || 'var(--c-accent)' }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
