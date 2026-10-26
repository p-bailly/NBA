import { applyGame, DEFAULTS, historyPoints, homeProb, monthOf, record, type EloState, type GameIn, type Params } from '../lib/eloCore'
import { finalsSince } from './eloFeed'

// Elo des équipes. Le calcul sur tous les matchs depuis 2000-01 est fait une fois par scripts/build-elo.mjs et rangé
// dans public/elo.json ; l'appli n'y ajoute que les matchs joués depuis, et garde le résultat sur l'appareil.

type Row = [r: number, n: number, w: number, l: number, last: number, season: number, peak: number]
/** Match récent : variation de l'équipe à domicile et de l'équipe à l'extérieur, chance qu'avait l'équipe à domicile, équipes, jour. */
type Recent = [dh: number, da: number, ph: number, home: string, away: string, day: number]

interface Snapshot {
  v: number
  builtAt: string
  /** Dernière journée (américaine) prise en compte. */
  until: string
  season: number
  params: Params
  quality: { logloss: number; accuracy: number; n: number }
  games: number
  first: string
  teams: Record<string, Row>
  /** Abréviation, nom et logo de chaque équipe. */
  info: Record<string, [string, string, string]>
  /** Historique compact (voir `record`). */
  history: Record<string, number[]>
  recent: Record<string, Recent>
}

/** Ce qui change quand on ajoute des matchs (gardé sur l'appareil). */
interface Work {
  until: string
  teams: Record<string, Row>
  history: Record<string, number[]>
  recent: Record<string, Recent>
  added: number
}

export interface EloTeam {
  id: string
  abbr: string
  name: string
  logo: string
  rating: number
  games: number
  wins: number
  losses: number
  peak: number
  rank: number
  /** Variation sur les 30 derniers jours (somme des matchs joués). */
  delta: number
}

export interface Elo {
  teams: EloTeam[]
  byId: Map<string, EloTeam>
  params: Params
  quality: Snapshot['quality']
  builtAt: string
  until: string
  first: string
  /** Matchs pris en compte, et matchs ajoutés par l'appli depuis le calcul. */
  games: number
  added: number
  /** Matchs récents (environ 5 mois) : variation des deux équipes et chance qu'avait l'équipe à domicile. */
  recent: Map<string, { home: number; away: number; homeProb: number }>
  /** Note en fin de mois : [mois depuis janvier 2000, note], jusqu'à aujourd'hui. */
  history: Map<string, [number, number][]>
  /** Chance qu'a l'équipe à domicile de gagner, d'après les notes du moment. */
  prob: (homeId: string, awayId: string, neutral?: boolean) => number | undefined
}

const DAY = 86_400_000
const KEY = 'elo-teams-v1'
const r1 = (x: number) => Math.round(x * 10) / 10

function readCache(snap: Snapshot): Work | undefined {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (c?.base === snap.builtAt && c.work?.until > snap.until) return c.work as Work
  } catch {
    /* cache illisible : on repart du calcul */
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

/** Ajoute des matchs à l'état (les lignes sont modifiées sur place). */
function addGames(work: Work, games: GameIn[], params: Params) {
  const state: EloState = {}
  for (const [id, [r, n, w, l, last, season, peak]] of Object.entries(work.teams)) state[id] = { r, n, w, l, last, season, peak }
  for (const g of games) {
    if (work.recent[g.id]) continue
    const { ph, dh, da } = applyGame(state, g, params)
    const m = monthOf(g.t)
    record(work.history, g.home, m, state[g.home].r)
    record(work.history, g.away, m, state[g.away].r)
    work.recent[g.id] = [r1(dh), r1(da), Math.round(ph * 1000) / 1000, g.home, g.away, Math.floor(g.t / DAY)]
    work.added++
  }
  for (const [id, s] of Object.entries(state)) work.teams[id] = [r1(s.r), s.n, s.w, s.l, s.last, s.season, r1(s.peak)]
  const old = Math.floor(Date.now() / DAY) - 150
  for (const [id, x] of Object.entries(work.recent)) if (x[5] < old) delete work.recent[id]
}

async function build(): Promise<Elo> {
  const res = await fetch(`${import.meta.env.BASE_URL}elo.json`)
  if (!res.ok) throw new Error('Elo indisponible.')
  const snap = (await res.json()) as Snapshot
  const params = snap.params ?? DEFAULTS
  const work: Work = readCache(snap) ?? structuredClone({ until: snap.until, teams: snap.teams, history: snap.history, recent: snap.recent, added: 0 })

  let days: Awaited<ReturnType<typeof finalsSince>> = []
  try {
    days = await finalsSince(work.until)
  } catch {
    /* hors-ligne : on garde les notes déjà calculées */
  }
  // Journées finies : gardées sur l'appareil. Journée en cours : ajoutée seulement pour l'affichage.
  const done = days.filter((d) => d.complete)
  if (done.length) {
    addGames(work, done.flatMap((d) => d.games), params)
    work.until = done[done.length - 1].day
    writeCache(snap, work)
  }
  const shown = structuredClone(work)
  addGames(shown, days.filter((d) => !d.complete).flatMap((d) => d.games), params)

  const monthAgo = Math.floor(Date.now() / DAY) - 30
  const delta: Record<string, number> = {}
  for (const [dh, da, , home, away, day] of Object.values(shown.recent)) {
    if (day < monthAgo) continue
    delta[home] = (delta[home] ?? 0) + dh
    delta[away] = (delta[away] ?? 0) + da
  }
  const teams: EloTeam[] = Object.entries(shown.teams)
    .filter(([id]) => snap.info[id])
    .map(([id, [r, n, w, l, , , peak]]) => ({
      id,
      abbr: snap.info[id][0],
      name: snap.info[id][1],
      logo: snap.info[id][2],
      rating: r,
      games: n,
      wins: w,
      losses: l,
      peak,
      rank: 0,
      delta: delta[id] ?? 0,
    }))
    .sort((a, b) => b.rating - a.rating)
  teams.forEach((t, i) => (t.rank = i + 1))
  const byId = new Map(teams.map((t) => [t.id, t]))
  const nowMonth = monthOf(Date.now())
  const history = new Map<string, [number, number][]>()
  for (const t of teams) {
    const h = historyPoints(shown.history[t.id])
    if (h.length && h[h.length - 1][0] < nowMonth) h.push([nowMonth, Math.round(t.rating)])
    history.set(t.id, h)
  }
  const recent = new Map(Object.entries(shown.recent).map(([id, [dh, da, ph]]) => [id, { home: dh, away: da, homeProb: ph }]))

  return {
    teams,
    byId,
    params,
    quality: snap.quality,
    builtAt: snap.builtAt,
    until: shown.until,
    first: snap.first,
    games: snap.games + shown.added,
    added: shown.added,
    recent,
    history,
    prob: (h, a, neutral = false) => {
      const th = byId.get(h)
      const ta = byId.get(a)
      return th && ta ? homeProb(th.rating, ta.rating, neutral, params) : undefined
    },
  }
}

let cache: { at: number; p: Promise<Elo> } | undefined

/** Elo des équipes à jour (gardé 10 minutes en mémoire, le temps que d'autres matchs se terminent). */
export function fetchElo(): Promise<Elo> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.p
  const p = build()
  cache = { at: Date.now(), p }
  p.catch(() => (cache = undefined))
  return p
}
