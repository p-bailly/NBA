import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  updatedAt: number | undefined
  refresh: () => void
}

/**
 * Charge des données puis les rafraîchit automatiquement.
 * - `interval` peut dépendre des données (ex. 15 s si un match est en cours, sinon 2 min) ;
 *   `null` désactive le rafraîchissement.
 * - Pause quand l'onglet est caché ou que `active` est faux, rechargement immédiat au retour.
 * - Les anciennes données restent affichées pendant le rechargement.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  interval: number | null | ((data: T) => number | null) = null,
  active = true,
): PollState<T> {
  const [state, setState] = useState<Omit<PollState<T>, 'refresh'>>({
    data: undefined,
    error: undefined,
    loading: true,
    updatedAt: undefined,
  })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const intervalRef = useRef(interval)
  intervalRef.current = interval

  // Nouvelle ressource (ex. autre match) : on repart de zéro.
  useEffect(() => {
    setState({ data: undefined, error: undefined, loading: true, updatedAt: undefined })
  }, deps)

  useEffect(() => {
    if (!active) return
    let timer: number | undefined
    let ctrl: AbortController | undefined
    let stopped = false

    const run = async () => {
      if (document.hidden) return
      ctrl = new AbortController()
      setState((s) => ({ ...s, loading: true }))
      let next: number | null = null
      try {
        const data = await fetcherRef.current(ctrl.signal)
        if (stopped) return
        setState({ data, error: undefined, loading: false, updatedAt: Date.now() })
        const iv = intervalRef.current
        next = typeof iv === 'function' ? iv(data) : iv
      } catch (e) {
        if (stopped || (e as Error).name === 'AbortError') return
        setState((s) => ({ ...s, error: e as Error, loading: false }))
        next = 30_000 // réessaie plus tard en cas d'erreur réseau
      }
      if (next != null && !stopped) timer = window.setTimeout(run, next)
    }

    const onVisible = () => {
      if (document.hidden) return
      window.clearTimeout(timer)
      ctrl?.abort()
      run()
    }

    run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      ctrl?.abort()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [...deps, active, tick])

  return { ...state, refresh }
}

/** Fréquence de rafraîchissement d'une liste de matchs selon leur état. */
export function liveInterval(games: { state: string; date: string }[]): number {
  if (games.some((g) => g.state === 'in')) return 15_000
  const soon = games.some(
    (g) => g.state === 'pre' && new Date(g.date).getTime() - Date.now() < 30 * 60_000,
  )
  return soon ? 30_000 : 120_000
}
