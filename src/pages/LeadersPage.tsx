import { useState } from 'react'
import { fetchLeaders, seenTeam, type LeaderEntry, type SeasonLeaders } from '../api/espn'
import { fetchMvpRace } from '../api/mvp'
import { ErrorBox, Headshot, Loading, PageHeader, TeamLogo, UpdatedAt } from '../components/ui'
import { usePolling } from '../hooks/usePolling'
import { href } from '../lib/router'

// Catégories affichées (nom ESPN → libellé français), dans l'ordre des onglets.
const MVP = 'mvp'
const CATEGORIES: [string, string][] = [
  [MVP, 'Course au MVP'],
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
  const { data, error, refresh } = usePolling(
    (s) => fetchLeaders(s),
    [],
    (d) => (d.computedFrom ? 10 * 60_000 : 30 * 60_000),
    active,
  )

  const category = data?.categories.find((c) => c.name === cat)
  const available = CATEGORIES.filter(([name]) => name === MVP || (data?.categories.some((c) => c.name === name) ?? true))

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
        {cat === MVP && <MvpRace leaders={data} active={active} />}
        {cat !== MVP && error && !data && <ErrorBox error={error} onRetry={refresh} />}
        {cat !== MVP && !data && !error && <Loading />}
        {cat !== MVP && data?.computedFrom && (
          <p className="notice">
            ESPN n’a pas encore publié les stats officielles de la saison : classements calculés sur{' '}
            {data.computedFrom > 1 ? `les ${data.computedFrom} premiers matchs` : 'le premier match'}.
          </p>
        )}
        {category && (
          <section className="card flush">
            <h3 className="card-title">{CATEGORIES.find(([name]) => name === cat)?.[1] ?? category.label}</h3>
            <ol className="leader-list">
              {category.entries.map((e, i) => (
                <li key={e.athleteId} className={i === 0 ? 'first' : ''}>
                  <span className="ll-rank">{i + 1}</span>
                  <Headshot src={e.headshot} alt={e.name} size={i === 0 ? 56 : 44} />
                  <span className="ll-main">
                    <a className="player-link" href={href.player(e.athleteId)}>
                      <strong>{e.name}</strong>
                    </a>
                    {e.team && (
                      <a className="ll-team muted" href={href.team(e.team.id)}>
                        <TeamLogo team={e.team} size={16} /> {e.team.name} · {e.position}
                      </a>
                    )}
                  </span>
                  <span className="ll-value">{e.value.replace(/(\d)\.(\d)/, '$1,$2')}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  )
}

// Nom sans accents ni ponctuation, pour rapprocher les noms Polymarket de ceux d'ESPN.
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const pct = (p: number) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.1 ? 1 : 0 })} %`

function MvpRace({ leaders, active }: { leaders?: SeasonLeaders; active: boolean }) {
  const { data, error, loading, updatedAt, refresh } = usePolling((s) => fetchMvpRace(s), [], 5 * 60_000, active)

  // Photo, équipe et fiche du joueur : prises dans les leaders ESPN quand le nom y figure.
  const espn = new Map<string, LeaderEntry>()
  for (const c of leaders?.categories ?? []) for (const e of c.entries) espn.set(norm(e.name), e)

  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />
  if (!data) return <Loading />
  const max = data.candidates[0]?.prob || 1

  return (
    <>
      <p className="notice">
        Probabilité que chaque joueur soit élu MVP {data.season},{' '}
        {data.source === 'polymarket' ? (
          <>
            selon le marché de prédiction{' '}
            <a href={data.url} target="_blank" rel="noreferrer">
              Polymarket
            </a>{' '}
            ({Math.round(data.volume ?? 0).toLocaleString('fr-FR')} $ échangés).
          </>
        ) : (
          <>d’après les cotes de DraftKings (sans la marge du bookmaker). Polymarket n’est pas accessible depuis la France.</>
        )}{' '}
        <UpdatedAt at={updatedAt} loading={loading} />
      </p>
      <section className="card flush">
        <h3 className="card-title">Course au MVP</h3>
        <ol className="leader-list">
          {data.candidates.map((c, i) => {
            const e = espn.get(norm(c.name))
            const athleteId = c.athleteId ?? e?.athleteId
            const team = (c.teamId && seenTeam(c.teamId)) || e?.team
            const change = c.weekChange !== undefined && Math.abs(c.weekChange) >= 0.005 ? c.weekChange : undefined
            return (
              <li key={c.name} className={i === 0 ? 'first' : ''}>
                <span className="ll-rank">{i + 1}</span>
                <Headshot src={e?.headshot ?? c.image} alt={c.name} size={i === 0 ? 56 : 44} />
                <span className="ll-main">
                  {athleteId ? (
                    <a className="player-link" href={href.player(athleteId)}>
                      <strong>{c.name}</strong>
                    </a>
                  ) : (
                    <strong>{c.name}</strong>
                  )}
                  {team && (
                    <a className="ll-team muted" href={href.team(team.id)}>
                      <TeamLogo team={team} size={16} /> {team.name}
                    </a>
                  )}
                  <span className="mvp-bar">
                    <span style={{ width: `${(c.prob / max) * 100}%` }} />
                  </span>
                </span>
                <span className="mvp-value">
                  <span className="ll-value">{pct(c.prob)}</span>
                  {change !== undefined && (
                    <span className={`elo-delta ${change > 0 ? 'pos' : 'neg'}`} title="Variation sur 7 jours">
                      {change > 0 ? '+' : '−'}
                      {(Math.abs(change) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}
