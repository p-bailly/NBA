// Course au MVP : probabilités du marché de prédiction Polymarket (API publique « gamma », CORS ouvert).
// Un événement par saison (slug « nba-2026-27-mvp »), un marché Oui/Non par joueur.

const GAMMA = 'https://gamma-api.polymarket.com'

export interface MvpCandidate {
  name: string
  /** Probabilité (0-1) que le joueur soit MVP. */
  prob: number
  /** Variation de la probabilité sur 7 jours (en points de 0-1). */
  weekChange?: number
  image?: string
}

export interface MvpRace {
  season: string
  url: string
  volume: number
  updatedAt?: string
  candidates: MvpCandidate[]
}

/** Année de début de la saison en cours (la saison régulière commence en octobre). */
function seasonStart(now = new Date()): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
}

const slugOf = (y: number) => `nba-${y}-${String((y + 1) % 100).padStart(2, '0')}-mvp`

async function fetchEvent(slug: string, signal?: AbortSignal) {
  const res = await fetch(`${GAMMA}/events?slug=${slug}`, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`Polymarket : erreur ${res.status}`)
  const list = await res.json()
  return Array.isArray(list) ? list[0] : undefined
}

export async function fetchMvpRace(signal?: AbortSignal): Promise<MvpRace> {
  const y = seasonStart()
  // En été, le marché de la saison suivante peut déjà exister ; sinon on garde la saison écoulée.
  let year = y
  let event = await fetchEvent(slugOf(y), signal)
  if (!event) {
    year = y - 1
    event = await fetchEvent(slugOf(year), signal)
  }
  if (!event) throw new Error('Aucun marché Polymarket pour le MVP de cette saison.')

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
  candidates.sort((a, b) => b.prob - a.prob)

  return {
    season: `${year}-${String((year + 1) % 100).padStart(2, '0')}`,
    url: `https://polymarket.com/event/${event.slug}`,
    volume: Number(event.volume) || 0,
    updatedAt: event.updatedAt,
    candidates,
  }
}
