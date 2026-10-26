import { useEffect, useRef, useState } from 'react'
import type { Competitor, Game } from '../api/espn'
import { useGameOdds } from '../api/oddsApi'
import { useElo } from '../hooks/useElo'
import { formatOdds, handicapLabel, isClutch, periodShort, statusLabel } from '../lib/format'
import { href } from '../lib/router'
import { EloDelta, LiveBadge, TeamLogo } from './ui'

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

function TeamRow({ c, game, fav, elo, chance, change }: { c: Competitor; game: Game; fav: boolean; elo?: number; chance?: number; change?: number }) {
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
        {(c.record || change !== undefined || elo !== undefined) && (
          <span className="gc-record">
            {c.record}
            {c.record && (change !== undefined || elo !== undefined) && ' · '}
            {change !== undefined ? (
              <>
                Elo <EloDelta value={change} />
              </>
            ) : (
              elo !== undefined && `Elo ${Math.round(elo)}`
            )}
          </span>
        )}
      </div>
      {chance !== undefined && (
        <span className={`gc-prob ${chance >= 0.5 ? 'fav' : ''}`} title="Chances de gagner d'après l'Elo">
          {Math.round(chance * 100)} %
        </span>
      )}
      {showScore && <span className={`gc-score ${flash ? 'flash' : ''}`}>{c.score}</span>}
    </div>
  )
}

export function GameCard({ game, day, favorites }: { game: Game; day?: string; favorites: string[] }) {
  const live = game.state === 'in'
  const clutch = isClutch(game)
  const top = game.state !== 'pre' ? bestPerformer(game) : undefined
  const isFav = (c: Competitor) => favorites.includes(c.team.id)
  const gameOdds = useGameOdds(game, game.odds)
  const odds = game.state === 'pre' ? gameOdds : undefined
  const awayOdds = formatOdds(odds?.moneyline?.away)
  const homeOdds = formatOdds(odds?.moneyline?.home)
  const handicap = odds && handicapLabel(odds, game.home.team.abbr, game.away.team.abbr)
  const hasOdds = !!((awayOdds && homeOdds) || handicap)
  const elo = useElo()
  const homeProb = game.state === 'pre' ? elo?.prob(game.home.team.id, game.away.team.id, game.neutral) : undefined
  const change = game.state === 'post' ? elo?.recent.get(game.id) : undefined
  const rating = (c: Competitor) => (homeProb !== undefined ? elo?.teamById.get(c.team.id)?.rating : undefined)

  return (
    <a className={`game-card ${live ? 'live' : ''} ${clutch ? 'clutch' : ''}`} href={href.game(game.id)}>
      <div className="gc-main">
        <div className="gc-teams">
          <TeamRow c={game.away} game={game} fav={isFav(game.away)} elo={rating(game.away)} chance={homeProb === undefined ? undefined : 1 - homeProb} change={change?.away} />
          <TeamRow c={game.home} game={game} fav={isFav(game.home)} elo={rating(game.home)} chance={homeProb} change={change?.home} />
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
      {homeProb !== undefined && (
        <div className="gc-chance" aria-hidden="true">
          <span className="away" style={{ flexGrow: 1 - homeProb }} />
          <span className="home" style={{ flexGrow: homeProb }} />
        </div>
      )}
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
                  <span className="muted">{odds?.short ?? 'Cotes'} </span>
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
