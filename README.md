# Basket Live

Application perso de **scores NBA en direct**, inspirée de *Superfan Sports Pro Basketball* : scores rafraîchis
automatiquement, fiches de match (box score, play-by-play, carte des tirs, probabilité de victoire), joueurs et équipes,
classement avec projection de fin de saison, Elo des joueurs et des équipes, alertes. C'est une appli Android à installer
soi-même (pas de store, de compte ni de serveur) : l'interface est écrite en web (React) et embarquée par Capacitor.

## Installer (Android)

**Télécharger :** https://github.com/p-bailly/NBA/releases/latest/download/basket-live.apk

Ouvrir le lien sur le téléphone, puis le fichier téléchargé, et autoriser l'installation depuis le navigateur
(« sources inconnues »). L'APK est reconstruit par GitHub Actions à chaque push sur la branche par défaut : le retélécharger
suffit pour mettre à jour (il s'installe par-dessus l'ancien).

## Développement

Node.js 20 ou plus.

```bash
npm install
npm run dev             # http://localhost:5173 ; ajouter -- --host pour l'ouvrir depuis le téléphone
npm run android         # APK dans android/app/build/outputs/apk/release/ (Android SDK 36 + Java 21)
```

Dans le navigateur, tout marche sauf les notifications système et le partage avec Nimbus.
Architecture, données et pièges : [CLAUDE.md](CLAUDE.md).

## Utilisation

- **Alertes** (début de match, match serré, prolongation, score final) : à activer dans l'onglet **Mes équipes**. Sans
  serveur, elles ne partent que quand l'app est ouverte ou en arrière-plan récent.
- **Cotes des bookmakers français** (Winamax, Betclic, Unibet, PMU, NetBet) : créer une clé gratuite sur
  [the-odds-api.com](https://the-odds-api.com/#get-access) (500 crédits par mois), puis la coller dans **Mes équipes → Cotes
  des bookmakers français**. Sans clé, les cotes viennent d'ESPN (DraftKings), converties au format européen.

Les données viennent de l'API publique (non officielle) d'ESPN. Projet perso, sans lien avec la NBA, ESPN ou Superfan Sports.
