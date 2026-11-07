import { IconContext } from '@phosphor-icons/react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { CommandPalette } from './components/CommandPalette'
import { Rail, Sidebar, TopBar } from './components/Shell'
import { useTicker } from './components/ui'
import { api } from './lib/api'
import { setSkew } from './lib/format'
import { load, useStore } from './lib/store'
import type { AgentResponse, AgentTab, Session, SourceState, StateResponse } from './lib/types'
import { AgentView } from './views/AgentView'
import { HelpView, JournalView, ScriptView, SearchView, SourcesView } from './views/MoreViews'
import { OverviewView } from './views/OverviewView'
import { SessionsView } from './views/SessionsView'

function usePolling() {
  const cur = useStore((s) => s.cur)
  const view = useStore((s) => s.view)
  const agent = useStore((s) => (s.cur ? s.ui[s.cur]?.agent : null))
  const restored = useRef(false)

  // sessions : toutes les 5 s sur la page Sessions, toutes les 20 s ailleurs
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    const loop = async () => {
      try {
        const d = await api<Session[]>('/api/sessions')
        if (stop) return
        const s = useStore.getState()
        s.setSessions(d)
        if (!restored.current) {
          restored.current = true
          const saved = load<string | null>('cur', null)
          const open = useStore.getState().open
          if (saved && open.includes(saved)) s.openSource(saved)
        }
        useStore.setState({ conn: true, lastOk: Date.now() })
      } catch {
        useStore.setState({ conn: false })
      }
      if (!stop) timer = window.setTimeout(loop, useStore.getState().view === 'sessions' ? 5000 : 20000)
    }
    loop()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [])

  // état de la source ouverte : toutes les 2 s (le serveur répond « inchangé » si rien n'a bougé)
  useEffect(() => {
    if (!cur) return
    let stop = false
    let timer: number | undefined
    const loop = async () => {
      const s = useStore.getState()
      try {
        const r = await api<StateResponse>('/api/state', { wf: cur, v: s.states[cur]?.version || '' })
        if (stop) return
        if (r.now) setSkew(r.now)
        if (r.error) toast.warning('Source introuvable', { description: r.error, id: `missing-${cur}` })
        else if (!r.unchanged) s.setState(cur, r as SourceState)
        useStore.setState({ conn: true, lastOk: Date.now() })
      } catch {
        useStore.setState({ conn: false })
      }
      if (!stop) timer = window.setTimeout(loop, 2000)
    }
    loop()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [cur])

  // agent ouvert : toutes les 1,5 s, seulement les nouveaux événements
  useEffect(() => {
    if (!cur || !agent || view !== 'agent') return
    let stop = false
    let timer: number | undefined
    const loop = async () => {
      const s = useStore.getState()
      const d = s.agents[cur]?.[agent]
      const res = d?.resultLoaded ? 0 : 1
      try {
        const r = await api<AgentResponse>('/api/agent', { wf: cur, id: agent, since: d ? d.events.length : 0, res })
        if (stop) return
        if (r.now) setSkew(r.now)
        if (!r.error) useStore.getState().mergeAgent(cur, r, res === 1)
      } catch {
        /* nouvel essai au prochain tour */
      }
      if (!stop) timer = window.setTimeout(loop, 1500)
    }
    loop()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [cur, agent, view])
}

const TAB_KEYS: AgentTab[] = ['fil', 'prompt', 'outils', 'resultat', 'systeme', 'brut']

function useKeyboard() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const s = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.setPalette(!s.palette)
        return
      }
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey || s.palette) return
      const k = e.key
      if (k === 'g') s.setView('sessions')
      else if (k === 'o') s.setView('overview')
      else if (k === 's') s.setView('sources')
      else if (k === '?') s.setView('help')
      else if (k === '/') {
        e.preventDefault()
        s.setView('search')
      } else if (k === 'j' || k === 'k') {
        const st = s.cur ? s.states[s.cur] : undefined
        if (!st || !st.agents.length) return
        const order = st.phases.map((p) => p.title)
        const list = [...st.agents].sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase))
        const curId = s.cur ? s.ui[s.cur]?.agent : null
        const i = list.findIndex((a) => a.id === curId)
        const next = list[i < 0 ? 0 : (i + (k === 'j' ? 1 : -1) + list.length) % list.length]
        s.openAgent(next.id)
      } else if (/^[1-6]$/.test(k) && s.view === 'agent') s.setAgentTab(TAB_KEYS[Number(k) - 1])
      else if (k === 'a') {
        s.setFollow(!s.follow)
        toast(s.follow ? 'Suivi en direct coupé' : 'Suivi en direct activé')
      } else if (k === 'e' && s.view === 'agent') window.dispatchEvent(new CustomEvent('agents:expand', { detail: true }))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}

function CurrentView() {
  const view = useStore((s) => s.view)
  switch (view) {
    case 'sessions':
      return <SessionsView />
    case 'overview':
      return <OverviewView />
    case 'agent':
      return <AgentView />
    case 'sources':
      return <SourcesView />
    case 'search':
      return <SearchView />
    case 'script':
      return <ScriptView />
    case 'journal':
      return <JournalView />
    case 'help':
      return <HelpView />
  }
}

export default function App() {
  usePolling()
  useKeyboard()
  useTicker()
  const view = useStore((s) => s.view)
  const cur = useStore((s) => s.cur)
  const theme = useStore((s) => s.theme)
  const agent = useStore((s) => (s.cur ? s.ui[s.cur]?.agent : null))
  const showSidebar = !!cur && view !== 'sessions' && view !== 'help'
  const key = `${view}:${cur || ''}:${view === 'agent' ? agent : ''}`

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    const el = document.getElementById('main-scroll')
    if (el) el.scrollTop = 0
  }, [key])

  return (
    <IconContext.Provider value={{ size: 18, weight: 'regular' }}>
      <div
        className={clsx(
          'grid h-dvh grid-rows-[52px_minmax(0,1fr)]',
          showSidebar ? 'grid-cols-[56px_300px_minmax(0,1fr)]' : 'grid-cols-[56px_minmax(0,1fr)]',
        )}
      >
        <TopBar />
        <Rail />
        {showSidebar && <Sidebar />}
        <main id="main-scroll" className="min-h-0 min-w-0 overflow-y-auto">
          {/* entrée animée seulement : une sortie animée (AnimatePresence mode="wait") pouvait rester bloquée sur un écran vide */}
          <motion.div key={key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            <CurrentView />
          </motion.div>
        </main>
      </div>
      <CommandPalette />
      <Toaster
        theme={theme}
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: '!rounded-xl !border !border-line-strong !bg-surface !text-fg shadow-float !font-sans',
            title: '!text-[13.5px] !font-medium',
            description: '!text-[12.5px] !text-fg-3',
            actionButton: '!bg-accent !text-white !rounded-md !text-[12px]',
          },
        }}
      />
    </IconContext.Provider>
  )
}
