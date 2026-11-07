let skew = 0
export const setSkew = (serverNow: number) => {
  skew = serverNow - Date.now() / 1000
}
export const nowS = () => Date.now() / 1000 + skew

const fr = (s: string) => s.replace('.', ',')

export function fmtDur(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return '–'
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const x = s % 60
  if (h) return `${h} h ${String(m).padStart(2, '0')}`
  if (m) return `${m} min ${String(x).padStart(2, '0')}`
  return `${x} s`
}

export function fmtClock(s: number | null | undefined): string {
  if (s == null || !isFinite(s)) return '–'
  s = Math.max(0, Math.round(s))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const x = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms} ms`
  return fr((ms / 1000).toFixed(ms < 10000 ? 1 : 0)) + ' s'
}

export function fmtTime(t: number | null | undefined, seconds = true): string {
  if (!t) return '–'
  return new Date(t * 1000).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  })
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '–'
  if (n >= 1e6) return fr((n / 1e6).toFixed(n >= 1e7 ? 0 : 1)) + ' M'
  if (n >= 1e3) return fr((n / 1e3).toFixed(n >= 1e4 ? 0 : 1)) + ' k'
  return String(n)
}

export function when(t: number | null | undefined): string {
  if (!t) return '–'
  const s = nowS() - t
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  return new Date(t * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function dayLabel(t: number): string {
  const d = new Date(t * 1000)
  const today = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(today) - start(d)) / 86400000)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function expLabel(e: [number, number] | null | undefined): string {
  if (!e) return '?'
  return e[0] === e[1] ? String(e[0]) : `${e[0]}–${e[1]}`
}

export function relT(first: number | null | undefined, t: number | null | undefined): string {
  if (!t || !first) return ''
  const s = Math.max(0, Math.round(t - first))
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`
}
