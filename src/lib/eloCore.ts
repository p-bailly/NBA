// Elo : ce qui est commun au calcul (playerEloCore.ts), à l'appli et au script scripts/build-elo.mjs, sans aucune
// dépendance. Ne mettre ici que de la syntaxe TypeScript effaçable : Node exécute ce fichier tel quel.

/** Match terminé (sans le détail des joueurs). */
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

export const BASE = 1500

/** Chance de gagner d'après l'écart de notes (avantage du terrain compris). */
export const winProb = (diff: number) => 1 / (1 + 10 ** (-diff / 400))

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
