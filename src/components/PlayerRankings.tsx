import { useMemo, useState } from 'react'
import { fetchCoreStatsFor, fetchPlayerStats, type CoreStats, type PlayerSeason, type PlayerStats } from '../api/playerStats'
import { usePolling } from '../hooks/usePolling'
import { href } from '../lib/router'
import { ErrorBox, Headshot, Loading, TeamLogo } from './ui'

interface Col {
  key: string
  label: string
  value: (p: PlayerSeason, core?: CoreStats) => number
  digits?: number
  signed?: boolean
  /** Le plus petit est le meilleur (balles perdues…) : premier tri croissant. */
  asc?: boolean
}

const per36 = (k: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'tpm') => (p: PlayerSeason) => (p.min ? (36 * p[k]) / p.min : 0)

const PER36_COLS: Col[] = [
  { key: 'pts', label: 'PTS', value: per36('pts') },
  { key: 'reb', label: 'REB', value: per36('reb') },
  { key: 'ast', label: 'PD', value: per36('ast') },
  { key: 'stl', label: 'INT', value: per36('stl') },
  { key: 'blk', label: 'CT', value: per36('blk') },
  { key: 'tpm', label: '3PTS', value: per36('tpm') },
  { key: 'tov', label: 'BP', value: per36('tov'), asc: true },
  { key: 'gp', label: 'MJ', value: (p) => p.gp, digits: 0 },
  { key: 'mpg', label: 'MIN', value: (p) => p.min / Math.max(1, p.gp) },
]

const ADVANCED_COLS: Col[] = [
  { key: 'per', label: 'PER', value: (_, c) => c?.per ?? NaN },
  { key: 'pm', label: '+/-', value: (_, c) => c?.plusMinus ?? NaN, digits: 0, signed: true },
  { key: 'pmg', label: '+/- /m', value: (p, c) => (c ? c.plusMinus / Math.max(1, p.gp) : NaN), signed: true },
  { key: 'ts', label: 'TS%', value: (p) => (p.fga + p.fta ? (100 * p.pts) / (2 * (p.fga + 0.44 * p.fta)) : NaN) },
  { key: 'efg', label: 'eFG%', value: (p) => (p.fga ? (100 * (p.fgm + 0.5 * p.tpm)) / p.fga : NaN) },
  { key: 'usg', label: 'USG%', value: (p) => p.usg },
  { key: 'astto', label: 'PD/BP', value: (p) => (p.tov ? p.ast / p.tov : NaN), digits: 2 },
  {
    key: 'eff',
    label: 'EFF',
    value: (p) => (p.pts + p.reb + p.ast + p.stl + p.blk - (p.fga - p.fgm) - (p.fta - p.ftm) - p.tov) / Math.max(1, p.gp),
  },
]

const fmt = (v: number, c: Col) => {
  if (!Number.isFinite(v)) return '–'
  const s = v.toLocaleString('fr-FR', { minimumFractionDigits: c.digits ?? 1, maximumFractionDigits: c.digits ?? 1 })
  return c.signed && v > 0 ? `+${s}` : s.replace('-', '−')
}

/** Fiches (+/- et PER) des joueurs classés : une requête par joueur, d'où le chargement à part. */
function useCoreStats(data: PlayerStats | undefined, active: boolean) {
  const ids = useMemo(
    () => (data?.players ?? []).filter((p) => p.qualified).sort((a, b) => b.min - a.min).map((p) => p.id),
    [data],
  )
  return usePolling(
    (s) => fetchCoreStatsFor(data!.year, data!.type, ids, s),
    [data?.year, data?.type, ids.join()],
    30 * 60_000,
    active && ids.length > 0,
  )
}

function usePlayerStats(active: boolean) {
  return usePolling((s) => fetchPlayerStats(s), [], 30 * 60_000, active)
}

/** Classement des joueurs classés, triable en touchant l'en-tête d'une colonne. */
export function StatsTable({ mode, active }: { mode: 'per36' | 'advanced'; active: boolean }) {
  const cols = mode === 'per36' ? PER36_COLS : ADVANCED_COLS
  const [sort, setSort] = useState<{ key: string; asc: boolean }>({ key: mode === 'per36' ? 'pts' : 'per', asc: false })
  const [all, setAll] = useState(false)
  const { data, error, refresh } = usePlayerStats(active)
  const core = useCoreStats(data, active && mode === 'advanced')

  const col = cols.find((c) => c.key === sort.key) ?? cols[0]
  const rows = useMemo(() => {
    const list = (data?.players ?? []).filter((p) => p.qualified)
    const v = (p: PlayerSeason) => col.value(p, core.data?.get(p.id))
    // Valeurs inconnues (fiche pas encore chargée) en fin de liste, quel que soit le sens.
    return list
      .map((p) => ({ p, v: v(p) }))
      .sort((a, b) => (Number.isFinite(a.v) ? (Number.isFinite(b.v) ? (sort.asc ? a.v - b.v : b.v - a.v) : -1) : 1))
  }, [data, core.data, col, sort.asc])

  if (error && !data) return <ErrorBox error={error} onRetry={refresh} />
  if (!data) return <Loading />

  const shown = all ? rows : rows.slice(0, 50)
  const onSort = (c: Col) =>
    setSort((s) => (s.key === c.key ? { key: c.key, asc: !s.asc } : { key: c.key, asc: !!c.asc }))

  return (
    <>
      {mode === 'advanced' && !core.data && <p className="notice">Chargement du +/- et du PER des joueurs…</p>}
      <section className="card flush">
        <h3 className="card-title">{mode === 'per36' ? 'Stats ramenées à 36 minutes' : 'Stats avancées'}</h3>
        <div className="table-scroll">
          <table className="bs-table rank-table">
            <thead>
              <tr>
                <th scope="col">Joueur</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" aria-sort={c.key === sort.key ? (sort.asc ? 'ascending' : 'descending') : undefined}>
                    <button className={`rank-sort ${c.key === sort.key ? 'active' : ''}`} onClick={() => onSort(c)}>
                      {c.label}
                      {c.key === sort.key ? (sort.asc ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p }, i) => (
                <tr key={p.id}>
                  <th scope="row">
                    <span className="rank-n">{i + 1}</span>
                    <a className="player-link" href={href.player(p.id)}>
                      <span className="bs-name">{p.shortName}</span>
                    </a>
                    {p.team && <span className="bs-pos">{p.team.abbr}</span>}
                  </th>
                  {cols.map((c) => (
                    <td key={c.key} className={c.key === sort.key ? 'strong' : ''}>
                      {fmt(c.value(p, core.data?.get(p.id)), c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 50 && (
          <button className="rank-more" onClick={() => setAll((a) => !a)}>
            {all ? 'Afficher les 50 premiers' : `Afficher les ${rows.length} joueurs classés`}
          </button>
        )}
      </section>
      <p className="footnote">
        {mode === 'per36'
          ? 'Moyennes ramenées à 36 minutes de jeu. MJ matchs joués · MIN minutes par match · PD passes · INT interceptions · CT contres · BP balles perdues.'
          : 'PER efficacité de Hollinger (moyenne 15) · +/- écart au score quand il est sur le terrain, sur la saison et par match · TS% adresse réelle (lancers et 3 pts compris) · eFG% adresse pondérée (un 3 pts vaut 1,5 tir) · USG% part des possessions de son équipe qu’il termine · PD/BP passes par balle perdue · EFF évaluation NBA par match.'}{' '}
        Joueurs classés : 70 % des matchs et 15 minutes par match. Touchez une colonne pour trier.
      </p>
    </>
  )
}

/** Leaders au +/- de la saison (total), sous la forme des autres classements. */
export function PlusMinusLeaders({ active }: { active: boolean }) {
  const { data, error, refresh } = usePlayerStats(active)
  const core = useCoreStats(data, active)

  if ((error && !data) || (core.error && !core.data)) return <ErrorBox error={(error ?? core.error)!} onRetry={error ? refresh : core.refresh} />
  if (!data || !core.data) return <Loading label="Chargement du +/- des joueurs…" />

  const top = data.players
    .filter((p) => core.data!.has(p.id))
    .map((p) => ({ p, pm: core.data!.get(p.id)!.plusMinus }))
    .sort((a, b) => b.pm - a.pm)
    .slice(0, 15)

  return (
    <>
      <section className="card flush">
        <h3 className="card-title">+/-</h3>
        <ol className="leader-list">
          {top.map(({ p, pm }, i) => (
            <li key={p.id} className={i === 0 ? 'first' : ''}>
              <span className="ll-rank">{i + 1}</span>
              <Headshot src={p.headshot} alt={p.name} size={i === 0 ? 56 : 44} />
              <span className="ll-main">
                <a className="player-link" href={href.player(p.id)}>
                  <strong>{p.name}</strong>
                </a>
                {p.team && (
                  <a className="ll-team muted" href={href.team(p.team.id)}>
                    <TeamLogo team={p.team} size={16} /> {p.team.name} · {p.position}
                  </a>
                )}
              </span>
              <span className="mvp-value">
                <span className="ll-value">{pm > 0 ? `+${pm}` : String(pm).replace('-', '−')}</span>
                <span className="muted pm-avg">
                  {fmt(pm / Math.max(1, p.gp), { key: '', label: '', value: () => 0, signed: true })} / m
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <p className="footnote">
        Écart au score cumulé quand le joueur est sur le terrain, sur la saison {data.season}. Joueurs classés : 70 % des matchs et
        15 minutes par match.
      </p>
    </>
  )
}
