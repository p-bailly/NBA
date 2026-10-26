import { useMemo, useState } from 'react'
import { Chips } from './ui'

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const label = (m: number) => `${MONTHS[m % 12]} ${2000 + Math.floor(m / 12)}`

type Range = '1' | '3' | 'all'
const SPAN: Record<Range, number> = { '1': 12, '3': 36, all: Infinity }

const W = 360
const H = 190
const L = 38
const R = 10
const T = 10
const B = 22

/** Courbe de l'Elo, mois par mois. `points` : [mois depuis janvier 2000, note]. */
export function EloChart({ points }: { points: [number, number][] }) {
  const [range, setRange] = useState<Range>('3')
  const [cursor, setCursor] = useState<number>()

  const view = useMemo(() => {
    if (points.length < 2) return undefined
    const last = points[points.length - 1][0]
    const lo = Math.max(points[0][0], last - SPAN[range])
    const data = points.filter(([m]) => m >= lo)
    // Le point juste avant la fenêtre, pour que la courbe démarre au bord gauche.
    const before = points.filter(([m]) => m < lo).at(-1)
    if (before && (!data.length || data[0][0] > lo)) data.unshift([lo, before[1]])
    if (data.length < 2) return undefined
    const ys = data.map((d) => d[1])
    const min = Math.floor((Math.min(...ys) - 15) / 50) * 50
    const max = Math.ceil((Math.max(...ys) + 15) / 50) * 50
    return { data, lo, hi: last, min, max: Math.max(max, min + 50) }
  }, [points, range])

  const options = [
    { value: '1' as Range, label: '1 an' },
    { value: '3' as Range, label: '3 ans' },
    { value: 'all' as Range, label: 'Tout' },
  ]

  if (!view) return <p className="muted">Pas assez d'historique pour tracer la courbe.</p>
  const { data, lo, hi, min, max } = view
  const x = (m: number) => L + ((m - lo) / Math.max(1, hi - lo)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B)
  const path = data.map(([m, v], i) => `${i ? 'L' : 'M'}${x(m).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const grid: number[] = []
  const stepY = max - min > 500 ? 100 : 50
  for (let v = Math.ceil(min / stepY) * stepY; v <= max; v += stepY) grid.push(v)
  const years: number[] = []
  const yearStep = (hi - lo) / 12 > 8 ? 2 : 1
  for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12 * yearStep) years.push(m)
  const peak = data.reduce((a, d) => (d[1] > a[1] ? d : a))
  const shown = cursor === undefined ? data[data.length - 1] : data[cursor]
  const prev = cursor === undefined ? data[data.length - 2] : data[cursor - 1]

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const m = lo + (((e.clientX - r.left) / r.width) * W - L) / (W - L - R) * (hi - lo)
    let best = 0
    data.forEach((d, i) => {
      if (Math.abs(d[0] - m) < Math.abs(data[best][0] - m)) best = i
    })
    setCursor(best)
  }

  return (
    <div className="elo-chart">
      <Chips options={options} value={range} onChange={(r) => { setRange(r); setCursor(undefined) }} />
      <p className="elo-chart-read">
        <strong>{Math.round(shown[1])}</strong> <span className="muted">· {label(shown[0])}</span>
        {prev && <span className={shown[1] - prev[1] >= 0 ? 'pos' : 'neg'}> {shown[1] - prev[1] >= 0 ? '+' : '−'}{Math.abs(Math.round(shown[1] - prev[1]))}</span>}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Évolution de l'Elo"
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons || e.pointerType === 'mouse' ? pick(e) : undefined}
        onPointerLeave={() => setCursor(undefined)}
      >
        {grid.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="ec-grid" />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" className="ec-axis">{v}</text>
          </g>
        ))}
        {years.map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="ec-axis">{2000 + m / 12}</text>
        ))}
        <path d={path} className="ec-line" />
        <circle cx={x(peak[0])} cy={y(peak[1])} r="3" className="ec-peak" />
        <text x={Math.min(Math.max(x(peak[0]), L + 14), W - R - 14)} y={y(peak[1]) - 7} textAnchor="middle" className="ec-axis">{Math.round(peak[1])}</text>
        {cursor !== undefined && (
          <>
            <line x1={x(shown[0])} x2={x(shown[0])} y1={T} y2={H - B} className="ec-cursor" />
            <circle cx={x(shown[0])} cy={y(shown[1])} r="4" className="ec-dot" />
          </>
        )}
      </svg>
      <p className="footnote">Note en fin de mois ; touche la courbe pour lire une valeur. Point : meilleur niveau de la période.</p>
    </div>
  )
}
