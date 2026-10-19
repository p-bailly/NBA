import { useState } from 'react'
import { fetchPlayer, type PlayerGame, type PlayerProfile } from '../api/espn'
import { Empty, ErrorBox, Headshot, Loading, PageHeader, Segmented, TeamLogo } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { heightMetric, ordinal, positionFr, shortDate, timeOf, weightMetric } from '../lib/format'
import { href } from '../lib/router'

type Tab = 'stats' | 'games'

/** "33.5" → "33,5" (les stats ESPN arrivent avec un point décimal). */
const fr = (v: string) => v.replace(/(\d)\.(\d)/g, '$1,$2')

// Moyennes : clé ESPN → libellé, dans l'ordre d'affichage.
const AVERAGES: [string, string][] = [
  ['avgPoints', 'PTS'],
  ['avgRebounds', 'REB'],
  ['avgAssists', 'PD'],
  ['avgSteals', 'INT'],
  ['avgBlocks', 'CT'],
  ['fieldGoalPct', '% TIRS'],
  ['threePointPct', '% 3PTS'],
  ['freeThrowPct', '% LF'],
  ['avgMinutes', 'MIN'],
  ['avgTurnovers', 'BP'],
  ['avgFouls', 'F'],
  ['gamesPlayed', 'MJ'],
]

const SUMMARY_LABELS: Record<string, string> = { PTS: 'Points', REB: 'Rebonds', AST: 'Passes déc.', 'FG%': '% aux tirs' }

function seasonTypeFr(s: string): string {
  const m = s.match(/^(\d{4}-\d{2})\s+(.+)$/)
  const type = (m ? m[2] : s)
    .replace(/Regular Season/i, 'Saison régulière')
    .replace(/Postseason/i, 'Playoffs')
    .replace(/Preseason/i, 'Présaison')
  return m ? `${type} ${m[1]}` : type
}

function draftFr(d?: string): string | undefined {
  const m = d?.match(/^(\d{4}): Rd (\d+), Pk (\d+)(?: \((\w+)\))?/)
  if (!m) return d
  return `${m[1]}, ${ordinal(Number(m[2]))} tour, ${ordinal(Number(m[3]))} choix${m[4] ? ` (${m[4]})` : ''}`
}

const experienceFr = (e?: string) => e?.replace(/^(\d+)\w*\s+Season$/i, (_, n: string) => `${ordinal(Number(n))} saison`)

export function PlayerPage({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>('stats')
  const { data, error, refresh } = usePolling((s) => fetchPlayer(id, s), [id])

  if (!data) {
    return (
      <>
        <PageHeader back title="Joueur" />
        <div className="content">{error ? <ErrorBox error={error} onRetry={refresh} /> : <Loading />}</div>
      </>
    )
  }

  return (
    <>
      <PageHeader back title={data.name} subtitle={data.team?.displayName} />
      <Hero p={data} />
      <div className="toolbar sticky">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stats', label: 'Stats' },
            { value: 'games', label: `Matchs${data.games.length ? ` (${data.games.length})` : ''}` },
          ]}
        />
      </div>
      <div className="content">{tab === 'stats' ? <Stats p={data} /> : <GameLog games={data.games} />}</div>
    </>
  )
}

function Hero({ p }: { p: PlayerProfile }) {
  const facts = [
    p.age && `${p.age} ans`,
    heightMetric(p.height),
    weightMetric(p.weight),
    p.birthPlace,
    experienceFr(p.experience),
  ].filter(Boolean)
  return (
    <section className="player-hero" style={p.team ? { ['--team' as string]: p.team.color } : undefined}>
      <Headshot src={p.headshot} alt={p.name} size={96} />
      <div className="player-id">
        <h2>{p.name}</h2>
        <p className="player-line">
          {p.jersey && <span className="jersey">#{p.jersey}</span>}
          {positionFr(p.position)}
          {p.team && (
            <a href={href.team(p.team.id)} className="player-team">
              <TeamLogo team={p.team} size={18} /> {p.team.name}
            </a>
          )}
        </p>
        <p className="muted small">{facts.join(' · ')}</p>
        {p.draft && <p className="muted small">Draft {draftFr(p.draft)}</p>}
      </div>
    </section>
  )
}

function Stats({ p }: { p: PlayerProfile }) {
  const season = p.summaryLabel.match(/\d{4}-\d{2}/)?.[0]
  const idx = (name: string) => p.averages.labels.indexOf(name)
  const regular = p.games.filter((g) => /Regular Season/i.test(g.seasonType))
  const latestSeason = regular[0]?.seasonType
  const records = recordsOf(regular.filter((g) => g.seasonType === latestSeason))

  return (
    <>
      {p.nextGame && (
        <a className="card next-game" href={href.game(p.nextGame.id)}>
          <span className="muted">Prochain match</span>
          <strong>{p.nextGame.label}</strong>
          <span>
            {shortDate(p.nextGame.date)} · {timeOf(p.nextGame.date)}
          </span>
        </a>
      )}

      {p.summary.length > 0 && (
        <section className="card">
          <h3 className="card-title">{season ? `Saison ${season}` : 'Saison'}</h3>
          <div className="stat-tiles">
            {p.summary.map((s) => (
              <div key={s.abbr} className="stat-tile">
                <span className="stat-label">{SUMMARY_LABELS[s.abbr] ?? s.abbr}</span>
                <span className="stat-value">{fr(s.value)}</span>
                {s.rank != null && <span className="stat-rank">{ordinal(s.rank)} NBA</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {p.averages.rows.length > 0 && (
        <section className="card flush">
          <h3 className="card-title">Moyennes par match</h3>
          <div className="table-scroll">
            <table className="bs-table avg-table">
              <thead>
                <tr>
                  <th scope="col" />
                  {AVERAGES.map(([, l]) => (
                    <th key={l} scope="col">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.averages.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{/career/i.test(r.label) ? 'Carrière' : 'Saison'}</th>
                    {AVERAGES.map(([k, l]) => (
                      <td key={l} className={k === 'avgPoints' ? 'strong' : ''}>
                        {idx(k) >= 0 ? fr(r.values[idx(k)] ?? '–') : '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {records.length > 0 && (
        <section className="card">
          <h3 className="card-title">Records de la saison{latestSeason ? ` ${latestSeason.match(/\d{4}-\d{2}/)?.[0] ?? ''}` : ''}</h3>
          <div className="stat-tiles">
            {records.map((r) => (
              <a key={r.label} className="stat-tile" href={href.game(r.game.id)}>
                <span className="stat-label">{r.label}</span>
                <span className="stat-value">{r.value}</span>
                <span className="stat-rank">
                  {r.game.atVs} {r.game.opponent.abbr} · {shortDate(r.game.date)}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {!p.summary.length && !p.averages.rows.length && <Empty>Pas encore de statistiques pour ce joueur.</Empty>}
    </>
  )
}

/** Meilleure performance de la saison dans chaque catégorie. */
function recordsOf(games: PlayerGame[]) {
  const made = (v?: string) => Number(v?.split('-')[0] ?? NaN)
  const cats: [string, (g: PlayerGame) => number][] = [
    ['Points', (g) => Number(g.stats.points)],
    ['Rebonds', (g) => Number(g.stats.totalRebounds)],
    ['Passes déc.', (g) => Number(g.stats.assists)],
    ['Paniers à 3 pts', (g) => made(g.stats['threePointFieldGoalsMade-threePointFieldGoalsAttempted'])],
    ['Interceptions', (g) => Number(g.stats.steals)],
    ['Contres', (g) => Number(g.stats.blocks)],
  ]
  return cats
    .map(([label, get]) => {
      let best: PlayerGame | undefined
      for (const g of games) if (Number.isFinite(get(g)) && (!best || get(g) > get(best))) best = g
      return best && get(best) > 0 ? { label, value: get(best), game: best } : undefined
    })
    .filter((r) => r !== undefined)
}

function GameLog({ games }: { games: PlayerGame[] }) {
  const [all, setAll] = useState(false)
  if (!games.length) return <Empty>Aucun match joué pour l’instant.</Empty>
  const shown = all ? games : games.slice(0, 20)
  return (
    <section className="card flush">
      <ul className="sched-list">
        {shown.map((g, i) => {
          const s = g.stats
          const newGroup = i === 0 || shown[i - 1].seasonType !== g.seasonType
          return (
            <li key={`${g.id}-${g.seasonType}`}>
              {newGroup && <div className="pbp-period">{seasonTypeFr(g.seasonType)}</div>}
              <a href={href.game(g.id)} className="glog-row">
                <span className="glog-date">{shortDate(g.date)}</span>
                <span className="glog-opp">
                  <span className="muted">{g.atVs}</span>
                  {g.opponent.logo && <TeamLogo team={{ logo: g.opponent.logo, abbr: g.opponent.abbr }} size={20} />}
                  {g.opponent.abbr}
                  <span className={`wl ${g.result === 'W' ? 'w' : 'l'}`}>{g.result === 'W' ? 'V' : 'D'}</span>
                  {g.teamScore && <span className="muted">{g.teamScore}-{g.oppScore}</span>}
                </span>
                <span className="glog-line">
                  <strong>{s.points} pts</strong> · {s.totalRebounds} reb · {s.assists} pd
                  <span className="muted">
                    {' '}· {s['fieldGoalsMade-fieldGoalsAttempted']?.replace('-', '/')} tirs · {s.minutes} min
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
      {!all && games.length > shown.length && (
        <button className="more-btn" onClick={() => setAll(true)}>
          Voir les {games.length} matchs
        </button>
      )}
    </section>
  )
}
