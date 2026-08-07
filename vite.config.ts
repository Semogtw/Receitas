import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'Receitas',
        short_name: 'Receitas',
        description: 'Caderno de receitas privado e compartilhado para duas pessoas.',
        lang: 'pt-BR',
        start_url: '/recipes',
        scope: '/',
        display: 'standalone',
        background_color: '#f7f1e7',
        theme_color: '#a5472d',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        runtimeCaching: [],
      },
    }),
  ],
})
