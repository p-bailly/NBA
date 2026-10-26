// Outils communs aux scripts de calcul de l'Elo : appels à l'API d'ESPN (curl, donc le proxy éventuel est respecté),
// file d'attente parallèle, liste de tous les matchs NBA depuis 2013-14 et leurs box scores, gardés dans un dossier temporaire.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
export const CACHE = join(tmpdir(), 'nba-elo')
mkdirSync(CACHE, { recursive: true })

/** Première saison prise en compte (2014 = 2013-14) : il faut le box score de chaque match. */
export const FIRST_SEASON = 2014

export function get(url) {
  return new Promise((resolve, reject) => {
    const attempt = (n) =>
      execFile('curl', ['-sS', '-L', '--compressed', '--max-time', '60', url], { maxBuffer: 256 * 1024 * 1024 }, (err, out) => {
        let json
        try {
          if (err) throw err
          json = JSON.parse(out)
          if (json.code >= 400) throw new Error(json.message)
        } catch (e) {
          if (n >= 4) return reject(new Error(`${url} : ${String(e.message).slice(0, 120)}`))
          return setTimeout(() => attempt(n + 1), 1000 * 2 ** n)
        }
        resolve(json)
      })
    attempt(0)
  })
}

/** Applique `fn` à chaque élément, `n` à la fois. */
export async function pool(items, n, fn, label) {
  const out = new Array(items.length)
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
        if (label && ++done % 500 === 0) console.log(`  ${label} : ${done} / ${items.length}`)
      }
    }),
  )
  return out
}

const usFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
/** Journée américaine (heure de New York) d'un instant : "2026-10-25". */
export const usDay = (t) => usFmt.format(new Date(t))

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'))

/** Saison en cours (année de fin) d'après le tableau des scores du jour. */
export async function currentSeason() {
  const sb = await get(`${SITE}/scoreboard`)
  return sb.season?.year ?? sb.leagues?.[0]?.season?.year
}

/** Match ESPN (calendrier d'équipe ou tableau des scores) → match pour l'Elo, ou rien s'il n'est pas terminé. */
export function gameOf(e) {
  const c = e.competitions?.[0] ?? {}
  if (!c.status?.type?.completed) return undefined
  const type = Number(e.seasonType?.type ?? e.season?.type ?? 2)
  if (type !== 2 && type !== 3 && type !== 5) return undefined
  const side = (h) => c.competitors?.find((x) => x.homeAway === h)
  const home = side('home')
  const away = side('away')
  const score = (x) => Number(x?.score?.value ?? x?.score)
  if (!home || !away || !(score(home) + score(away) > 0) || score(home) === score(away)) return undefined
  return {
    id: String(e.id),
    t: new Date(e.date ?? c.date).getTime(),
    season: Number(e.season?.year),
    home: String(home.team?.id ?? home.id),
    away: String(away.team?.id ?? away.id),
    hs: score(home),
    as: score(away),
    neutral: !!c.neutralSite,
    playoffs: type === 3,
  }
}

/**
 * Tous les matchs terminés de saison régulière, de play-in et de playoffs depuis FIRST_SEASON, triés par date.
 * Les saisons finies sont gardées dans le dossier temporaire ; la saison en cours est toujours retéléchargée.
 * Renvoie aussi les équipes vues (abréviation, nom, logo).
 */
export async function loadGames(refresh = false) {
  const season = await currentSeason()
  const teams = {}
  const games = []
  for (let s = FIRST_SEASON; s <= season; s++) {
    const file = join(CACHE, `games-${s}.json`)
    if (!refresh && s < season && existsSync(file)) {
      const cached = readJson(file)
      games.push(...cached.games)
      Object.assign(teams, cached.teams)
      continue
    }
    const byId = new Map()
    const seen = {}
    const jobs = []
    for (let id = 1; id <= 30; id++) for (const type of [2, 3, 5]) jobs.push([id, type])
    await pool(jobs, 8, async ([id, type]) => {
      const d = await get(`${SITE}/teams/${id}/schedule?season=${s}&seasontype=${type}`)
      const t = d.team
      if (t?.id) seen[t.id] = [t.abbreviation, t.displayName, t.logo ?? '']
      for (const e of d.events ?? []) {
        const g = gameOf(e)
        if (g && g.season === s) byId.set(g.id, g)
      }
    })
    const list = [...byId.values()].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
    writeFileSync(file, JSON.stringify({ games: list, teams: seen }))
    console.log(`saison ${s - 1}-${String(s).slice(2)} : ${list.length} matchs`)
    games.push(...list)
    Object.assign(teams, seen)
  }
  games.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  return { season, games, teams }
}

/**
 * Coupe à la veille (journée américaine) : les matchs du jour peuvent ne pas être tous finis. `--until 2026-10-22`
 * coupe plus tôt (pour vérifier que l'appli ajoute bien les matchs suivants).
 */
export function untilYesterday(games) {
  const i = process.argv.indexOf('--until')
  const kept = i > 0 ? games.filter((g) => usDay(g.t) <= process.argv[i + 1]) : games.filter((g) => usDay(g.t) < usDay(Date.now()))
  const until = kept.length ? usDay(kept[kept.length - 1].t) : usDay(Date.now())
  return { kept, until }
}

/** Box score d'un match → joueurs de chaque équipe qui ont joué : [identifiant, minutes, +/-], et leurs noms. */
export function boxOf(d) {
  const out = { teams: {}, names: {} }
  for (const p of d.boxscore?.players ?? []) {
    const block = p.statistics?.[0] ?? {}
    const keys = block.keys ?? []
    const iMin = keys.indexOf('minutes')
    const iPm = keys.indexOf('plusMinus')
    const lines = []
    for (const a of block.athletes ?? []) {
      const id = String(a.athlete?.id ?? '')
      const min = Number(a.stats?.[iMin])
      if (!id || a.didNotPlay || !(min > 0)) continue
      const pm = iPm >= 0 ? Number(String(a.stats[iPm]).replace('+', '')) : NaN
      lines.push([id, min, Number.isFinite(pm) ? pm : null])
      out.names[id] = a.athlete?.displayName ?? ''
    }
    out.teams[String(p.team?.id)] = lines
  }
  return out
}

/**
 * Box scores des matchs, gardés par saison dans le dossier temporaire (seuls les matchs
 * manquants sont téléchargés). Renvoie identifiant du match → box score.
 */
export async function loadBoxes(games) {
  const all = {}
  const seasons = [...new Set(games.map((g) => g.season))]
  for (const s of seasons) {
    const file = join(CACHE, `box-${s}.json`)
    const boxes = existsSync(file) ? readJson(file) : {}
    const missing = games.filter((g) => g.season === s && !boxes[g.id])
    if (missing.length) {
      let since = 0
      await pool(missing, 8, async (g) => {
        try {
          boxes[g.id] = boxOf(await get(`${SITE}/summary?event=${g.id}`))
        } catch (e) {
          console.error('  box score manquant :', g.id, e.message)
        }
        if (++since % 200 === 0) writeFileSync(file, JSON.stringify(boxes))
      }, `box scores ${s - 1}-${String(s).slice(2)}`)
      writeFileSync(file, JSON.stringify(boxes))
      console.log(`saison ${s - 1}-${String(s).slice(2)} : ${Object.keys(boxes).length} box scores`)
    }
    Object.assign(all, boxes)
  }
  return all
}
