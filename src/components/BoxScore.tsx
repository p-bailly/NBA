import { useState } from 'react'
import type { BoxPlayer, BoxTeam } from '../api/espn'
import { Segmented, TeamLogo } from './ui'

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

function PlayerRow({ p }: { p: BoxPlayer }) {
  return (
    <tr className={p.didNotPlay ? 'dnp' : ''}>
      <th scope="row">
        <span className="bs-name">{p.shortName}</span>
        <span className="bs-pos">{p.position}</span>
      </th>
      {p.didNotPlay ? (
        <td colSpan={COLS.length} className="bs-reason">
          N’a pas joué{p.reason ? ` · ${REASONS[p.reason] ?? p.reason.toLowerCase()}` : ''}
        </td>
      ) : (
        COLS.map(([k]) => (
          <td key={k} className={k === 'points' ? 'strong' : ''}>
            {p.stats[k] || '–'}
          </td>
        ))
      )}
    </tr>
  )
}

export function BoxScore({ teams }: { teams: BoxTeam[] }) {
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
            </tr>
          </thead>
          <tbody>
            {starters.map((p) => <PlayerRow key={p.id} p={p} />)}
            <tr className="bs-group">
              <th scope="row">Banc</th>
              <td colSpan={COLS.length} />
            </tr>
            {bench.map((p) => <PlayerRow key={p.id} p={p} />)}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {COLS.map(([k]) => (
                <td key={k}>{t.totals[k] || ''}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="footnote">PD passes décisives · RO rebonds offensifs · INT interceptions · CT contres · BP balles perdues · LF lancers francs</p>
    </div>
  )
}
