import { useEffect, useState } from 'react'
import { fetchElo, type Elo } from '../api/elo'
import { fetchPlayerElo, type PlayerEloData } from '../api/eloPlayers'

// L'Elo est chargé une seule fois pour tout l'écran, puis partagé par les cartes de match, les fiches…
function shared<T>(fetcher: () => Promise<T>) {
  let data: T | undefined
  let loading = false
  let at = 0
  const listeners = new Set<() => void>()
  const load = () => {
    if (loading || (data && Date.now() - at < 10 * 60_000)) return
    loading = true
    fetcher()
      .then((d) => {
        data = d
        at = Date.now()
        listeners.forEach((l) => l())
      })
      .catch(() => {
        /* pas d'Elo : les cartes s'affichent sans */
      })
      .finally(() => {
        loading = false
      })
  }
  return function useShared(): T | undefined {
    const [, set] = useState(0)
    useEffect(() => {
      const l = () => set((n) => n + 1)
      listeners.add(l)
      load()
      return () => void listeners.delete(l)
    }, [])
    return data
  }
}

/** Elo des équipes, ou rien tant qu'il n'est pas chargé (ou s'il est indisponible). */
export const useElo: () => Elo | undefined = shared(fetchElo)

/** Elo des joueurs, ou rien tant qu'il n'est pas chargé. */
export const usePlayerElo: () => PlayerEloData | undefined = shared(fetchPlayerElo)
