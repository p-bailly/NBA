import { useState } from 'react'
import type { Play, Team } from '../api/espn'
import { periodLong, periodShort } from '../lib/format'
import { Empty, TeamLogo } from './ui'

/** Fil des actions, plus récentes en haut, filtrable par période. */
export function PlayByPlay({ plays, home, away }: { plays: Play[]; home: Team; away: Team }) {
  const periods = [...new Set(plays.map((p) => p.period))].filter((p) => p > 0)
  const [period, setPeriod] = useState<number | 'all'>('all')
  const [scoringOnly, setScoringOnly] = useState(false)

  if (!plays.length) return <Empty>Le fil des actions démarrera au coup d’envoi.</Empty>

  const shown = plays
    .filter((p) => (period === 'all' || p.period === period) && (!scoringOnly || p.scoring))
    .reverse()
  const teamOf = (id?: string) => (id === home.id ? home : id === away.id ? away : undefined)

  return (
    <div className="pbp">
      <div className="chips">
        <button className={`chip ${period === 'all' ? 'active' : ''}`} onClick={() => setPeriod('all')}>
          Tout
        </button>
        {periods.map((p) => (
          <button key={p} className={`chip ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
            {periodShort(p)}
          </button>
        ))}
        <label className="chip toggle">
          <input type="checkbox" checked={scoringOnly} onChange={(e) => setScoringOnly(e.target.checked)} />
          Paniers
        </label>
      </div>
      <ol className="pbp-list">
        {shown.map((p, i) => {
          const team = teamOf(p.teamId)
          const newPeriod = period === 'all' && (i === 0 || shown[i - 1].period !== p.period)
          return (
            <li key={p.id} className={p.scoring ? 'scoring' : ''}>
              {newPeriod && <div className="pbp-period">{periodLong(p.period)}</div>}
              <div className="pbp-row">
                <span className="pbp-clock">{p.clock}</span>
                <span className="pbp-logo">{team && <TeamLogo team={team} size={20} />}</span>
                <span className="pbp-text">{p.text}</span>
                <span className="pbp-score">
                  {p.awayScore}–{p.homeScore}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
