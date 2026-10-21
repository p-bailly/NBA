import { fetchPowerIndex, fetchSeasonGames, fetchStandings, type SeasonGame, type Team } from '../api/espn'

// Projection de fin de saison régulière : on rejoue des milliers de fois les matchs restants
// (Monte-Carlo) et on compte à quelle place chaque équipe finit dans sa conférence.
//
// Un match : écart attendu = note de l'équipe à domicile − note de l'adversaire + avantage du terrain ;
// l'écart réel suit une loi normale de 13 pts d'écart-type autour de cette attente. La note est le BPI
// d'ESPN (écart attendu face à une équipe moyenne, sur terrain neutre), décalée à chaque simulation
// d'un aléa de forme (blessures, transferts…). Réglages calés sur les projections publiées par ESPN.

const SIMS = 5_000
export const GAMES = 82
const HOME_EDGE = 2
const GAME_SD = 13
const RATING_SD = 1.5

export interface TeamProjection {
  team: Team
  /** Victoires attendues en fin de saison, et fourchette où elles tombent 8 fois sur 10. */
  projWins: number
  winsRange: [number, number]
  /** seeds[k] : probabilité de finir (k + 1)e de la conférence. */
  seeds: number[]
  /** Probabilité de jouer les playoffs : top 6, ou qualifié par le play-in. */
  playoffs: number
}

export interface ConferenceProjection {
  name: string
  short: string
  /** Triées par place moyenne. */
  teams: TeamProjection[]
}

export interface Projection {
  season: string
  sims: number
  remaining: number
  /** Note utilisée : BPI d'ESPN, ou à défaut l'écart de points moyen de la saison. */
  ratings: 'bpi' | 'diff'
  conferences: ConferenceProjection[]
}

let cache: { at: number; promise: Promise<Projection> } | undefined

/** Projection partagée entre le classement et les pages équipe, recalculée au plus toutes les 10 min. */
export function getProjection(): Promise<Projection> {
  if (!cache || Date.now() - cache.at > 10 * 60_000) {
    const promise = buildProjection()
    cache = { at: Date.now(), promise }
    promise.catch(() => {
      if (cache?.promise === promise) cache = undefined
    })
  }
  return cache.promise
}

async function buildProjection(): Promise<Projection> {
  const standings = await fetchStandings()
  const rows = standings.conferences.flatMap((c, conf) => c.rows.map((r) => ({ ...r, conf })))
  const [games, bpi] = await Promise.all([
    fetchSeasonGames(rows.map((r) => r.team.id)),
    fetchPowerIndex().catch(() => new Map<string, number>()),
  ])
  const useBpi = rows.every((r) => bpi.has(r.team.id))
  const ratings = rows.map((r) => {
    if (useBpi) return bpi.get(r.team.id)!
    // Sans BPI : écart de points moyen, ramené vers 0 tant que peu de matchs ont été joués.
    const gp = r.wins + r.losses
    return ((parseFloat(r.diff) || 0) * gp) / (gp + 15)
  })

  const sim = await simulate(rows.map((r) => r.conf), ratings, rows.map((r) => r.team.id), games)

  return {
    season: standings.season,
    sims: SIMS,
    remaining: games.filter((g) => !g.winnerId).length,
    ratings: useBpi ? 'bpi' : 'diff',
    conferences: standings.conferences.map((c, conf) => ({
      name: c.name,
      short: c.short,
      teams: rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.conf === conf)
        .map(({ r, i }): TeamProjection & { avgSeed: number } => {
          const seeds = Array.from(sim.seeds.subarray(i * 15, i * 15 + 15), (n) => n / SIMS)
          const hist = sim.wins.subarray(i * (GAMES + 1), (i + 1) * (GAMES + 1))
          return {
            team: r.team,
            projWins: hist.reduce((s, n, w) => s + n * w, 0) / SIMS,
            winsRange: [quantile(hist, 0.1), quantile(hist, 0.9)],
            seeds,
            playoffs: sim.playoffs[i] / SIMS,
            avgSeed: seeds.reduce((s, p, k) => s + p * (k + 1), 0),
          }
        })
        .sort((a, b) => a.avgSeed - b.avgSeed || b.projWins - a.projWins),
    })),
  }
}

function quantile(hist: Int32Array, q: number): number {
  let seen = 0
  for (let w = 0; w < hist.length; w++) {
    seen += hist[w]
    if (seen >= q * SIMS) return w
  }
  return hist.length - 1
}

/** Fonction de répartition de la loi normale centrée réduite (Abramowitz & Stegun 26.2.17). */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const p = 0.3989423 * Math.exp((-z * z) / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

// Tabulée au millième d'écart-type, de −4 à +4 : bien plus rapide que de la recalculer à chacun
// des millions de matchs simulés. Dans la simulation, les notes sont exprimées dans cette unité.
const STEPS = 1000
const PHI = Float64Array.from({ length: 8 * STEPS + 1 }, (_, k) => phi(k / STEPS - 4))
function chance(z: number): number {
  const k = (z + 4 * STEPS + 0.5) | 0
  return k <= 0 ? 0 : k >= 8 * STEPS ? 1 : PHI[k]
}
const UNIT = STEPS / GAME_SD

/** Générateur pseudo-aléatoire à graine fixe : mêmes données, mêmes chiffres d'un rafraîchissement à l'autre. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function simulate(conf: number[], ratings: number[], ids: string[], games: SeasonGame[]) {
  const N = ids.length
  const index = new Map(ids.map((id, i) => [id, i]))
  const rand = mulberry32(2027)

  // Bilans : victoires, confrontations directes (h2h[i * N + j] = victoires de i sur j), bilan dans la conférence.
  const wins = new Int16Array(N)
  const h2h = new Int16Array(N * N)
  const confW = new Int16Array(N)
  const confG = new Int16Array(N)
  const record = (w: number, l: number) => {
    wins[w]++
    h2h[w * N + l]++
    if (conf[w] === conf[l]) {
      confW[w]++
      confG[w]++
      confG[l]++
    }
  }

  const scheduled = new Int16Array(N)
  const left: { h: number; a: number; edge: number }[] = [] // matchs restants
  for (const g of games) {
    const h = index.get(g.homeId)
    const a = index.get(g.awayId)
    if (h == null || a == null) continue
    scheduled[h]++
    scheduled[a]++
    if (!g.winnerId) {
      left.push({ h, a, edge: g.neutral ? 0 : HOME_EDGE * UNIT })
      continue
    }
    if (g.winnerId === g.homeId) record(h, a)
    else record(a, h)
  }
  const [baseWins, baseH2h, baseConfW, baseConfG] = [wins, h2h, confW, confG].map((t) => t.slice())
  // Matchs pas encore au calendrier (2 matchs de NBA Cup fixés en décembre) : contre une équipe moyenne, sur terrain neutre.
  const extra = Array.from(scheduled, (n) => Math.max(0, GAMES - n))

  const r = new Float64Array(N)
  const tie = new Float64Array(N)
  const seeds = new Int32Array(N * 15)
  const winsHist = new Int32Array(N * (GAMES + 1))
  const playoffs = new Int32Array(N)
  const confTeams = [...new Set(conf)].map((c) => ids.map((_, i) => i).filter((i) => conf[i] === c))

  const beats = (h: number, a: number, edge: number) => rand() < chance(r[h] - r[a] + edge)

  // Égalités : confrontations directes entre les équipes à égalité, puis bilan dans la conférence, puis tirage au sort.
  const ranked = (teams: number[]) => {
    const order = [...teams].sort((a, b) => wins[b] - wins[a])
    for (let i = 0; i < order.length; ) {
      let j = i + 1
      while (j < order.length && wins[order[j]] === wins[order[i]]) j++
      if (j - i > 1) {
        const group = order.slice(i, j)
        const key = new Map(
          group.map((t) => {
            let w = 0
            let g = 0
            for (const o of group) {
              w += h2h[t * N + o]
              g += h2h[t * N + o] + h2h[o * N + t]
            }
            return [t, [g ? w / g : 0.5, confG[t] ? confW[t] / confG[t] : 0.5, tie[t]]]
          }),
        )
        group.sort((a, b) => {
          const ka = key.get(a)!
          const kb = key.get(b)!
          return kb[0] - ka[0] || kb[1] - ka[1] || kb[2] - ka[2]
        })
        order.splice(i, j - i, ...group)
      }
      i = j
    }
    return order
  }

  for (let s = 0; s < SIMS; s++) {
    for (let i = 0; i < N; i++) {
      const gauss = Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
      r[i] = (ratings[i] + RATING_SD * gauss) * UNIT
      tie[i] = rand()
    }
    wins.set(baseWins)
    h2h.set(baseH2h)
    confW.set(baseConfW)
    confG.set(baseConfG)
    for (const g of left) {
      if (beats(g.h, g.a, g.edge)) record(g.h, g.a)
      else record(g.a, g.h)
    }
    for (let i = 0; i < N; i++) {
      const p = chance(r[i])
      for (let k = 0; k < extra[i]; k++) if (rand() < p) wins[i]++
      winsHist[i * (GAMES + 1) + Math.min(GAMES, wins[i])]++
    }
    for (const teams of confTeams) {
      const order = ranked(teams)
      order.forEach((t, k) => k < 15 && seeds[t * 15 + k]++)
      for (const t of order.slice(0, 6)) playoffs[t]++
      // Play-in : 7e contre 8e (le vainqueur prend la 7e place), 9e contre 10e (le perdant est éliminé),
      // puis le perdant du premier match contre le vainqueur du second pour la 8e place.
      const [s7, s8, s9, s10] = order.slice(6, 10)
      if (s10 == null) continue
      const first = beats(s7, s8, HOME_EDGE * UNIT) ? s7 : s8
      const second = beats(s9, s10, HOME_EDGE * UNIT) ? s9 : s10
      const loser = first === s7 ? s8 : s7
      playoffs[first]++
      playoffs[beats(loser, second, HOME_EDGE * UNIT) ? loser : second]++
    }
    // Laisse respirer l'interface pendant le calcul.
    if (s % 500 === 499) await new Promise((done) => setTimeout(done))
  }

  return { seeds, wins: winsHist, playoffs }
}
