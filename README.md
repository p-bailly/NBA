# Basket Live 🏀

Application perso de **scores NBA en direct**, inspirée de *Superfan Sports Pro Basketball*.
C'est une web app installable sur téléphone (PWA) : pas de store, pas de compte, pas de serveur.

## Fonctionnalités

- **Scores en direct** de toute la NBA, rafraîchis automatiquement (toutes les 15 s quand un match est en cours,
  pause quand l'app est en arrière-plan). Le score clignote quand il change.
- **Calendrier** : bandeau des jours de match de la saison + sélecteur de date. Heures affichées dans votre fuseau.
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
- **Mes équipes** : favoris (leurs matchs remontent en tête des scores) et page équipe (calendrier, résultats, effectif).
- **Alertes** : début de match, **match serré** (≤ 5 pts dans les 5 dernières minutes), prolongation, score final —
  pour vos équipes ou toute la ligue.
- **Classement** Est / Ouest (zones playoffs et play-in), avec la saison précédente.
- **Leaders** de la saison (points, rebonds, passes, contres, % aux tirs…).
- **Actus** NBA.
- Thème sombre / clair automatique, fonctionne hors-ligne pour l'interface.

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

## Lancer l'app en local

Prérequis : [Node.js](https://nodejs.org) 20 ou plus.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev -- --host   # pour l'ouvrir depuis votre téléphone sur le même Wi-Fi
```

Version de production : `npm run build` puis `npm run preview`.

## La mettre sur votre téléphone

1. **Hébergez-la** (gratuit) :
   - **GitHub Pages** : le workflow `.github/workflows/deploy.yml` publie l'app à chaque push sur la branche
     par défaut, une fois Pages activé dans *Settings → Pages → Source : GitHub Actions*.
   - Ou **Netlify / Vercel / Cloudflare Pages** (marchent aussi avec un dépôt privé) :
     commande de build `npm run build`, dossier publié `dist`.
2. Ouvrez l'adresse sur le téléphone puis :
   - **iPhone (Safari)** : Partager → *Sur l'écran d'accueil* ;
   - **Android (Chrome)** : menu ⋮ → *Installer l'application*.

L'app s'ouvre alors en plein écran comme une app native.

## Les alertes

Activez-les dans l'onglet **Mes équipes**. Elles s'affichent dans l'app et en notification système
(appli Android : notifications natives ; navigateur : quand il le permet, sur iPhone seulement une fois l'app
ajoutée à l'écran d'accueil, iOS 16.4+).

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

Les données viennent de l'API publique (non officielle) d'ESPN, appelée directement depuis le navigateur.
Elle n'est pas documentée et peut changer sans préavis. Les endpoints `/teams` et `/teams/{id}` n'autorisant
pas les appels navigateur (CORS), la liste des équipes vient du classement et la fiche équipe du calendrier.

Projet perso, sans lien avec la NBA, ESPN ou Superfan Sports.

## Structure

```
src/
  api/espn.ts          appels à l'API ESPN → modèles simples (Game, GameDetail, Standings…)
  hooks/usePolling.ts  chargement + rafraîchissement automatique (pause en arrière-plan)
  lib/                 formatage (dates, statuts), favoris / réglages (localStorage), routage par hash
  components/          cartes de match, graphique de probabilité, box score, play-by-play, alertes…
  pages/               Scores, Match, Mes équipes, Équipe, Classement, Leaders, Actus
public/                manifest PWA, service worker, icônes
android/               projet Android (Capacitor) qui embarque l'app web
design/logo/           logo au crayon : generer.py (SVG, icône adaptative), puis png.cjs (PNG)
```
