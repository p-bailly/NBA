import type { Team, TeamStat } from '../api/espn'
import { TeamLogo } from './ui'

// Stats d'équipe affichées, dans l'ordre. "pct" = statistique de pourcentage associée.
const ROWS: { name: string; label: string; pct?: string }[] = [
  { name: 'fieldGoalsMade-fieldGoalsAttempted', label: 'Tirs', pct: 'fieldGoalPct' },
  { name: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', label: 'Tirs à 3 pts', pct: 'threePointFieldGoalPct' },
  { name: 'freeThrowsMade-freeThrowsAttempted', label: 'Lancers francs', pct: 'freeThrowPct' },
  { name: 'totalRebounds', label: 'Rebonds' },
  { name: 'offensiveRebounds', label: 'Rebonds offensifs' },
  { name: 'assists', label: 'Passes décisives' },
  { name: 'steals', label: 'Interceptions' },
  { name: 'blocks', label: 'Contres' },
  { name: 'totalTurnovers', label: 'Balles perdues' },
  { name: 'pointsInPaint', label: 'Points dans la raquette' },
  { name: 'fastBreakPoints', label: 'Points en contre-attaque' },
  { name: 'turnoverPoints', label: 'Points sur balles perdues' },
  { name: 'largestLead', label: 'Plus grosse avance' },
  { name: 'fouls', label: 'Fautes' },
]

/** Comparaison des stats d'équipe : valeurs aux deux extrémités, barre partagée au milieu. */
export function StatCompare({ stats, home, away }: { stats: TeamStat[]; home: Team; away: Team }) {
  const by = new Map(stats.map((s) => [s.name, s]))
  const rows = ROWS.map((r) => {
    const s = by.get(r.name)
    if (!s) return null
    const p = r.pct ? by.get(r.pct) : undefined
    const fmt = (v: string, pv?: string) => (pv ? `${v.replace('-', '/')} · ${pv} %` : v)
    const a = Number(p ? p.away : s.away) || 0
    const h = Number(p ? p.home : s.home) || 0
    return {
      label: r.label,
      away: fmt(s.away, p?.away),
      home: fmt(s.home, p?.home),
      share: a + h > 0 ? a / (a + h) : 0.5,
    }
  }).filter((r) => r !== null)

  if (!rows.length) return null

  return (
    <div className="stat-compare">
      <div className="sc-legend">
        <span><TeamLogo team={away} size={20} /><i className="key key-away" />{away.abbr}</span>
        <span>{home.abbr}<i className="key key-home" /><TeamLogo team={home} size={20} /></span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="sc-row" title={`${r.label} — ${away.abbr} ${r.away} / ${home.abbr} ${r.home}`}>
          <div className="sc-values">
            <span>{r.away}</span>
            <span className="sc-label">{r.label}</span>
            <span>{r.home}</span>
          </div>
          <div className="sc-bar">
            <span className="away" style={{ flexGrow: r.share }} />
            <span className="home" style={{ flexGrow: 1 - r.share }} />
          </div>
        </div>
      ))}
    </div>
  )
}
