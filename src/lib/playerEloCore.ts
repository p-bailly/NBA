// Elo des joueurs NBA, et des équipes à partir de leurs joueurs. La force d'une équipe sur un match est la moyenne des
// notes de ses joueurs, pondérée par leurs minutes. Après le match, chaque joueur gagne ou perd selon l'écart entre son
// résultat et ce qui était attendu, d'autant plus qu'il a joué longtemps. Son résultat mêle celui de l'équipe (victoire
// ou défaite) et son +/- (l'écart au score pendant qu'il était sur le terrain) : c'est ce qui sépare les coéquipiers.
// Avant un match, on ne connaît pas les minutes : on prend les minutes attendues de chaque joueur (moyenne glissante de
// ses derniers matchs avec l'équipe), sans les joueurs absents.
// Même contrainte que eloCore.ts : syntaxe TypeScript effaçable seulement (Node exécute ce fichier tel quel).

import { BASE, movMult, winProb } from './eloCore.ts'

export interface PlayerLine {
  /** Identifiant ESPN du joueur. */
  id: string
  /** Minutes jouées. */
  min: number
  /** +/- du joueur sur le match (null quand ESPN ne le donne pas). */
  pm: number | null
}

export interface PlayerGameIn {
  id: string
  t: number
  season: number
  home: string
  away: string
  hs: number
  as: number
  neutral: boolean
  playoffs: boolean
  /** Joueurs de l'équipe à domicile et de l'équipe à l'extérieur (ceux qui ont joué). */
  h: PlayerLine[]
  a: PlayerLine[]
}

export interface PlayerState {
  r: number
  /** Matchs joués. */
  n: number
  /** Minutes jouées en tout. */
  min: number
  w: number
  l: number
  /** Dernier match, en jours depuis 1970. */
  last: number
  season: number
  peak: number
  /** Équipe du dernier match. */
  team: string
}

export interface PlayerElo {
  players: Record<string, PlayerState>
  /** Rotation de chaque équipe : minutes attendues de chaque joueur (moyenne glissante, 0 quand il ne joue pas). */
  rot: Record<string, Record<string, number>>
  /** Saison en cours du calcul, et moyenne des notes (1500 : l'échelle est recentrée à chaque saison). */
  season: number
  mean: number
}

export interface PlayerParams {
  /** K d'un joueur sans historique, puis d'un joueur établi (pour 48 minutes jouées). */
  kMax: number
  kMin: number
  /** Nombre de matchs pour que K soit à mi-chemin entre kMax et kMin. */
  nHalf: number
  hca: number
  /** Part du +/- dans le résultat d'un joueur (0 : seul compte le résultat de l'équipe). */
  alpha: number
  /** Échelle du +/- : un +/- de `pmScale` vaut un résultat de 0,91 (10 contre 1). */
  pmScale: number
  mov: number
  /** Part de l'écart à la moyenne effacée entre deux saisons. */
  regress: number
  /** Note de départ d'un nouveau joueur, par rapport à la moyenne. */
  rookie: number
  /** Poids des matchs précédents dans les minutes attendues (0,5 : le dernier match compte pour moitié). */
  decay: number
}

/** Paramètres retenus après réglage sur l'historique (voir scripts/build-elo.mjs --tune). */
export const PLAYER_DEFAULTS: PlayerParams = { kMax: 96, kMin: 16, nHalf: 80, hca: 45, alpha: 0.6, pmScale: 3, mov: 1, regress: 0.2, rookie: -300, decay: 0.8 }

const DAY = 86_400_000

export const kOf = (n: number, p: PlayerParams) => p.kMin + (p.kMax - p.kMin) / (1 + n / p.nHalf)

export const emptyPlayerElo = (): PlayerElo => ({ players: {}, rot: {}, season: 0, mean: BASE })

/** Force d'une équipe sur un match joué : moyenne des notes de ses joueurs, pondérée par leurs minutes. */
function playedRating(elo: PlayerElo, lines: PlayerLine[]): number {
  let sum = 0
  let min = 0
  for (const x of lines) {
    sum += elo.players[x.id].r * x.min
    min += x.min
  }
  return min ? sum / min : elo.mean
}

/** Note d'un joueur pour la saison en cours (retour vers la moyenne compris s'il n'a pas encore joué cette saison). */
export const ratingNow = (elo: PlayerElo, s: PlayerState, p: PlayerParams) => (s.season < elo.season ? s.r + (elo.mean - s.r) * p.regress : s.r)

/**
 * Force d'une équipe avant un match : moyenne des notes de sa rotation, pondérée par les minutes attendues, sans les
 * joueurs absents (`out`) ni ceux partis dans une autre équipe. Rien si l'équipe n'a pas encore joué.
 */
export function teamStrength(elo: PlayerElo, team: string, p: PlayerParams, out?: Set<string>): number | undefined {
  let sum = 0
  let min = 0
  for (const [id, m] of Object.entries(elo.rot[team] ?? {})) {
    const s = elo.players[id]
    if (!s || s.team !== team || out?.has(id)) continue
    sum += ratingNow(elo, s, p) * m
    min += m
  }
  return min ? sum / min : undefined
}

/** Chance qu'a l'équipe à domicile de gagner, d'après la force des deux équipes avant le match. */
export function pregameProb(elo: PlayerElo, home: string, away: string, neutral: boolean, p: PlayerParams, out?: Set<string>): number | undefined {
  const rh = teamStrength(elo, home, p, out)
  const ra = teamStrength(elo, away, p, out)
  return rh === undefined || ra === undefined ? undefined : winProb(rh - ra + (neutral ? 0 : p.hca))
}

/** Moyenne des joueurs établis de la saison écoulée (au moins 20 matchs en carrière), pondérée par leurs minutes. */
function activeMean(elo: PlayerElo): number {
  let sum = 0
  let min = 0
  for (const id in elo.players) {
    const s = elo.players[id]
    if (s.season !== elo.season || s.n < 20) continue
    sum += s.r * s.min
    min += s.min
  }
  return min ? sum / min : elo.mean
}

export interface GameResult {
  /** Chance qu'avait l'équipe à domicile, d'après les joueurs qui ont joué et leurs minutes. */
  ph: number
  /** Variation de la force de chaque équipe : moyenne des variations de ses joueurs, pondérée par leurs minutes. */
  dh: number
  da: number
}

/**
 * Applique un match : notes des joueurs, puis rotation des deux équipes. `deltas`, s'il est donné, reçoit la variation
 * de chaque joueur.
 */
export function applyPlayerGame(elo: PlayerElo, g: PlayerGameIn, p: PlayerParams, deltas?: Record<string, number>): GameResult {
  if (g.season > elo.season) {
    // Nouvelle saison : l'échelle est recentrée pour que les joueurs établis de la saison écoulée aient 1500 de moyenne
    // (les nouveaux venus, qui démarrent sous la moyenne, la feraient sinon glisser vers le bas année après année).
    // Seuls les écarts entre joueurs comptent : les prévisions n'en changent pas. Puis chacun est rapproché de 1500.
    if (elo.season) {
      const shift = BASE - activeMean(elo)
      for (const id in elo.players) elo.players[id].r += shift
    }
    elo.mean = BASE
    elo.season = g.season
  }
  const day = Math.floor(g.t / DAY)
  for (const x of [...g.h, ...g.a]) {
    const s = elo.players[x.id]
    if (!s) {
      const r = elo.mean + p.rookie
      elo.players[x.id] = { r, n: 0, min: 0, w: 0, l: 0, last: day, season: g.season, peak: r, team: '' }
    } else if (s.season < g.season) {
      s.r += (elo.mean - s.r) * p.regress
      s.season = g.season
    }
  }
  const rh = playedRating(elo, g.h)
  const ra = playedRating(elo, g.a)
  const diff = rh - ra + (g.neutral ? 0 : p.hca)
  const ph = winProb(diff)
  const homeWon = g.hs > g.as
  const mult = p.mov ? movMult(g.hs - g.as, homeWon ? diff : -diff) : 1
  const teamDelta: number[] = []
  for (const [lines, won, expected, team] of [
    [g.h, homeWon, ph, g.home],
    [g.a, !homeWon, 1 - ph, g.away],
  ] as const) {
    let sum = 0
    let mins = 0
    for (const x of lines) {
      const s = elo.players[x.id]
      const own = x.pm === null ? (won ? 1 : 0) : 1 / (1 + 10 ** (-x.pm / p.pmScale))
      const result = (1 - p.alpha) * (won ? 1 : 0) + p.alpha * own
      const d = kOf(s.n, p) * (x.min / 48) * mult * (result - expected)
      s.r += d
      sum += d * x.min
      mins += x.min
      if (deltas) deltas[x.id] = d
      s.n++
      s.min += x.min
      if (won) s.w++
      else s.l++
      s.last = day
      s.team = team
      if (s.r > s.peak) s.peak = s.r
    }
    teamDelta.push(mins ? sum / mins : 0)
    // Rotation : les minutes attendues suivent les derniers matchs ; un joueur absent voit les siennes baisser.
    const rot = (elo.rot[team] ??= {})
    const played = new Map(lines.map((x) => [x.id, x.min]))
    for (const id in rot) if (!played.has(id)) rot[id] *= p.decay
    for (const [id, min] of played) rot[id] = rot[id] === undefined ? min : p.decay * rot[id] + (1 - p.decay) * min
    for (const id in rot) if (rot[id] < 0.5) delete rot[id]
  }
  return { ph, dh: teamDelta[0], da: teamDelta[1] }
}

export interface PlayerScore {
  logloss: number
  accuracy: number
  n: number
}

/**
 * Qualité des prévisions de vainqueur, à partir de `from`, faites avant chaque match : minutes attendues, sans les
 * joueurs qui n'ont pas joué ce match (`absents`, ce que le rapport des blessés donne à peu près) ou avec tout le monde.
 * `played` : prévision faite avec les minutes réellement jouées (connues seulement après le match).
 */
export function evaluatePlayers(games: PlayerGameIn[], p: PlayerParams, from = 0, mode: 'absents' | 'all' | 'played' = 'absents'): PlayerScore {
  const elo = emptyPlayerElo()
  let loss = 0
  let hit = 0
  let n = 0
  for (const g of games) {
    let pre: number | undefined
    if (g.t >= from && mode !== 'played') {
      let out: Set<string> | undefined
      if (mode === 'absents') {
        const played = new Set([...g.h, ...g.a].map((x) => x.id))
        out = new Set([...Object.keys(elo.rot[g.home] ?? {}), ...Object.keys(elo.rot[g.away] ?? {})].filter((id) => !played.has(id)))
      }
      pre = pregameProb(elo, g.home, g.away, g.neutral, p, out)
    }
    const { ph } = applyPlayerGame(elo, g, p)
    if (g.t < from) continue
    const q = Math.min(0.995, Math.max(0.005, mode === 'played' ? ph : (pre ?? 0.5)))
    const homeWon = g.hs > g.as
    loss += -Math.log(homeWon ? q : 1 - q)
    if (homeWon === q > 0.5) hit++
    n++
  }
  return { logloss: loss / n, accuracy: hit / n, n }
}
