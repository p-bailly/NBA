import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Chemins relatifs : l'app fonctionne aussi bien à la racine d'un domaine
// que dans un sous-dossier (ex. GitHub Pages : /NBA/).
export default defineConfig({
  base: './',
  plugins: [react()],
})
