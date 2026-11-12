import { useMemo, useState, type PointerEvent } from 'react'
import type { Play, Team, WinProbPoint } from '../api/espn'
import { periodShort } from '../lib/format'
import { Segmented } from './ui'

const W = 600
const H = 160

type Overlay = 'points' | 'margin'

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

/** Arrondi au-dessus, au multiple de `step`. */
const ceilTo = (v: number, step: number) => Math.max(step, Math.ceil(v / step) * step)

/**
 * Probabilité de victoire au fil du match, avec le score par-dessus.
 * Probabilité : une seule courbe, au-dessus de 50 % l'équipe à domicile est favorite (sa couleur),
 * en dessous l'équipe extérieure. Score : soit les points de chaque équipe (échelle de droite,
 * de 0 au plus haut score), soit l'écart (au-dessus du milieu, l'équipe à domicile mène).
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
  const [overlay, setOverlay] = useState<Overlay>('points')

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

  // Score après chaque panier (et 0-0 au coup d'envoi), dans l'ordre du match.
  const score = useMemo(() => {
    const out = [{ t: 0, home: 0, away: 0, play: undefined as Play | undefined }]
    const sorted = plays
      .filter((p) => p.period > 0)
      .map((p) => ({ t: elapsed(p.period, p.clock), play: p }))
      .sort((a, b) => a.t - b.t)
    for (const { t, play } of sorted) {
      const prev = out[out.length - 1]
      if (play.homeScore === prev.home && play.awayScore === prev.away) continue
      out.push({ t, home: play.homeScore, away: play.awayScore, play })
    }
    // Dernière action connue, pour prolonger les courbes jusqu'au moment présent.
    const end = sorted[sorted.length - 1]
    if (end && end.t > out[out.length - 1].t) out.push({ ...out[out.length - 1], t: end.t, play: end.play })
    return out
  }, [plays])

  const hasWp = series.length >= 2
  if (!hasWp && score.length < 2) return null

  const lastT = Math.max(series[series.length - 1]?.t ?? 0, score[score.length - 1].t)
  const maxPeriod = Math.max(4, ...series.map((s) => s.play.period), ...plays.map((p) => p.period))
  const total = 2880 + (maxPeriod - 4) * 300
  const x = (t: number) => (t / total) * W
  const y = (pct: number) => (1 - pct) * H

  // Échelles du score.
  const maxPts = ceilTo(Math.max(...score.map((s) => Math.max(s.home, s.away))) + 5, 20)
  const maxMargin = ceilTo(Math.max(...score.map((s) => Math.abs(s.home - s.away))), 5)
  const yPts = (v: number) => (1 - v / maxPts) * H
  const yMargin = (m: number) => H / 2 - (m / maxMargin) * (H / 2)

  // Le score évolue par paliers : horizontal jusqu'au panier suivant, puis vertical.
  const step = (val: (s: (typeof score)[number]) => number) =>
    score.map((s, i) => `${i ? `H${x(s.t).toFixed(1)}V` : `M${x(s.t).toFixed(1)},`}${val(s).toFixed(1)}`).join('')

  const line = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.pct).toFixed(1)}`).join('')
  const area = hasWp
    ? `${line}L${x(series[series.length - 1].t).toFixed(1)},${H / 2}L${x(series[0].t).toFixed(1)},${H / 2}Z`
    : ''

  const periodLines = Array.from({ length: maxPeriod - 1 }, (_, i) => (i < 4 ? (i + 1) * 720 : 2880 + (i - 3) * 300))

  // Point survolé : un instant du match ; probabilité la plus proche, score à cet instant.
  const t = hover ?? lastT
  let wp = series[series.length - 1]
  if (hover != null && hasWp) for (const s of series) if (Math.abs(s.t - t) < Math.abs(wp.t - t)) wp = s
  const at = hasWp ? wp.t : t
  let sc = score[0]
  for (const s of score) if (s.t <= at) sc = s
  const play = hasWp ? wp.play : sc.play
  const homeFav = hasWp && wp.pct >= 0.5
  const pctLabel = (p: number) => `${Math.round(p * 100)} %`
  const lead = sc.home - sc.away

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(lastT, ((e.clientX - r.left) / r.width) * total)))
  }

  const dotY = hasWp ? y(wp.pct) : overlay === 'margin' ? yMargin(lead) : undefined

  return (
    <div className="wp">
      <div className="wp-head">
        <div className="wp-legend">
          <span><i className="key key-home" />{home.abbr} (dom.)</span>
          <span><i className="key key-away" />{away.abbr} (ext.)</span>
          {hasWp && (
            <span className="wp-legend-score">
              <i className="key key-score" />
              {overlay === 'points' ? 'points (pointillés)' : 'écart (pointillés)'}
            </span>
          )}
        </div>
        <div className="wp-readout" aria-live="polite">
          {hasWp && <strong>{homeFav ? home.abbr : away.abbr} {pctLabel(homeFav ? wp.pct : 1 - wp.pct)}</strong>}
          <span className={hasWp ? 'wp-score-now' : 'wp-score-now big'}>
            {away.abbr} {sc.away} – {sc.home} {home.abbr}
          </span>
          <span className="muted">
            {hover != null && play ? `${periodShort(play.period)} ${play.clock}` : 'actuellement'}
          </span>
        </div>
      </div>
      <div
        className="wp-plot"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={
          (hasWp ? `Probabilité de victoire : ${home.abbr} ${pctLabel(wp.pct)}, ${away.abbr} ${pctLabel(1 - wp.pct)}. ` : '') +
          `Score : ${away.abbr} ${sc.away}, ${home.abbr} ${sc.home}`
        }
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <clipPath id="wp-top"><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
            <clipPath id="wp-bottom"><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
          </defs>
          {periodLines.map((pt) => (
            <line key={pt} x1={x(pt)} x2={x(pt)} y1="0" y2={H} className="wp-grid" />
          ))}
          {(hasWp || overlay === 'margin') && <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="wp-mid" />}
          {hasWp && (
            <>
              <path d={area} className="wp-area home" clipPath="url(#wp-top)" />
              <path d={area} className="wp-area away" clipPath="url(#wp-bottom)" />
            </>
          )}
          {overlay === 'points' ? (
            <>
              <path d={step((s) => yPts(s.away))} className={`wp-score away ${hasWp ? '' : 'solid'}`} />
              <path d={step((s) => yPts(s.home))} className={`wp-score home ${hasWp ? '' : 'solid'}`} />
            </>
          ) : (
            <>
              <path d={step((s) => yMargin(s.home - s.away))} className={`wp-score home ${hasWp ? '' : 'solid'}`} clipPath="url(#wp-top)" />
              <path d={step((s) => yMargin(s.home - s.away))} className={`wp-score away ${hasWp ? '' : 'solid'}`} clipPath="url(#wp-bottom)" />
            </>
          )}
          {hasWp && (
            <>
              <path d={line} className="wp-line home" clipPath="url(#wp-top)" />
              <path d={line} className="wp-line away" clipPath="url(#wp-bottom)" />
            </>
          )}
          {hover != null && <line x1={x(at)} x2={x(at)} y1="0" y2={H} className="wp-cross" />}
        </svg>
        {hasWp ? (
          <>
            <span className="wp-axis top">{home.abbr} 100 %</span>
            <span className="wp-axis mid">50 %</span>
            <span className="wp-axis bottom">{away.abbr} 100 %</span>
          </>
        ) : null}
        {overlay === 'points' ? (
          <>
            <span className="wp-axis right top">{maxPts} pts</span>
            <span className="wp-axis right mid">{maxPts / 2}</span>
            <span className="wp-axis right bottom">0</span>
          </>
        ) : (
          <>
            <span className="wp-axis right top">{home.abbr} +{maxMargin}</span>
            <span className="wp-axis right bottom">{away.abbr} +{maxMargin}</span>
          </>
        )}
        {dotY != null && (
          <span
            className="wp-dot"
            style={{ left: `${(x(at) / W) * 100}%`, top: `${(dotY / H) * 100}%` }}
            data-side={hasWp ? (homeFav ? 'home' : 'away') : lead >= 0 ? 'home' : 'away'}
          />
        )}
        {overlay === 'points' && hover != null && (
          <>
            <span className="wp-dot small" data-side="home" style={{ left: `${(x(at) / W) * 100}%`, top: `${(yPts(sc.home) / H) * 100}%` }} />
            <span className="wp-dot small" data-side="away" style={{ left: `${(x(at) / W) * 100}%`, top: `${(yPts(sc.away) / H) * 100}%` }} />
          </>
        )}
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
      <div className="wp-overlay">
        <Segmented<Overlay>
          value={overlay}
          onChange={setOverlay}
          options={[
            { value: 'points', label: 'Points' },
            { value: 'margin', label: 'Écart' },
          ]}
        />
      </div>
      {hover != null && play && <p className="wp-play">{play.text}</p>}
    </div>
  )
}
