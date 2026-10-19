import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// Notifications système : API du navigateur (via le service worker) pour la version web,
// plugin natif pour l'appli Android (la WebView ne gère pas l'API Notification).

export const isNative = Capacitor.isNativePlatform()

export type Permission = 'granted' | 'denied' | 'default'

const fromNative = (s: string): Permission => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'default')

export async function notificationPermission(): Promise<Permission> {
  if (isNative) return fromNative((await LocalNotifications.checkPermissions()).display)
  return 'Notification' in window ? Notification.permission : 'denied'
}

export async function requestNotificationPermission(): Promise<Permission> {
  if (isNative) return fromNative((await LocalNotifications.requestPermissions()).display)
  return 'Notification' in window ? Notification.requestPermission() : 'denied'
}

/** Identifiant numérique stable dérivé d'une clé (le plugin natif exige un entier 32 bits). */
function numericId(key: string): number {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Affiche une notification qui, touchée, ouvre `hash` (ex. "#/game/123"). */
export async function showNotification(key: string, title: string, body: string, hash: string) {
  try {
    if (isNative) {
      await LocalNotifications.schedule({ notifications: [{ id: numericId(key), title, body, extra: { hash } }] })
      return
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const options = { body, tag: key, icon: './icon-192.png', badge: './icon-192.png', data: { url: hash } }
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch {
    /* certaines plateformes refusent les notifications hors service worker */
  }
}

/** Appelle `open` avec le hash du match quand l'utilisateur touche une notification. */
export function onNotificationOpen(open: (hash: string) => void): () => void {
  if (isNative) {
    const handle = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
      const hash = a.notification.extra?.hash
      if (typeof hash === 'string') open(hash)
    })
    return () => void handle.then((h) => h.remove())
  }
  // Version web : le service worker transmet le clic à la page.
  const onMsg = (e: MessageEvent) => {
    if (e.data?.type === 'open' && typeof e.data.hash === 'string') open(e.data.hash)
  }
  navigator.serviceWorker?.addEventListener('message', onMsg)
  return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
}
