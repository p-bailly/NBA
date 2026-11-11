// Course au MVP : probabilité que chaque joueur soit élu MVP de la saison régulière.
// 1. Polymarket (marché de prédiction, API publique « gamma », CORS ouvert) : bloqué en France (ANJ), la requête y
//    échoue (« Failed to fetch ») ; on n'attend pas plus de 5 s et on ne réessaie qu'au bout d'une heure.
// 2. À défaut, les cotes DraftKings servies par ESPN (« futures »), converties en probabilités sans la marge du bookmaker.

import { getJson } from './espn'

export interface MvpCandidate {
  name: string
  /** Probabilité (0-1) que le joueur soit MVP. */
  prob: number
  /** Variation de la probabilité sur 7 jours (Polymarket seulement). */
  weekChange?: number
  /** Id ESPN du joueur, quand la source le donne. */
  athleteId?: string
  teamId?: string
  image?: string
}

export interface MvpRace {
  source: 'polymarket' | 'draftkings'
  season: string
  url?: string
  /** Volume échangé en $ (Polymarket). */
  volume?: number
  candidates: MvpCandidate[]
}

/** Année de début de la saison en cours (la saison régulière commence en octobre). */
function seasonStart(now = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}
const seasonLabel = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`

// ---------- Polymarket ----------

const GAMMA = 'https://gamma-api.polymarket.com'
const RETRY_AFTER = 60 * 60_000
let polymarketFailedAt = 0

async function fetchJsonTimeout(url: string, signal: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController()
  const abort = () => ctrl.abort()
  signal?.addEventListener('abort', abort)
  const timer = setTimeout(abort, ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`Erreur ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

async function fromPolymarket(signal?: AbortSignal): Promise<MvpRace | undefined> {
  const slugOf = (y: number) => `nba-${seasonLabel(y)}-mvp`
  const y = seasonStart()
  // En été, le marché de la saison suivante peut déjà exister ; sinon on garde la saison écoulée.
  for (const year of [y, y - 1]) {
    const list = await fetchJsonTimeout(`${GAMMA}/events?slug=${slugOf(year)}`, signal, 5000)
    const event = Array.isArray(list) ? list[0] : undefined
    if (!event) continue
    const candidates: MvpCandidate[] = []
    for (const m of event.markets ?? []) {
      // Les marchés « Player B », « Other »… sont des réserves inactives.
      if (!m.active || m.closed || !m.groupItemTitle) continue
      let prob: number
      try {
        prob = Number(JSON.parse(m.outcomePrices)[0])
      } catch {
        continue
      }
      if (!Number.isFinite(prob)) continue
      candidates.push({
        name: m.groupItemTitle,
        prob,
        weekChange: typeof m.oneWeekPriceChange === 'number' ? m.oneWeekPriceChange : undefined,
        image: m.image || m.icon || undefined,
      })
    }
    if (!candidates.length) continue
    return {
      source: 'polymarket',
      season: seasonLabel(year),
      url: `https://polymarket.com/event/${event.slug}`,
      volume: Number(event.volume) || 0,
      candidates,
    }
  }
  return undefined
}

// ---------- Cotes DraftKings via ESPN ----------

const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba'
// Les liens « $ref » d'ESPN sont en http : la WebView les refuserait (contenu mixte).
const https = (u: string) => u.replace(/^http:/, 'https:')
/** Cote américaine (« +145 », « -120 ») → probabilité implicite, marge comprise. */
function implied(american: string): number | undefined {
  const o = Number(american.replace('+', ''))
  if (!Number.isFinite(o) || o === 0) return undefined
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100)
}

const athletes = new Map<string, Promise<{ name: string; teamId?: string; image?: string }>>()
function athlete(ref: string, signal?: AbortSignal) {
  const id = ref.match(/athletes\/(\d+)/)?.[1] ?? ref
  let p = athletes.get(id)
  if (!p) {
    p = getJson(https(ref), signal).then((a) => ({
      name: a.displayName ?? a.fullName ?? '',
      teamId: a.team?.$ref?.match(/teams\/(\d+)/)?.[1],
      image: a.headshot?.href,
    }))
    p.catch(() => athletes.delete(id))
    athletes.set(id, p)
  }
  return p.then((a) => ({ ...a, athleteId: id }))
}

const SHOWN = 25

async function fromDraftKings(signal?: AbortSignal): Promise<MvpRace> {
  const y = seasonStart()
  // ESPN numérote une saison par l'année de sa fin (2026-27 → 2027).
  const d = await getJson(`${CORE}/seasons/${y + 1}/futures?limit=100`, signal)
  const future = (d.items ?? []).find((f: { name?: string }) => /regular season mvp/i.test(f.name ?? ''))
  const books: { athlete?: { $ref?: string }; value?: string }[] = future?.futures?.[0]?.books ?? []
  const odds = books
    .map((b) => ({ ref: b.athlete?.$ref, p: implied(b.value ?? '') }))
    .filter((b): b is { ref: string; p: number } => !!b.ref && b.p !== undefined)
  if (!odds.length) throw new Error('Pas de cotes pour le MVP de cette saison.')
  // On retire la marge du bookmaker : les probabilités sont ramenées à un total de 100 %.
  const total = odds.reduce((s, o) => s + o.p, 0)
  odds.sort((a, b) => b.p - a.p)
  const candidates = await Promise.all(
    odds.slice(0, SHOWN).map(async (o) => ({ ...(await athlete(o.ref, signal)), prob: o.p / total })),
  )
  return { source: 'draftkings', season: seasonLabel(y), candidates }
}

export async function fetchMvpRace(signal?: AbortSignal): Promise<MvpRace> {
  if (Date.now() - polymarketFailedAt > RETRY_AFTER) {
    try {
      const race = await fromPolymarket(signal)
      if (race) {
        race.candidates.sort((a, b) => b.prob - a.prob)
        return race
      }
    } catch (e) {
      if (signal?.aborted) throw e
      polymarketFailedAt = Date.now()
    }
  }
  return fromDraftKings(signal)
}
