// Calcule l'Elo des joueurs NBA sur tous les box scores depuis 2013-14, et celui des équipes à partir de leurs joueurs,
// puis écrit public/elo.json.
//
//   node scripts/build-elo.mjs            calcule avec les paramètres par défaut (src/lib/playerEloCore.ts)
//   node scripts/build-elo.mjs --tune     cherche d'abord les meilleurs paramètres sur l'historique
//   node scripts/build-elo.mjs --refresh  retélécharge la liste des matchs (les box scores déjà là sont gardés)
//
//   --until 2026-10-22                     s'arrête à cette journée (pour tester l'ajout des matchs suivants par l'appli)
//
// Le premier lancement télécharge un box score par match (environ 17 000, une vingtaine de minutes) ; ils sont
// gardés dans le dossier temporaire. L'appli charge ensuite public/elo.json et ajoute les matchs suivants.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { monthOf, record } from '../src/lib/eloCore.ts'
import { PLAYER_DEFAULTS, applyPlayerGame, emptyPlayerElo, evaluatePlayers, teamStrength } from '../src/lib/playerEloCore.ts'
import { loadBoxes, loadGames, untilYesterday, usDay } from './espn.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const DAY = 86_400_000

const loaded = await loadGames(args.has('--refresh'))
const { kept, until } = untilYesterday(loaded.games)
const boxes = await loadBoxes(kept)
const names = {}
const games = []
for (const g of kept) {
  const box = boxes[g.id]
  const line = ([id, min, pm]) => ({ id, min, pm })
  const h = box?.teams[g.home]?.map(line)
  const a = box?.teams[g.away]?.map(line)
  if (!h?.length || !a?.length) continue
  // Box score sans +/- (tous à zéro) : seul compte le résultat de l'équipe.
  if ([...h, ...a].every((x) => !x.pm)) for (const x of [...h, ...a]) x.pm = null
  Object.assign(names, box.names)
  games.push({ ...g, h, a })
}
console.log(`${games.length} matchs avec box score jusqu'au ${until}`)

// Réglage mesuré à partir de 2016-17 : les premières saisons servent à mettre les notes en place.
const FROM = Date.UTC(2016, 9, 1)

let params = { ...PLAYER_DEFAULTS }
if (args.has('--tune')) {
  const score = (p) => evaluatePlayers(games, p, FROM).logloss
  let best = score(params)
  console.log('départ :', best.toFixed(4))
  const steps = {
    decay: [0.3, 0.5, 0.7, 0.8, 0.9],
    alpha: [0.25, 0.4, 0.5, 0.6],
    pmScale: [3, 4, 6, 8],
    kMax: [48, 72, 96, 128],
    kMin: [8, 12, 16, 20],
    nHalf: [40, 80, 120],
    hca: [35, 45, 55, 65],
    mov: [0, 1],
    regress: [0, 0.1, 0.2, 0.3, 0.4],
    rookie: [-300, -250, -200, -150, -100],
  }
  for (let round = 0; round < 2; round++) {
    for (const [key, values] of Object.entries(steps)) {
      for (const v of values) {
        const p = { ...params, [key]: v }
        const s = score(p)
        if (s < best - 1e-6) {
          best = s
          params = p
        }
      }
      console.log(`  ${key} = ${params[key]} : ${best.toFixed(4)}`)
    }
    console.log(`tour ${round + 1} :`, JSON.stringify(params), best.toFixed(4))
  }
}

const quality = evaluatePlayers(games, params, FROM)
console.log(`qualité : ${(quality.accuracy * 100).toFixed(1)} % de vainqueurs bien prévus, perte log ${quality.logloss.toFixed(4)} sur ${quality.n} matchs`)
for (const mode of ['all', 'played']) {
  const q = evaluatePlayers(games, params, FROM, mode)
  console.log(`  (${mode === 'all' ? 'sans retirer les absents' : 'avec les minutes réelles'} : ${(q.accuracy * 100).toFixed(1)} %, perte log ${q.logloss.toFixed(4)})`)
}

const elo = emptyPlayerElo()
const history = {}
const teamHistory = {}
const recent = {}
const now = Date.now()
const r1 = (x) => Math.round(x * 10) / 10
// Points d'écart attendus par point d'Elo d'écart avant le match (régression de l'écart final sur l'écart d'Elo).
let sxy = 0
let sxx = 0
for (const g of games) {
  if (g.t >= FROM) {
    const rh = teamStrength(elo, g.home, params)
    const ra = teamStrength(elo, g.away, params)
    if (rh !== undefined && ra !== undefined) {
      const diff = rh - ra + (g.neutral ? 0 : params.hca)
      sxy += diff * (g.hs - g.as)
      sxx += diff * diff
    }
  }
  const deltas = {}
  const { dh, da } = applyPlayerGame(elo, g, params, deltas)
  const m = monthOf(g.t)
  for (const id in deltas) record(history, id, m, elo.players[id].r)
  for (const team of [g.home, g.away]) record(teamHistory, team, m, teamStrength(elo, team, params) ?? elo.mean)
  // Matchs récents : jour, variation de chaque joueur, variation des deux équipes, équipes.
  if (now - g.t < 60 * DAY) recent[g.id] = [Math.floor(g.t / DAY), Object.fromEntries(Object.entries(deltas).map(([id, d]) => [id, r1(d)])), r1(dh), r1(da), g.home, g.away]
}
const ptsPerElo = Math.round((sxy / sxx) * 10000) / 10000
console.log(`1 point d'Elo d'écart ≈ ${ptsPerElo} point au score (${Math.round(1 / ptsPerElo)} points d'Elo par point)`)

// Joueurs gardés : ceux qui ont joué lors des trois dernières saisons. Historique : les cinq dernières années.
const players = {}
const kept5 = monthOf(now) - 60
const hist = {}
for (const [id, s] of Object.entries(elo.players)) {
  if (s.season < loaded.season - 2) continue
  players[id] = [r1(s.r), s.n, s.min, s.w, s.l, s.last, s.season, r1(s.peak), s.team]
  const h = history[id]
  if (!h) continue
  const skip = Math.max(0, kept5 - h[0])
  hist[id] = skip ? [h[0] + skip, ...h.slice(1 + skip)] : h
  if (hist[id].length < 2) delete hist[id]
}
const all = evaluatePlayers(games, params, FROM, 'all')
const snapshot = {
  v: 2,
  builtAt: new Date().toISOString(),
  until,
  season: loaded.season,
  params,
  // Prévision d'avant-match sans les absents (comme dans l'appli avec le rapport des blessés), et avec tout le monde.
  quality: { logloss: Math.round(quality.logloss * 10000) / 10000, accuracy: Math.round(quality.accuracy * 1000) / 1000, n: quality.n, allAccuracy: Math.round(all.accuracy * 1000) / 1000 },
  ptsPerElo,
  games: games.length,
  first: usDay(games[0].t),
  eloSeason: elo.season,
  mean: r1(elo.mean),
  players,
  names: Object.fromEntries(Object.keys(players).map((id) => [id, names[id] ?? ''])),
  info: loaded.teams,
  history: hist,
  rot: Object.fromEntries(Object.entries(elo.rot).filter(([id]) => loaded.teams[id]).map(([id, r]) => [id, Object.fromEntries(Object.entries(r).map(([pid, m]) => [pid, r1(m)]))])),
  teamHistory: Object.fromEntries(Object.entries(teamHistory).filter(([id]) => loaded.teams[id])),
  recent,
}
const file = join(ROOT, 'public', 'elo.json')
writeFileSync(file, JSON.stringify(snapshot))
console.log(`écrit ${file} (${Math.round(JSON.stringify(snapshot).length / 1024)} Ko, ${Object.keys(players).length} joueurs)`)
const top = Object.entries(players).filter(([, p]) => p[6] >= loaded.season - 1 && p[1] >= 82).sort((a, b) => b[1][0] - a[1][0])
for (const [id, p] of top.slice(0, 15)) console.log(' ', names[id], p[0], loaded.teams[p[8]]?.[0])
const teams = Object.keys(loaded.teams).map((id) => [loaded.teams[id][0], teamStrength(elo, id, params)]).sort((a, b) => b[1] - a[1])
console.log(teams.map(([a, r]) => `${a} ${Math.round(r)}`).join(' · '))
