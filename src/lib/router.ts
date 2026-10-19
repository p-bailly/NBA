import { useSyncExternalStore } from 'react'

// Routage par hash (#/game/123) : marche sur n'importe quel hébergement statique.

export type Route =
  | { name: 'scores' }
  | { name: 'teams' }
  | { name: 'standings' }
  | { name: 'leaders' }
  | { name: 'news' }
  | { name: 'game'; id: string }
  | { name: 'team'; id: string }
  | { name: 'player'; id: string }

export const TABS = ['scores', 'teams', 'standings', 'leaders', 'news'] as const
export type TabName = (typeof TABS)[number]

function parse(hash: string): Route {
  const [name, id] = hash.replace(/^#\/?/, '').split('/')
  if ((name === 'game' || name === 'team' || name === 'player') && id) return { name, id }
  if ((TABS as readonly string[]).includes(name)) return { name: name as TabName }
  return { name: 'scores' }
}

let current = parse(location.hash)
const listeners = new Set<() => void>()
// Pile des pages visitées dans l'app, pour savoir si "retour" doit sortir de l'app.
const stack = [location.hash]
window.addEventListener('hashchange', () => {
  if (stack.length > 1 && stack[stack.length - 2] === location.hash) stack.pop()
  else stack.push(location.hash)
  current = parse(location.hash)
  listeners.forEach((l) => l())
})

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

export const href = {
  game: (id: string) => `#/game/${id}`,
  team: (id: string) => `#/team/${id}`,
  player: (id: string) => `#/player/${id}`,
  tab: (t: TabName) => (t === 'scores' ? '#/' : `#/${t}`),
}

/** Retour arrière : historique si on vient de l'app, sinon l'accueil. */
export function goBack() {
  if (stack.length > 1) history.back()
  else location.replace('#/')
}
