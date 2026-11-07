import { create } from 'zustand'
import { toast } from 'sonner'
import type { AgentData, AgentResponse, AgentTab, Session, SessionSource, SourceState, View } from './types'
import { fmtDur } from './format'

const LS = 'agents-panel:'
export function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(LS + k)
    return v === null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
export function save(k: string, v: unknown) {
  try {
    localStorage.setItem(LS + k, JSON.stringify(v))
  } catch {
    /* stockage indisponible : on continue sans */
  }
}

export interface SrcUI {
  tabs: string[]
  agent: string | null
  view: View
}
export type Kinds = { text: boolean; tool: boolean; thinking: boolean; sys: boolean }
export type SrcRef = SessionSource & { session: Session }

interface Store {
  sessions: Session[] | null
  srcIndex: Record<string, SrcRef>
  open: string[]
  cur: string | null
  view: View
  ui: Record<string, SrcUI>
  states: Record<string, SourceState>
  agents: Record<string, Record<string, AgentData>>
  agentTab: AgentTab
  kinds: Kinds
  follow: boolean
  theme: 'dark' | 'light'
  notify: boolean
  focus: { agent: string; i: number; nonce: number } | null
  conn: boolean
  lastOk: number
  palette: boolean
  tick: number

  setSessions: (s: Session[]) => void
  setView: (v: View) => void
  openSource: (id: string) => void
  closeSource: (id: string) => void
  setState: (src: string, st: SourceState) => void
  openAgent: (id: string, opts?: { focus?: number; tab?: AgentTab }) => void
  closeAgentTab: (id: string) => void
  mergeAgent: (src: string, r: AgentResponse, askedResult: boolean) => void
  setAgentTab: (t: AgentTab) => void
  toggleKind: (k: keyof Kinds) => void
  setFollow: (b: boolean) => void
  setTheme: (t: 'dark' | 'light') => void
  setNotify: (b: boolean) => void
  setPalette: (b: boolean) => void
}

const emptyUI = (): SrcUI => ({ tabs: [], agent: null, view: 'overview' })

function notifyBrowser(title: string, body: string) {
  try {
    if (useStore.getState().notify && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
  } catch {
    /* ignoré */
  }
}

function transitions(prev: SourceState | undefined, next: SourceState) {
  if (!prev || prev.id !== next.id) return
  const before = new Map(prev.agents.map((a) => [a.id, a.status]))
  const open = (id: string) => ({ label: 'Ouvrir', onClick: () => useStore.getState().openAgent(id) })
  for (const a of next.agents) {
    const b = before.get(a.id)
    if (!b || b === a.status) continue
    if (a.status === 'done') toast.success(a.label, { description: `Fini en ${fmtDur(a.dur)}, ${a.tools} appels d'outils`, action: open(a.id) })
    else if (a.status === 'error') {
      toast.error(a.label, { description: 'Agent en erreur', action: open(a.id) })
      notifyBrowser(`Agent en erreur : ${a.label}`, next.name)
    } else if (a.status === 'stale') toast.warning(a.label, { description: 'Plus rien depuis 15 minutes', action: open(a.id) })
  }
  for (const p of next.phases) {
    const q = prev.phases.find((x) => x.title === p.title)
    const done = (x: typeof p) => !!x.expected && x.done >= x.expected[0]
    if (q && !done(q) && done(p)) toast(`Phase ${p.title} terminée`, { description: `${p.done} agents` })
  }
  if (prev.status !== 'done' && next.status === 'done') {
    toast.success('Workflow terminé', { description: next.name })
    notifyBrowser('Workflow terminé', next.name)
  }
  if (prev.status !== 'stalled' && next.status === 'stalled') notifyBrowser("Workflow à l'arrêt", 'Aucune activité depuis 20 minutes')
}

export const useStore = create<Store>((set, get) => ({
  sessions: null,
  srcIndex: {},
  open: load<string[]>('open', []),
  cur: null,
  view: 'sessions',
  ui: {},
  states: {},
  agents: {},
  agentTab: load<AgentTab>('agentTab', 'fil'),
  kinds: load<Kinds>('kinds', { text: true, tool: true, thinking: true, sys: false }),
  follow: load('follow', true),
  theme: load<'dark' | 'light'>('theme', 'dark'),
  notify: load('notify', false),
  focus: null,
  conn: true,
  lastOk: 0,
  palette: false,
  tick: 0,

  setSessions: (sessions) => {
    const srcIndex: Record<string, SrcRef> = {}
    for (const s of sessions) for (const src of s.sources) srcIndex[src.id] = { ...src, session: s }
    const open = get().open.filter((id) => srcIndex[id])
    if (open.length !== get().open.length) save('open', open)
    set({ sessions, srcIndex, open })
  },

  setView: (v) => {
    const { cur, ui } = get()
    if (!cur && v !== 'sessions' && v !== 'help') v = 'sessions'
    if (cur && v !== 'sessions' && v !== 'help') set({ ui: { ...ui, [cur]: { ...(ui[cur] || emptyUI()), view: v } } })
    set({ view: v })
  },

  openSource: (id) => {
    const { open, ui } = get()
    const u = ui[id] || emptyUI()
    const nextOpen = open.includes(id) ? open : [...open, id]
    save('open', nextOpen)
    save('cur', id)
    set({ cur: id, open: nextOpen, ui: { ...ui, [id]: u }, view: u.view === 'agent' && !u.agent ? 'overview' : u.view })
  },

  closeSource: (id) => {
    const { open, cur, ui, agents, states } = get()
    const nextOpen = open.filter((x) => x !== id)
    const { [id]: _u, ...restUI } = ui
    const { [id]: _a, ...restAgents } = agents
    const { [id]: _s, ...restStates } = states
    save('open', nextOpen)
    set({ open: nextOpen, ui: restUI, agents: restAgents, states: restStates })
    if (cur === id) {
      if (nextOpen.length) get().openSource(nextOpen[nextOpen.length - 1])
      else {
        save('cur', null)
        set({ cur: null, view: 'sessions' })
      }
    }
  },

  setState: (src, st) => {
    const prev = get().states[src]
    set({ states: { ...get().states, [src]: st } })
    transitions(prev, st)
  },

  openAgent: (id, opts = {}) => {
    const { cur, ui } = get()
    if (!cur) return
    const u = ui[cur] || emptyUI()
    const tabs = u.tabs.includes(id) ? u.tabs : [...u.tabs, id]
    const patch: Partial<Store> = { ui: { ...ui, [cur]: { tabs, agent: id, view: 'agent' } }, view: 'agent' }
    if (opts.tab) patch.agentTab = opts.tab
    if (opts.focus != null && !isNaN(opts.focus)) {
      patch.focus = { agent: id, i: opts.focus, nonce: Date.now() }
      patch.agentTab = 'fil'
    }
    set(patch)
  },

  closeAgentTab: (id) => {
    const { cur, ui, view } = get()
    if (!cur) return
    const u = ui[cur] || emptyUI()
    const tabs = u.tabs.filter((x) => x !== id)
    let agent = u.agent
    let nextView = view
    if (agent === id) {
      agent = tabs.length ? tabs[tabs.length - 1] : null
      if (!agent && view === 'agent') nextView = 'overview'
    }
    set({ ui: { ...ui, [cur]: { ...u, tabs, agent, view: nextView === 'agent' ? 'agent' : u.view === 'agent' ? 'overview' : u.view } }, view: nextView })
  },

  mergeAgent: (src, r, askedResult) => {
    const all = get().agents
    const bySrc = all[src] || {}
    const old = bySrc[r.id]
    const d: AgentData = old
      ? { ...old }
      : { label: r.label, phase: r.phase, status: r.status, header: null, events: [], results: {}, hooks: {}, tools: {}, prompt: null, promptHead: null, request: null, result: undefined, resultText: null, resultLoaded: false }
    d.label = r.label
    d.phase = r.phase
    d.status = r.status
    d.header = r.header
    if ('prompt' in r) {
      d.prompt = r.prompt ?? null
      d.promptHead = r.prompt_head ?? null
      d.request = r.request ?? null
    }
    if (askedResult && ('result' in r || 'result_text' in r)) {
      d.result = r.result
      d.resultText = r.result_text ?? null
      d.resultLoaded = true
    }
    const fresh = r.events || []
    if (fresh.length) {
      d.events = d.events.concat(fresh)
      let results = d.results
      let hooks = d.hooks
      let tools = d.tools
      for (const ev of fresh) {
        if (ev.k === 'result') {
          if (results === d.results) results = { ...results }
          results[ev.id] = ev
        } else if (ev.k === 'hook') {
          if (hooks === d.hooks) hooks = { ...hooks }
          hooks[ev.id] = [...(hooks[ev.id] || []), ev]
        } else if (ev.k === 'tool') {
          if (tools === d.tools) tools = { ...tools }
          tools[ev.id] = ev
        }
      }
      d.results = results
      d.hooks = hooks
      d.tools = tools
    }
    set({ agents: { ...all, [src]: { ...bySrc, [r.id]: d } } })
  },

  setAgentTab: (t) => {
    save('agentTab', t)
    set({ agentTab: t })
  },
  toggleKind: (k) => {
    const kinds = { ...get().kinds, [k]: !get().kinds[k] }
    save('kinds', kinds)
    set({ kinds })
  },
  setFollow: (b) => {
    save('follow', b)
    set({ follow: b })
  },
  setTheme: (t) => {
    save('theme', t)
    document.documentElement.dataset.theme = t
    set({ theme: t })
  },
  setNotify: (b) => {
    save('notify', b)
    set({ notify: b })
  },
  setPalette: (b) => set({ palette: b }),
}))

// sélecteurs pratiques
export const useCurState = () => useStore((s) => (s.cur ? s.states[s.cur] : undefined))
export const useCurUI = () => useStore((s) => (s.cur ? s.ui[s.cur] : undefined))
export const useCurAgentData = () =>
  useStore((s) => {
    if (!s.cur) return undefined
    const id = s.ui[s.cur]?.agent
    return id ? s.agents[s.cur]?.[id] : undefined
  })

export function srcName(ref: SrcRef | undefined, id: string): string {
  if (!ref) return id
  if (ref.kind === 'workflow') return ref.name
  return ref.session.title || (ref.session.first_prompt || '').slice(0, 60) || 'Agents de la session'
}

const PALETTE = ['#6a93e8', '#c08bd6', '#d6b25e', '#de8b66', '#57b9a4', '#8aa9d8', '#cfa36b', '#93b977', '#e07a7a', '#7fc29a', '#8fb4c9', '#d3c06a']
export function phaseColor(phases: { title: string }[] | undefined, title: string | undefined): string {
  const list = phases || []
  const i = list.findIndex((p) => p.title === title)
  return PALETTE[(i < 0 ? list.length : i) % PALETTE.length]
}
