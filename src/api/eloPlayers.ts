import { historyPoints, monthOf, record } from '../lib/eloCore'
import { applyPlayerGame, PLAYER_DEFAULTS, type PlayerElo, type PlayerGameIn, type PlayerLine, type PlayerParams } from '../lib/playerEloCore'
import { finalsSince } from './eloFeed'
import { getJson, SITE } from './espn'

// Elo des joueurs. Calcul sur tous les box scores depuis 2013-14 par scripts/build-player-elo.mjs (public/elo-players.json) ;
// l'appli ajoute les matchs joués depuis (un box score par match) et garde le résultat sur l'appareil.

type Row = [r: number, n: number, min: number, w: number, l: number, last: number, season: number, peak: number, team: string]
/** Match récent : jour, et variation de chaque joueur. */
type Recent = [day: number, deltas: Record<string, number>]

interface Snapshot {
  v: number
  builtAt: string
  until: string
  season: number
  params: PlayerParams
  quality: { logloss: number; accuracy: number; n: number }
  games: number
  first: string
  /** Saison du calcul et moyenne des joueurs établis (retour vers la moyenne entre deux saisons). */
  eloSeason: number
  mean: number
  players: Record<string, Row>
  names: Record<string, string>
  info: Record<string, [string, string, string]>
  history: Record<string, number[]>
  recent: Record<string, Recent>
}

interface Work {
  until: string
  eloSeason: number
  mean: number
  players: Record<string, Row>
  names: Record<string, string>
  history: Record<string, number[]>
  recent: Record<string, Recent>
  added: number
}

export interface EloPlayer {
  id: string
  name: string
  /** Équipe du dernier match. */
  team: string
  rating: number
  games: number
  minutes: number
  wins: number
  losses: number
  peak: number
  season: number
  /** Dernier match, en millisecondes. */
  last: number
  /** Place parmi les joueurs de la saison en cours (sinon de la dernière saison jouée). */
  rank?: number
  /** Variation sur les 30 derniers jours. */
  delta: number
}

export interface PlayerEloData {
  players: EloPlayer[]
  byId: Map<string, EloPlayer>
  params: PlayerParams
  quality: Snapshot['quality']
  until: string
  first: string
  season: number
  games: number
  added: number
  info: Snapshot['info']
  /** Variation d'Elo de chaque joueur, par match récent (environ 2 mois). */
  recent: Map<string, Record<string, number>>
  history: Map<string, [number, number][]>
}

const DAY = 86_400_000
const KEY = 'elo-players-v1'
const r1 = (x: number) => Math.round(x * 10) / 10

/** Box score d'un match → joueurs de chaque équipe qui ont joué, et leurs noms. */
async function boxOf(id: string): Promise<{ teams: Record<string, PlayerLine[]>; names: Record<string, string> }> {
  const d = await getJson(`${SITE}/summary?event=${encodeURIComponent(id)}`)
  const out = { teams: {} as Record<string, PlayerLine[]>, names: {} as Record<string, string> }
  for (const p of d.boxscore?.players ?? []) {
    const block = p.statistics?.[0] ?? {}
    const keys: string[] = block.keys ?? []
    const iMin = keys.indexOf('minutes')
    const iPm = keys.indexOf('plusMinus')
    const lines: PlayerLine[] = []
    for (const a of block.athletes ?? []) {
      const pid = String(a.athlete?.id ?? '')
      const min = Number(a.stats?.[iMin])
      if (!pid || a.didNotPlay || !(min > 0)) continue
      const pm = iPm >= 0 ? Number(String(a.stats[iPm]).replace('+', '')) : NaN
      lines.push({ id: pid, min, pm: Number.isFinite(pm) ? pm : null })
      out.names[pid] = String(a.athlete?.displayName ?? '')
    }
    out.teams[String(p.team?.id)] = lines
  }
  return out
}

function readCache(snap: Snapshot): Work | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (c?.base === snap.builtAt && c.work?.until > snap.until) return c.work as Work
  } catch {
    /* cache illisible */
  }
  return undefined
}

function writeCache(snap: Snapshot, work: Work) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ base: snap.builtAt, work }))
  } catch {
    /* stockage plein ou indisponible */
  }
}

function addGames(work: Work, games: PlayerGameIn[], params: PlayerParams) {
  const elo: PlayerElo = { players: {}, season: work.eloSeason, mean: work.mean }
  for (const [id, [r, n, min, w, l, last, season, peak, team]] of Object.entries(work.players)) elo.players[id] = { r, n, min, w, l, last, season, peak, team }
  for (const g of games) {
    if (work.recent[g.id]) continue
    const deltas: Record<string, number> = {}
    applyPlayerGame(elo, g, params, deltas)
    const m = monthOf(g.t)
    for (const id in deltas) {
      record(work.history, id, m, elo.players[id].r)
      deltas[id] = r1(deltas[id])
    }
    work.recent[g.id] = [Math.floor(g.t / DAY), deltas]
    work.added++
  }
  for (const [id, s] of Object.entries(elo.players)) work.players[id] = [r1(s.r), s.n, s.min, s.w, s.l, s.last, s.season, r1(s.peak), s.team]
  work.eloSeason = elo.season
  work.mean = elo.mean
  const old = Math.floor(Date.now() / DAY) - 60
  for (const [id, x] of Object.entries(work.recent)) if (x[0] < old) delete work.recent[id]
}

/** Box scores des matchs, 4 à la fois ; un box score introuvable fait sauter son match. */
async function withBoxes(games: { id: string }[], names: Record<string, string>): Promise<PlayerGameIn[]> {
  const out: (PlayerGameIn | undefined)[] = []
  for (let i = 0; i < games.length; i += 4) {
    const part = await Promise.all(
      games.slice(i, i + 4).map(async (g) => {
        const gi = g as Omit<PlayerGameIn, 'h' | 'a'>
        try {
          const box = await boxOf(gi.id)
          Object.assign(names, box.names)
          const h = box.teams[gi.home]
          const a = box.teams[gi.away]
          return h?.length && a?.length ? { ...gi, h, a } : undefined
        } catch {
          return undefined
        }
      }),
    )
    out.push(...part)
  }
  return out.filter((g): g is PlayerGameIn => !!g)
}

async function build(): Promise<PlayerEloData> {
  const res = await fetch(`${import.meta.env.BASE_URL}elo-players.json`)
  if (!res.ok) throw new Error('Elo des joueurs indisponible.')
  const snap = (await res.json()) as Snapshot
  const params = snap.params ?? PLAYER_DEFAULTS
  const work: Work =
    readCache(snap) ??
    structuredClone({ until: snap.until, eloSeason: snap.eloSeason, mean: snap.mean, players: snap.players, names: snap.names, history: snap.history, recent: snap.recent, added: 0 })

  let days: Awaited<ReturnType<typeof finalsSince>> = []
  try {
    days = await finalsSince(work.until)
  } catch {
    /* hors-ligne */
  }
  const done = days.filter((d) => d.complete)
  if (done.length) {
    const games = await withBoxes(done.flatMap((d) => d.games), work.names)
    addGames(work, games, params)
    work.until = done[done.length - 1].day
    writeCache(snap, work)
  }
  const shown = structuredClone(work)
  addGames(shown, await withBoxes(days.filter((d) => !d.complete).flatMap((d) => d.games), shown.names), params)

  const monthAgo = Math.floor(Date.now() / DAY) - 30
  const delta: Record<string, number> = {}
  for (const [day, deltas] of Object.values(shown.recent)) {
    if (day < monthAgo) continue
    for (const [id, d] of Object.entries(deltas)) delta[id] = (delta[id] ?? 0) + d
  }
  const players: EloPlayer[] = Object.entries(shown.players)
    .map(([id, [r, n, min, w, l, last, season, peak, team]]) => ({
      id,
      name: shown.names[id] ?? id,
      team,
      rating: r,
      games: n,
      minutes: min,
      wins: w,
      losses: l,
      peak,
      season,
      last: last * DAY,
      delta: delta[id] ?? 0,
    }))
    .sort((a, b) => b.rating - a.rating)
  // Rang parmi les joueurs dont le dernier match est de la même saison (au moins 20 matchs en carrière).
  const counted = new Map<number, number>()
  for (const p of players) {
    if (p.games < 20) continue
    const k = (counted.get(p.season) ?? 0) + 1
    counted.set(p.season, k)
    p.rank = k
  }
  const nowMonth = monthOf(Date.now())
  const history = new Map<string, [number, number][]>()
  for (const p of players) {
    const h = historyPoints(shown.history[p.id])
    if (!h.length) continue
    if (h[h.length - 1][0] < nowMonth) h.push([nowMonth, Math.round(p.rating)])
    history.set(p.id, h)
  }

  return {
    players,
    byId: new Map(players.map((p) => [p.id, p])),
    params,
    quality: snap.quality,
    until: shown.until,
    first: snap.first,
    season: Math.max(snap.season, shown.eloSeason),
    games: snap.games + shown.added,
    added: shown.added,
    info: snap.info,
    recent: new Map(Object.entries(shown.recent).map(([id, [, d]]) => [id, d])),
    history,
  }
}

let cache: { at: number; p: Promise<PlayerEloData> } | undefined

/** Elo des joueurs à jour (gardé 10 minutes en mémoire). */
export function fetchPlayerElo(): Promise<PlayerEloData> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.p
  const p = build()
  cache = { at: Date.now(), p }
  p.catch(() => (cache = undefined))
  return p
}
