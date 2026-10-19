# Superfan Basket 🏀

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
  - avant-match : cote, pronostic ESPN, forme sur 5 matchs, infirmerie, TV, salle.
- **Mes équipes** : favoris (leurs matchs remontent en tête des scores) et page équipe (calendrier, résultats, effectif).
- **Alertes** : début de match, **match serré** (≤ 5 pts dans les 5 dernières minutes), prolongation, score final —
  pour vos équipes ou toute la ligue.
- **Classement** Est / Ouest (zones playoffs et play-in), avec la saison précédente.
- **Leaders** de la saison (points, rebonds, passes, contres, % aux tirs…).
- **Actus** NBA.
- Thème sombre / clair automatique, fonctionne hors-ligne pour l'interface.

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
   - **GitHub Pages** : le workflow `.github/workflows/deploy.yml` publie l'app à chaque push sur `main`.
     Activez-le une fois dans *Settings → Pages → Source : GitHub Actions*.
     (Pages est gratuit pour un dépôt public ; pour un dépôt privé il faut un compte GitHub payant.)
   - Ou **Netlify / Vercel / Cloudflare Pages** (marchent aussi avec un dépôt privé) :
     commande de build `npm run build`, dossier publié `dist`.
2. Ouvrez l'adresse sur le téléphone puis :
   - **iPhone (Safari)** : Partager → *Sur l'écran d'accueil* ;
   - **Android (Chrome)** : menu ⋮ → *Installer l'application*.

L'app s'ouvre alors en plein écran comme une app native.

## Les alertes

Activez-les dans l'onglet **Mes équipes**. Elles s'affichent dans l'app et en notification système quand le
navigateur le permet (sur iPhone : seulement une fois l'app ajoutée à l'écran d'accueil, iOS 16.4+).

Limite : sans serveur, les alertes ne partent que **quand l'app est ouverte ou en arrière-plan récent**.
Des notifications avec l'app complètement fermée demanderaient un serveur de push.

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
```
