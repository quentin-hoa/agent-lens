export type Status = 'running' | 'done' | 'error' | 'stale' | 'skipped'
export type View = 'sessions' | 'overview' | 'agent' | 'sources' | 'search' | 'script' | 'journal' | 'help'
export type AgentTab = 'fil' | 'prompt' | 'outils' | 'resultat' | 'systeme' | 'brut'

export interface SessionSource {
  id: string
  kind: 'workflow' | 'session'
  name: string
  agents: number
  done: number
  mtime: number
  live: boolean
}

export interface Session {
  id: string
  project: string
  cwd: string
  title: string | null
  first_prompt: string | null
  mtime: number
  live: boolean
  sources: SessionSource[]
}

export interface Tokens {
  in?: number
  out?: number
  cache_read?: number
  cache_write?: number
}

export interface AgentSummary {
  id: string
  label: string
  phase: string
  status: Status
  first: number | null
  last: number | null
  dur: number | null
  tools: number
  errors: number
  tokens: Tokens
  model: string | null
  effort: string | null
  events: number
  mtime: number | null
  thinking_ms: number
  last_action: string
  last_tool: string | null
}

export interface Phase {
  title: string
  detail: string
  started: number
  done: number
  running: number
  error: number
  expected: [number, number] | null
}

export interface FeedItem {
  t: number | null
  agent: string
  label: string
  phase: string
  tool: string
  sum: string
  i: number
}

export interface SourceState {
  id: string
  kind: 'workflow' | 'session'
  name: string
  description: string
  project: string
  cwd: string
  session: string
  session_title: string | null
  script: string | null
  dir: string
  status: 'running' | 'done' | 'stalled'
  started: number | null
  last_activity: number | null
  now: number
  version: string
  expected_total: [number, number] | null
  totals: {
    agents: number
    running: number
    done: number
    error: number
    tools: number
    tokens: Tokens
    searches: number
    fetches: number
  }
  by_tool: [string, number][]
  domains: [string, number][]
  phases: Phase[]
  agents: AgentSummary[]
  feed: FeedItem[]
  wf_events: Record<string, unknown>[]
}

export interface StateResponse extends Partial<SourceState> {
  unchanged?: boolean
  error?: string
}

export interface EvPrompt { k: 'prompt'; i: number; t: number | null; chars: number }
export interface EvThinking { k: 'thinking'; i: number; t: number | null; ms: number; text: string }
export interface EvText { k: 'text'; i: number; t: number | null; text: string }
export interface EvUser { k: 'user'; i: number; t: number | null; text: string; img?: number[] }
export interface EvTool { k: 'tool'; i: number; t: number | null; id: string; name: string; input: unknown; sum: string }
export interface EvResult { k: 'result'; i: number; t: number | null; id: string; err: boolean; text: string; img: number[]; ms: number | null; trunc?: number }
export interface EvHook { k: 'hook'; i: number; t: number | null; id: string; name: string; text: string }
export interface EvSys { k: 'sys'; i: number; t: number | null; sub: string; text: string }
export type Ev = EvPrompt | EvThinking | EvText | EvUser | EvTool | EvResult | EvHook | EvSys

export interface AgentHeader {
  first: number | null
  last: number | null
  model: string | null
  effort: string | null
  requests: number
  tools: number
  by_tool: Record<string, number>
  errors: number
  tokens: Tokens
  thinking_ms: number
  finished: boolean
  events: number
  pending: number
  has_result: boolean
}

export interface AgentResponse {
  error?: string
  id: string
  label: string
  phase: string
  status: Status
  header: AgentHeader
  total: number
  events: Ev[]
  now: number
  prompt?: string | null
  prompt_head?: string | null
  request?: string | null
  result?: unknown
  result_text?: string | null
}

export interface AgentData {
  label: string
  phase: string
  status: Status
  header: AgentHeader | null
  events: Ev[]
  results: Record<string, EvResult>
  hooks: Record<string, EvHook[]>
  tools: Record<string, EvTool>
  prompt: string | null
  promptHead: string | null
  request: string | null
  result: unknown
  resultText: string | null
  resultLoaded: boolean
}

export interface SourceItem {
  key: string
  extra: string | null
  count: number
  agents: { id: string; label: string; i: number }[]
}
export type SourcesResponse = Record<string, SourceItem[]>

export interface SearchHit {
  agent: string
  label: string
  i: number
  kind: string
  tool: string | null
  before: string
  match: string
  after: string
  count: number
}
