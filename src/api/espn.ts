// Client pour l'API publique d'ESPN (site.api.espn.com).
// Elle autorise les appels depuis le navigateur (CORS *) : pas besoin de serveur.
// Chaque fonction transforme le JSON brut en modèles simples utilisés par l'UI.

type J = any

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const SITE_V3 = 'https://site.api.espn.com/apis/site/v3/sports/basketball/nba'
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'

async function getJson(url: string, signal?: AbortSignal): Promise<J> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`ESPN ${res.status}`)
  return res.json()
}

// ---------- Modèles ----------

export type GameState = 'pre' | 'in' | 'post'

export interface Team {
  id: string
  abbr: string
  name: string // "Celtics"
  displayName: string // "Boston Celtics"
  location: string
  logo: string
  color: string
  altColor: string
}

export interface Leader {
  category: string // points | rebounds | assists | rating
  label: string
  value: string
  num: number
  athleteId: string
  shortName: string
  headshot?: string
}

export interface Competitor {
  team: Team
  homeAway: 'home' | 'away'
  score: number | null
  winner: boolean
  record?: string
  linescores: number[]
  leaders: Leader[]
}

export interface Odds {
  details?: string // "BOS -1.5"
  overUnder?: number
  provider?: string
  // Cotes américaines (-110, +150…) ; converties au format européen à l'affichage.
  moneyline?: { home?: number; away?: number }
  spread?: { home?: number; away?: number; homeOdds?: number; awayOdds?: number }
  total?: { line?: number; over?: number; under?: number }
}

export interface Game {
  id: string
  date: string // ISO
  timeValid: boolean
  state: GameState
  statusName: string // STATUS_FINAL, STATUS_HALFTIME…
  shortDetail: string
  period: number
  clock: number // secondes restantes dans la période
  displayClock: string
  home: Competitor
  away: Competitor
  venue?: string
  city?: string
  broadcasts: string[]
  odds?: Odds
  note?: string // NBA Cup, série de playoffs…
  lastPlay?: string
}

export interface Scoreboard {
  day: string // YYYY-MM-DD (journée US)
  calendar: string[] // jours avec des matchs, YYYY-MM-DD
  games: Game[]
}

// ---------- Helpers ----------

const str = (v: J): string => (v == null ? '' : String(v))

function num(v: J): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'object') v = v.value ?? v.displayValue
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pickLogo(t: J): string {
  if (t.logo) return t.logo
  const logos: J[] = t.logos ?? []
  const def = logos.find((l) => l.rel?.includes('default')) ?? logos[0]
  return def?.href ?? ''
}

export function parseTeam(t: J): Team {
  return {
    id: str(t.id),
    abbr: str(t.abbreviation),
    name: str(t.shortDisplayName || t.name),
    displayName: str(t.displayName),
    location: str(t.location),
    logo: pickLogo(t),
    color: '#' + (t.color || '555555'),
    altColor: '#' + (t.alternateColor || '999999'),
  }
}

function parseLeaders(raw: J[] | undefined): Leader[] {
  if (!raw) return []
  return raw
    .map((cat: J): Leader | null => {
      const top = cat.leaders?.[0]
      if (!top) return null
      const a = top.athlete ?? {}
      return {
        category: str(cat.name),
        label: str(cat.shortDisplayName || cat.abbreviation || cat.displayName),
        value: str(top.displayValue),
        num: Number(top.value ?? 0),
        athleteId: str(a.id),
        shortName: str(a.shortName || a.displayName),
        headshot: typeof a.headshot === 'string' ? a.headshot : a.headshot?.href,
      }
    })
    .filter((l): l is Leader => l !== null)
}

function recordOf(c: J): string | undefined {
  const recs: J[] = c.records ?? c.record ?? []
  if (!Array.isArray(recs)) return undefined
  const total = recs.find((r) => r.type === 'total') ?? recs[0]
  return total?.summary ?? total?.displayValue
}

function parseCompetitor(c: J): Competitor {
  return {
    team: parseTeam(c.team ?? {}),
    homeAway: c.homeAway === 'home' ? 'home' : 'away',
    score: num(c.score),
    winner: !!c.winner,
    record: recordOf(c),
    linescores: (c.linescores ?? []).map((l: J) => num(l.value ?? l.displayValue) ?? 0),
    leaders: parseLeaders(c.leaders),
  }
}

function parseStatus(s: J) {
  const t = s?.type ?? {}
  return {
    state: (t.state ?? 'pre') as GameState,
    statusName: str(t.name),
    shortDetail: str(t.shortDetail || t.detail || t.description),
    period: Number(s?.period ?? 0),
    clock: Number(s?.clock ?? 0),
    displayClock: str(s?.displayClock),
  }
}

/** "-110" / "+150" / "EVEN" → cote américaine. */
function american(v: J): number | undefined {
  const s = str(v).trim().toUpperCase()
  if (s === 'EVEN') return 100
  const n = Number(s.replace(/^\+/, ''))
  return s && Number.isFinite(n) && n !== 0 ? n : undefined
}

/** "+1.5" / "o222.5" → 1.5 / 222.5 */
function lineOf(v: J): number | undefined {
  const n = parseFloat(str(v).replace(/^[ou]/i, ''))
  return Number.isFinite(n) ? n : undefined
}

// Utilisé pour le tableau des matchs et pour le "pickcenter" de la fiche (même format).
function parseOdds(list: J[] | undefined): Odds | undefined {
  const o = list?.[0]
  if (!o || (!o.details && o.overUnder == null && !o.moneyline)) return undefined
  const cur = (side: J) => side?.close ?? side?.open
  const ml = o.moneyline
  const ps = o.pointSpread
  const tot = o.total
  return {
    details: o.details,
    overUnder: o.overUnder,
    provider: o.provider?.name,
    moneyline: {
      home: american(cur(ml?.home)?.odds) ?? american(o.homeTeamOdds?.moneyLine),
      away: american(cur(ml?.away)?.odds) ?? american(o.awayTeamOdds?.moneyLine),
    },
    spread: ps && {
      home: lineOf(cur(ps.home)?.line),
      away: lineOf(cur(ps.away)?.line),
      homeOdds: american(cur(ps.home)?.odds),
      awayOdds: american(cur(ps.away)?.odds),
    },
    total: tot && {
      line: lineOf(cur(tot.over)?.line) ?? o.overUnder,
      over: american(cur(tot.over)?.odds),
      under: american(cur(tot.under)?.odds),
    },
  }
}

function parseBroadcasts(c: J): string[] {
  const names = new Set<string>()
  for (const b of c.broadcasts ?? []) {
    for (const n of b.names ?? []) names.add(n)
    if (b.media?.shortName) names.add(b.media.shortName)
  }
  return [...names]
}

/** Construit un Game à partir d'un "event" ESPN (scoreboard ou calendrier d'équipe). */
export function parseEvent(e: J): Game {
  const comp = e.competitions?.[0] ?? {}
  const competitors: Competitor[] = (comp.competitors ?? []).map(parseCompetitor)
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]
  const status = parseStatus(comp.status ?? e.status)
  const note = comp.notes?.[0]?.headline ?? comp.series?.summary ?? undefined
  return {
    id: str(e.id),
    date: str(e.date || comp.date),
    timeValid: comp.timeValid ?? e.timeValid ?? true,
    ...status,
    home,
    away,
    venue: comp.venue?.fullName,
    city: comp.venue?.address?.city,
    broadcasts: parseBroadcasts(comp),
    odds: parseOdds(comp.odds),
    note,
    lastPlay: comp.situation?.lastPlay?.text,
  }
}

const isoDay = (s: string) => s.slice(0, 10)
export const toParam = (day: string) => day.replaceAll('-', '')

// ---------- Scores ----------

export async function fetchScoreboard(day?: string, signal?: AbortSignal): Promise<Scoreboard> {
  const url = day ? `${SITE}/scoreboard?dates=${toParam(day)}` : `${SITE}/scoreboard`
  const d = await getJson(url, signal)
  const league = d.leagues?.[0] ?? {}
  const games: Game[] = (d.events ?? []).map(parseEvent)
  return {
    day: day ?? d.day?.date ?? isoDay(games[0]?.date ?? new Date().toISOString()),
    calendar: (league.calendar ?? []).map((c: J) => isoDay(typeof c === 'string' ? c : c.startDate ?? '')),
    games,
  }
}

// ---------- Fiche de match ----------

export interface BoxPlayer {
  id: string
  name: string
  shortName: string
  jersey: string
  position: string
  headshot?: string
  starter: boolean
  didNotPlay: boolean
  reason?: string
  stats: Record<string, string>
}

export interface BoxTeam {
  team: Team
  keys: string[]
  players: BoxPlayer[]
  totals: Record<string, string>
}

export interface TeamStat {
  name: string
  label: string
  home: string
  away: string
}

export interface Play {
  id: string
  period: number
  clock: string
  text: string
  homeScore: number
  awayScore: number
  scoring: boolean
  scoreValue: number
  teamId?: string
}

export interface WinProbPoint {
  homePct: number
  playId: string
}

export interface TeamLeaders {
  teamId: string
  leaders: Leader[]
}

export interface Injury {
  teamId: string
  name: string
  status: string
  detail?: string
}

export interface FormGame {
  id: string
  result: string // W | L
  score: string
  atVs: string // "vs" | "@"
  opponent: string
}

export interface GameDetail {
  game: Game
  box: BoxTeam[]
  teamStats: TeamStat[]
  plays: Play[]
  winProb: WinProbPoint[]
  leaders: TeamLeaders[]
  officials: string[]
  attendance?: number
  odds?: Odds
  seasonSeries?: string
  injuries: Injury[]
  /** Pronostic ESPN avant-match, en % (équipe à domicile). */
  predictorHome?: number
  /** 5 derniers matchs de chaque équipe. */
  form: { teamId: string; games: FormGame[] }[]
}

// Les stats du box score arrivent sous forme de tableau aligné sur "keys".
function parseBox(p: J): BoxTeam {
  const block = p.statistics?.[0] ?? {}
  const keys: string[] = block.keys ?? block.names ?? []
  const zip = (vals: J[] | undefined): Record<string, string> => {
    const out: Record<string, string> = {}
    keys.forEach((k, i) => (out[k] = str(vals?.[i])))
    return out
  }
  return {
    team: parseTeam(p.team ?? {}),
    keys,
    players: (block.athletes ?? []).map((a: J) => ({
      id: str(a.athlete?.id),
      name: str(a.athlete?.displayName),
      shortName: str(a.athlete?.shortName || a.athlete?.displayName),
      jersey: str(a.athlete?.jersey),
      position: str(a.athlete?.position?.abbreviation),
      headshot: a.athlete?.headshot?.href,
      starter: !!a.starter,
      didNotPlay: !!a.didNotPlay || !(a.stats?.length > 0),
      reason: a.reason,
      stats: zip(a.stats),
    })),
    totals: zip(block.totals),
  }
}

export async function fetchGame(id: string, signal?: AbortSignal): Promise<GameDetail> {
  const d = await getJson(`${SITE}/summary?event=${encodeURIComponent(id)}`, signal)
  const comp = d.header?.competitions?.[0] ?? {}
  const game = parseEvent({ id, date: comp.date, competitions: [{ ...comp, venue: d.gameInfo?.venue }] })
  const homeId = game.home?.team.id

  const box: BoxTeam[] = (d.boxscore?.players ?? []).map(parseBox)

  const statTeams: J[] = d.boxscore?.teams ?? []
  const homeStats = statTeams.find((t) => str(t.team?.id) === homeId) ?? statTeams[1]
  const awayStats = statTeams.find((t) => str(t.team?.id) !== homeId) ?? statTeams[0]
  const teamStats: TeamStat[] = (homeStats?.statistics ?? []).map((s: J) => ({
    name: str(s.name),
    label: str(s.label),
    home: str(s.displayValue),
    away: str(awayStats?.statistics?.find((x: J) => x.name === s.name)?.displayValue),
  }))

  const plays: Play[] = (d.plays ?? []).map((p: J) => ({
    id: str(p.id),
    period: Number(p.period?.number ?? 0),
    clock: str(p.clock?.displayValue),
    text: str(p.text),
    homeScore: Number(p.homeScore ?? 0),
    awayScore: Number(p.awayScore ?? 0),
    scoring: !!p.scoringPlay,
    scoreValue: Number(p.scoreValue ?? 0),
    teamId: p.team?.id ? str(p.team.id) : undefined,
  }))

  const leaders: TeamLeaders[] = (d.leaders ?? []).map((t: J) => ({
    teamId: str(t.team?.id),
    leaders: parseLeaders(t.leaders),
  }))

  const injuries: Injury[] = (d.injuries ?? []).flatMap((t: J) =>
    (t.injuries ?? []).map((i: J) => ({
      teamId: str(t.team?.id),
      name: str(i.athlete?.displayName),
      status: str(i.status),
      detail: i.details?.type ?? i.type?.description,
    })),
  )

  return {
    game,
    box,
    teamStats,
    plays,
    winProb: (d.winprobability ?? []).map((w: J) => ({ homePct: Number(w.homeWinPercentage), playId: str(w.playId) })),
    leaders,
    officials: (d.gameInfo?.officials ?? []).map((o: J) => str(o.displayName)),
    attendance: d.gameInfo?.attendance || undefined,
    odds: parseOdds(d.pickcenter) ?? game.odds,
    seasonSeries: d.seasonseries?.[0]?.summary,
    injuries,
    predictorHome: num(d.predictor?.homeTeam?.gameProjection) ?? undefined,
    form: (d.lastFiveGames ?? []).map((t: J) => ({
      teamId: str(t.team?.id),
      games: (t.events ?? []).map((e: J) => ({
        id: str(e.id),
        result: str(e.gameResult),
        score: str(e.score),
        atVs: str(e.atVs),
        opponent: str(e.opponent?.abbreviation),
      })),
    })),
  }
}

// ---------- Équipes ----------
// Note : /teams et /teams/{id} n'autorisent pas les appels navigateur (pas de CORS),
// on passe donc par le classement (liste des équipes) et le calendrier (infos d'équipe).

export async function fetchTeams(signal?: AbortSignal): Promise<{ conference: string; teams: Team[] }[]> {
  const { conferences } = await fetchStandings(undefined, signal)
  return conferences.map((c) => ({
    conference: c.short,
    teams: c.rows.map((r) => r.team).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  }))
}

export interface TeamInfo {
  team: Team
  record?: string
  standing?: string
}

export async function fetchTeamSchedule(id: string, signal?: AbortSignal): Promise<{ info: TeamInfo; games: Game[] }> {
  const d = await getJson(`${SITE}/teams/${id}/schedule`, signal)
  const t = d.team ?? {}
  return {
    info: { team: parseTeam(t), record: t.recordSummary, standing: t.standingSummary },
    games: (d.events ?? []).map(parseEvent),
  }
}

export interface RosterPlayer {
  id: string
  name: string
  jersey: string
  position: string
  height: string
  age?: number
  headshot?: string
  injury?: string
}

export async function fetchRoster(id: string, signal?: AbortSignal): Promise<RosterPlayer[]> {
  const d = await getJson(`${SITE}/teams/${id}/roster`, signal)
  return (d.athletes ?? []).map((a: J) => ({
    id: str(a.id),
    name: str(a.displayName),
    jersey: str(a.jersey),
    position: str(a.position?.abbreviation),
    height: str(a.displayHeight),
    age: a.age,
    headshot: a.headshot?.href,
    injury: a.injuries?.[0]?.status,
  }))
}

// ---------- Classement ----------

export interface StandingRow {
  team: Team
  seed: number
  wins: number
  losses: number
  pct: string
  gb: string
  streak: string
  last10: string
  home: string
  road: string
  diff: string
}

export interface Conference {
  name: string
  short: string
  rows: StandingRow[]
}

export interface Standings {
  season: string
  conferences: Conference[]
}

export async function fetchStandings(season?: number, signal?: AbortSignal): Promise<Standings> {
  const qs = new URLSearchParams({ seasontype: '2' })
  if (season) qs.set('season', String(season))
  const d = await getJson(`${STANDINGS}?${qs}`, signal)
  const conferences: Conference[] = (d.children ?? []).map((ch: J) => {
    const rows: StandingRow[] = (ch.standings?.entries ?? []).map((e: J) => {
      const stats: J[] = e.stats ?? []
      const get = (name: string) => stats.find((s) => s.name === name || s.type === name)
      const dv = (name: string) => str(get(name)?.displayValue ?? get(name)?.summary)
      return {
        team: parseTeam(e.team ?? {}),
        seed: Number(get('playoffSeed')?.value ?? 99),
        wins: Number(get('wins')?.value ?? 0),
        losses: Number(get('losses')?.value ?? 0),
        pct: dv('winPercent'),
        gb: dv('gamesBehind'),
        streak: dv('streak'),
        last10: dv('lasttengames'),
        home: dv('home'),
        road: dv('road'),
        diff: dv('differential'),
      }
    })
    rows.sort((a, b) => a.seed - b.seed)
    return { name: str(ch.name), short: str(ch.abbreviation), rows }
  })
  return { season: str(d.children?.[0]?.standings?.seasonDisplayName ?? d.seasons?.[0]?.displayName), conferences }
}

// ---------- Leaders de la saison ----------

export interface LeaderEntry {
  value: string
  athleteId: string
  name: string
  position: string
  headshot?: string
  team?: Team
}

export interface LeaderCategory {
  name: string
  label: string
  abbr: string
  entries: LeaderEntry[]
}

export interface SeasonLeaders {
  season: string
  categories: LeaderCategory[]
}

export async function fetchLeaders(signal?: AbortSignal): Promise<SeasonLeaders> {
  const d = await getJson(`${SITE_V3}/leaders`, signal)
  return {
    season: str(d.requestedSeason?.displayName),
    categories: (d.leaders?.categories ?? []).map((c: J) => ({
      name: str(c.name),
      label: str(c.displayName),
      abbr: str(c.abbreviation),
      entries: (c.leaders ?? []).map((l: J) => ({
        value: str(l.displayValue),
        athleteId: str(l.athlete?.id),
        name: str(l.athlete?.displayName),
        position: str(l.athlete?.position?.abbreviation),
        headshot: l.athlete?.headshot?.href,
        team: l.team ? parseTeam(l.team) : undefined,
      })),
    })),
  }
}

// ---------- Actus ----------

export interface Article {
  id: string
  headline: string
  description: string
  published: string
  image?: string
  url?: string
}

export async function fetchNews(signal?: AbortSignal): Promise<Article[]> {
  const d = await getJson(`${SITE}/news?limit=40`, signal)
  return (d.articles ?? []).map((a: J) => ({
    id: str(a.id),
    headline: str(a.headline),
    description: str(a.description),
    published: str(a.published),
    image: a.images?.[0]?.url,
    url: a.links?.web?.href,
  }))
}
