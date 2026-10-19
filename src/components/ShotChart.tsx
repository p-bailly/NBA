import { useMemo, useState } from 'react'
import type { BoxTeam, Play, Team } from '../api/espn'
import { periodShort } from '../lib/format'
import { href } from '../lib/router'
import { Empty, Segmented, TeamLogo } from './ui'

// Demi-terrain NBA en pieds : 50 de large, 47 de long, cercle à 5,25 de la ligne de fond.
// ESPN donne x (0–50) et y mesuré depuis le cercle : on place donc le tir à (x, y + 5,25).
const RIM_Y = 5.25
const toCourt = (s: NonNullable<Play['shot']>) => ({
  cx: Math.min(49.5, Math.max(0.5, s.x)),
  cy: Math.min(46.5, Math.max(0.5, s.y + RIM_Y)),
})

type Zone = 'paint' | 'mid' | 'three'
function zoneOf(s: NonNullable<Play['shot']>): Zone {
  if (s.points === 3) return 'three'
  return Math.abs(s.x - 25) <= 8 && s.y + RIM_Y <= 19 ? 'paint' : 'mid'
}
const ZONES: [Zone, string][] = [
  ['paint', 'Raquette'],
  ['mid', 'Mi-distance'],
  ['three', 'À 3 points'],
]

function Court() {
  return (
    <g className="court" fill="none">
      <rect x="0" y="0" width="50" height="47" />
      <rect x="17" y="0" width="16" height="19" className="paint" />
      <circle cx="25" cy="19" r="6" />
      <path d="M21 5.25A4 4 0 0 0 29 5.25" />
      <path d="M3 0V14.2A23.75 23.75 0 0 0 47 14.2V0" />
      <path d="M19 47A6 6 0 0 1 31 47" />
      <line x1="22" x2="28" y1="4" y2="4" className="board" />
      <circle cx="25" cy={RIM_Y} r="0.75" className="rim" />
    </g>
  )
}

/** Carte des tirs (hors lancers francs) d'une équipe, mise à jour en direct avec le match. */
export function ShotChart({ plays, box, home, away, live }: { plays: Play[]; box: BoxTeam[]; home: Team; away: Team; live: boolean }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const [period, setPeriod] = useState<number | 'all'>('all')
  const [player, setPlayer] = useState('all')
  const [selected, setSelected] = useState<string>()

  const team = side === 'home' ? home : away
  const names = useMemo(() => new Map(box.flatMap((b) => b.players.map((p) => [p.id, p.shortName] as const))), [box])

  const teamShots = plays.filter((p) => p.shot && p.teamId === team.id)
  const periods = [...new Set(teamShots.map((p) => p.period))].sort((a, b) => a - b)
  const inPeriod = teamShots.filter((p) => period === 'all' || p.period === period)
  const shots = inPeriod.filter((p) => player === 'all' || p.athleteId === player)

  // Joueurs ayant tiré, du plus grand nombre de tentatives au plus petit.
  const shooters = [...new Set(inPeriod.map((p) => p.athleteId).filter((id): id is string => !!id))]
    .map((id) => {
      const mine = inPeriod.filter((p) => p.athleteId === id)
      return { id, name: names.get(id) ?? '?', made: mine.filter((p) => p.shot!.made).length, att: mine.length }
    })
    .sort((a, b) => b.att - a.att)

  const made = shots.filter((p) => p.shot!.made).length
  const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)} %` : '–')
  const sel = shots.find((p) => p.id === selected)
  const latest = live ? shots[shots.length - 1] : undefined

  // Les positions ESPN sont arrondies au pied : plusieurs tirs peuvent se superposer.
  // Toucher à nouveau le même endroit passe au tir suivant de la pile.
  const pick = (p: Play) => {
    const { cx, cy } = toCourt(p.shot!)
    const stack = shots.filter((q) => {
      const c = toCourt(q.shot!)
      return Math.hypot(c.cx - cx, c.cy - cy) < 1
    })
    const i = stack.findIndex((q) => q.id === selected)
    setSelected(stack[(i + 1) % stack.length].id)
  }

  const pickPeriod = (p: number | 'all') => {
    setPeriod(p)
    setSelected(undefined)
  }

  return (
    <div className="shots">
      <Segmented
        value={side}
        onChange={(v) => {
          setSide(v)
          setPlayer('all')
          setSelected(undefined)
        }}
        options={[
          { value: 'away', label: <span className="seg-team"><TeamLogo team={away} size={18} /> {away.name}</span> },
          { value: 'home', label: <span className="seg-team"><TeamLogo team={home} size={18} /> {home.name}</span> },
        ]}
      />
      <div className="shots-filters">
        <div className="chips">
          <button className={`chip ${period === 'all' ? 'active' : ''}`} onClick={() => pickPeriod('all')}>
            Tout
          </button>
          {periods.map((p) => (
            <button key={p} className={`chip ${period === p ? 'active' : ''}`} onClick={() => pickPeriod(p)}>
              {periodShort(p)}
            </button>
          ))}
        </div>
        <select
          className="select"
          value={player}
          onChange={(e) => {
            setPlayer(e.target.value)
            setSelected(undefined)
          }}
        >
          <option value="all">Tous les joueurs</option>
          {shooters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.made}/{s.att})
            </option>
          ))}
        </select>
      </div>

      {teamShots.length === 0 ? (
        <Empty>Aucun tir pour l’instant.</Empty>
      ) : (
        <>
          <div className="shots-head">
            <strong>
              {made}/{shots.length} · {pct(made, shots.length)}
            </strong>
            <span className="shots-legend" data-side={side}>
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" className="mk made" /></svg> Réussi
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2L10 10M10 2L2 10" className="mk miss" /></svg> Manqué
            </span>
          </div>
          <div className="court-wrap" data-side={side}>
            <svg viewBox="-1 -1 52 49" role="img" aria-label={`Carte des tirs ${team.name} : ${made} réussis sur ${shots.length}`}>
              <Court />
              {[...shots.filter((p) => p.id !== selected), ...(sel ? [sel] : [])].map((p) => {
                const { cx, cy } = toCourt(p.shot!)
                const isSel = p.id === selected
                return (
                  <g key={p.id} className={`shot ${isSel ? 'sel' : ''} ${p === latest ? 'latest' : ''}`} onClick={() => pick(p)}>
                    {p.shot!.made ? (
                      <circle cx={cx} cy={cy} r="0.85" className="mk made" />
                    ) : (
                      <path d={`M${cx - 0.7} ${cy - 0.7}L${cx + 0.7} ${cy + 0.7}M${cx + 0.7} ${cy - 0.7}L${cx - 0.7} ${cy + 0.7}`} className="mk miss" />
                    )}
                    {/* Zone de toucher plus grande que la marque. */}
                    <circle cx={cx} cy={cy} r="1.9" className="hit" />
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="shot-detail" aria-live="polite">
            {sel ? (
              <>
                <span className="muted">
                  {periodShort(sel.period)} {sel.clock} · {sel.shot!.made ? 'Réussi' : 'Manqué'} · {sel.shot!.points} pts
                </span>
                <span>{sel.text}</span>
                {sel.athleteId && names.get(sel.athleteId) && (
                  <a className="link-btn" href={href.player(sel.athleteId)}>
                    Fiche de {names.get(sel.athleteId)} ›
                  </a>
                )}
              </>
            ) : (
              <span className="muted">Touchez un tir pour voir le détail.{live ? ' Le dernier tir clignote.' : ''}</span>
            )}
          </div>
          <table className="zones">
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col">Réussis</th>
                <th scope="col">%</th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map(([z, label]) => {
                const inZone = shots.filter((p) => zoneOf(p.shot!) === z)
                const m = inZone.filter((p) => p.shot!.made).length
                return (
                  <tr key={z}>
                    <th scope="row">{label}</th>
                    <td>
                      {m}/{inZone.length}
                    </td>
                    <td className="strong">{pct(m, inZone.length)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="footnote">Hors lancers francs. Positions fournies par ESPN, à quelques dizaines de centimètres près.</p>
        </>
      )}
    </div>
  )
}
