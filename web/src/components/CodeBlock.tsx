import clsx from 'clsx'
import type { ReactNode } from 'react'
import { CopyButton } from './ui'

export function CodeBlock({
  text,
  label,
  actions,
  maxH = 460,
  tone = 'neutral',
  className,
}: {
  text: string
  label?: ReactNode
  actions?: ReactNode
  maxH?: number | null
  tone?: 'neutral' | 'bad'
  className?: string
}) {
  return (
    <div className={clsx('overflow-hidden rounded-xl border bg-surface-2/70', tone === 'bad' ? 'border-bad/35' : 'border-line', className)}>
      <div className="flex h-9 items-center justify-between gap-3 border-b border-line pr-1.5 pl-3.5">
        <span className={clsx('text-[11.5px] font-medium tracking-wide uppercase', tone === 'bad' ? 'text-bad' : 'text-fg-3')}>{label}</span>
        <div className="flex items-center gap-1">
          {actions}
          <CopyButton text={text} />
        </div>
      </div>
      <pre
        className="overflow-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.65] [overflow-wrap:anywhere] whitespace-pre-wrap text-code"
        style={maxH ? { maxHeight: maxH } : undefined}
      >
        {text}
      </pre>
    </div>
  )
}
