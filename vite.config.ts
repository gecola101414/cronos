import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 3. OPZIONI AVANZATE ESBUILD (Moved to root level)
  esbuild: {
    // Rimuove tutti i console.log e debugger dal codice finale
    drop: ['console', 'debugger'],
    // Rimuove tutti i commenti, inclusi quelli legali/copyright
    legalComments: 'none',
    target: 'es2015'
  },
  build: {
    // 1. DISABILITA LE MAPPE: Impedisce al browser di ricostruire il codice originale
    sourcemap: false,

    // 2. MINIFICAZIONE AGGRESSIVA (Esbuild)
    minify: 'esbuild',
    target: 'es2015',

    // 4. OFFUSCAMENTO NOMI FILE E STRUTTURA
    rollupOptions: {
      output: {
        // Nomi file casuali (Hash) per impedire l'identificazione dei moduli
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
        // Rimuove commenti legali e annotazioni residue
        compact: true,
      }
    },
    // Aumenta il limite di warning per i chunk
    chunkSizeWarningLimit: 1000
  }
})