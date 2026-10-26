import { useMemo, useState } from 'react'
import { fetchElo, type Elo, type EloPlayer, type EloTeam } from '../api/elo'
import { usePolling } from '../hooks/usePolling'
import { dayToDate } from '../lib/format'
import { href } from '../lib/router'
import { useFavorites } from '../lib/store'
import { Chips, Empty, ErrorBox, Headshot, Loading, TeamLogo } from './ui'

const PAGE = 50

/** Points d'écart attendus face à une équipe moyenne, sur terrain neutre. */
export const vsAverage = (elo: Elo, t: EloTeam) => (t.rating - elo.teamMean) * elo.ptsPerElo

const fr1 = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dayFr = (day: string) => dayToDate(day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export const headshotOf = (id: string) => `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`

function Delta({ v }: { v: number }) {
  if (Math.abs(v) < 1) return <span className="muted">=</span>
  return (
    <span className={v > 0 ? 'pos' : 'neg'}>
      {v > 0 ? '▲' : '▼'} {Math.round(Math.abs(v))}
    </span>
  )
}

/** Force des 30 équipes d'après l'Elo de leurs joueurs, de la meilleure à la plus faible. */
export function EloTeams({ active }: { active: boolean }) {
  const { data, error, loading, refresh } = usePolling(() => fetchElo(), [], 10 * 60_000, active)
  const { has } = useFavorites()

  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />
  if (!data) return <Loading label="Calcul de l’Elo…" />

  return (
    <div className="content">
      <div className="card flush">
        <ol className="elo-list">
          {data.teams.map((t) => (
            <TeamRow key={t.id} t={t} pts={vsAverage(data, t)} fav={has(t.id)} />
          ))}
        </ol>
      </div>
      <p className="footnote">
        L’Elo d’une équipe est la moyenne des Elo de ses joueurs, pondérée par leurs minutes attendues (moyenne glissante de leurs derniers matchs avec l’équipe),
        sans les joueurs absents d’après le rapport des blessés d’ESPN{data.injuries ? '' : ' (indisponible pour le moment)'}. Sous chaque équipe, l’écart de points
        attendu face à une équipe moyenne sur terrain neutre ({Math.round(1 / data.ptsPerElo)} points d’Elo ≈ 1 point) et ses absents. Réglage mesuré sur l’historique,
        avant chaque match : {(data.quality.accuracy * 100).toFixed(0)} % des vainqueurs bien prévus (avantage du terrain : {data.params.hca} points d’Elo). Évolution :
        sur 30 jours.
        {loading ? ' Mise à jour…' : ''}
      </p>
    </div>
  )
}

function TeamRow({ t, pts, fav }: { t: EloTeam; pts: number; fav: boolean }) {
  const absents = t.absents.filter((a) => a.minutes >= 10)
  return (
    <li>
      <a className="elo-row" href={href.team(t.id)}>
        <span className="elo-rank">{t.rank}</span>
        <TeamLogo team={t} size={30} />
        <span className="elo-name">
          <strong>
            {t.name}
            {fav && <span className="fav-mark">★</span>}
          </strong>
          <small className="muted">
            {pts >= 0 ? '+' : '−'}
            {fr1(Math.abs(pts))} pts
            {absents.length > 0 && ` · sans ${absents.map((a) => a.name.split(' ').slice(-1)[0]).join(', ')}`}
          </small>
        </span>
        <span className="elo-score">
          <strong>{Math.round(t.rating)}</strong>
          <small>
            <Delta v={t.delta} />
          </small>
        </span>
      </a>
    </li>
  )
}

type Scope = 'season' | 'all'

/** Elo des joueurs : ceux de la saison en cours, ou tous ceux des trois dernières saisons. */
export function EloPlayers({ active }: { active: boolean }) {
  const { data, error, loading, refresh } = usePolling(() => fetchElo(), [], 10 * 60_000, active)
  const { ids: favs } = useFavorites()
  const [scope, setScope] = useState<Scope>('season')
  const [team, setTeam] = useState('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const latest = Math.max(...data.players.map((p) => p.season))
    return data.players.filter(
      (p) =>
        (scope === 'all' ? p.games >= 20 : p.season === latest) &&
        (team === 'all' || (team === 'fav' ? favs.includes(p.team) : p.team === team)) &&
        (!q || p.name.toLowerCase().includes(q)),
    )
  }, [data, scope, team, query, favs])

  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />
  if (!data) return <Loading label="Calcul de l’Elo des joueurs…" />

  const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name))
  const reset = () => setShown(PAGE)

  return (
    <>
      <Chips<Scope>
        value={scope}
        onChange={(s) => (setScope(s), reset())}
        options={[
          { value: 'season', label: 'Saison en cours' },
          { value: 'all', label: '3 dernières saisons' },
        ]}
      />
      <div className="content">
        <div className="elo-filters">
          <input className="search" type="search" placeholder="Joueur…" value={query} onChange={(e) => (setQuery(e.target.value), reset())} />
          <select className="search" value={team} onChange={(e) => (setTeam(e.target.value), reset())} aria-label="Équipe">
            <option value="all">Toutes les équipes</option>
            {favs.length > 0 && <option value="fav">Mes équipes</option>}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {rows.length === 0 && <Empty>Aucun joueur ne correspond.</Empty>}
        {rows.length > 0 && (
          <div className="card flush">
            <ol className="elo-list">
              {rows.slice(0, shown).map((p, i) => (
                <PlayerRow key={p.id} p={p} pos={i + 1} team={data.teamById.get(p.team)?.abbr} />
              ))}
            </ol>
          </div>
        )}
        {rows.length > shown && (
          <button className="btn more" onClick={() => setShown(shown + PAGE)}>
            Voir {Math.min(PAGE, rows.length - shown)} joueurs de plus
          </button>
        )}
        <p className="footnote">
          Elo des joueurs calculé sur {data.games.toLocaleString('fr-FR')} matchs depuis le {dayFr(data.first)}, mis à jour avec les derniers box scores
          {data.added ? ` (${data.added} depuis le calcul)` : ''}. La force d’une équipe sur un match est la moyenne des notes de ses joueurs, pondérée par leurs minutes.
          Après le match, chaque joueur gagne ou perd selon l’écart entre son résultat et ce qui était attendu, d’autant plus qu’il a joué longtemps. Son résultat mêle
          celui de l’équipe et son +/- ({Math.round(data.params.alpha * 100)} %) : c’est ce qui départage les coéquipiers. Un nouveau joueur démarre un peu sous la
          moyenne ; sa note bouge beaucoup au début (K = {data.params.kMax} pour 48 minutes) puis se stabilise (K = {data.params.kMin}). Réglage mesuré sur
          l’historique : {Math.round(data.quality.accuracy * 100)} % des vainqueurs bien prévus avant le match. « Provisoire » : moins de 82 matchs. Évolution : sur 30 jours.
          {loading ? ' Mise à jour…' : ''}
        </p>
      </div>
    </>
  )
}

function PlayerRow({ p, pos, team }: { p: EloPlayer; pos: number; team?: string }) {
  return (
    <li>
      <a className="elo-row" href={href.player(p.id)}>
        <span className="elo-rank">{pos}</span>
        <Headshot src={headshotOf(p.id)} alt={p.name} size={30} />
        <span className="elo-name">
          <strong>{p.name}</strong>
          <small className="muted">{[team, `${p.games} matchs`, p.games < 82 ? 'provisoire' : '', p.out ? 'blessé' : ''].filter(Boolean).join(' · ')}</small>
        </span>
        <span className="elo-score">
          <strong>{Math.round(p.rating)}</strong>
          <small>
            <Delta v={p.delta} />
          </small>
        </span>
      </a>
    </li>
  )
}
