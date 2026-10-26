import { getJson, SITE } from './espn'

// Rapport des blessés de toute la ligue (un seul appel) : sert à retirer les absents de la force des équipes.

type J = any

export interface Absence {
  playerId: string
  name: string
  teamId: string
  /** "Out", "Day-To-Day"… */
  status: string
  /** Date de retour prévue (YYYY-MM-DD), si elle est connue. */
  returnDate?: string
}

let cache: { at: number; p: Promise<Absence[]> } | undefined

/** Blessés de toute la NBA (gardés 30 minutes en mémoire). */
export function fetchInjuries(): Promise<Absence[]> {
  if (cache && Date.now() - cache.at < 30 * 60_000) return cache.p
  const p = getJson(`${SITE}/injuries`).then((d: J) => {
    const out: Absence[] = []
    for (const team of d.injuries ?? []) {
      for (const i of team.injuries ?? []) {
        const a = i.athlete ?? {}
        // L'identifiant du joueur n'est donné que dans le lien vers sa fiche.
        const id = String(a.id ?? '') || (a.links ?? []).map((l: J) => String(l.href ?? '').match(/\/id\/(\d+)/)?.[1]).find(Boolean)
        if (!id) continue
        out.push({ playerId: id, name: String(a.displayName ?? ''), teamId: String(a.team?.id ?? team.id), status: String(i.status ?? ''), returnDate: i.details?.returnDate })
      }
    }
    return out
  })
  cache = { at: Date.now(), p }
  p.catch(() => (cache = undefined))
  return p
}
