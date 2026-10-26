import { useState, type ReactNode } from 'react'
import { fetchGame, type Competitor, type Game, type GameDetail, type Leader, type Odds, type Team } from '../api/espn'
import { useGameOdds } from '../api/oddsApi'
import { BoxScore } from '../components/BoxScore'
import { PlayByPlay } from '../components/PlayByPlay'
import { ShotChart } from '../components/ShotChart'
import { StatCompare } from '../components/StatCompare'
import { EloDelta, Empty, ErrorBox, Headshot, LiveBadge, Loading, PageHeader, Segmented, TeamLogo, UpdatedAt } from '../components/ui'
import { WinProbChart } from '../components/WinProbChart'
import { useElo, usePlayerElo } from '../hooks/useElo'
import { usePolling } from '../hooks/usePolling'
import { formatOdds, isClutch, periodLong, periodShort, shortDate, signedLine, statusLabel, timeAgo, timeOf } from '../lib/format'
import { href } from '../lib/router'
import { useFavorites, useOddsSettings } from '../lib/store'

type Tab = 'summary' | 'box' | 'pbp' | 'shots'

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
              { value: 'shots', label: 'Tirs' },
            ]}
          />
        </div>
      )}
      <div className="content">
        {(!started || tab === 'summary') && <Summary data={data} />}
        {started && tab === 'box' && (data.box.length ? <GameBox data={data} /> : <Empty>Box score indisponible.</Empty>)}
        {started && tab === 'pbp' && <PlayByPlay plays={data.plays} home={game.home.team} away={game.away.team} />}
        {started && tab === 'shots' && (
          <ShotChart plays={data.plays} box={data.box} home={game.home.team} away={game.away.team} live={game.state === 'in'} />
        )}
      </div>
    </>
  )
}

/** Box score, avec la variation d'Elo de chaque joueur une fois le match terminé. */
function GameBox({ data }: { data: GameDetail }) {
  const elo = usePlayerElo()
  const deltas = data.game.state === 'post' ? elo?.recent.get(data.game.id) : undefined
  return <BoxScore teams={data.box} elo={deltas} />
}

function Scoreboard({ data }: { data: GameDetail }) {
  const { game } = data
  const live = game.state === 'in'
  const periods = Math.max(4, game.home.linescores.length, game.away.linescores.length)
  const elo = useElo()
  const change = game.state === 'post' ? elo?.recent.get(game.id) : undefined

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

      {change && (
        <div className="sb-elo">
          <span>
            {game.away.team.abbr} <EloDelta value={change.away} />
          </span>
          <span className="muted">variation d’Elo</span>
          <span>
            <EloDelta value={change.home} /> {game.home.team.abbr}
          </span>
        </div>
      )}
    </section>
  )
}

/** Chances de victoire d'après l'Elo des deux équipes, avant le match. */
function EloCard({ game }: { game: Game }) {
  const elo = useElo()
  const ph = elo?.prob(game.home.team.id, game.away.team.id, game.neutral)
  if (!elo || ph === undefined) return null
  const home = game.home.team
  const away = game.away.team
  const rh = elo.byId.get(home.id)!
  const ra = elo.byId.get(away.id)!
  const pts = (rh.rating - ra.rating + (game.neutral ? 0 : elo.params.hca)) / 28
  const fav = pts >= 0 ? home : away
  return (
    <Card title="Elo">
      <div className="stat-compare">
        <div className="sc-legend">
          <span><TeamLogo team={away} size={20} /><i className="key key-away" />{away.abbr}</span>
          <span>{home.abbr}<i className="key key-home" /><TeamLogo team={home} size={20} /></span>
        </div>
        <div className="sc-row">
          <div className="sc-values">
            <span>{Math.round(ra.rating)} <small className="muted">({ra.rank}e)</small></span>
            <span className="sc-label">Note Elo (rang)</span>
            <span>{Math.round(rh.rating)} <small className="muted">({rh.rank}e)</small></span>
          </div>
        </div>
        <div className="sc-row">
          <div className="sc-values">
            <span>{((1 - ph) * 100).toFixed(0)} %</span>
            <span className="sc-label">Chances de victoire</span>
            <span>{(ph * 100).toFixed(0)} %</span>
          </div>
          <div className="sc-bar">
            <span className="away" style={{ flexGrow: 1 - ph }} />
            <span className="home" style={{ flexGrow: ph }} />
          </div>
        </div>
      </div>
      <p className="footnote">
        {fav.name} favori de {Math.abs(pts).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pts
        {game.neutral ? ' (terrain neutre)' : `, avantage du terrain compris (${elo.params.hca} points d’Elo)`}.
      </p>
    </Card>
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

      {!started && <EloCard game={game} />}

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

      <OddsCard game={game} fallback={data.odds} />

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
function OddsCard({ game, fallback }: { game: Game; fallback?: Odds }) {
  const odds = useGameOdds(game, fallback)
  const { settings } = useOddsSettings()
  if (!odds) return null
  const home = game.home.team
  const away = game.away.team
  const started = game.state !== 'pre'
  const ml = odds.moneyline ?? {}
  const mlAway = formatOdds(ml.away)
  const mlHome = formatOdds(ml.home)
  // La plus petite cote est celle du favori.
  const fav = ml.home != null && ml.away != null && ml.home !== ml.away ? (ml.home < ml.away ? 'home' : 'away') : undefined
  const sp = odds.spread
  const spreadCell = (line?: number, price?: number) =>
    line == null ? '–' : `${signedLine(line)}${price != null ? ` · ${formatOdds(price)}` : ''}`
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
              Plus <strong>{formatOdds(total.over) ?? '–'}</strong> · Moins <strong>{formatOdds(total.under) ?? '–'}</strong>
            </span>
          </div>
        )}
      </div>
      {odds.source === 'oddsapi' ? (
        <p className="footnote left">
          Cotes {odds.provider} via The Odds API{odds.updatedAt ? ` · mises à jour ${timeAgo(odds.updatedAt)}` : ''}.
        </p>
      ) : (
        <p className="footnote left">
          Cotes {odds.provider ?? 'ESPN'} (États-Unis) converties au format européen.
          {settings.apiKey
            ? ' Ce match n’est pas (encore) proposé par les bookmakers français.'
            : ' Pour les cotes Winamax, Betclic, Unibet… ajoutez une clé The Odds API dans « Mes équipes ».'}
        </p>
      )}
    </Card>
  )
}

function LeaderCell({ l, right }: { l?: Leader; right?: boolean }) {
  if (!l) return <span className="leader-cell" />
  return (
    <a className={`leader-cell player-link ${right ? 'right' : ''}`} href={href.player(l.athleteId)}>
      <Headshot src={l.headshot} alt={l.shortName} size={40} />
      <span className="leader-text">
        <strong>{l.value}</strong>
        <span className="muted">{l.shortName}</span>
      </span>
    </a>
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
