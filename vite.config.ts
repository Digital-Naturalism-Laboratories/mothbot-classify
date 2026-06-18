/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/**
 * Builds a version string like "142.a1b2c3d" from git history at build time.
 * Auto-increments with every commit — no manual version bumps needed.
 *
 * Vercel does a shallow clone by default (only ~10 commits of history:
 * https://vercel.com/docs/builds/configure-a-build), so `git rev-list
 * --count HEAD` would be wrong (stuck near 10) unless the project has the
 * VERCEL_DEEP_CLONE env var set. The short commit hash is always correct
 * regardless of clone depth, so it's the part that's always shown; the
 * commit count is only appended when it looks trustworthy (i.e. bigger
 * than the shallow-clone depth Vercel uses), so the version reliably looks
 * "new" on every deploy either way.
 */
function getAppVersion(): string {
  const short = tryGitShortSha() ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
  const count = tryGitCommitCount()

  // Heuristic: if the repo has well over 10 commits total but git only
  // reports a number at or below that, we're almost certainly looking at
  // Vercel's shallow clone, not a real low count — omit it rather than show
  // a misleading, non-incrementing number.
  const countLooksShallow = count !== null && count <= 10
  if (count && short && !countLooksShallow) return `${count}.${short}`
  if (short) return short
  return 'dev'
}

function tryGitCommitCount(): number | null {
  try {
    const out = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim()
    const n = Number.parseInt(out, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function tryGitShortSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return null
  }
}

const appVersion = getAppVersion()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
        suppressWarnings: true,
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
