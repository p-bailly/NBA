// Rend les PNG du logo à partir de design/logo/logo.svg : anciennes icônes Android (avant Android 8, sans icône
// adaptative) et écrans de démarrage. À relancer après design/logo/generer.py, avec Playwright
// et son Chromium installés :
//   NODE_PATH=$(npm root -g) node design/logo/png.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const RACINE = path.join(__dirname, '..', '..')
const RES = path.join(RACINE, 'android', 'app', 'src', 'main', 'res')
const LOGO = fs.readFileSync(path.join(__dirname, 'logo.svg'), 'utf8')
// Fond des écrans de démarrage : celui de l'app.
const NUIT = '#0b0e14'
const COINS = '22%'
const DENSITES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }

// Le logo cadré sur une zone de la grille 108 : « 18 18 72 72 » est la partie visible de l'icône adaptative.
function logo(taille, zone = '18 18 72 72') {
  return LOGO.replace(/viewBox="[^"]*"/, `viewBox="${zone}" width="${taille}" height="${taille}"`)
}

function icone(taille, coins) {
  return `<div style="width:${taille}px;height:${taille}px;border-radius:${coins};overflow:hidden">${logo(taille)}</div>`
}

// Largeur et hauteur d'un PNG, lues dans son en-tête.
function dimensions(fichier) {
  const tete = fs.readFileSync(fichier).subarray(16, 24)
  return [tete.readUInt32BE(0), tete.readUInt32BE(4)]
}

async function rendre(page, fichier, w, h, html, transparent = false) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(
    `<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}svg{display:block}</style>${html}`,
  )
  await page.screenshot({ path: fichier, omitBackground: transparent })
  console.log(path.relative(RACINE, fichier))
}

;(async () => {
  const navigateur = await chromium.launch()
  const page = await navigateur.newPage()

  for (const [densite, taille] of Object.entries(DENSITES)) {
    const dossier = path.join(RES, `mipmap-${densite}`)
    await rendre(page, path.join(dossier, 'ic_launcher.png'), taille, taille, icone(taille, COINS), true)
    await rendre(page, path.join(dossier, 'ic_launcher_round.png'), taille, taille, icone(taille, '50%'), true)
  }

  // Écrans de démarrage : l'icône au centre, sur un tiers du petit côté, sur le fond de l'app.
  for (const dossier of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const fichier = path.join(RES, dossier, 'splash.png')
    if (!fs.existsSync(fichier)) continue
    const [w, h] = dimensions(fichier)
    const taille = Math.round(Math.min(w, h) * 0.32)
    const html = `<div style="width:${w}px;height:${h}px;background:${NUIT};display:flex;align-items:center;justify-content:center">${icone(taille, COINS)}</div>`
    await rendre(page, fichier, w, h, html)
  }

  await navigateur.close()
})()
