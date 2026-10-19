import { useEffect, useRef, useState } from 'react'
import { fetchScoreboard, type Game } from '../api/espn'
import { liveInterval, usePolling } from '../hooks/usePolling'
import { isClutch, periodShort } from '../lib/format'
import { showNotification, onNotificationOpen } from '../lib/notifications'
import { href } from '../lib/router'
import { getFavoriteIds, useAlertSettings, type AlertSettings } from '../lib/store'

interface Alert {
  key: string
  gameId: string
  title: string
  body: string
}

const score = (g: Game) => `${g.away.team.abbr} ${g.away.score ?? 0} – ${g.home.score ?? 0} ${g.home.team.abbr}`

/** Compare deux états d'un match et renvoie les alertes à déclencher. */
function diff(prev: Game, next: Game, s: AlertSettings): Alert[] {
  const out: Alert[] = []
  const base = { gameId: next.id }
  if (s.start && prev.state === 'pre' && next.state === 'in') {
    out.push({ ...base, key: `${next.id}:start`, title: 'Coup d’envoi', body: `${next.away.team.name} @ ${next.home.team.name}` })
  }
  if (s.clutch && !isClutch(prev) && isClutch(next)) {
    out.push({ ...base, key: `${next.id}:clutch:${next.period}`, title: `Match serré · ${periodShort(next.period)} ${next.displayClock}`, body: score(next) })
  }
  if (s.overtime && next.state === 'in' && next.period > 4 && next.period > prev.period) {
    out.push({ ...base, key: `${next.id}:ot:${next.period}`, title: periodShort(next.period) === 'Prol.' ? 'Prolongation !' : `${periodShort(next.period)} !`, body: score(next) })
  }
  if (s.final && prev.state === 'in' && next.state === 'post') {
    const w = (next.home.score ?? 0) > (next.away.score ?? 0) ? next.home : next.away
    out.push({ ...base, key: `${next.id}:final`, title: `Terminé · victoire des ${w.team.name}`, body: score(next) })
  }
  return out
}

/** Surveille les matchs du jour et affiche des alertes (bandeau dans l'app + notification système). */
export function Alerts() {
  const { settings } = useAlertSettings()
  const [toasts, setToasts] = useState<Alert[]>([])
  const prev = useRef(new Map<string, Game>())
  const fired = useRef(new Set<string>())

  const { data } = usePolling(
    (s) => fetchScoreboard(undefined, s),
    [],
    (sb) => liveInterval(sb.games),
    settings.enabled,
  )

  useEffect(() => {
    if (!data || !settings.enabled) return
    const favs = getFavoriteIds()
    const fresh: Alert[] = []
    for (const g of data.games) {
      const before = prev.current.get(g.id)
      prev.current.set(g.id, g)
      if (!before) continue // premier passage : on mémorise l'état sans alerter
      if (settings.favoritesOnly && !favs.includes(g.home.team.id) && !favs.includes(g.away.team.id)) continue
      for (const a of diff(before, g, settings)) {
        if (fired.current.has(a.key)) continue
        fired.current.add(a.key)
        fresh.push(a)
      }
    }
    if (!fresh.length) return
    fresh.forEach((a) => showNotification(a.key, a.title, a.body, href.game(a.gameId)))
    setToasts((t) => [...t, ...fresh].slice(-3))
  }, [data, settings])

  useEffect(() => {
    if (!toasts.length) return
    const t = window.setTimeout(() => setToasts((list) => list.slice(1)), 8000)
    return () => window.clearTimeout(t)
  }, [toasts])

  // Notification système touchée : on ouvre le match.
  useEffect(() => onNotificationOpen((hash) => (location.hash = hash)), [])

  if (!toasts.length) return null
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <a key={t.key} className="toast" href={href.game(t.gameId)} onClick={() => setToasts((l) => l.filter((x) => x !== t))}>
          <strong>{t.title}</strong>
          <span>{t.body}</span>
        </a>
      ))}
    </div>
  )
}
