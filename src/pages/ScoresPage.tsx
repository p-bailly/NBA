import { useState } from 'react'
import { fetchScoreboard, type Game } from '../api/espn'
import { DateStrip } from '../components/DateStrip'
import { GameCard } from '../components/GameCard'
import { Empty, ErrorBox, Loading, PageHeader, Segmented, UpdatedAt } from '../components/ui'
import { liveInterval, usePolling } from '../hooks/usePolling'
import { longDay } from '../lib/format'
import { useFavorites } from '../lib/store'

type Filter = 'all' | 'live' | 'fav'

export function ScoresPage({ active }: { active: boolean }) {
  // undefined = journée choisie par ESPN (aujourd'hui, ou le prochain jour de match).
  const [day, setDay] = useState<string>()
  const [calendar, setCalendar] = useState<string[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const { ids: favs } = useFavorites()

  const { data, error, loading, updatedAt, refresh } = usePolling(
    async (signal) => {
      const sb = await fetchScoreboard(day, signal)
      if (sb.calendar.length) setCalendar(sb.calendar)
      return sb
    },
    [day],
    (sb) => liveInterval(sb.games),
    active,
  )

  const selected = day ?? data?.day
  const games = data?.games ?? []
  const isFav = (g: Game) => favs.includes(g.home.team.id) || favs.includes(g.away.team.id)
  const liveCount = games.filter((g) => g.state === 'in').length

  const shown = games.filter((g) => (filter === 'live' ? g.state === 'in' : filter === 'fav' ? isFav(g) : true))
  const favGames = filter === 'all' ? shown.filter(isFav) : []
  const rest = shown.filter((g) => !favGames.includes(g))
  const byTime = (a: Game, b: Game) => a.date.localeCompare(b.date)
  const sections: [string, Game[]][] = [
    ['Mes équipes', favGames.sort(byTime)],
    ['En direct', rest.filter((g) => g.state === 'in').sort(byTime)],
    ['À venir', rest.filter((g) => g.state === 'pre').sort(byTime)],
    ['Terminés', rest.filter((g) => g.state === 'post').sort(byTime)],
  ]

  return (
    <>
      <PageHeader
        title="Scores NBA"
        subtitle={selected ? longDay(selected) : ' '}
        right={
          <button className="icon-btn" onClick={refresh} aria-label="Actualiser">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className={loading ? 'spin' : ''}>
              <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        }
      />
      {selected && <DateStrip calendar={calendar} selected={selected} onSelect={setDay} />}

      <div className="toolbar">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Tous${games.length ? ` (${games.length})` : ''}` },
            { value: 'live', label: `En direct${liveCount ? ` (${liveCount})` : ''}` },
            { value: 'fav', label: 'Mes équipes' },
          ]}
        />
        <UpdatedAt at={updatedAt} loading={loading} />
      </div>

      <div className="content">
        {error && !data && <ErrorBox error={error} onRetry={refresh} />}
        {!data && !error && <Loading />}
        {data && games.length === 0 && <Empty>Aucun match ce jour-là.</Empty>}
        {data && games.length > 0 && shown.length === 0 && (
          <Empty>
            {filter === 'live'
              ? 'Aucun match en cours pour le moment.'
              : favs.length
                ? 'Pas de match de vos équipes ce jour-là.'
                : 'Ajoutez vos équipes favorites dans l’onglet « Mes équipes ».'}
          </Empty>
        )}
        {sections.map(
          ([title, list]) =>
            list.length > 0 && (
              <section key={title} className="games-section">
                <h2 className="section-title">{title}</h2>
                <div className="games-grid">
                  {list.map((g) => (
                    <GameCard key={g.id} game={g} day={selected} favorites={favs} />
                  ))}
                </div>
              </section>
            ),
        )}
        {data && games.length > 0 && <p className="footnote">Heures affichées dans votre fuseau horaire.</p>}
      </div>
    </>
  )
}
