export async function api<T>(path: string, params: Record<string, string | number | null | undefined> = {}): Promise<T> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v))
  const r = await fetch(`${path}?${q}`)
  return (await r.json()) as T
}

export const imgUrl = (wf: string, id: string, n: number) => `/api/img?${new URLSearchParams({ wf, id, n: String(n) })}`
