// Elo des équipes NBA : le calcul, sans rien d'autre (aucune dépendance), pour servir à la fois à l'appli
// (mise à jour avec les derniers matchs) et au script scripts/build-elo.mjs (calcul sur tout l'historique).
// Ne mettre ici que de la syntaxe TypeScript effaçable : Node exécute ce fichier tel quel.

export interface GameIn {
  /** Identifiant ESPN du match (pour retrouver sa variation d'Elo). */
  id: string
  /** Début du match, en millisecondes. */
  t: number
  /** Saison (année de fin : 2027 pour 2026-27). */
  season: number
  home: string
  away: string
  /** Points de l'équipe à domicile et de l'équipe à l'extérieur. */
  hs: number
  as: number
  /** Terrain neutre (finale de la NBA Cup, matchs à l'étranger) : pas d'avantage du terrain. */
  neutral: boolean
  playoffs: boolean
}

export interface TeamState {
  /** Note Elo. */
  r: number
  /** Matchs joués. */
  n: number
  w: number
  l: number
  /** Dernier match, en jours depuis 1970. */
  last: number
  /** Saison du dernier match. */
  season: number
  peak: number
}

export type EloState = Record<string, TeamState>

export interface Params {
  /** K : ce que vaut un match (une victoire attendue à 50 % rapporte K/2, avant l'écart au score). */
  k: number
  /** Avantage du terrain, en points d'Elo. */
  hca: number
  /** 1 : l'écart au score compte (une victoire de 20 points rapporte plus qu'une victoire d'un point), 0 : non. */
  mov: number
  /** Part de l'écart à la moyenne effacée entre deux saisons (effectifs renouvelés). */
  regress: number
  /** Poids d'un match de playoffs (1 : tous les matchs comptent pareil). */
  playoffs: number
}

/** Paramètres retenus après réglage sur l'historique (voir scripts/build-elo.mjs --tune). */
export const DEFAULTS: Params = { k: 20, hca: 65, mov: 1, regress: 0.35, playoffs: 1 }

export const BASE = 1500
const DAY = 86_400_000

/** Chance de gagner d'après l'écart de notes (avantage du terrain compris). */
export const winProb = (diff: number) => 1 / (1 + 10 ** (-diff / 400))

/** Chance qu'a l'équipe à domicile de gagner, d'après les notes des deux équipes. */
export const homeProb = (rh: number, ra: number, neutral: boolean, p: Params) => winProb(rh - ra + (neutral ? 0 : p.hca))

/**
 * Multiplicateur d'écart au score (celui de FiveThirtyEight) : il grandit avec l'écart, moins vite quand le vainqueur
 * était déjà favori, pour que les favoris qui gagnent largement ne s'envolent pas.
 */
export function movMult(margin: number, winnerDiff: number): number {
  return (Math.abs(margin) + 3) ** 0.8 / (7.5 + 0.006 * winnerDiff)
}

/** Mois depuis janvier 2000 (UTC), pour l'historique. */
export const monthOf = (t: number) => {
  const d = new Date(t)
  return (d.getUTCFullYear() - 2000) * 12 + d.getUTCMonth()
}

/**
 * Historique compact : [premier mois, note à la fin de ce mois, du suivant…]. Les mois sans match reprennent la note
 * précédente. Met à jour la note du mois `month`.
 */
export function record(hist: Record<string, number[]>, id: string, month: number, r: number) {
  const h = hist[id]
  const v = Math.round(r)
  if (!h) {
    hist[id] = [month, v]
    return
  }
  const lastMonth = h[0] + h.length - 2
  if (month < lastMonth) return
  for (let m = lastMonth + 1; m <= month; m++) h.push(h[h.length - 1])
  h[h.length - 1] = v
}

/** Historique compact → points [mois depuis janvier 2000, note]. */
export const historyPoints = (h: number[] | undefined): [number, number][] => (h ? h.slice(1).map((v, i) => [h[0] + i, v]) : [])

/**
 * Applique un match à l'état. Une équipe qui commence une nouvelle saison voit d'abord sa note rapprochée de la
 * moyenne. `onGame` reçoit, avant la mise à jour, la chance qu'avait l'équipe à domicile de gagner (pour mesurer la
 * qualité des prévisions). Renvoie cette chance et la variation de chaque équipe.
 */
export function applyGame(state: EloState, g: GameIn, p: Params, onGame?: (ph: number, homeWon: boolean) => void): { ph: number; dh: number; da: number } {
  const day = Math.floor(g.t / DAY)
  const touch = (id: string): TeamState => {
    let t = state[id]
    if (!t) t = state[id] = { r: BASE, n: 0, w: 0, l: 0, last: day, season: g.season, peak: BASE }
    else if (t.season < g.season) {
      t.r += (BASE - t.r) * p.regress
      t.season = g.season
    }
    return t
  }
  const th = touch(g.home)
  const ta = touch(g.away)
  const homeWon = g.hs > g.as
  const ph = homeProb(th.r, ta.r, g.neutral, p)
  onGame?.(ph, homeWon)
  const diff = th.r - ta.r + (g.neutral ? 0 : p.hca)
  const mult = p.mov ? movMult(g.hs - g.as, homeWon ? diff : -diff) : 1
  const dh = p.k * mult * (g.playoffs ? p.playoffs : 1) * ((homeWon ? 1 : 0) - ph)
  th.r += dh
  ta.r -= dh
  for (const [t, won] of [
    [th, homeWon],
    [ta, !homeWon],
  ] as const) {
    t.n++
    if (won) t.w++
    else t.l++
    t.last = day
    if (t.r > t.peak) t.peak = t.r
  }
  return { ph, dh, da: -dh }
}

export interface Score {
  /** Perte logarithmique moyenne par match (plus bas = mieux). */
  logloss: number
  accuracy: number
  /** Nombre de matchs mesurés. */
  n: number
}

/** Qualité des prévisions de vainqueur, à partir de `from`. */
export function evaluate(games: GameIn[], p: Params, from = 0): Score {
  const state: EloState = {}
  let loss = 0
  let hit = 0
  let n = 0
  for (const g of games) {
    applyGame(state, g, p, (ph, homeWon) => {
      if (g.t < from) return
      const q = Math.min(0.995, Math.max(0.005, ph))
      loss += -Math.log(homeWon ? q : 1 - q)
      if (homeWon === q > 0.5) hit++
      n++
    })
  }
  return { logloss: loss / n, accuracy: hit / n, n }
}
