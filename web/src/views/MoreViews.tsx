import {
  ArrowClockwise,
  Code,
  Command as CommandIcon,
  FileText,
  Globe,
  ListBullets,
  MagnifyingGlass,
  PencilSimpleLine,
  Plugs,
  TerminalWindow,
  Wrench,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PageHeader } from '../components/Shell'
import { Button, CopyButton, EmptyState, Kbd, Panel, Segmented, Skeleton } from '../components/ui'
import { api } from '../lib/api'
import { phaseColor, useCurState, useStore } from '../lib/store'
import type { SearchHit, SourceItem, SourcesResponse } from '../lib/types'

// ---------------------------------------------------------------- sources

const SRC_TABS: { k: string; label: string; icon: typeof Globe; col: string }[] = [
  { k: 'WebFetch', label: 'Pages', icon: Globe, col: 'Page' },
  { k: 'WebSearch', label: 'Recherches', icon: MagnifyingGlass, col: 'Recherche' },
  { k: 'Read', label: 'Fichiers lus', icon: FileText, col: 'Fichier' },
  { k: 'Bash', label: 'Commandes', icon: TerminalWindow, col: 'Commande' },
  { k: 'Write', label: 'Écrits', icon: PencilSimpleLine, col: 'Fichier' },
  { k: 'Grep', label: 'Grep / Glob', icon: MagnifyingGlass, col: 'Motif' },
  { k: 'MCP', label: 'MCP', icon: Plugs, col: 'Appel' },
  { k: 'Autres', label: 'Autres', icon: Wrench, col: 'Appel' },
]

function AgentChips({ agents }: { agents: SourceItem['agents'] }) {
  const st = useCurState()
  const openAgent = useStore((s) => s.openAgent)
  return (
    <div className="flex flex-wrap gap-1.5">
      {agents.map((a) => {
        const phase = st?.agents.find((x) => x.id === a.id)?.phase
        return (
          <button
            key={a.id}
            onClick={() => openAgent(a.id, { focus: a.i })}
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line-strong px-2.5 text-[11.5px] font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <span className="size-1.5 rounded-full" style={{ background: phaseColor(st?.phases, phase) }} />
            {a.label}
          </button>
        )
      })}
    </div>
  )
}

export function SourcesView() {
  const cur = useStore((s) => s.cur)
  const [data, setData] = useState<SourcesResponse | null>(null)
  const [tab, setTab] = useState('WebFetch')
  const [q, setQ] = useState('')
  const load = () => {
    if (!cur) return
    setData(null)
    api<SourcesResponse>('/api/sources', { wf: cur }).then(setData)
  }
  useEffect(load, [cur])
  const items = useMemo(() => {
    const f = q.trim().toLowerCase()
    return (data?.[tab] || []).filter((x) => !f || `${x.key} ${x.extra || ''} ${x.agents.map((a) => a.label).join(' ')}`.toLowerCase().includes(f))
  }, [data, tab, q])
  const col = SRC_TABS.find((t) => t.k === tab)?.col || 'Élément'
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <PageHeader
        title="Sources consultées"
        right={
          <Button variant="secondary" onClick={load}>
            <ArrowClockwise size={15} />
            Actualiser
          </Button>
        }
      >
        Tout ce que les agents ont lu, cherché, ouvert ou lancé, regroupé et compté. Un clic sur un agent l'ouvre sur l'action en question.
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          items={SRC_TABS.map((t) => ({ value: t.k, label: t.label, count: data ? (data[t.k] || []).length : undefined }))}
        />
        <label className="relative ml-auto block">
          <MagnifyingGlass size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrer"
            className="h-8 w-72 rounded-lg border border-line bg-surface pr-3 pl-8.5 text-[13px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none"
          />
        </label>
      </div>
      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : !items.length ? (
        <EmptyState icon={<Globe size={22} />} title="Rien ici">
          Aucun élément pour cet onglet{q ? ' avec ce filtre' : ''}.
        </EmptyState>
      ) : (
        <Panel pad={false} className="overflow-hidden">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-[12px] text-fg-3">
                <th className="px-5 py-2.5 font-medium">{col}</th>
                <th className="hidden px-5 py-2.5 font-medium lg:table-cell">Détail</th>
                <th className="w-16 px-3 py-2.5 text-right font-medium">Fois</th>
                <th className="w-[34%] px-5 py-2.5 font-medium">Agents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.slice(0, 1500).map((x) => (
                <tr key={x.key} className="align-top transition-colors hover:bg-surface-2/40">
                  <td className="max-w-[520px] px-5 py-3 [overflow-wrap:anywhere]">
                    {tab === 'WebFetch' ? (
                      <a href={x.key} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {x.key}
                      </a>
                    ) : (
                      <span className={clsx(tab === 'WebSearch' ? 'text-fg' : 'font-mono text-[12.5px] text-fg')}>{x.key.slice(0, 500)}</span>
                    )}
                  </td>
                  <td className="hidden max-w-[380px] px-5 py-3 text-[12.5px] leading-relaxed text-fg-3 lg:table-cell">{String(x.extra || '').slice(0, 280)}</td>
                  <td className="px-3 py-3 text-right font-mono text-fg-2 tabular-nums">{x.count}</td>
                  <td className="px-5 py-3">
                    <AgentChips agents={x.agents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- recherche

const KIND_LABEL: Record<string, string> = { tool: 'appel d’outil', result: 'résultat d’outil', text: 'réponse', prompt: 'prompt', thinking: 'réflexion', user: 'message', sys: 'système' }

export function SearchView() {
  const cur = useStore((s) => s.cur)
  const st = useCurState()
  const openAgent = useStore((s) => s.openAgent)
  const [q, setQ] = useState(() => sessionStorage.getItem('agents-panel:q') || '')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    try {
      sessionStorage.setItem('agents-panel:q', q)
    } catch {
      /* ignoré */
    }
    const t = q.trim()
    if (!cur || t.length < 2) {
      setHits(null)
      return
    }
    setBusy(true)
    const timer = setTimeout(() => {
      api<SearchHit[]>('/api/search', { wf: cur, q: t })
        .then(setHits)
        .finally(() => setBusy(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [q, cur])
  const groups = useMemo(() => {
    const m = new Map<string, SearchHit[]>()
    for (const h of hits || []) m.set(h.agent, [...(m.get(h.agent) || []), h])
    return [...m.entries()]
  }, [hits])
  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <PageHeader title="Rechercher partout">Dans les prompts, les réponses, les appels d'outils et leurs résultats, pour tous les agents de la source ouverte.</PageHeader>
      <label className="relative mb-7 block">
        <MagnifyingGlass size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-fg-3" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Un mot, une URL, un nom de fichier…"
          className="h-12 w-full rounded-2xl border border-line-strong bg-surface pr-28 pl-12 text-[15px] text-fg placeholder:text-fg-3 focus:border-accent/60 focus:outline-none"
        />
        <span className="absolute top-1/2 right-4 -translate-y-1/2 text-[12.5px] text-fg-3">
          {busy ? 'recherche…' : hits ? `${hits.length}${hits.length >= 400 ? '+' : ''} résultats` : ''}
        </span>
      </label>
      {!hits && (
        <EmptyState icon={<MagnifyingGlass size={22} />} title="Tape au moins deux caractères">
          Exemple : « Doctoralia », « renta », un domaine ou un chemin de fichier.
        </EmptyState>
      )}
      {hits && !hits.length && <EmptyState icon={<MagnifyingGlass size={22} />} title="Aucun résultat" />}
      <div className="space-y-5">
        {groups.map(([agent, list]) => {
          const a = st?.agents.find((x) => x.id === agent)
          return (
            <Panel key={agent} pad={false}>
              <div className="flex items-center gap-2.5 px-5 py-3.5">
                <span className="size-2 rounded-full" style={{ background: phaseColor(st?.phases, a?.phase) }} />
                <span className="text-[13.5px] font-semibold text-fg">{list[0].label}</span>
                <span className="font-mono text-[12px] text-fg-3">{list.length}</span>
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {list.map((h) => (
                  <li key={`${h.i}`}>
                    <button onClick={() => openAgent(agent, { focus: h.i })} className="block w-full px-5 py-3 text-left transition-colors hover:bg-surface-2/50">
                      <div className="mb-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">
                        {KIND_LABEL[h.kind] || h.kind}
                        {h.tool ? ` · ${h.tool}` : ''}
                        {h.count > 1 ? ` · ${h.count} fois` : ''}
                      </div>
                      <p className="font-mono text-[12.5px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-fg-2">
                        {h.before}
                        <mark className="rounded bg-warn/30 px-0.5 text-fg">{h.match}</mark>
                        {h.after}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- script

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function highlight(src: string) {
  const re =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^\\`])*`|'(?:\\.|[^\\'\n])*'|"(?:\\.|[^\\"\n])*")|\b(const|let|var|function|return|await|async|if|else|for|of|in|while|new|export|import|from|true|false|null|undefined|try|catch|throw|break|continue|typeof)\b|\b(\d+(?:\.\d+)?)\b/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index))
    out += `<span class="${m[1] ? 'tok-com' : m[2] ? 'tok-str' : m[3] ? 'tok-kw' : 'tok-num'}">${esc(m[0])}</span>`
    last = re.lastIndex
  }
  return out + esc(src.slice(last))
}

export function ScriptView() {
  const cur = useStore((s) => s.cur)
  const [data, setData] = useState<{ path: string | null; source: string | null } | null>(null)
  useEffect(() => {
    if (cur) api<{ path: string | null; source: string | null }>('/api/script', { wf: cur }).then(setData)
  }, [cur])
  const html = useMemo(() => (data?.source ? highlight(data.source) : ''), [data])
  if (!data) return <div className="p-8"><Skeleton className="h-[70vh] w-full rounded-2xl" /></div>
  if (!data.source) return <EmptyState icon={<Code size={22} />} title="Pas de script pour cette source">Seuls les workflows ont un script.</EmptyState>
  const n = data.source.split('\n').length
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <PageHeader title="Script du workflow" right={<CopyButton text={data.source} label="Copier le script" className="!h-8.5 border border-line-strong !px-3 !text-[13px] !text-fg" />}>
        <span className="font-mono text-[12.5px] break-all text-fg-3">{data.path}</span> · {n} lignes
      </PageHeader>
      <Panel pad={false} className="overflow-hidden">
        <div className="flex overflow-auto font-mono text-[12.5px] leading-[1.7]">
          <pre className="border-r border-line bg-surface-2/50 px-4 py-4 text-right text-fg-3 select-none">{Array.from({ length: n }, (_, i) => i + 1).join('\n')}</pre>
          <pre className="flex-1 px-5 py-4 text-code" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- journal

export function JournalView() {
  const cur = useStore((s) => s.cur)
  const openAgent = useStore((s) => s.openAgent)
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  useEffect(() => {
    if (cur) api<Record<string, unknown>[]>('/api/journal', { wf: cur }).then(setRows)
  }, [cur])
  if (!rows) return <div className="p-8"><Skeleton className="h-[60vh] w-full rounded-2xl" /></div>
  if (!rows.length) return <EmptyState icon={<ListBullets size={22} />} title="Journal vide">Seuls les workflows tiennent un journal.</EmptyState>
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'remoteControlDeviceReport')
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <PageHeader title="Journal du workflow">
        Le fichier <span className="font-mono text-[13px]">journal.jsonl</span> tel quel, {rows.length} événements. C'est lui qui permet de reprendre un workflow interrompu sans refaire les agents déjà finis.
      </PageHeader>
      <Panel pad={false} className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-fg-3">
              <th className="px-4 py-2.5 font-medium">#</th>
              {keys.map((k) => (
                <th key={k} className="px-4 py-2.5 font-mono font-medium">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => typeof r.agentId === 'string' && openAgent(r.agentId)}
                className={clsx('align-top', typeof r.agentId === 'string' && 'cursor-pointer hover:bg-surface-2/40')}
              >
                <td className="px-4 py-2.5 font-mono text-fg-3">{i + 1}</td>
                {keys.map((k) => (
                  <td key={k} className="max-w-[460px] truncate px-4 py-2.5 font-mono text-fg-2" title={String(r[k] ?? '')}>
                    {String(r[k] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------- aide

function HelpBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-7 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
      <div className="space-y-2.5 text-[14px] leading-relaxed text-fg-2">{children}</div>
    </section>
  )
}

export function HelpView() {
  const keys: [ReactNode, string][] = [
    [<><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></>, 'aller à un agent, une session ou une vue'],
    [<Kbd>G</Kbd>, 'sessions'],
    [<Kbd>O</Kbd>, "vue d'ensemble de la source ouverte"],
    [<Kbd>S</Kbd>, 'sources consultées'],
    [<Kbd>/</Kbd>, 'rechercher partout'],
    [<><Kbd>J</Kbd> <Kbd>K</Kbd></>, 'agent suivant, agent précédent'],
    [<><Kbd>1</Kbd> … <Kbd>6</Kbd></>, "onglets d'un agent (Fil, Prompt, Outils, Résultat, Système, Brut)"],
    [<Kbd>A</Kbd>, 'suivre l’agent en direct (défilement automatique)'],
    [<Kbd>E</Kbd>, 'ouvrir toutes les cartes du fil'],
    [<Kbd>?</Kbd>, 'cette page'],
  ]
  return (
    <div className="mx-auto max-w-[820px] px-8 py-10">
      <PageHeader title="Aide">Le panneau lit les fichiers que Claude Code écrit quand une session lance des agents ou des workflows, et se met à jour toutes les deux secondes. Il n'écrit rien et rien ne sort de la machine.</PageHeader>
      <Panel className="px-8 py-7">
        <HelpBlock title="Lancer et arrêter">
          <p>
            Dans un terminal : <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">agents</code> lance le panneau en arrière-plan et ouvre le navigateur. Le relancer ouvre simplement un onglet de plus.
          </p>
          <p>
            <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">agents stop</code> l'arrête, <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">agents restart</code> le relance, <code className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">agents --foreground</code> le garde dans le terminal.
          </p>
        </HelpBlock>
        <HelpBlock title="Naviguer">
          <p>
            <strong className="text-fg">Sessions</strong> liste toutes les sessions Claude Code du PC qui ont lancé des agents ou des workflows ; les actives ont un point vert. Un clic ouvre la source dans un onglet en haut, et chaque onglet garde l'agent que tu regardais.
          </p>
          <p>
            Dans une source : la <strong className="text-fg">vue d'ensemble</strong> (phases, chronologie, activité en direct), la liste des agents à gauche, et pour chaque agent son <strong className="text-fg">fil</strong> (chaque outil avec son entrée et son résultat), son <strong className="text-fg">prompt</strong>, ses <strong className="text-fg">outils</strong>, son <strong className="text-fg">résultat</strong>, son prompt <strong className="text-fg">système</strong> et les données <strong className="text-fg">brutes</strong>.
          </p>
          <p>
            <strong className="text-fg">Sources consultées</strong> regroupe toutes les pages, recherches, fichiers et commandes de tous les agents. <strong className="text-fg">Rechercher partout</strong> trouve un mot dans tout ce qu'ils ont lu ou écrit.
          </p>
        </HelpBlock>
        <HelpBlock title="Raccourcis">
          <dl className="grid grid-cols-[150px_1fr] gap-x-6 gap-y-2.5">
            {keys.map(([k, v], i) => (
              <div key={i} className="contents">
                <dt className="flex items-center gap-1">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </HelpBlock>
        <HelpBlock title="À savoir">
          <p>Claude Code ne garde pas le contenu de la réflexion des agents, seulement sa durée.</p>
          <p>Un agent marqué inactif n'a rien écrit depuis 15 minutes : il est peut-être bloqué ou arrêté.</p>
          <p>
            Le nombre d'agents prévu n'est connu que pour les workflows déclarés dans <span className="font-mono text-[13px]">expected.json</span> (voir expected.example.json).
          </p>
        </HelpBlock>
      </Panel>
      <p className="mt-6 flex items-center gap-2 text-[12.5px] text-fg-3">
        <CommandIcon size={14} />
        agent-lens · React, Tailwind, Framer Motion, icônes Phosphor · github.com/quentin-hoa/agent-lens
      </p>
    </div>
  )
}
