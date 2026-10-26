import { historyPoints, monthOf, record, winProb, type GameIn } from '../lib/eloCore'
import { applyPlayerGame, PLAYER_DEFAULTS, ratingNow, teamStrength, type PlayerElo, type PlayerGameIn, type PlayerLine, type PlayerParams } from '../lib/playerEloCore'
import { finalsSince } from './eloFeed'
import { getJson, SITE } from './espn'
import { fetchInjuries, type Absence } from './injuries'

// Elo des joueurs, et des équipes à partir de leurs joueurs. Le calcul sur tous les box scores depuis 2013-14 est fait
// une fois par scripts/build-elo.mjs (public/elo.json) ; l'appli ajoute les matchs joués depuis (un box score par match)
// et garde le résultat sur l'appareil. La force d'une équipe retire les joueurs absents d'après le rapport des blessés.

type Row = [r: number, n: number, min: number, w: number, l: number, last: number, season: number, peak: number, team: string]
/** Match récent : jour, variation de chaque joueur, variation des deux équipes, équipes. */
type Recent = [day: number, deltas: Record<string, number>, dh: number, da: number, home: string, away: string]

interface Snapshot {
  v: number
  builtAt: string
  until: string
  season: number
  params: PlayerParams
  quality: { logloss: number; accuracy: number; n: number; allAccuracy: number }
  /** Points d'écart au score attendus par point d'Elo d'écart. */
  ptsPerElo: number
  games: number
  first: string
  eloSeason: number
  mean: number
  players: Record<string, Row>
  names: Record<string, string>
  /** Abréviation, nom et logo de chaque équipe. */
  info: Record<string, [string, string, string]>
  history: Record<string, number[]>
  /** Rotation de chaque équipe : minutes attendues de chaque joueur. */
  rot: Record<string, Record<string, number>>
  teamHistory: Record<string, number[]>
  recent: Record<string, Recent>
}

/** Ce qui change quand on ajoute des matchs (gardé sur l'appareil). */
type Work = Pick<Snapshot, 'until' | 'eloSeason' | 'mean' | 'players' | 'names' | 'history' | 'rot' | 'teamHistory' | 'recent'> & { added: number }

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
  /** Place parmi les joueurs dont le dernier match est de la même saison (au moins 20 matchs en carrière). */
  rank?: number
  /** Variation sur les 30 derniers jours. */
  delta: number
  /** Absent d'après le rapport des blessés. */
  out: boolean
}

export interface EloTeam {
  id: string
  abbr: string
  name: string
  logo: string
  /** Force du moment : moyenne des notes de la rotation, pondérée par les minutes attendues, sans les absents. */
  rating: number
  /** Même chose avec tout l'effectif. */
  full: number
  rank: number
  /** Variation sur les 30 derniers jours (somme des variations de ses matchs). */
  delta: number
  /** Joueurs de la rotation absents, du plus utilisé au moins utilisé. */
  absents: { id: string; name: string; minutes: number; rating: number }[]
}

export interface Elo {
  players: EloPlayer[]
  byId: Map<string, EloPlayer>
  teams: EloTeam[]
  teamById: Map<string, EloTeam>
  params: PlayerParams
  quality: Snapshot['quality']
  ptsPerElo: number
  /** Force moyenne des 30 équipes (l'« équipe moyenne »). */
  teamMean: number
  until: string
  first: string
  games: number
  added: number
  /** Le rapport des blessés a pu être chargé. */
  injuries: boolean
  /** Matchs récents (environ 2 mois) : variation de chaque joueur et des deux équipes. */
  recent: Map<string, { players: Record<string, number>; home: number; away: number }>
  /** Note en fin de mois : [mois depuis janvier 2000, note], jusqu'à aujourd'hui. */
  history: Map<string, [number, number][]>
  teamHistory: Map<string, [number, number][]>
  /** Chance qu'a l'équipe à domicile de gagner, d'après la force du moment des deux équipes. */
  prob: (homeId: string, awayId: string, neutral?: boolean) => number | undefined
}

const DAY = 86_400_000
const KEY = 'elo-v2'
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
    // Anciens caches (Elo des équipes et des joueurs séparés) : plus utilisés.
    localStorage.removeItem('elo-teams-v1')
    localStorage.removeItem('elo-players-v1')
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

function stateOf(work: Work): PlayerElo {
  const elo: PlayerElo = { players: {}, rot: work.rot, season: work.eloSeason, mean: work.mean }
  for (const [id, [r, n, min, w, l, last, season, peak, team]] of Object.entries(work.players)) elo.players[id] = { r, n, min, w, l, last, season, peak, team }
  return elo
}

/** Ajoute des matchs (`work` est modifié sur place) ; renvoie l'état obtenu. */
function addGames(work: Work, games: PlayerGameIn[], params: PlayerParams): PlayerElo {
  const elo = stateOf(work)
  for (const g of games) {
    if (work.recent[g.id]) continue
    const deltas: Record<string, number> = {}
    const { dh, da } = applyPlayerGame(elo, g, params, deltas)
    const m = monthOf(g.t)
    for (const id in deltas) {
      record(work.history, id, m, elo.players[id].r)
      deltas[id] = r1(deltas[id])
    }
    for (const team of [g.home, g.away]) record(work.teamHistory, team, m, teamStrength(elo, team, params) ?? elo.mean)
    work.recent[g.id] = [Math.floor(g.t / DAY), deltas, r1(dh), r1(da), g.home, g.away]
    work.added++
  }
  for (const [id, s] of Object.entries(elo.players)) work.players[id] = [r1(s.r), s.n, s.min, s.w, s.l, s.last, s.season, r1(s.peak), s.team]
  work.rot = elo.rot
  work.eloSeason = elo.season
  work.mean = elo.mean
  const old = Math.floor(Date.now() / DAY) - 60
  for (const [id, x] of Object.entries(work.recent)) if (x[0] < old) delete work.recent[id]
  return elo
}

/** Box scores des matchs, 4 à la fois ; un box score introuvable fait sauter son match. */
async function withBoxes(games: GameIn[], names: Record<string, string>): Promise<PlayerGameIn[]> {
  const out: (PlayerGameIn | undefined)[] = []
  for (let i = 0; i < games.length; i += 4) {
    const part = await Promise.all(
      games.slice(i, i + 4).map(async (g) => {
        try {
          const box = await boxOf(g.id)
          Object.assign(names, box.names)
          const h = box.teams[g.home]
          const a = box.teams[g.away]
          return h?.length && a?.length ? { ...g, h, a } : undefined
        } catch {
          return undefined
        }
      }),
    )
    out.push(...part)
  }
  return out.filter((g): g is PlayerGameIn => !!g)
}

async function build(): Promise<Elo> {
  const res = await fetch(`${import.meta.env.BASE_URL}elo.json`)
  if (!res.ok) throw new Error('Elo indisponible.')
  const snap = (await res.json()) as Snapshot
  const params = snap.params ?? PLAYER_DEFAULTS
  const work: Work =
    readCache(snap) ??
    structuredClone({
      until: snap.until,
      eloSeason: snap.eloSeason,
      mean: snap.mean,
      players: snap.players,
      names: snap.names,
      history: snap.history,
      rot: snap.rot,
      teamHistory: snap.teamHistory,
      recent: snap.recent,
      added: 0,
    })

  const injuries = fetchInjuries().catch((): Absence[] | undefined => undefined)
  let days: Awaited<ReturnType<typeof finalsSince>> = []
  try {
    days = await finalsSince(work.until)
  } catch {
    /* hors-ligne : on garde les notes déjà calculées */
  }
  // Journées finies : gardées sur l'appareil. Journée en cours : ajoutée seulement pour l'affichage.
  const done = days.filter((d) => d.complete)
  if (done.length) {
    addGames(work, await withBoxes(done.flatMap((d) => d.games), work.names), params)
    work.until = done[done.length - 1].day
    writeCache(snap, work)
  }
  const shown = structuredClone(work)
  const elo = addGames(shown, await withBoxes(days.filter((d) => !d.complete).flatMap((d) => d.games), shown.names), params)

  const absences = await injuries
  const out = new Set((absences ?? []).filter((a) => a.status === 'Out').map((a) => a.playerId))

  const monthAgo = Math.floor(Date.now() / DAY) - 30
  const delta: Record<string, number> = {}
  for (const [day, deltas, dh, da, home, away] of Object.values(shown.recent)) {
    if (day < monthAgo) continue
    for (const [id, d] of Object.entries(deltas)) delta[id] = (delta[id] ?? 0) + d
    delta[`t${home}`] = (delta[`t${home}`] ?? 0) + dh
    delta[`t${away}`] = (delta[`t${away}`] ?? 0) + da
  }

  const players: EloPlayer[] = Object.entries(shown.players)
    .map(([id, [r, n, min, w, l, , season, peak, team]]) => ({
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
      delta: delta[id] ?? 0,
      out: out.has(id),
    }))
    .sort((a, b) => b.rating - a.rating)
  const counted = new Map<number, number>()
  for (const p of players) {
    if (p.games < 20) continue
    const k = (counted.get(p.season) ?? 0) + 1
    counted.set(p.season, k)
    p.rank = k
  }
  const byId = new Map(players.map((p) => [p.id, p]))

  const teams: EloTeam[] = Object.entries(snap.info)
    .map(([id, [abbr, name, logo]]) => {
      const full = teamStrength(elo, id, params)
      if (full === undefined) return undefined
      const absents = Object.entries(elo.rot[id] ?? {})
        .filter(([pid]) => out.has(pid) && elo.players[pid]?.team === id)
        .sort((a, b) => b[1] - a[1])
        .map(([pid, minutes]) => ({ id: pid, name: shown.names[pid] ?? pid, minutes, rating: ratingNow(elo, elo.players[pid], params) }))
      return { id, abbr, name, logo, rating: teamStrength(elo, id, params, out) ?? full, full, rank: 0, delta: delta[`t${id}`] ?? 0, absents }
    })
    .filter((t): t is EloTeam => !!t)
    .sort((a, b) => b.rating - a.rating)
  teams.forEach((t, i) => (t.rank = i + 1))
  const teamById = new Map(teams.map((t) => [t.id, t]))

  const nowMonth = monthOf(Date.now())
  const points = (h: number[] | undefined, now: number) => {
    const out = historyPoints(h)
    if (out.length && out[out.length - 1][0] < nowMonth) out.push([nowMonth, Math.round(now)])
    return out
  }
  const history = new Map<string, [number, number][]>()
  for (const p of players) if (shown.history[p.id]) history.set(p.id, points(shown.history[p.id], p.rating))
  const teamHistory = new Map(teams.map((t) => [t.id, points(shown.teamHistory[t.id], t.full)]))

  return {
    players,
    byId,
    teams,
    teamById,
    params,
    quality: snap.quality,
    ptsPerElo: snap.ptsPerElo,
    teamMean: teams.reduce((a, t) => a + t.rating, 0) / (teams.length || 1),
    until: shown.until,
    first: snap.first,
    games: snap.games + shown.added,
    added: shown.added,
    injuries: !!absences,
    recent: new Map(Object.entries(shown.recent).map(([id, [, players, home, away]]) => [id, { players, home, away }])),
    history,
    teamHistory,
    prob: (h, a, neutral = false) => {
      const th = teamById.get(h)
      const ta = teamById.get(a)
      return th && ta ? winProb(th.rating - ta.rating + (neutral ? 0 : params.hca)) : undefined
    },
  }
}

let cache: { at: number; p: Promise<Elo> } | undefined

/** Elo à jour (gardé 10 minutes en mémoire, le temps que d'autres matchs se terminent). */
export function fetchElo(): Promise<Elo> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.p
  const p = build()
  cache = { at: Date.now(), p }
  p.catch(() => (cache = undefined))
  return p
}
