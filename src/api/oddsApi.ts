// The Odds API (the-odds-api.com) : cotes réelles des bookmakers français.
// La clé est personnelle, saisie dans l'app et gardée sur l'appareil.
// Une actualisation coûte 3 crédits (3 marchés × 1 région) sur les 500 gratuits par mois :
// les cotes sont donc mises en cache 6 h, avec actualisation manuelle possible.

import { useEffect, useSyncExternalStore } from 'react'
import type { Game, Odds } from './espn'
import { createStore, oddsSettings, useOddsSettings } from '../lib/store'

const ENDPOINT = 'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/'
const CACHE_TTL = 6 * 3600_000
const RETRY_AFTER_ERROR = 15 * 60_000
export const CREDITS_PER_REFRESH = 3

export const BOOKMAKERS = [
  { key: 'winamax_fr', name: 'Winamax' },
  { key: 'betclic_fr', name: 'Betclic' },
  { key: 'unibet_fr', name: 'Unibet' },
  { key: 'pmu_fr', name: 'PMU' },
  { key: 'netbet_fr', name: 'NetBet' },
]

/** Cotes d'un bookmaker pour un match, déjà réduites à ce que l'app affiche. */
interface BookOdds {
  updatedAt: string
  h2h?: { home?: number; away?: number }
  spreads?: { home?: number; away?: number; homeOdds?: number; awayOdds?: number }
  totals?: { line?: number; over?: number; under?: number }
}

interface OddsEvent {
  time: string
  home: string
  away: string
  books: Record<string, BookOdds>
}

interface Cache {
  apiKey: string
  events: OddsEvent[]
  fetchedAt?: number
  remaining?: number
  used?: number
  error?: string
  errorAt?: number
}

const cache = createStore<Cache>('superfan:odds-cache', { apiKey: '', events: [] })

// Chargement en cours : simple état en mémoire.
let loading = false
const loadingListeners = new Set<() => void>()
function setLoading(on: boolean) {
  loading = on
  loadingListeners.forEach((l) => l())
}
const subscribeLoading = (l: () => void) => {
  loadingListeners.add(l)
  return () => loadingListeners.delete(l)
}

type J = any

// La réponse est volumineuse : on ne garde que les 3 marchés affichés, pour chaque bookmaker.
function compact(raw: J[]): OddsEvent[] {
  return raw.map((e) => {
    const books: Record<string, BookOdds> = {}
    for (const b of e.bookmakers ?? []) {
      const market = (k: string) => (b.markets ?? []).find((m: J) => m.key === k)?.outcomes ?? []
      const side = (outcomes: J[], team: string) => outcomes.find((o: J) => o.name === team)
      const h2h = market('h2h')
      const spreads = market('spreads')
      const totals = market('totals')
      const over = totals.find((o: J) => o.name === 'Over')
      const under = totals.find((o: J) => o.name === 'Under')
      books[b.key] = {
        updatedAt: b.last_update,
        h2h: h2h.length ? { home: side(h2h, e.home_team)?.price, away: side(h2h, e.away_team)?.price } : undefined,
        spreads: spreads.length
          ? {
              home: side(spreads, e.home_team)?.point,
              away: side(spreads, e.away_team)?.point,
              homeOdds: side(spreads, e.home_team)?.price,
              awayOdds: side(spreads, e.away_team)?.price,
            }
          : undefined,
        totals: totals.length ? { line: over?.point ?? under?.point, over: over?.price, under: under?.price } : undefined,
      }
    }
    return { time: e.commence_time, home: e.home_team, away: e.away_team, books }
  })
}

function errorMessage(status: number, body: J): string {
  switch (body?.error_code) {
    case 'INVALID_KEY':
    case 'MISSING_KEY':
      return 'Clé API invalide : vérifiez-la sur the-odds-api.com.'
    case 'OUT_OF_USAGE_CREDITS':
      return 'Crédits du mois épuisés : les cotes ESPN restent affichées.'
    case 'EXCEEDED_FREQ_LIMIT':
      return 'Trop de requêtes rapprochées, réessayez dans un instant.'
  }
  return body?.message ?? `Erreur ${status}`
}

let inflight = false

/** Recharge les cotes si le cache est périmé (ou tout de suite avec `force`). */
export async function refreshOdds(force = false) {
  const { apiKey } = oddsSettings.get()
  const c = cache.get()
  if (!apiKey || inflight) return
  const sameKey = c.apiKey === apiKey
  if (!force && sameKey && c.fetchedAt && Date.now() - c.fetchedAt < CACHE_TTL) return
  if (!force && sameKey && c.errorAt && Date.now() - c.errorAt < RETRY_AFTER_ERROR) return

  inflight = true
  setLoading(true)
  try {
    const qs = new URLSearchParams({ apiKey, regions: 'fr', markets: 'h2h,spreads,totals', oddsFormat: 'decimal' })
    const res = await fetch(`${ENDPOINT}?${qs}`, { cache: 'no-store' })
    const quota = {
      remaining: Number(res.headers.get('x-requests-remaining') ?? NaN),
      used: Number(res.headers.get('x-requests-used') ?? NaN),
    }
    const known = (n: number, fallback?: number) => (Number.isFinite(n) ? n : fallback)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      cache.set({
        ...c,
        apiKey,
        events: sameKey ? c.events : [],
        error: errorMessage(res.status, body),
        errorAt: Date.now(),
        remaining: known(quota.remaining, c.remaining),
      })
      return
    }
    cache.set({
      apiKey,
      events: compact(await res.json()),
      fetchedAt: Date.now(),
      remaining: known(quota.remaining),
      used: known(quota.used),
    })
  } catch (e) {
    cache.set({
      ...c,
      apiKey,
      events: sameKey ? c.events : [],
      error: navigator.onLine ? (e as Error).message : 'Pas de connexion internet',
      errorAt: Date.now(),
    })
  } finally {
    inflight = false
    setLoading(false)
  }
}

export function forgetOddsCache() {
  cache.set({ apiKey: '', events: [] })
}

/** État des cotes pour l'écran de réglages. */
export function useOddsStatus() {
  const c = useSyncExternalStore(cache.subscribe, cache.get)
  const isLoading = useSyncExternalStore(subscribeLoading, () => loading)
  return { ...c, loading: isLoading }
}

// "Los Angeles Clippers" (The Odds API) et "LA Clippers" (ESPN) → "clippers" : les surnoms NBA sont uniques.
const nickname = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase()

function findEvent(events: OddsEvent[], game: Game): OddsEvent | undefined {
  const home = nickname(game.home.team.displayName)
  const away = nickname(game.away.team.displayName)
  const t = Date.parse(game.date)
  return events.find(
    (e) => nickname(e.home) === home && nickname(e.away) === away && Math.abs(Date.parse(e.time) - t) < 36 * 3600_000,
  )
}

function toOdds(e: OddsEvent, preferred: string): Odds | undefined {
  const order = [preferred, ...BOOKMAKERS.map((b) => b.key)].filter((k) => k !== 'best')
  const key = order.find((k) => e.books[k]?.h2h || e.books[k]?.spreads)
  if (!key) return undefined
  const book = e.books[key]
  const name = (k: string) => BOOKMAKERS.find((b) => b.key === k)?.name ?? k

  let moneyline = book.h2h
  let provider = name(key)
  let short = provider
  if (preferred === 'best') {
    // Meilleure cote de chaque équipe parmi tous les bookmakers (handicap et total : premier disponible).
    const all = Object.values(e.books).flatMap((b) => (b.h2h ? [b.h2h] : []))
    const best = (pick: (h: NonNullable<BookOdds['h2h']>) => number | undefined) => {
      const prices = all.map(pick).filter((p): p is number => p != null)
      return prices.length ? Math.max(...prices) : undefined
    }
    if (all.length) {
      moneyline = { home: best((h) => h.home), away: best((h) => h.away) }
      provider = `meilleure cote (${all.length} bookmaker${all.length > 1 ? 's' : ''})`
      short = 'Meilleures cotes'
    }
  }
  return {
    source: 'oddsapi',
    provider,
    short,
    updatedAt: book.updatedAt,
    moneyline,
    spread: book.spreads,
    total: book.totals,
  }
}

/**
 * Cotes à afficher pour un match : bookmaker français si une clé The Odds API est configurée
 * et que le match est trouvé, sinon `fallback` (cotes ESPN).
 */
export function useGameOdds(game: Game, fallback?: Odds): Odds | undefined {
  const { settings } = useOddsSettings()
  const c = useSyncExternalStore(cache.subscribe, cache.get)
  const wanted = !!settings.apiKey && game.state === 'pre'

  useEffect(() => {
    if (wanted) refreshOdds()
  }, [wanted])

  if (!settings.apiKey || c.apiKey !== settings.apiKey) return fallback
  const event = findEvent(c.events, game)
  return (event && toOdds(event, settings.bookmaker)) ?? fallback
}
