import { useState } from 'react'
import { fetchRoster, fetchTeamSchedule, type Game } from '../api/espn'
import { Empty, ErrorBox, Headshot, LiveBadge, Loading, PageHeader, Segmented, Star, TeamLogo } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { shortDate, statusLabel } from '../lib/format'
import { href } from '../lib/router'
import { useFavorites } from '../lib/store'

type Tab = 'schedule' | 'roster'

export function TeamPage({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>('schedule')
  const favs = useFavorites()
  // Le calendrier fournit aussi les infos de l'équipe (bilan, rang).
  const sched = usePolling(
    (s) => fetchTeamSchedule(id, s),
    [id],
    (d) => (d.games.some((g) => g.state === 'in') ? 20_000 : null),
  )
  const info = sched.data?.info
  const team = info?.team

  return (
    <>
      <PageHeader
        back
        title={team?.displayName ?? 'Équipe'}
        right={
          <button
            className={`icon-btn star ${favs.has(id) ? 'on' : ''}`}
            onClick={() => favs.toggle(id)}
            aria-pressed={favs.has(id)}
            aria-label={favs.has(id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star on={favs.has(id)} />
          </button>
        }
      />
      {team && (
        <section className="team-hero" style={{ ['--team' as string]: team.color }}>
          <TeamLogo team={team} size={72} />
          <div>
            <h2>{team.displayName}</h2>
            {info?.record && <p className="team-record">{info.record}</p>}
            {info?.standing && <p className="muted">{translateStanding(info.standing)}</p>}
          </div>
        </section>
      )}
      <div className="toolbar sticky">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'schedule', label: 'Calendrier' },
            { value: 'roster', label: 'Effectif' },
          ]}
        />
      </div>
      <div className="content">
        {tab === 'roster' ? (
          <Roster id={id} />
        ) : sched.error && !sched.data ? (
          <ErrorBox error={sched.error} onRetry={sched.refresh} />
        ) : !sched.data ? (
          <Loading />
        ) : (
          <Schedule games={sched.data.games} teamId={id} />
        )}
      </div>
    </>
  )
}

function Schedule({ games, teamId }: { games: Game[]; teamId: string }) {
  if (!games.length) return <Empty>Calendrier indisponible.</Empty>

  const upcoming = games.filter((g) => g.state !== 'post')
  const results = games.filter((g) => g.state === 'post').reverse()

  return (
    <>
      {upcoming.length > 0 && (
        <section className="card flush">
          <h3 className="card-title">À venir</h3>
          <ul className="sched-list">
            {upcoming.slice(0, 15).map((g) => <SchedRow key={g.id} g={g} teamId={teamId} />)}
          </ul>
        </section>
      )}
      {results.length > 0 && (
        <section className="card flush">
          <h3 className="card-title">Résultats</h3>
          <ul className="sched-list">
            {results.map((g) => <SchedRow key={g.id} g={g} teamId={teamId} />)}
          </ul>
        </section>
      )}
    </>
  )
}

function SchedRow({ g, teamId }: { g: Game; teamId: string }) {
  const me = g.home.team.id === teamId ? g.home : g.away
  const opp = me === g.home ? g.away : g.home
  const won = g.state === 'post' && (me.score ?? 0) > (opp.score ?? 0)
  return (
    <li>
      <a href={href.game(g.id)} className="sched-row">
        <span className="sched-date">{shortDate(g.date)}</span>
        <span className="sched-opp">
          <span className="muted">{me.homeAway === 'home' ? 'vs' : '@'}</span>
          <TeamLogo team={opp.team} size={22} />
          {opp.team.name}
        </span>
        <span className="sched-result">
          {g.state === 'post' ? (
            <>
              <span className={`wl ${won ? 'w' : 'l'}`}>{won ? 'V' : 'D'}</span>
              {me.score}-{opp.score}
              {g.period > 4 && <span className="muted"> {g.period === 5 ? 'Prol.' : `${g.period - 4}P`}</span>}
            </>
          ) : g.state === 'in' ? (
            <>
              <LiveBadge />
              {me.score}-{opp.score}
            </>
          ) : (
            statusLabel(g)
          )}
        </span>
      </a>
    </li>
  )
}

function Roster({ id }: { id: string }) {
  const { data, error, refresh } = usePolling((s) => fetchRoster(id, s), [id])
  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />
  if (!data) return <Loading />
  return (
    <section className="card flush">
      <ul className="roster">
        {data.map((p) => (
          <li key={p.id}>
            <Headshot src={p.headshot} alt={p.name} size={44} />
            <span className="roster-main">
              <strong>{p.name}</strong>
              <span className="muted">
                {[p.position, p.height.replace(/' (\d+)"/, "'$1\""), p.age ? `${p.age} ans` : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
            {p.injury && <span className="inj-status out">{p.injury === 'Out' ? 'Absent' : p.injury}</span>}
            <span className="jersey">#{p.jersey}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function translateStanding(s: string): string {
  const m = s.match(/^(\d+)(?:st|nd|rd|th) in (.+)$/)
  if (!m) return s
  const rank = m[1] === '1' ? '1er' : `${m[1]}e`
  const DIVS: Record<string, string> = {
    Atlantic: 'Atlantique',
    Central: 'Centrale',
    Southeast: 'Sud-Est',
    Northwest: 'Nord-Ouest',
    Pacific: 'Pacifique',
    Southwest: 'Sud-Ouest',
  }
  const div = m[2]
    .replace(/(\w+) Division/, (_, d: string) => `division ${DIVS[d] ?? d}`)
    .replace(/(\w+)ern Conference/, (_, c: string) => `conférence ${c === 'East' ? 'Est' : 'Ouest'}`)
  return `${rank} de la ${div}`
}
