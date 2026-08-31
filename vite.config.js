import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    // Without this, .jsx files still compile — Vite's built-in esbuild
    // handles the JSX syntax on its own — which is why the app worked fine
    // without it. What was missing is React Fast Refresh: editing a
    // component now swaps just that component in place and KEEPS its state,
    // instead of reloading the whole page and throwing away whatever you'd
    // typed into a form or which order you had selected.
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
