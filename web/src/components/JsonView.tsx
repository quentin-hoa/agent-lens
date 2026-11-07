import { CaretRight } from '@phosphor-icons/react'
import clsx from 'clsx'
import { memo, useState } from 'react'
import { Pill } from './ui'

const ENUM: Record<string, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  confirmed: 'ok',
  high: 'ok',
  done: 'ok',
  corrected: 'warn',
  medium: 'warn',
  major: 'warn',
  unverifiable: 'neutral',
  minor: 'neutral',
  low: 'bad',
  refuted: 'bad',
  blocker: 'bad',
}

function Prim({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="font-mono text-[12.5px] text-fg-3">null</span>
  if (typeof v === 'boolean') return <Pill tone={v ? 'ok' : 'bad'}>{v ? 'oui' : 'non'}</Pill>
  if (typeof v === 'number') return <span className="tok-num font-mono text-[13px] tabular-nums">{v}</span>
  const s = String(v)
  if (ENUM[s]) return <Pill tone={ENUM[s] === 'neutral' ? 'neutral' : ENUM[s]}>{s}</Pill>
  if (/^https?:\/\/\S+$/.test(s))
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
        {s}
      </a>
    )
  return <span className="text-fg">{s}</span>
}

const isLong = (v: unknown) => typeof v === 'string' && (v.length > 110 || v.includes('\n'))
const isTable = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length >= 2 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))

function Cell({ v }: { v: unknown }) {
  if (v === undefined) return null
  if (v === null || typeof v !== 'object') return isLong(v) ? <span className="whitespace-pre-wrap">{String(v)}</span> : <Prim v={v} />
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))
    return (
      <ul className="space-y-1">
        {v.map((x, i) => (
          <li key={i}>
            <Prim v={x} />
          </li>
        ))}
      </ul>
    )
  return <Node v={v} depth={3} />
}

function JTable({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = [...new Set(rows.flatMap((o) => Object.keys(o)))]
  return (
    <div className="mt-2 mb-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="bg-surface-2">
            <th className="w-10 border-b border-line px-3 py-2 font-medium text-fg-3">#</th>
            {keys.map((k) => (
              <th key={k} className="border-b border-line px-3 py-2 font-mono text-[12px] font-medium whitespace-nowrap text-fg-2">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((o, i) => (
            <tr key={i} className="align-top odd:bg-transparent even:bg-surface-2/40">
              <td className="border-b border-line px-3 py-2.5 font-mono text-[12px] text-fg-3">{i + 1}</td>
              {keys.map((k) => (
                <td key={k} className="max-w-[440px] border-b border-line px-3 py-2.5 leading-relaxed [overflow-wrap:anywhere]">
                  <Cell v={o[k]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Node({ k, v, depth }: { k?: string | number; v: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const [asTable, setAsTable] = useState(true)
  const label =
    k !== undefined ? <span className="json-key font-mono text-[12.5px]">{k}</span> : null
  if (v === null || typeof v !== 'object') {
    return (
      <div className="py-[3px]">
        {label && (
          <>
            {label}
            <span className="text-fg-3">: </span>
          </>
        )}
        {isLong(v) ? (
          <div className="mt-1.5 mb-2 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg">
            {String(v)}
          </div>
        ) : (
          <Prim v={v} />
        )}
      </div>
    )
  }
  const arr = Array.isArray(v)
  const entries: [string | number, unknown][] = arr ? (v as unknown[]).map((x, i) => [i, x]) : Object.entries(v as object)
  const table = isTable(v)
  return (
    <div className="py-[3px]">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 rounded-md text-left hover:text-fg">
          <CaretRight size={11} weight="bold" className={clsx('text-fg-3 transition-transform duration-150', open && 'rotate-90')} />
          {label}
          <span className="font-mono text-[11.5px] text-fg-3">{arr ? `${entries.length} éléments` : `${entries.length} champs`}</span>
        </button>
        {table && open && (
          <button className="text-[11.5px] font-medium text-accent hover:underline" onClick={() => setAsTable(!asTable)}>
            {asTable ? 'voir en arbre' : 'voir en tableau'}
          </button>
        )}
      </div>
      {open &&
        (table && asTable ? (
          <JTable rows={v as Record<string, unknown>[]} />
        ) : (
          <div className="mt-0.5 ml-[5px] border-l border-line pl-4">
            {entries.map(([kk, x]) => (
              <Node key={String(kk)} k={kk} v={x} depth={depth + 1} />
            ))}
          </div>
        ))}
    </div>
  )
}

export const JsonView = memo(function JsonView({ value }: { value: unknown }) {
  return (
    <div className="text-[13.5px] leading-relaxed">
      <Node v={value} depth={0} />
    </div>
  )
})
