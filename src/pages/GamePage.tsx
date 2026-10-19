import { useState, type ReactNode } from 'react'
import { fetchGame, type Competitor, type GameDetail, type Leader, type Odds, type Team } from '../api/espn'
import { BoxScore } from '../components/BoxScore'
import { PlayByPlay } from '../components/PlayByPlay'
import { StatCompare } from '../components/StatCompare'
import { Empty, ErrorBox, Headshot, LiveBadge, Loading, PageHeader, Segmented, TeamLogo, UpdatedAt } from '../components/ui'
import { WinProbChart } from '../components/WinProbChart'
import { usePolling } from '../hooks/usePolling'
import { euroOdds, isClutch, periodLong, periodShort, shortDate, signedLine, statusLabel, timeOf } from '../lib/format'
import { href } from '../lib/router'
import { useFavorites } from '../lib/store'

type Tab = 'summary' | 'box' | 'pbp'

export function GamePage({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>('summary')
  const { data, error, updatedAt, loading, refresh } = usePolling(
    (signal) => fetchGame(id, signal),
    [id],
    (d) => (d.game.state === 'in' ? 10_000 : d.game.state === 'pre' ? 60_000 : null),
  )

  if (!data) {
    return (
      <>
        <PageHeader back title="Match" />
        <div className="content">{error ? <ErrorBox error={error} onRetry={refresh} /> : <Loading />}</div>
      </>
    )
  }

  const { game } = data
  const started = game.state !== 'pre'

  return (
    <>
      <PageHeader
        back
        title={`${game.away.team.abbr} @ ${game.home.team.abbr}`}
        subtitle={<UpdatedAt at={updatedAt} loading={loading} />}
      />
      <Scoreboard data={data} />
      {started && (
        <div className="toolbar sticky">
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'summary', label: 'Résumé' },
              { value: 'box', label: 'Box score' },
              { value: 'pbp', label: 'Actions' },
            ]}
          />
        </div>
      )}
      <div className="content">
        {(!started || tab === 'summary') && <Summary data={data} />}
        {started && tab === 'box' && (data.box.length ? <BoxScore teams={data.box} /> : <Empty>Box score indisponible.</Empty>)}
        {started && tab === 'pbp' && <PlayByPlay plays={data.plays} home={game.home.team} away={game.away.team} />}
      </div>
    </>
  )
}

function Scoreboard({ data }: { data: GameDetail }) {
  const { game } = data
  const live = game.state === 'in'
  const periods = Math.max(4, game.home.linescores.length, game.away.linescores.length)

  return (
    <section className={`scoreboard ${live ? 'live' : ''}`}>
      <div className="sb-main">
        <SbTeam c={game.away} game={data.game} />
        <div className="sb-center">
          {live && <LiveBadge label={isClutch(game) ? 'SERRÉ' : 'LIVE'} />}
          {game.state === 'pre' ? (
            <>
              <span className="sb-date">{shortDate(game.date)}</span>
              <span className="sb-time">{statusLabel(game)}</span>
            </>
          ) : (
            <span className={`sb-status ${live ? 'is-live' : ''}`}>
              {live && game.statusName === 'STATUS_IN_PROGRESS'
                ? `${periodLong(game.period)} · ${game.displayClock}`
                : statusLabel(game)}
            </span>
          )}
          {game.note && <span className="sb-note">{game.note}</span>}
        </div>
        <SbTeam c={game.home} game={data.game} />
      </div>

      {game.state !== 'pre' && (
        <div className="table-scroll">
          <table className="linescore">
            <thead>
              <tr>
                <th />
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i}>{i < 4 ? i + 1 : periodShort(i + 1)}</th>
                ))}
                <th>T</th>
              </tr>
            </thead>
            <tbody>
              {[game.away, game.home].map((c) => (
                <tr key={c.team.id}>
                  <th scope="row">{c.team.abbr}</th>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i}>{c.linescores[i] ?? '–'}</td>
                  ))}
                  <td className="strong">{c.score ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SbTeam({ c, game }: { c: Competitor; game: GameDetail['game'] }) {
  const { has } = useFavorites()
  const other = c.homeAway === 'home' ? game.away : game.home
  const lost = game.state === 'post' && (c.score ?? 0) < (other.score ?? 0)
  return (
    <a className={`sb-team ${lost ? 'loser' : ''}`} href={href.team(c.team.id)}>
      <TeamLogo team={c.team} size={56} />
      <span className="sb-name">
        {c.team.name}
        {has(c.team.id) && <span className="fav-mark">★</span>}
      </span>
      {c.record && <span className="sb-record">{c.record}</span>}
      {game.state !== 'pre' && <span className="sb-score">{c.score ?? 0}</span>}
    </a>
  )
}

const LEADER_LABELS: Record<string, string> = {
  points: 'Points',
  rebounds: 'Rebonds',
  assists: 'Passes déc.',
  pointsPerGame: 'Points / match',
  reboundsPerGame: 'Rebonds / match',
  assistsPerGame: 'Passes / match',
}

function Summary({ data }: { data: GameDetail }) {
  const { game } = data
  const home = game.home.team
  const away = game.away.team
  const started = game.state !== 'pre'

  const leadersOf = (t: Team) => data.leaders.find((l) => l.teamId === t.id)?.leaders ?? []
  const awayL = leadersOf(away)
  const homeL = leadersOf(home)
  const cats = [...new Set([...awayL, ...homeL].map((l) => l.category))].filter((c) => c in LEADER_LABELS)

  const injuries = data.injuries.filter((i) => i.status)

  return (
    <div className="summary">
      {started && data.winProb.length > 1 && (
        <Card title="Probabilité de victoire">
          <WinProbChart points={data.winProb} plays={data.plays} home={home} away={away} />
        </Card>
      )}

      {!started && data.predictorHome != null && (
        <Card title="Pronostic ESPN">
          <div className="stat-compare">
            <div className="sc-legend">
              <span><TeamLogo team={away} size={20} /><i className="key key-away" />{away.abbr}</span>
              <span>{home.abbr}<i className="key key-home" /><TeamLogo team={home} size={20} /></span>
            </div>
            <div className="sc-row">
              <div className="sc-values">
                <span>{(100 - data.predictorHome).toFixed(1)} %</span>
                <span className="sc-label">Chances de victoire</span>
                <span>{data.predictorHome.toFixed(1)} %</span>
              </div>
              <div className="sc-bar">
                <span className="away" style={{ flexGrow: 100 - data.predictorHome }} />
                <span className="home" style={{ flexGrow: data.predictorHome }} />
              </div>
            </div>
          </div>
        </Card>
      )}

      {!started && data.form.some((f) => f.games.length) && (
        <Card title="Forme (5 derniers matchs)">
          <div className="form-list">
            {[away, home].map((t) => {
              const games = data.form.find((f) => f.teamId === t.id)?.games ?? []
              return (
                <div key={t.id} className="form-row">
                  <span className="form-team">
                    <TeamLogo team={t} size={22} /> {t.abbr}
                  </span>
                  <span className="form-games">
                    {games.map((g) => (
                      <span key={g.id} className={`wl ${g.result === 'W' ? 'w' : 'l'}`} title={`${g.atVs} ${g.opponent} · ${g.score}`}>
                        {g.result === 'W' ? 'V' : 'D'}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {cats.length > 0 && (
        <Card title={started ? 'Leaders du match' : 'Leaders de la saison'}>
          <div className="leaders">
            {cats.map((cat) => {
              const a = awayL.find((l) => l.category === cat)
              const h = homeL.find((l) => l.category === cat)
              return (
                <div key={cat} className="leader-row">
                  <LeaderCell l={a} />
                  <span className="leader-cat">{LEADER_LABELS[cat]}</span>
                  <LeaderCell l={h} right />
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {started && data.teamStats.length > 0 && (
        <Card title="Stats d'équipe">
          <StatCompare stats={data.teamStats} home={home} away={away} />
        </Card>
      )}

      {data.odds && <OddsCard odds={data.odds} home={home} away={away} started={started} />}

      <Card title="Infos du match">
        <dl className="info-list">
          <dt>Date</dt>
          <dd>
            {new Date(game.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {timeOf(game.date)}
          </dd>
          {game.venue && (
            <>
              <dt>Salle</dt>
              <dd>{game.venue}{game.city ? `, ${game.city}` : ''}</dd>
            </>
          )}
          {game.broadcasts.length > 0 && (
            <>
              <dt>TV (US)</dt>
              <dd>{game.broadcasts.join(', ')}</dd>
            </>
          )}
          {data.seasonSeries && (
            <>
              <dt>Série</dt>
              <dd>{translateSeries(data.seasonSeries)}</dd>
            </>
          )}
          {data.attendance && (
            <>
              <dt>Affluence</dt>
              <dd>{data.attendance.toLocaleString('fr-FR')} spectateurs</dd>
            </>
          )}
          {data.officials.length > 0 && (
            <>
              <dt>Arbitres</dt>
              <dd>{data.officials.join(', ')}</dd>
            </>
          )}
        </dl>
      </Card>

      {injuries.length > 0 && (
        <Card title="Infirmerie">
          {[away, home].map((t) => {
            const list = injuries.filter((i) => i.teamId === t.id)
            if (!list.length) return null
            return (
              <div key={t.id} className="injuries">
                <h4>
                  <TeamLogo team={t} size={18} /> {t.name}
                </h4>
                <ul>
                  {list.map((i) => (
                    <li key={i.name}>
                      <span>{i.name}</span>
                      <span className={`inj-status ${i.status.toLowerCase().replace(/\W+/g, '-')}`}>
                        {translateInjury(i.status)}
                        {i.detail ? ` · ${i.detail}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}

/** Cotes au format européen : vainqueur, handicap et total de points. */
function OddsCard({ odds, home, away, started }: { odds: Odds; home: Team; away: Team; started: boolean }) {
  const ml = odds.moneyline ?? {}
  const mlAway = euroOdds(ml.away)
  const mlHome = euroOdds(ml.home)
  // En cote américaine, la plus petite valeur est celle du favori (-150 < +130).
  const fav = ml.home != null && ml.away != null && ml.home !== ml.away ? (ml.home < ml.away ? 'home' : 'away') : undefined
  const sp = odds.spread
  const spreadCell = (line?: number, american?: number) =>
    line == null ? '–' : `${signedLine(line)}${american != null ? ` · ${euroOdds(american)}` : ''}`
  const total = odds.total

  if (!(mlAway && mlHome) && sp?.home == null && total?.line == null) return null

  return (
    <Card title={started ? 'Cotes d’avant-match' : 'Cotes'}>
      <div className="odds">
        <div className="odds-row head">
          <span />
          <span><TeamLogo team={away} size={20} /> {away.abbr}</span>
          <span><TeamLogo team={home} size={20} /> {home.abbr}</span>
        </div>
        {mlAway && mlHome && (
          <div className="odds-row">
            <span className="odds-label">Vainqueur</span>
            <span className={fav === 'away' ? 'fav' : ''}>{mlAway}</span>
            <span className={fav === 'home' ? 'fav' : ''}>{mlHome}</span>
          </div>
        )}
        {sp && (sp.home != null || sp.away != null) && (
          <div className="odds-row">
            <span className="odds-label">Handicap</span>
            <span>{spreadCell(sp.away, sp.awayOdds)}</span>
            <span>{spreadCell(sp.home, sp.homeOdds)}</span>
          </div>
        )}
        {total?.line != null && (
          <div className="odds-row">
            <span className="odds-label">Total {total.line.toLocaleString('fr-FR')} pts</span>
            <span className="odds-wide">
              Plus <strong>{euroOdds(total.over) ?? '–'}</strong> · Moins <strong>{euroOdds(total.under) ?? '–'}</strong>
            </span>
          </div>
        )}
      </div>
      <p className="footnote left">
        Cotes {odds.provider ?? 'ESPN'} (États-Unis) converties au format européen ; celles des bookmakers français
        peuvent légèrement différer.
      </p>
    </Card>
  )
}

function LeaderCell({ l, right }: { l?: Leader; right?: boolean }) {
  if (!l) return <span className="leader-cell" />
  return (
    <span className={`leader-cell ${right ? 'right' : ''}`}>
      <Headshot src={l.headshot} alt={l.shortName} size={40} />
      <span className="leader-text">
        <strong>{l.value}</strong>
        <span className="muted">{l.shortName}</span>
      </span>
    </span>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h3 className="card-title">{title}</h3>
      {children}
    </section>
  )
}

function translateInjury(s: string): string {
  const map: Record<string, string> = {
    Out: 'Absent',
    'Day-To-Day': 'Incertain',
    Questionable: 'Incertain',
    Doubtful: 'Douteux',
    Probable: 'Probable',
    Suspension: 'Suspendu',
  }
  return map[s] ?? s
}

function translateSeries(s: string): string {
  return s
    .replace(/^Series starts (\d+)\/(\d+)$/, 'Première confrontation le $2/$1')
    .replace(/series tied (\d+-\d+)/i, 'série à égalité $1')
    .replace(/(\w+) leads series (\d+-\d+)/i, '$1 mène la série $2')
    .replace(/(\w+) wins series (\d+-\d+)/i, '$1 remporte la série $2')
}
