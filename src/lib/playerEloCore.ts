// Elo des joueurs NBA. La force d'une équipe sur un match est la moyenne des notes de ses joueurs, pondérée par leurs
// minutes. Après le match, chaque joueur gagne ou perd selon l'écart entre son résultat et ce qui était attendu,
// d'autant plus qu'il a joué longtemps. Son résultat mêle celui de l'équipe (victoire ou défaite) et son +/- (l'écart
// au score pendant qu'il était sur le terrain) : c'est ce qui sépare les coéquipiers.
// Même contrainte que eloCore.ts : syntaxe TypeScript effaçable seulement (Node exécute ce fichier tel quel).

import { movMult, winProb } from './eloCore.ts'

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
}

/** Paramètres retenus après réglage sur l'historique (voir scripts/build-player-elo.mjs --tune). */
export const PLAYER_DEFAULTS: PlayerParams = { kMax: 128, kMin: 12, nHalf: 80, hca: 45, alpha: 0.5, pmScale: 3, mov: 1, regress: 0.2, rookie: -300 }

export const BASE = 1500
const DAY = 86_400_000

export const kOf = (n: number, p: PlayerParams) => p.kMin + (p.kMax - p.kMin) / (1 + n / p.nHalf)

export const emptyPlayerElo = (): PlayerElo => ({ players: {}, season: 0, mean: BASE })

/** Force d'une équipe sur un match : moyenne des notes de ses joueurs, pondérée par les minutes. */
export function teamRating(elo: PlayerElo, lines: PlayerLine[], p: PlayerParams): number {
  let sum = 0
  let min = 0
  for (const x of lines) {
    sum += (elo.players[x.id]?.r ?? elo.mean + p.rookie) * x.min
    min += x.min
  }
  return min ? sum / min : elo.mean
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

/**
 * Applique un match. Renvoie la chance qu'avait l'équipe à domicile de le gagner ; `deltas`, s'il est donné, reçoit
 * la variation de chaque joueur.
 */
export function applyPlayerGame(elo: PlayerElo, g: PlayerGameIn, p: PlayerParams, deltas?: Record<string, number>): number {
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
  const rh = teamRating(elo, g.h, p)
  const ra = teamRating(elo, g.a, p)
  const diff = rh - ra + (g.neutral ? 0 : p.hca)
  const ph = winProb(diff)
  const homeWon = g.hs > g.as
  const mult = p.mov ? movMult(g.hs - g.as, homeWon ? diff : -diff) : 1
  for (const [lines, won, expected, team] of [
    [g.h, homeWon, ph, g.home],
    [g.a, !homeWon, 1 - ph, g.away],
  ] as const) {
    for (const x of lines) {
      const s = elo.players[x.id]
      const own = x.pm === null ? (won ? 1 : 0) : 1 / (1 + 10 ** (-x.pm / p.pmScale))
      const result = (1 - p.alpha) * (won ? 1 : 0) + p.alpha * own
      const d = kOf(s.n, p) * (x.min / 48) * mult * (result - expected)
      s.r += d
      if (deltas) deltas[x.id] = d
      s.n++
      s.min += x.min
      if (won) s.w++
      else s.l++
      s.last = day
      s.team = team
      if (s.r > s.peak) s.peak = s.r
    }
  }
  return ph
}

export interface PlayerScore {
  logloss: number
  accuracy: number
  n: number
}

/** Qualité des prévisions de vainqueur, à partir de `from`. */
export function evaluatePlayers(games: PlayerGameIn[], p: PlayerParams, from = 0): PlayerScore {
  const elo = emptyPlayerElo()
  let loss = 0
  let hit = 0
  let n = 0
  for (const g of games) {
    const ph = applyPlayerGame(elo, g, p)
    if (g.t < from) continue
    const q = Math.min(0.995, Math.max(0.005, ph))
    const homeWon = g.hs > g.as
    loss += -Math.log(homeWon ? q : 1 - q)
    if (homeWon === q > 0.5) hit++
    n++
  }
  return { logloss: loss / n, accuracy: hit / n, n }
}
