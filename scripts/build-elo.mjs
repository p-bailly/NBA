// Calcule l'Elo des équipes NBA sur tous les matchs depuis 2000-01 et écrit public/elo.json.
//
//   node scripts/build-elo.mjs            calcule avec les paramètres par défaut (src/lib/eloCore.ts)
//   node scripts/build-elo.mjs --tune     cherche d'abord les meilleurs paramètres sur l'historique
//   node scripts/build-elo.mjs --refresh  retélécharge toutes les saisons (sinon celles gardées dans le dossier temporaire)
//
//   --until 2026-10-22                  s'arrête à cette journée (pour tester l'ajout des matchs suivants par l'appli)
//
// L'appli charge ensuite public/elo.json et n'ajoute que les matchs joués après `until`.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULTS, applyGame, evaluate, monthOf, record } from '../src/lib/eloCore.ts'
import { loadGames, untilYesterday, usDay } from './espn.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const DAY = 86_400_000

const loaded = await loadGames(args.has('--refresh'))
const { kept: games, until } = untilYesterday(loaded.games)
console.log(`${games.length} matchs jusqu'au ${until}`)

// Réglage mesuré à partir de 2005-06 : les premières saisons servent à mettre les notes en place.
const FROM = Date.UTC(2005, 9, 1)

let params = { ...DEFAULTS }
if (args.has('--tune')) {
  const score = (p) => evaluate(games, p, FROM).logloss
  let best = score(params)
  const steps = { k: [12, 16, 18, 20, 22, 24, 28], hca: [40, 60, 65, 70, 75, 80, 100], mov: [0, 1], regress: [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5], playoffs: [0.75, 1, 1.25, 1.5] }
  for (let round = 0; round < 3; round++) {
    for (const [key, values] of Object.entries(steps)) {
      for (const v of values) {
        const p = { ...params, [key]: v }
        const s = score(p)
        if (s < best - 1e-6) {
          best = s
          params = p
        }
      }
    }
    console.log(`tour ${round + 1} :`, JSON.stringify(params), best.toFixed(4))
  }
}

const quality = evaluate(games, params, FROM)
console.log(`qualité : ${(quality.accuracy * 100).toFixed(1)} % de vainqueurs bien prévus, perte log ${quality.logloss.toFixed(4)} sur ${quality.n} matchs`)

const r1 = (x) => Math.round(x * 10) / 10
const state = {}
const history = {}
const recent = {}
const now = Date.now()
for (const g of games) {
  const { ph, dh, da } = applyGame(state, g, params)
  const m = monthOf(g.t)
  record(history, g.home, m, state[g.home].r)
  record(history, g.away, m, state[g.away].r)
  // Matchs récents : variation de chaque équipe, chance qu'avait l'équipe à domicile, équipes et jour.
  if (now - g.t < 150 * DAY) recent[g.id] = [r1(dh), r1(da), Math.round(ph * 1000) / 1000, g.home, g.away, Math.floor(g.t / DAY)]
}

const teams = {}
for (const [id, s] of Object.entries(state)) {
  // Seules les franchises actuelles (identifiants ESPN 1 à 30) sont gardées.
  if (!loaded.teams[id]) continue
  teams[id] = [r1(s.r), s.n, s.w, s.l, s.last, s.season, r1(s.peak)]
}
const snapshot = {
  v: 1,
  builtAt: new Date().toISOString(),
  until,
  season: loaded.season,
  params,
  quality: { logloss: Math.round(quality.logloss * 10000) / 10000, accuracy: Math.round(quality.accuracy * 1000) / 1000, n: quality.n },
  games: games.length,
  first: usDay(games[0].t),
  teams,
  info: loaded.teams,
  history: Object.fromEntries(Object.entries(history).filter(([id]) => teams[id])),
  recent,
}
const file = join(ROOT, 'public', 'elo.json')
writeFileSync(file, JSON.stringify(snapshot))
console.log(`écrit ${file} (${Math.round(JSON.stringify(snapshot).length / 1024)} Ko)`)
const top = Object.entries(teams).sort((a, b) => b[1][0] - a[1][0])
for (const [id, t] of top.slice(0, 10)) console.log(' ', loaded.teams[id][0], t[0])
