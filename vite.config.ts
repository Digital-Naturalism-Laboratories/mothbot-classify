/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', { runtimeModule: 'react-compiler-runtime' }]],
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mothbot.svg'],
      manifest: {
        name: 'Mothbot Classify',
        short_name: 'Mothbot',
        description: 'Local app to review and label Mothbot insect detections per night.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '~': '/src',
      '@': '/src',
    },
  },
  server: {
    allowedHosts: ['vite-96.localcan.dev'],
  },
  // @ts-expect-error - vite and vitest have compatible but differently typed configs
  test: {
    environment: 'jsdom',
    setupFiles: ['/src/test/setup.ts'],
    globals: true,
    css: true,
  },
})
