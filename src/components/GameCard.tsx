import { useEffect, useRef, useState } from 'react'
import type { Competitor, Game } from '../api/espn'
import { euroOdds, handicapLabel, isClutch, periodShort, statusLabel } from '../lib/format'
import { href } from '../lib/router'
import { LiveBadge, TeamLogo } from './ui'

/** Vrai pendant un court instant quand la valeur change (ex. panier marqué). */
function useFlash(value: unknown): boolean {
  const prev = useRef(value)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (prev.current !== value && prev.current != null) {
      setFlash(true)
      const t = window.setTimeout(() => setFlash(false), 1600)
      prev.current = value
      return () => window.clearTimeout(t)
    }
    prev.current = value
  }, [value])
  return flash
}

function TeamRow({ c, game, fav }: { c: Competitor; game: Game; fav: boolean }) {
  const flash = useFlash(c.score)
  const showScore = game.state !== 'pre' && c.score != null
  const other = c.homeAway === 'home' ? game.away : game.home
  const lost = game.state === 'post' && showScore && (c.score ?? 0) < (other.score ?? 0)
  return (
    <div className={`gc-row ${lost ? 'loser' : ''}`}>
      <TeamLogo team={c.team} size={30} />
      <div className="gc-name">
        <span className="gc-team">
          {c.team.name}
          {fav && <span className="fav-mark" aria-label="Favori">★</span>}
        </span>
        {c.record && <span className="gc-record">{c.record}</span>}
      </div>
      {showScore && <span className={`gc-score ${flash ? 'flash' : ''}`}>{c.score}</span>}
    </div>
  )
}

export function GameCard({ game, day, favorites }: { game: Game; day?: string; favorites: string[] }) {
  const live = game.state === 'in'
  const clutch = isClutch(game)
  const top = game.state !== 'pre' ? bestPerformer(game) : undefined
  const isFav = (c: Competitor) => favorites.includes(c.team.id)
  const odds = game.state === 'pre' ? game.odds : undefined
  const awayOdds = euroOdds(odds?.moneyline?.away)
  const homeOdds = euroOdds(odds?.moneyline?.home)
  const handicap = odds && handicapLabel(odds, game.home.team.abbr, game.away.team.abbr)
  const hasOdds = !!((awayOdds && homeOdds) || handicap)

  return (
    <a className={`game-card ${live ? 'live' : ''} ${clutch ? 'clutch' : ''}`} href={href.game(game.id)}>
      <div className="gc-main">
        <div className="gc-teams">
          <TeamRow c={game.away} game={game} fav={isFav(game.away)} />
          <TeamRow c={game.home} game={game} fav={isFav(game.home)} />
        </div>
        <div className="gc-status">
          {live && <LiveBadge label={clutch ? 'SERRÉ' : 'LIVE'} />}
          {game.state === 'post' && game.period > 4 ? (
            <>
              <span className="gc-status-text">Terminé</span>
              <span className="gc-tv">après {periodShort(game.period).toLowerCase()}</span>
            </>
          ) : (
            <span className={`gc-status-text ${live ? 'is-live' : ''}`}>{statusLabel(game, day)}</span>
          )}
          {game.state === 'pre' && game.broadcasts.length > 0 && (
            <span className="gc-tv">{game.broadcasts.slice(0, 2).join(' · ')}</span>
          )}
        </div>
      </div>
      {(top || game.note || (live && game.lastPlay) || hasOdds) && (
        <div className="gc-foot">
          {live && game.lastPlay ? (
            <span className="gc-lastplay">{game.lastPlay}</span>
          ) : top ? (
            <span>
              <span className="muted">Top : </span>
              {top.shortName} <span className="muted">({top.team})</span> · {top.value}
            </span>
          ) : hasOdds ? (
            <span className="gc-oddsline">
              {awayOdds && homeOdds && (
                <>
                  <span className="muted">Cotes </span>
                  {game.away.team.abbr} <strong>{awayOdds}</strong> · {game.home.team.abbr} <strong>{homeOdds}</strong>
                </>
              )}
              {awayOdds && homeOdds && handicap && <span className="muted"> · </span>}
              {handicap && (
                <>
                  <span className="muted">Hand. </span>
                  <strong>{handicap}</strong>
                </>
              )}
            </span>
          ) : null}
          {game.note && <span className="gc-note">{game.note}</span>}
        </div>
      )}
    </a>
  )
}

/** Meilleur joueur du match selon la note ESPN ("rating"), sinon le meilleur marqueur. */
function bestPerformer(game: Game) {
  const pick = (cat: string) =>
    [game.away, game.home]
      .flatMap((c) => c.leaders.filter((l) => l.category === cat).map((l) => ({ ...l, team: c.team.abbr })))
      .sort((a, b) => b.num - a.num)[0]
  const rating = pick('rating')
  if (rating) {
    const value = rating.value.replace('PTS', 'pts').replace('REB', 'reb').replace('AST', 'pd')
    return { shortName: rating.shortName, team: rating.team, value }
  }
  const points = pick('points')
  return points && { shortName: points.shortName, team: points.team, value: `${points.value} pts` }
}
