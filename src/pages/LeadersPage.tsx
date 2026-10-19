import { useState } from 'react'
import { fetchLeaders } from '../api/espn'
import { ErrorBox, Headshot, Loading, PageHeader, TeamLogo } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { href } from '../lib/router'

// Catégories affichées (nom ESPN → libellé français), dans l'ordre des onglets.
const CATEGORIES: [string, string][] = [
  ['pointsPerGame', 'Points'],
  ['reboundsPerGame', 'Rebonds'],
  ['assistsPerGame', 'Passes'],
  ['stealsPerGame', 'Interceptions'],
  ['blocksPerGame', 'Contres'],
  ['3PointsMadePerGame', '3 pts marqués'],
  ['fieldGoalPercentage', '% aux tirs'],
  ['3PointPct', '% à 3 pts'],
  ['FreeThrowPct', '% aux LF'],
  ['doubleDouble', 'Doubles-doubles'],
  ['PER', 'PER'],
  ['minutesPerGame', 'Minutes'],
]

export function LeadersPage({ active }: { active: boolean }) {
  const [cat, setCat] = useState(CATEGORIES[0][0])
  const { data, error, refresh } = usePolling((s) => fetchLeaders(s), [], 30 * 60_000, active)

  const category = data?.categories.find((c) => c.name === cat)
  const available = CATEGORIES.filter(([name]) => data?.categories.some((c) => c.name === name) ?? true)

  return (
    <>
      <PageHeader title="Leaders" subtitle={data ? `Saison ${data.season}` : ' '} />
      <div className="chips scroll">
        {available.map(([name, label]) => (
          <button key={name} className={`chip ${cat === name ? 'active' : ''}`} onClick={() => setCat(name)}>
            {label}
          </button>
        ))}
      </div>
      <div className="content">
        {error && !data && <ErrorBox error={error} onRetry={refresh} />}
        {!data && !error && <Loading />}
        {category && (
          <section className="card flush">
            <h3 className="card-title">{CATEGORIES.find(([name]) => name === cat)?.[1] ?? category.label}</h3>
            <ol className="leader-list">
              {category.entries.map((e, i) => (
                <li key={e.athleteId} className={i === 0 ? 'first' : ''}>
                  <span className="ll-rank">{i + 1}</span>
                  <Headshot src={e.headshot} alt={e.name} size={i === 0 ? 56 : 44} />
                  <span className="ll-main">
                    <strong>{e.name}</strong>
                    {e.team && (
                      <a className="ll-team muted" href={href.team(e.team.id)}>
                        <TeamLogo team={e.team} size={16} /> {e.team.name} · {e.position}
                      </a>
                    )}
                  </span>
                  <span className="ll-value">{e.value}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  )
}
