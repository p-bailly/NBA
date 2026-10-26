import { useState } from 'react'
import type { BoxPlayer, BoxTeam } from '../api/espn'
import { href } from '../lib/router'
import { EloDelta, Segmented, TeamLogo } from './ui'

// Colonnes affichées (clé ESPN → libellé français).
const COLS: [string, string][] = [
  ['minutes', 'MIN'],
  ['points', 'PTS'],
  ['rebounds', 'REB'],
  ['assists', 'PD'],
  ['fieldGoalsMade-fieldGoalsAttempted', 'TIRS'],
  ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PTS'],
  ['freeThrowsMade-freeThrowsAttempted', 'LF'],
  ['offensiveRebounds', 'RO'],
  ['steals', 'INT'],
  ['blocks', 'CT'],
  ['turnovers', 'BP'],
  ['fouls', 'F'],
  ['plusMinus', '+/-'],
]

const REASONS: Record<string, string> = {
  "COACH'S DECISION": "Choix de l'entraîneur",
  'NOT WITH TEAM': "Absent",
  INJURED: 'Blessé',
}

function PlayerRow({ p, elo }: { p: BoxPlayer; elo?: Record<string, number> }) {
  return (
    <tr className={p.didNotPlay ? 'dnp' : ''}>
      <th scope="row">
        <a className="player-link" href={href.player(p.id)}>
          <span className="bs-name">{p.shortName}</span>
        </a>
        <span className="bs-pos">{p.position}</span>
      </th>
      {p.didNotPlay ? (
        <td colSpan={COLS.length + (elo ? 1 : 0)} className="bs-reason">
          N’a pas joué{p.reason ? ` · ${REASONS[p.reason] ?? p.reason.toLowerCase()}` : ''}
        </td>
      ) : (
        <>
          {COLS.map(([k]) => (
            <td key={k} className={k === 'points' ? 'strong' : ''}>
              {p.stats[k] || '–'}
            </td>
          ))}
          {elo && <td>{elo[p.id] !== undefined ? <EloDelta value={elo[p.id]} /> : '–'}</td>}
        </>
      )}
    </tr>
  )
}

/** `elo` : variation d'Elo de chaque joueur (match terminé). */
export function BoxScore({ teams, elo }: { teams: BoxTeam[]; elo?: Record<string, number> }) {
  const [idx, setIdx] = useState('0')
  const t = teams[Number(idx)]
  if (!t) return null

  const starters = t.players.filter((p) => p.starter)
  const bench = t.players.filter((p) => !p.starter)

  return (
    <div className="boxscore">
      <Segmented
        value={idx}
        onChange={setIdx}
        options={teams.map((bt, i) => ({
          value: String(i),
          label: (
            <span className="seg-team">
              <TeamLogo team={bt.team} size={18} /> {bt.team.name}
            </span>
          ),
        }))}
      />
      <div className="table-scroll">
        <table className="bs-table">
          <thead>
            <tr>
              <th scope="col">Titulaires</th>
              {COLS.map(([k, l]) => (
                <th key={k} scope="col">{l}</th>
              ))}
              {elo && <th scope="col">ELO</th>}
            </tr>
          </thead>
          <tbody>
            {starters.map((p) => <PlayerRow key={p.id} p={p} elo={elo} />)}
            <tr className="bs-group">
              <th scope="row">Banc</th>
              <td colSpan={COLS.length + (elo ? 1 : 0)} />
            </tr>
            {bench.map((p) => <PlayerRow key={p.id} p={p} elo={elo} />)}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {COLS.map(([k]) => (
                <td key={k}>{t.totals[k] || ''}</td>
              ))}
              {elo && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="footnote">PD passes décisives · RO rebonds offensifs · INT interceptions · CT contres · BP balles perdues · LF lancers francs{elo ? ' · ELO variation d’Elo du joueur' : ''}</p>
    </div>
  )
}
