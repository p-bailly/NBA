import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// Notifications système de l'appli Android (plugin natif : la WebView ne gère pas l'API Notification).
// Dans un navigateur (npm run dev), pas de notification : les alertes s'affichent seulement dans l'app.

export const isNative = Capacitor.isNativePlatform()

export type Permission = 'granted' | 'denied' | 'default'

const fromNative = (s: string): Permission => (s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'default')

export async function notificationPermission(): Promise<Permission> {
  return isNative ? fromNative((await LocalNotifications.checkPermissions()).display) : 'denied'
}

export async function requestNotificationPermission(): Promise<Permission> {
  return isNative ? fromNative((await LocalNotifications.requestPermissions()).display) : 'denied'
}

/** Identifiant numérique stable dérivé d'une clé (le plugin natif exige un entier 32 bits). */
function numericId(key: string): number {
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Affiche une notification qui, touchée, ouvre `hash` (ex. "#/game/123"). */
export async function showNotification(key: string, title: string, body: string, hash: string) {
  if (!isNative) return
  try {
    await LocalNotifications.schedule({ notifications: [{ id: numericId(key), title, body, extra: { hash } }] })
  } catch {
    /* notifications refusées */
  }
}

/** Appelle `open` avec le hash du match quand l'utilisateur touche une notification. */
export function onNotificationOpen(open: (hash: string) => void): () => void {
  if (!isNative) return () => {}
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const hash = a.notification.extra?.hash
    if (typeof hash === 'string') open(hash)
  })
  return () => void handle.then((h) => h.remove())
}
