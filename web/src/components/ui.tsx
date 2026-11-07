import clsx from 'clsx'
import { Check, Copy } from '@phosphor-icons/react'
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useStore } from '../lib/store'
import { fmtDur, nowS } from '../lib/format'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background,color,transform,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8.5 px-3.5 text-[13px]',
        variant === 'primary' && 'bg-accent text-white hover:brightness-110',
        variant === 'secondary' && 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
        variant === 'ghost' && 'text-fg-2 hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-8 items-center justify-center rounded-lg text-fg-2 transition-colors duration-150 hover:bg-surface-2 hover:text-fg active:scale-[0.96]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'bad' | 'warn'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap ring-1 ring-inset',
        tone === 'neutral' && 'bg-surface-2 text-fg-2 ring-line',
        tone === 'accent' && 'bg-accent/12 text-accent ring-accent/25',
        tone === 'ok' && 'bg-ok/12 text-ok ring-ok/25',
        tone === 'bad' && 'bg-bad/12 text-bad ring-bad/25',
        tone === 'warn' && 'bg-warn/12 text-warn ring-warn/25',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function LiveDot({ live = true, className }: { live?: boolean; className?: string }) {
  return <span className={clsx('inline-block size-2 shrink-0 rounded-full', live ? 'live-dot bg-ok' : 'bg-fg-3/50', className)} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-surface-2 px-1.5 font-mono text-[11px] text-fg-2">
      {children}
    </kbd>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  size = 'md',
  full = false,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode; count?: number }[]
  size?: 'sm' | 'md'
  full?: boolean
}) {
  return (
    <div className={clsx('rounded-lg border border-line bg-surface-2/60 p-0.5', full ? 'flex w-full' : 'inline-flex')}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150',
            full && 'min-w-0 flex-1',
            size === 'sm' ? 'h-6 px-1.5 text-[12px]' : 'h-7 px-2.5 text-[12.5px]',
            value === it.value ? 'bg-surface text-fg shadow-[0_1px_2px_var(--c-shadow)] ring-1 ring-line' : 'text-fg-3 hover:text-fg',
          )}
        >
          {it.label}
          {it.count != null && <span className={clsx('font-mono text-[11px] tabular-nums', value === it.value ? 'text-fg-2' : 'text-fg-3')}>{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium whitespace-nowrap ring-1 ring-inset transition-colors duration-150 active:scale-[0.98]',
        on ? 'bg-accent/12 text-accent ring-accent/25' : 'text-fg-3 ring-line hover:text-fg hover:ring-line-strong',
      )}
    >
      {children}
    </button>
  )
}

export function SectionTitle({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-3 flex items-end justify-between gap-4', className)}>
      <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-fg">{children}</h2>
      {right}
    </div>
  )
}

export function Panel({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={clsx('rounded-2xl border border-line bg-surface', pad && 'p-5', className)}>{children}</section>
}

export function EmptyState({ icon, title, children, className }: { icon: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-fg-3 ring-1 ring-line">{icon}</div>
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {children && <div className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-fg-3">{children}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} />
}

export function ProgressBar({ value, max, color, running, className }: { value: number; max: number; color?: string; running?: number; className?: string }) {
  const m = Math.max(1, max)
  const d = Math.min(100, (value / m) * 100)
  const r = Math.min(100 - d, ((running || 0) / m) * 100)
  return (
    <div className={clsx('flex h-1.5 overflow-hidden rounded-full bg-surface-3/80', className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${d}%`, background: color || 'var(--c-accent)' }} />
      {r > 0 && <div className="bar-running h-full" style={{ width: `${r}%`, backgroundColor: color || 'var(--c-accent)', opacity: 0.4 }} />}
    </div>
  )
}

export function CopyButton({ text, label = 'Copier', className }: { text: string | null | undefined; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg active:scale-[0.97]',
        className,
      )}
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(text || '')
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        } catch (err) {
          toast.error('Copie impossible', { description: String(err) })
        }
      }}
    >
      {done ? <Check size={14} weight="bold" className="text-ok" /> : <Copy size={14} />}
      {done ? 'Copié' : label}
    </button>
  )
}

// horloge partagée : un seul intervalle pour toutes les durées en direct
let tickStarted = false
export function useTicker() {
  useEffect(() => {
    if (tickStarted) return
    tickStarted = true
    const t = setInterval(() => useStore.setState((s) => ({ tick: s.tick + 1 })), 1000)
    return () => {
      clearInterval(t)
      tickStarted = false
    }
  }, [])
}

export function LiveDuration({ start, end, className }: { start: number | null | undefined; end?: number | null; className?: string }) {
  useStore((s) => (end ? 0 : s.tick))
  if (!start) return <span className={className}>–</span>
  return <span className={clsx('tabular-nums', className)}>{fmtDur((end || nowS()) - start)}</span>
}

export function download(name: string, text: string, type = 'text/markdown') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
