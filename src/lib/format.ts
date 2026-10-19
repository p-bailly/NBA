import type { Game, Odds } from '../api/espn'

const LOCALE = 'fr-FR'

/** "2026-10-20" → Date locale à minuit (sans décalage de fuseau). */
export function dayToDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shiftDay(day: string, delta: number): string {
  const d = dayToDate(day)
  d.setDate(d.getDate() + delta)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Journée NBA en cours (heure de New York), au format YYYY-MM-DD. */
export function usToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

export function dayLabel(day: string): { weekday: string; date: string } {
  const d = dayToDate(day)
  return {
    weekday: d.toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', ''),
    date: d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }).replace('.', ''),
  }
}

export function longDay(day: string): string {
  const s = dayToDate(day).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Heure de début en heure locale ; précise le jour s'il diffère de la journée US affichée. */
export function startLabel(game: Game, day?: string): string {
  if (!game.timeValid) return 'À déterminer'
  const local = new Date(game.date)
  const t = timeOf(game.date)
  if (day && dayToDate(day).getDate() !== local.getDate()) {
    return `${local.toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '')} ${t}`
  }
  return t
}

export function periodShort(period: number): string {
  if (period <= 4) return `Q${period}`
  const ot = period - 4
  return ot === 1 ? 'Prol.' : `${ot} Prol.`
}

export function periodLong(period: number): string {
  if (period <= 4) return `${period}${period === 1 ? 'er' : 'e'} quart-temps`
  const ot = period - 4
  return ot === 1 ? 'Prolongation' : `${ot}e prolongation`
}

/** Libellé de statut court affiché sur les cartes de match. */
export function statusLabel(game: Game, day?: string): string {
  switch (game.statusName) {
    case 'STATUS_POSTPONED':
      return 'Reporté'
    case 'STATUS_CANCELED':
      return 'Annulé'
    case 'STATUS_DELAYED':
      return 'Retardé'
    case 'STATUS_HALFTIME':
      return 'Mi-temps'
    case 'STATUS_END_PERIOD':
      return `Fin ${periodShort(game.period)}`
  }
  if (game.state === 'pre') return startLabel(game, day)
  if (game.state === 'post') return game.period > 4 ? `Terminé · ${periodShort(game.period)}` : 'Terminé'
  return `${periodShort(game.period)} ${game.displayClock}`
}

export function isLive(game: Game): boolean {
  return game.state === 'in'
}

/** Match serré : 4e QT ou prolongation, moins de 5 min, 5 points d'écart ou moins. */
export function isClutch(game: Game): boolean {
  if (game.state !== 'in' || game.period < 4) return false
  const diff = Math.abs((game.home.score ?? 0) - (game.away.score ?? 0))
  return game.clock <= 300 && diff <= 5 && game.statusName !== 'STATUS_END_PERIOD'
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "à l'instant"
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'hier' : `il y a ${d} j`
}

// ---------- Cotes ----------

/** Cote décimale à la française : 1.909 → "1,91". */
export function formatOdds(dec?: number): string | undefined {
  return dec?.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Ligne signée à la française : -2.5 → "−2,5" (vrai signe moins), 1.5 → "+1,5". */
export function signedLine(n: number): string {
  const s = Math.abs(n).toLocaleString(LOCALE)
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : '0'
}

/** Handicap de l'équipe favorite, ex. "SA -2,5" ("Égalité" si aucune n'est favorite). */
export function handicapLabel(odds: Odds, home: string, away: string): string | undefined {
  const { home: h, away: a } = odds.spread ?? {}
  if (h != null && h < 0) return `${home} ${signedLine(h)}`
  if (a != null && a < 0) return `${away} ${signedLine(a)}`
  if (h === 0 || a === 0) return 'Égalité'
  return odds.details?.replace(/(\d)\.(\d)/g, '$1,$2')
}

/** Logo redimensionné via le CDN d'ESPN, en version sombre si demandé. */
export function logoUrl(href: string, size: number, dark = false): string {
  const m = href.match(/a\.espncdn\.com(\/i\/teamlogos\/[^?]+)/)
  if (!m) return href
  const path = dark ? m[1].replace('/500/', '/500-dark/') : m[1]
  const px = size * 2
  return `https://a.espncdn.com/combiner/i?img=${path}&w=${px}&h=${px}&transparent=true`
}

export function headshotUrl(href: string | undefined, w: number): string | undefined {
  if (!href) return undefined
  const m = href.match(/a\.espncdn\.com(\/i\/headshots\/[^?]+)/)
  if (!m) return href
  return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${w * 2}&h=${Math.round(w * 1.46)}&scale=crop&cquality=60`
}
