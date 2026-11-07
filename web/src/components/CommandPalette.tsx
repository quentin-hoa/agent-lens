import {
  ChartLineUp,
  Code,
  FlowArrow,
  Globe,
  ListBullets,
  MagnifyingGlass,
  Moon,
  Question,
  SquaresFour,
  TreeStructure,
} from '@phosphor-icons/react'
import { Command } from 'cmdk'
import type { ReactNode } from 'react'
import { srcName, useCurState, useStore } from '../lib/store'
import { StatusIcon } from '../lib/tools'
import type { View } from '../lib/types'
import { Kbd, LiveDot } from './ui'

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] text-fg-2 transition-colors"
    >
      {children}
    </Command.Item>
  )
}

const VIEWS: { v: View; label: string; icon: typeof SquaresFour }[] = [
  { v: 'sessions', label: 'Sessions', icon: SquaresFour },
  { v: 'overview', label: "Vue d'ensemble", icon: ChartLineUp },
  { v: 'sources', label: 'Sources consultées', icon: Globe },
  { v: 'search', label: 'Rechercher partout', icon: MagnifyingGlass },
  { v: 'script', label: 'Script du workflow', icon: Code },
  { v: 'journal', label: 'Journal du workflow', icon: ListBullets },
  { v: 'help', label: 'Aide et raccourcis', icon: Question },
]

export function CommandPalette() {
  const open = useStore((s) => s.palette)
  const st = useCurState()
  const sessions = useStore((s) => s.sessions)
  const theme = useStore((s) => s.theme)
  const srcIndex = useStore((s) => s.srcIndex)
  const { setPalette, openAgent, openSource, setView, setTheme } = useStore.getState()
  const go = (fn: () => void) => {
    fn()
    setPalette(false)
  }
  return (
    <Command.Dialog
      open={open}
      onOpenChange={setPalette}
      label="Aller à"
      className="shadow-float overflow-hidden rounded-2xl border border-line-strong bg-surface"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlass size={18} className="text-fg-3" />
        <Command.Input
          autoFocus
          placeholder="Aller à un agent, une session, une vue…"
          className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        <Kbd>Échap</Kbd>
      </div>
      <Command.List className="max-h-[440px] overflow-y-auto p-2">
        <Command.Empty className="px-4 py-10 text-center text-[13.5px] text-fg-3">Aucun résultat.</Command.Empty>
        {st && st.agents.length > 0 && (
          <Command.Group heading={`Agents · ${st.name}`}>
            {st.agents.map((a) => (
              <Item key={a.id} value={`agent ${a.label} ${a.phase} ${a.id}`} onSelect={() => go(() => openAgent(a.id))}>
                <StatusIcon status={a.status} size={15} />
                <span className="min-w-0 flex-1 truncate text-fg">{a.label}</span>
                <span className="text-[12px] text-fg-3">{a.phase}</span>
              </Item>
            ))}
          </Command.Group>
        )}
        {sessions && (
          <Command.Group heading="Sessions et workflows">
            {sessions.flatMap((s) =>
              s.sources.map((src) => {
                const I = src.kind === 'workflow' ? FlowArrow : TreeStructure
                return (
                  <Item key={src.id} value={`source ${srcName(srcIndex[src.id], src.id)} ${s.title || ''} ${s.cwd} ${src.id}`} onSelect={() => go(() => openSource(src.id))}>
                    {src.live ? <LiveDot /> : <I size={15} className="text-fg-3" />}
                    <span className="min-w-0 flex-1 truncate text-fg">{srcName(srcIndex[src.id], src.id)}</span>
                    <span className="font-mono text-[11.5px] text-fg-3">{s.cwd}</span>
                  </Item>
                )
              }),
            )}
          </Command.Group>
        )}
        <Command.Group heading="Vues">
          {VIEWS.map((v) => (
            <Item key={v.v} value={`vue ${v.label}`} onSelect={() => go(() => setView(v.v))}>
              <v.icon size={16} className="text-fg-3" />
              <span className="text-fg">{v.label}</span>
            </Item>
          ))}
        </Command.Group>
        <Command.Group heading="Actions">
          <Item value="theme clair sombre" onSelect={() => go(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            <Moon size={16} className="text-fg-3" />
            <span className="text-fg">Passer au thème {theme === 'dark' ? 'clair' : 'sombre'}</span>
          </Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
