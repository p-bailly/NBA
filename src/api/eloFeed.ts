import type { GameIn } from '../lib/eloCore'
import { shiftDay, usToday } from '../lib/format'
import { getJson, SITE, toParam } from './espn'

// Matchs joués depuis le calcul de l'Elo (public/elo.json) : l'appli les ajoute elle-même, jour par jour.

type J = any

export interface DayFinals {
  day: string
  /** Matchs terminés de la journée, dans l'ordre. */
  games: GameIn[]
  /** Tous les matchs de la journée sont finis (ou reportés) : on peut la garder pour de bon. */
  complete: boolean
}

/** Match du tableau des scores → match pour l'Elo, ou rien s'il n'est pas terminé (ou hors saison, All-Star…). */
function gameOf(e: J): GameIn | undefined {
  const c = e.competitions?.[0] ?? {}
  if (!c.status?.type?.completed) return undefined
  const type = Number(e.season?.type ?? 2)
  if (type !== 2 && type !== 3 && type !== 5) return undefined
  const side = (h: string) => c.competitors?.find((x: J) => x.homeAway === h)
  const home = side('home')
  const away = side('away')
  const score = (x: J) => Number(x?.score?.value ?? x?.score)
  const nba = (x: J) => Number(x?.team?.id) >= 1 && Number(x?.team?.id) <= 30
  if (!nba(home) || !nba(away) || !(score(home) + score(away) > 0) || score(home) === score(away)) return undefined
  return {
    id: String(e.id),
    t: new Date(e.date ?? c.date).getTime(),
    season: Number(e.season?.year),
    home: String(home.team.id),
    away: String(away.team.id),
    hs: score(home),
    as: score(away),
    neutral: !!c.neutralSite,
    playoffs: type === 3,
  }
}

const memo = new Map<string, { at: number; p: Promise<DayFinals> }>()

/** Matchs terminés d'une journée (gardés en mémoire : pour toujours si la journée est finie, sinon 2 minutes). */
export function finalsOn(day: string): Promise<DayFinals> {
  const hit = memo.get(day)
  if (hit && Date.now() - hit.at < 120_000) return hit.p
  const p = getJson(`${SITE}/scoreboard?dates=${toParam(day)}`).then((d: J): DayFinals => {
    const events: J[] = d.events ?? []
    const games = events
      .map(gameOf)
      .filter((g): g is GameIn => !!g)
      .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
    const complete = events.every((e) => e.competitions?.[0]?.status?.type?.completed || /POSTPONED|CANCELED|SUSPENDED/.test(e.status?.type?.name ?? ''))
    if (complete) memo.set(day, { at: Infinity, p: Promise.resolve({ day, games, complete }) })
    return { day, games, complete }
  })
  memo.set(day, { at: Date.now(), p })
  p.catch(() => memo.delete(day))
  return p
}

let calendar: { at: number; p: Promise<string[]> } | undefined
/** Jours de match de la saison en cours (présaison comprise). */
function seasonDays(): Promise<string[]> {
  if (calendar && Date.now() - calendar.at < 3_600_000) return calendar.p
  const p = getJson(`${SITE}/scoreboard`).then((d: J) => (d.leagues?.[0]?.calendar ?? []).map((c: J) => String(typeof c === 'string' ? c : c.startDate).slice(0, 10)) as string[])
  calendar = { at: Date.now(), p }
  p.catch(() => (calendar = undefined))
  return p
}

/** Toutes les journées après `until`, jusqu'à aujourd'hui (journée américaine), dans l'ordre. */
export async function finalsSince(until: string): Promise<DayFinals[]> {
  const today = usToday()
  const known = await seasonDays().catch((): string[] => [])
  const first = known[0] ?? today
  const days: string[] = []
  // Pendant la saison, seuls les jours de match ; avant (calcul d'une saison passée), tous les jours.
  for (let d = shiftDay(until, 1); d <= today && days.length < 400; d = shiftDay(d, 1)) if (d < first || known.includes(d) || d === today) days.push(d)
  const out: DayFinals[] = []
  for (let i = 0; i < days.length; i += 6) out.push(...(await Promise.all(days.slice(i, i + 6).map(finalsOn))))
  // Une journée n'est gardée pour de bon que si elle et toutes celles d'avant sont finies (hier et avant : toujours).
  const yesterday = shiftDay(today, -1)
  let open = false
  for (const d of out) {
    if (!d.complete && d.day >= yesterday) open = true
    d.complete = !open
  }
  return out
}
