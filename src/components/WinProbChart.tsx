import { useMemo, useState, type PointerEvent } from 'react'
import type { Play, Team, WinProbPoint } from '../api/espn'
import { periodShort } from '../lib/format'

const W = 600
const H = 160

function clockSeconds(clock: string): number {
  const [m, s] = clock.split(':')
  return s === undefined ? Number(m) || 0 : Number(m) * 60 + Number(s)
}

/** Secondes écoulées depuis le début du match (12 min par QT, 5 min par prolongation). */
function elapsed(period: number, clock: string): number {
  const left = clockSeconds(clock)
  if (period <= 4) return (period - 1) * 720 + (720 - left)
  return 2880 + (period - 5) * 300 + (300 - left)
}

/**
 * Probabilité de victoire au fil du match. Une seule courbe : au-dessus de 50 %
 * l'équipe à domicile est favorite (sa couleur), en dessous l'équipe extérieure.
 */
export function WinProbChart({
  points,
  plays,
  home,
  away,
}: {
  points: WinProbPoint[]
  plays: Play[]
  home: Team
  away: Team
}) {
  const [hover, setHover] = useState<number | null>(null)

  const series = useMemo(() => {
    const byId = new Map(plays.map((p) => [p.id, p]))
    return points
      .map((pt) => {
        const play = byId.get(pt.playId)
        return play ? { t: elapsed(play.period, play.clock), pct: pt.homePct, play } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.t - b.t) // ESPN saisit parfois des actions en retard
  }, [points, plays])

  if (series.length < 2) return null

  const maxPeriod = Math.max(4, ...series.map((s) => s.play.period))
  const total = 2880 + (maxPeriod - 4) * 300
  const x = (t: number) => (t / total) * W
  const y = (pct: number) => (1 - pct) * H

  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.pct).toFixed(1)}`).join('')
  const area = `${line}L${x(series[series.length - 1].t).toFixed(1)},${H / 2}L${x(series[0].t).toFixed(1)},${H / 2}Z`

  const periodLines = Array.from({ length: maxPeriod - 1 }, (_, i) => (i < 4 ? (i + 1) * 720 : 2880 + (i - 3) * 300))
  const last = series[series.length - 1]
  const cur = hover != null ? series[hover] : last
  const homeFav = cur.pct >= 0.5
  const pctLabel = (p: number) => `${Math.round(p * 100)} %`

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - r.left) / r.width) * total
    let best = 0
    for (let i = 1; i < series.length; i++) if (Math.abs(series[i].t - t) < Math.abs(series[best].t - t)) best = i
    setHover(best)
  }

  return (
    <div className="wp">
      <div className="wp-head">
        <div className="wp-legend">
          <span><i className="key key-home" />{home.abbr} (dom.)</span>
          <span><i className="key key-away" />{away.abbr} (ext.)</span>
        </div>
        <div className="wp-readout" aria-live="polite">
          <strong>{homeFav ? home.abbr : away.abbr} {pctLabel(homeFav ? cur.pct : 1 - cur.pct)}</strong>
          <span className="muted">
            {hover != null ? `${periodShort(cur.play.period)} ${cur.play.clock}` : 'actuellement'}
          </span>
        </div>
      </div>
      <div
        className="wp-plot"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Probabilité de victoire : ${home.abbr} ${pctLabel(last.pct)}, ${away.abbr} ${pctLabel(1 - last.pct)}`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <clipPath id="wp-top"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
            <clipPath id="wp-bottom"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
          </defs>
          {periodLines.map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1="0" y2={H} className="wp-grid" />
          ))}
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="wp-mid" />
          <path d={area} className="wp-area home" clipPath="url(#wp-top)" />
          <path d={area} className="wp-area away" clipPath="url(#wp-bottom)" />
          <path d={line} className="wp-line home" clipPath="url(#wp-top)" />
          <path d={line} className="wp-line away" clipPath="url(#wp-bottom)" />
          {hover != null && <line x1={x(cur.t)} x2={x(cur.t)} y1="0" y2={H} className="wp-cross" />}
        </svg>
        <span className="wp-axis top">{home.abbr} 100 %</span>
        <span className="wp-axis mid">50 %</span>
        <span className="wp-axis bottom">{away.abbr} 100 %</span>
        <span
          className="wp-dot"
          style={{ left: `${(x(cur.t) / W) * 100}%`, top: `${(y(cur.pct) / H) * 100}%` }}
          data-side={homeFav ? 'home' : 'away'}
        />
      </div>
      <div className="wp-periods">
        {Array.from({ length: maxPeriod }, (_, i) => {
          const len = i < 4 ? 720 : 300
          return (
            <span key={i} style={{ width: `${(len / total) * 100}%` }}>
              {periodShort(i + 1)}
            </span>
          )
        })}
      </div>
      {hover != null && <p className="wp-play">{cur.play.text}</p>}
    </div>
  )
}
