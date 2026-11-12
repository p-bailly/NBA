// Stats de saison de tous les joueurs, pour les classements « Per 36 », « Stats avancées » et « +/- ».
// - Totaux de chaque joueur : un seul appel à `statistics/byathlete` (CORS ouvert sur site.api.espn.com).
// - +/- et PER : absents de cette liste, ils viennent de la fiche statistique de chaque joueur
//   (`sports.core.api.espn.com`), chargée seulement pour les joueurs classés.
import { getJson, parseTeam, seenTeam, type Team } from './espn'

type J = any

const BY_ATHLETE = 'https://site.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete'
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba'

export interface PlayerSeason {
  id: string
  name: string
  shortName: string
  position: string
  headshot?: string
  team?: Team
  gp: number
  /** Totaux de la saison. */
  min: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  pf: number
  fgm: number
  fga: number
  tpm: number
  tpa: number
  ftm: number
  fta: number
  /** Usage : part des possessions de son équipe qu'il termine (tir, lancers, balle perdue) quand il joue, en %. */
  usg: number
  /** Assez de matchs et de minutes pour être classé. */
  qualified: boolean
}

export interface PlayerStats {
  season: string
  year: number
  type: number
  players: PlayerSeason[]
}

// Dernière réponse, réutilisée 10 minutes d'un onglet de classement à l'autre.
let last: { at: number; data: PlayerStats } | undefined

export async function fetchPlayerStats(signal?: AbortSignal): Promise<PlayerStats> {
  if (last && Date.now() - last.at < 10 * 60_000) return last.data
  const d = await getJson(`${BY_ATHLETE}?region=us&lang=en&isqualified=false&page=1&limit=1000`, signal)
  // Les valeurs de chaque catégorie sont alignées sur les noms donnés en tête de réponse.
  const names = new Map<string, string[]>((d.categories ?? []).map((c: J) => [String(c.name), c.names ?? []]))

  const players: PlayerSeason[] = (d.athletes ?? []).map((row: J) => {
    const v: Record<string, number> = {}
    for (const c of row.categories ?? []) {
      const keys = names.get(String(c.name)) ?? []
      keys.forEach((k, i) => (v[k] = Number(c.values?.[i]) || 0))
    }
    const a = row.athlete ?? {}
    const teamId = a.teamId ? String(a.teamId) : undefined
    return {
      id: String(a.id ?? ''),
      name: String(a.displayName ?? ''),
      shortName: String(a.shortName || a.displayName || ''),
      position: String(a.position?.abbreviation ?? ''),
      headshot: a.headshot?.href,
      team: (teamId && seenTeam(teamId)) || (a.teams?.[0] ? parseTeam(a.teams[0]) : undefined),
      gp: v.gamesPlayed ?? 0,
      min: v.minutes ?? 0,
      pts: v.points ?? 0,
      reb: v.rebounds ?? 0,
      ast: v.assists ?? 0,
      stl: v.steals ?? 0,
      blk: v.blocks ?? 0,
      tov: v.turnovers ?? 0,
      pf: v.fouls ?? 0,
      fgm: v.fieldGoalsMade ?? 0,
      fga: v.fieldGoalsAttempted ?? 0,
      tpm: v.threePointFieldGoalsMade ?? 0,
      tpa: v.threePointFieldGoalsAttempted ?? 0,
      ftm: v.freeThrowsMade ?? 0,
      fta: v.freeThrowsAttempted ?? 0,
      usg: 0,
      qualified: false,
    }
  })

  // Usage (formule de Basketball-Reference) : les totaux d'équipe sont la somme de ceux de ses joueurs
  // (un joueur transféré compte entièrement pour son équipe actuelle : approximation).
  const teams = new Map<string, { min: number; poss: number }>()
  for (const p of players) {
    if (!p.team) continue
    const t = teams.get(p.team.id) ?? { min: 0, poss: 0 }
    t.min += p.min
    t.poss += p.fga + 0.44 * p.fta + p.tov
    teams.set(p.team.id, t)
  }
  // Classé : 70 % des matchs (du joueur qui en a joué le plus) et 15 min par match, sinon les stats
  // ramenées à 36 minutes de joueurs qui jouent peu n'ont pas de sens.
  const maxGp = Math.max(1, ...players.map((p) => p.gp))
  for (const p of players) {
    const t = p.team && teams.get(p.team.id)
    if (t && p.min && t.poss) p.usg = (100 * (p.fga + 0.44 * p.fta + p.tov) * (t.min / 5)) / (p.min * t.poss)
    p.qualified = p.gp >= Math.max(1, Math.round(0.7 * maxGp)) && p.min / Math.max(1, p.gp) >= 15
  }

  const data: PlayerStats = {
    season: String(d.requestedSeason?.displayName ?? ''),
    year: Number(d.requestedSeason?.year ?? new Date().getFullYear()),
    type: Number(d.requestedSeason?.type?.type ?? 2),
    players,
  }
  last = { at: Date.now(), data }
  return data
}

export interface CoreStats {
  plusMinus: number
  per: number
}

// Fiches déjà chargées (clé : saison/type/joueur), gardées 30 minutes.
const coreCache = new Map<string, { at: number; stats: CoreStats | null }>()
const CORE_TTL = 30 * 60_000

async function fetchCoreStats(year: number, type: number, id: string, signal?: AbortSignal): Promise<CoreStats | null> {
  const key = `${year}/${type}/${id}`
  const hit = coreCache.get(key)
  if (hit && Date.now() - hit.at < CORE_TTL) return hit.stats
  let stats: CoreStats | null = null
  try {
    const d = await getJson(`${CORE}/seasons/${year}/types/${type}/athletes/${id}/statistics/0?lang=en&region=us`, signal)
    const all = new Map<string, number>()
    for (const c of d.splits?.categories ?? []) for (const s of c.stats ?? []) all.set(String(s.name), Number(s.value))
    const pm = all.get('plusMinus')
    if (pm !== undefined && Number.isFinite(pm)) stats = { plusMinus: pm, per: all.get('PER') ?? NaN }
  } catch (e) {
    if (signal?.aborted) throw e
  }
  coreCache.set(key, { at: Date.now(), stats })
  return stats
}

/** +/- et PER des joueurs donnés (une requête par joueur, 8 à la fois). */
export async function fetchCoreStatsFor(
  year: number,
  type: number,
  ids: string[],
  signal?: AbortSignal,
): Promise<Map<string, CoreStats>> {
  const out = new Map<string, CoreStats>()
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      const s = await fetchCoreStats(year, type, id, signal)
      if (s) out.set(id, s)
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, ids.length) }, worker))
  if (ids.length && !out.size) throw new Error('Fiches des joueurs indisponibles')
  return out
}
