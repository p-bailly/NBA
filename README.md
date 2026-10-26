# Basket Live 🏀

Application perso de **scores NBA en direct**, inspirée de *Superfan Sports Pro Basketball*.
C'est une appli Android (APK à installer soi-même) : pas de store, pas de compte, pas de serveur.
L'interface est écrite en web (React) et embarquée dans l'appli par Capacitor.

## Fonctionnalités

- **Scores en direct** de toute la NBA, rafraîchis automatiquement (toutes les 15 s quand un match est en cours,
  pause quand l'app est en arrière-plan). Le score clignote quand il change.
- **Calendrier** : bandeau des jours de match de la saison + sélecteur de date.
- **Fiche de match** :
  - tableau du score par quart-temps, horloge du match ;
  - **probabilité de victoire** au fil du match (graphique interactif) ;
  - leaders du match, **stats d'équipe** comparées ;
  - **box score** complet (titulaires, banc, totaux) ;
  - **play-by-play** filtrable par quart-temps / paniers uniquement ;
  - **carte des tirs** en direct : réussis / manqués sur le demi-terrain, filtres équipe, quart-temps et joueur,
    bilan par zone (raquette, mi-distance, 3 points) ;
  - avant-match : cotes, pronostic ESPN, forme sur 5 matchs, infirmerie, TV, salle.
- **Fiches joueurs** (depuis le box score, les leaders ou l'effectif) : moyennes saison et carrière avec rang NBA,
  records de la saison, historique des matchs et prochain match.
- **Mes équipes** : favoris (leurs matchs remontent en tête des scores) et page équipe (calendrier, résultats, effectif,
  projection de fin de saison).
- **Alertes** : début de match, **match serré** (≤ 5 pts dans les 5 dernières minutes), prolongation, score final —
  pour vos équipes ou toute la ligue.
- **Classement** Est / Ouest (zones playoffs et play-in), avec la saison précédente.
- **Projection de fin de saison** : pour chaque équipe, la probabilité de finir à chaque place de sa conférence
  (1re à 15e), ses chances de playoffs (play-in compris) et son bilan projeté. Les matchs restants sont simulés
  5 000 fois à partir de l'indice BPI d'ESPN (avantage du terrain, égalités départagées aux confrontations directes
  puis au bilan dans la conférence, play-in joué).
- **Elo** (onglet Classement → Elo), pour les **joueurs** et les **équipes**, comme dans l'appli LoL :
  - **joueurs** : calcul sur tous les box scores depuis 2013-14 (16 000 matchs). La force d'une équipe sur un match est
    la moyenne des notes de ses joueurs pondérée par leurs minutes ; après le match, chaque joueur gagne ou perd selon
    son résultat (celui de l'équipe mêlé à son +/-) par rapport à ce qui était attendu, d'autant plus qu'il a joué
    longtemps (multiplicateur d'écart au score de FiveThirtyEight). Un nouveau joueur démarre sous la moyenne et sa note
    bouge beaucoup au début ; l'échelle est recentrée sur 1500 à chaque saison ;
  - **équipes** : l'Elo d'une équipe est la moyenne des Elo de ses joueurs, pondérée par leurs **minutes attendues**
    (moyenne glissante de leurs derniers matchs avec l'équipe), **sans les joueurs absents** d'après le rapport des
    blessés d'ESPN (statut « Out »). Mesuré avant chaque match depuis 2016-17 (en retirant les joueurs qui n'ont pas
    joué, ce que donne à peu près le rapport des blessés) : 66,9 % de vainqueurs bien prévus, contre 65,9 % sans retirer
    les absents et 65,1 % pour un Elo calculé sur les seuls résultats des équipes. Réglages choisis par `--tune` sur cette
    prévision d'avant-match. Une limite : un joueur transféré compte pour son ancienne équipe jusqu'à son premier match
    avec la nouvelle ;
  - sur les **cartes de match** : Elo et chances de victoire avant le match, variation d'Elo une fois terminé ; sur la
    **fiche de match** : carte Elo avant le match (avec les absents retirés), variation des deux équipes et colonne « ELO »
    (variation de chaque joueur) dans le box score ; sur les **fiches équipe et joueur** : note, rang, courbe mois par
    mois et variation de chaque match récent.

  `scripts/build-elo.mjs` fait le calcul une fois et écrit `public/elo.json` ; l'appli y ajoute elle-même les matchs
  joués depuis (un tableau des scores par jour et un box score par match) et garde le résultat sur l'appareil. Relancer
  le script de temps en temps (par exemple à chaque nouvelle saison) puis pousser le fichier évite à l'appli de rattraper
  trop de matchs.
- **Leaders** de la saison (points, rebonds, passes, contres, % aux tirs…). Tant qu'ESPN sert encore ceux de la
  saison précédente (les premiers jours d'une saison), ils sont recalculés à partir des box scores des premiers matchs.
- **Actus** NBA.
- Thème sombre / clair automatique.

## Appli Android (APK)

**Télécharger :** https://github.com/p-bailly/NBA/releases/latest/download/basket-live.apk

1. Ouvrez le lien sur le téléphone Android et téléchargez le fichier.
2. Ouvrez-le : Android demande d'autoriser l'installation depuis le navigateur (« sources inconnues ») — acceptez.
3. L'appli **Basket Live** apparaît avec les autres applis.

L'APK est reconstruit automatiquement par GitHub Actions (`.github/workflows/android.yml`) à chaque push sur la
branche par défaut ; il suffit de le retélécharger pour mettre à jour (il s'installe par-dessus l'ancien).

Il est signé avec une clé de signature personnelle volontairement versionnée (`android/app/superfan.keystore`),
pour que les APK construits n'importe où aient la même signature. C'est adapté à un usage perso, pas à une
publication sur le Play Store.

Construire l'APK soi-même : Android SDK (plateforme 36) + Java 21, puis `npm run android`
→ `android/app/build/outputs/apk/release/app-release.apk`.

## Partage avec Nimbus

L'appli Android partage la liste de vos **équipes favorites** avec Nimbus (`fr.perso.nimbus`), le launcher perso,
qui affiche leurs matchs sur sa page de déverrouillage. Au démarrage et à chaque changement des favoris,
`src/lib/nimbus.ts` les remet au plugin natif `NimbusBridge`, qui les garde dans des SharedPreferences ;
`NimbusProvider` les sert en lecture seule à l'adresse `content://com.pbailly.superfanbasket.nimbus/favorites`
(une ligne par équipe, dans l'ordre des favoris : `team_id` ESPN, `abbr` et `name`, ces deux derniers quand
l.appli les connaît déjà, sinon null) et prévient Nimbus de chaque changement. Seuls Nimbus et l'appli elle-même
peuvent lire cette adresse. Les scores, Nimbus les demande lui-même à ESPN.

## Développement

Prérequis : [Node.js](https://nodejs.org) 20 ou plus.

```bash
npm install
npm run dev          # l'interface dans un navigateur : http://localhost:5173
npm run dev -- --host   # pour l'ouvrir depuis le téléphone sur le même Wi-Fi
```

Dans le navigateur, tout marche sauf ce qui demande Android : notifications système et partage avec Nimbus.

## Les alertes

Activez-les dans l'onglet **Mes équipes**. Elles s'affichent dans l'app et en notification Android.

Limite : sans serveur, les alertes ne partent que **quand l'app est ouverte ou en arrière-plan récent**.
Des notifications avec l'app complètement fermée demanderaient un serveur de push.

## Cotes des bookmakers français

Par défaut, les cotes viennent d'ESPN (DraftKings, États-Unis) et sont converties au format européen
(ex. -110 → 1,91), avec le handicap du favori (ex. « SA −2,5 ») et le total de points.

Pour afficher les **vraies cotes de Winamax, Betclic, Unibet, PMU ou NetBet** :

1. Créez une clé gratuite sur [the-odds-api.com](https://the-odds-api.com/#get-access) (500 crédits par mois).
2. Dans l'app, onglet **Mes équipes → Cotes des bookmakers français**, collez la clé et choisissez le bookmaker
   (ou « Meilleure cote »).

Chaque actualisation coûte 3 crédits (vainqueur, handicap, total). Les cotes sont gardées 6 h sur l'appareil, et
le bouton « Actualiser » permet de forcer une mise à jour ; le nombre de crédits restants est affiché. La clé reste
sur votre téléphone : elle n'est jamais dans le code ni envoyée ailleurs qu'à The Odds API.

## Données

Les données viennent de l'API publique (non officielle) d'ESPN, appelée directement depuis l'appli.
Elle n'est pas documentée et peut changer sans préavis. Les endpoints `/teams` et `/teams/{id}` n'autorisant
pas les appels depuis une page web (CORS, ce qui vaut aussi pour la WebView de l'appli), la liste des équipes vient du classement et la fiche équipe du calendrier.

Projet perso, sans lien avec la NBA, ESPN ou Superfan Sports.

## Structure

```
src/
  api/espn.ts          appels à l'API ESPN → modèles simples (Game, GameDetail, Standings…)
  hooks/usePolling.ts  chargement + rafraîchissement automatique (pause en arrière-plan)
  api/elo.ts           Elo des joueurs et des équipes : instantané + matchs joués depuis, cache sur l'appareil ;
  api/injuries.ts      rapport des blessés (absents retirés de la force des équipes)
  lib/                 formatage (dates, statuts), favoris / réglages (localStorage), routage par hash,
                       projection de fin de saison (simulation de Monte-Carlo), calcul de l'Elo (eloCore, playerEloCore)
  components/          cartes de match, graphique de probabilité, box score, play-by-play, alertes…
  pages/               Scores, Match, Mes équipes, Équipe, Classement, Leaders, Actus
public/                Elo précalculé (elo.json), embarqué dans l'appli
scripts/               calcul de l'Elo sur l'historique d'ESPN (node scripts/build-elo.mjs)
android/               projet Android (Capacitor) qui embarque l'interface
design/logo/           logo au crayon : generer.py (SVG, icône adaptative), puis png.cjs (PNG)
```
