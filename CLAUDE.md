# CLAUDE.md

Appli Android « Basket Live » (`com.pbailly.superfanbasket`) : interface React 19 + TypeScript + Vite dans `src/`, embarquée
par Capacitor 8 dans `android/`. Pas de serveur ni de compte : tout est appelé depuis la WebView. Textes et commentaires en français.

## Commandes
- `npm run dev`, `npm run typecheck` (`tsc --noEmit`), `npm run build` (typecheck + Vite vers `dist/`). Ni tests ni lint.
- `npm run android` : build, `npx cap sync android`, puis `gradlew assembleRelease`. `cap sync` génère (gitignorés)
  `android/app/src/main/assets/public`, `capacitor.config.json`, `capacitor.plugins.json` et `res/xml/config.xml`.
- `node scripts/build-elo.mjs [--tune] [--refresh] [--until AAAA-MM-JJ]` écrit `public/elo.json`. Importe directement des `.ts`
  (Node avec suppression des types intégrée : vérifié avec Node 22.22). Le premier lancement télécharge ~17 000 box scores
  (~20 min) via `curl`, gardés dans `$TMPDIR/nba-elo`. `--tune` cherche les réglages ; `--refresh` retélécharge la liste des matchs.
- CI `.github/workflows/android.yml` (Node 22, Java 21), seulement sur la branche par défaut : une release unique `apk`,
  asset `basket-live.apk` écrasé. `versionCode` = n° de run, `versionName` = `1.<n° de run>` (`1.0` en local).

## Architecture
- `src/api/` : `espn.ts` (API ESPN vers des modèles simples), `eloFeed.ts`, `elo.ts`, `injuries.ts`, `oddsApi.ts`. `src/lib/` :
  formatage, `store.ts` (`localStorage`, clés `superfan:*` et `elo-v2`), routage par hash (`#/game/123`, hébergement statique),
  `projection.ts`, `eloCore.ts`/`playerEloCore.ts`, `nimbus.ts`, `notifications.ts`. Reste : `hooks/`, `components/`, `pages/`.
- `usePolling` : rafraîchit toutes les 15 s si un match est en cours, 30 s s'il commence dans moins de 30 min, 2 min sinon ;
  pause en arrière-plan. `design/logo/` : `python3 generer.py` (SVG + calques de l'icône), puis `png.cjs` (Playwright) pour les PNG.
- Alertes (`Alerts.tsx`) : comparent deux états successifs d'un match ; le premier passage mémorise sans alerter. « Match
  serré » (`isClutch`) : 4e période ou plus, ≤ 5 min, écart ≤ 5 pts. Notifications natives (`@capacitor/local-notifications`)
  seulement sur Android ; app fermée = aucune alerte (il faudrait un serveur de push).

## Données et limites
- API ESPN publique et non documentée (`site.api.espn.com`), qui peut changer sans préavis. CORS ouvert **sauf** `/teams` et
  `/teams/{id}` (WebView comprise) : la liste des équipes vient du classement, la fiche équipe du calendrier.
- Leaders : en début de saison ESPN sert encore ceux de la saison précédente, ils sont alors recalculés depuis les box scores.
- Cotes : par défaut ESPN (DraftKings, -110 → 1,91). The Odds API : 3 crédits par actualisation (vainqueur, handicap, total) sur
  500 par mois, cache 6 h, nouvel essai 15 min après une erreur. La clé reste dans le `localStorage` (`superfan:odds`).

## Projection et Elo (choix de conception)
- Projection de fin de saison (`projection.ts`) : 5 000 simulations Monte-Carlo des matchs restants, à partir du BPI d'ESPN (à
  défaut l'écart de points moyen) ; avantage du terrain 2 pts, écart-type d'un match 13, aléa de forme de 1,5 par équipe ;
  égalités départagées aux confrontations directes puis au bilan de conférence ; play-in joué ; recalcul toutes les 10 min au plus.
- Elo des joueurs (`playerEloCore.ts`) : calculé sur tous les box scores depuis 2013-14 (~16 000 matchs). Force d'équipe = notes
  des joueurs pondérées par leurs minutes. Après le match, chaque joueur bouge selon son résultat (celui de l'équipe mêlé à son
  +/-) comparé à l'attendu, d'autant plus qu'il a joué longtemps (multiplicateur d'écart au score de FiveThirtyEight). Un nouveau
  joueur démarre sous la moyenne et bouge beaucoup ; échelle recentrée sur 1500 à chaque saison.
- Elo d'une équipe : moyenne des Elo de ses joueurs pondérée par leurs **minutes attendues** (moyenne glissante de leurs derniers
  matchs avec l'équipe), **sans les absents** (statut « Out » du rapport des blessés ESPN, `injuries.ts`). Mesuré avant chaque
  match depuis 2016-17, en retirant ceux qui n'ont pas joué (proxy du rapport des blessés) : 66,9 % de vainqueurs bien prévus,
  contre 65,9 % sans retirer les absents (valeurs courantes dans `quality` de `elo.json`) et 65,1 % pour un Elo calculé sur les
  seuls résultats des équipes. Réglages choisis par `--tune`. Limite : un joueur transféré compte pour son ancienne équipe
  jusqu'à son premier match avec la nouvelle.
- `public/elo.json` est versionné : relancer le script à chaque nouvelle saison (ou de temps en temps) et le committer, sinon
  l'appli rattrape trop de matchs. Elle ajoute elle-même ceux joués depuis `until` (scoreboard du jour + un box score par match)
  et garde le résultat dans le `localStorage` (`elo-v2`).
- `eloCore.ts` et `playerEloCore.ts` sont exécutés tels quels par Node : syntaxe TypeScript effaçable seulement (ni `enum`, ni
  `namespace`, ni paramètre-propriété), imports avec extension `.ts`.

## Android et Nimbus
- Clé de signature `android/app/superfan.keystore` **versionnée exprès** (mots de passe dans `android/app/build.gradle`) : tous
  les APK ont la même signature. Usage perso, pas Play Store. Release non minifiée ; minSdk 24, compileSdk/targetSdk 36.
- Partage des favoris avec le launcher Nimbus (`fr.perso.nimbus`) : les favoris vivent dans le `localStorage` de la WebView,
  `src/lib/nimbus.ts` les remet (au démarrage et à chaque changement) au plugin local `NimbusBridge` (enregistré dans
  `MainActivity` avant `super.onCreate`), qui les garde dans des SharedPreferences. `NimbusProvider` les sert en lecture seule à
  `content://com.pbailly.superfanbasket.nimbus/favorites` : une ligne par équipe, dans l'ordre des favoris, colonnes `team_id`
  (id ESPN), `abbr`, `name` (null si l'appli ne connaît pas encore l'équipe). Les clés de signature diffèrent, donc l'appelant
  est vérifié dans le code (Nimbus et l'appli seulement). Les scores, Nimbus les demande lui-même à ESPN.
