import { useState } from 'react'
import { fetchStandings, type Conference } from '../api/espn'
import { ErrorBox, Loading, PageHeader, Segmented, TeamLogo } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { href } from '../lib/router'
import { useFavorites } from '../lib/store'

type Conf = 'East' | 'West'

export function StandingsPage({ active }: { active: boolean }) {
  const [conf, setConf] = useState<Conf>('East')
  const [previous, setPrevious] = useState(false)

  const { data, error, refresh } = usePolling(
    async (signal) => {
      const current = await fetchStandings(undefined, signal)
      if (!previous) return current
      // ESPN désigne une saison par son année de fin : la saison avant "2026-27" est 2026.
      return fetchStandings(Number(current.season.slice(0, 4)), signal)
    },
    [previous],
    5 * 60_000,
    active,
  )

  const notStarted = !previous && data?.conferences.every((c) => c.rows.every((r) => r.wins + r.losses === 0))
  const current = data?.conferences.find((c) => c.short === conf)

  return (
    <>
      <PageHeader title="Classement" subtitle={data ? `Saison régulière ${data.season}` : ' '} />
      <div className="toolbar">
        <Segmented<Conf>
          value={conf}
          onChange={setConf}
          options={[
            { value: 'East', label: 'Conférence Est' },
            { value: 'West', label: 'Conférence Ouest' },
          ]}
        />
      </div>
      <div className="content">
        {error && !data && <ErrorBox error={error} onRetry={refresh} />}
        {!data && !error && <Loading />}
        {(notStarted || previous) && (
          <p className="notice">
            {previous ? 'Classement final de la saison précédente.' : 'La saison n’a pas encore commencé.'}{' '}
            <button className="link-btn" onClick={() => setPrevious(!previous)}>
              {previous ? 'Revenir à la saison en cours' : 'Voir la saison précédente'}
            </button>
          </p>
        )}
        {current && <ConferenceTable conf={current} />}
        <p className="footnote">1–6 : qualifiés pour les playoffs · 7–10 : play-in · GB : matchs de retard · Série : V = victoires, D = défaites</p>
      </div>
    </>
  )
}

function ConferenceTable({ conf }: { conf: Conference }) {
  const { has } = useFavorites()
  return (
    <div className="card flush">
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th scope="col" className="left">Équipe</th>
              <th scope="col">V</th>
              <th scope="col">D</th>
              <th scope="col">%</th>
              <th scope="col">GB</th>
              <th scope="col">Série</th>
              <th scope="col">10 der.</th>
              <th scope="col">Dom.</th>
              <th scope="col">Ext.</th>
              <th scope="col">Diff.</th>
            </tr>
          </thead>
          <tbody>
            {conf.rows.map((r, i) => (
              <tr
                key={r.team.id}
                className={[has(r.team.id) ? 'fav' : '', i === 5 ? 'cut-playoffs' : '', i === 9 ? 'cut-playin' : ''].join(' ')}
              >
                <th scope="row" className="left">
                  <a href={href.team(r.team.id)} className="st-team">
                    <span className="st-rank">{i + 1}</span>
                    <TeamLogo team={r.team} size={22} />
                    <span className="st-abbr">{r.team.abbr}</span>
                    <span className="st-name">{r.team.name}</span>
                  </a>
                </th>
                <td className="strong">{r.wins}</td>
                <td>{r.losses}</td>
                <td>{r.pct}</td>
                <td>{r.gb}</td>
                <td>{r.streak.replace('W', 'V').replace('L', 'D')}</td>
                <td>{r.last10}</td>
                <td>{r.home}</td>
                <td>{r.road}</td>
                <td className={r.diff.startsWith('-') ? 'neg' : r.diff.startsWith('+') ? 'pos' : ''}>{r.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
