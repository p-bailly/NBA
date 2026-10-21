import { Capacitor, registerPlugin } from '@capacitor/core'
import { onTeamSeen, seenTeam } from '../api/espn'
import { createStore, getFavoriteIds, subscribeFavorites } from './store'

// Partage des équipes favorites avec Nimbus, le launcher de l'utilisateur (appli Android seulement).
// Le plugin natif NimbusBridge les recopie dans des SharedPreferences que NimbusProvider sert à Nimbus
// (content://com.pbailly.superfanbasket.nimbus/favorites). Envoi au démarrage puis à chaque changement.
// Abréviation et nom court sont joints quand l'appli les connaît déjà (équipe vue dans une réponse d'ESPN,
// ou envoyée la fois précédente) ; sinon seul l'id part, Nimbus retrouve le reste dans le scoreboard.

export interface NimbusTeam {
  id: string
  abbr?: string
  name?: string
}

interface NimbusBridgePlugin {
  setFavorites(options: { teams: NimbusTeam[] }): Promise<void>
}

const NimbusBridge = registerPlugin<NimbusBridgePlugin>('NimbusBridge')

// Dernière liste remise au plugin, pour retrouver les noms dès le démarrage suivant.
const lastSent = createStore<{ teams: NimbusTeam[] }>('superfan:nimbus', { teams: [] })

function currentTeams(): NimbusTeam[] {
  const previous = new Map(lastSent.get().teams.map((t) => [t.id, t]))
  return getFavoriteIds().map((id) => {
    const seen = seenTeam(id)
    const abbr = seen?.abbr || previous.get(id)?.abbr
    const name = seen?.name || previous.get(id)?.name
    const team: NimbusTeam = { id }
    if (abbr) team.abbr = abbr
    if (name) team.name = name
    return team
  })
}

let sentJson = '' // ce qui a été remis au plugin pendant cette session
let timer: number | undefined

async function send() {
  timer = undefined
  const teams = currentTeams()
  const json = JSON.stringify(teams)
  if (json === sentJson) return
  sentJson = json
  try {
    await NimbusBridge.setFavorites({ teams })
    lastSent.set({ teams })
  } catch {
    sentJson = '' // on réessaiera au prochain changement
  }
}

// Regroupe les changements rapprochés (un scoreboard fait « voir » une vingtaine d'équipes d'un coup).
function schedule() {
  if (timer === undefined) timer = window.setTimeout(() => void send(), 0)
}

export function startNimbusSync() {
  if (!Capacitor.isNativePlatform()) return
  void send()
  subscribeFavorites(schedule)
  onTeamSeen(schedule)
}
