import { useSyncExternalStore } from 'react'

// Petits stores persistés dans le navigateur (favoris, réglages d'alertes et de cotes).
// Tout reste sur l'appareil : l'app est pour un usage perso.

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

export function createStore<T extends object>(key: string, initial: T) {
  let value = load(key, initial)
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      value = next
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* stockage indisponible (navigation privée) : on garde en mémoire */
      }
      listeners.forEach((l) => l())
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

// ---------- Favoris ----------

const favorites = createStore<{ ids: string[] }>('superfan:favorites', { ids: [] })

export function useFavorites() {
  const { ids } = useSyncExternalStore(favorites.subscribe, favorites.get)
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) =>
      favorites.set({ ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }),
  }
}

export const getFavoriteIds = () => favorites.get().ids

// ---------- Alertes ----------

export interface AlertSettings {
  enabled: boolean
  favoritesOnly: boolean
  start: boolean
  clutch: boolean
  overtime: boolean
  final: boolean
}

const alerts = createStore<AlertSettings>('superfan:alerts', {
  enabled: false,
  favoritesOnly: true,
  start: true,
  clutch: true,
  overtime: true,
  final: true,
})

export function useAlertSettings() {
  const settings = useSyncExternalStore(alerts.subscribe, alerts.get)
  return { settings, update: (patch: Partial<AlertSettings>) => alerts.set({ ...settings, ...patch }) }
}

// ---------- Cotes (The Odds API) ----------

export interface OddsSettings {
  apiKey: string
  /** Clé du bookmaker affiché (ex. "winamax_fr"), ou "best" pour la meilleure cote. */
  bookmaker: string
}

export const oddsSettings = createStore<OddsSettings>('superfan:odds', { apiKey: '', bookmaker: 'winamax_fr' })

export function useOddsSettings() {
  const settings = useSyncExternalStore(oddsSettings.subscribe, oddsSettings.get)
  return { settings, update: (patch: Partial<OddsSettings>) => oddsSettings.set({ ...settings, ...patch }) }
}
