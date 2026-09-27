#!/usr/bin/env bun
/**
 * Measures how Classify handles one night in real Chrome (V8), not the Bun test
 * runtime. Bun uses JavaScriptCore, which tolerates things that crash Chrome
 * (e.g. spreading 160k items into a call), and unit tests can't measure how long
 * a click freezes the page.
 *
 *   1. Start the dev server:  bun dev            (the harness imports /src modules)
 *   2. Run:  bun scripts/chrome-harness/measure-night.ts <package-dir> <night-id> [app-url]
 *
 *   <package-dir>  folder containing dataset.json, e.g. ".../MyData/_processed/Haystack"
 *   <night-id>     camera_day_id from 02_records/camera-days.ndjson
 *   [app-url]      default http://localhost:5173/
 *
 * Reports: dataset open time, time until the night's first patch renders,
 * main-thread freezes when accepting three detections, JS heap, parts (if the
 * night is split), and saves a screenshot.
 *
 * Safe on real data: the dataset is served read-only (GET only, confined to the
 * package folder), and anything the app tries to write lands in page memory and
 * is discarded when Chrome exits. Needs Google Chrome in /Applications.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const [packageDir, nightId, appUrl = 'http://localhost:5173/'] = process.argv.slice(2)
if (!packageDir || !nightId) {
  console.error('usage: bun scripts/chrome-harness/measure-night.ts <package-dir> <night-id> [app-url]')
  process.exit(1)
}
const HERE = import.meta.dir
const DATA_PORT = 5299
const handleName = path.basename(path.resolve(packageDir))
const out = mkdtempSync(path.join(tmpdir(), 'classify-measure-'))

// Import a module as the *app's own instance*. After Vite hot-reloads a module
// the app loads it as "/src/x.ts?t=<timestamp>"; importing plain "/src/x.ts"
// would create a second copy with its own (empty) stores.
const appImport =
  "window.__appImport = (p) => { const hits = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new URL(n).pathname === p); return import(hits.length ? hits[hits.length - 1] : p) }; 'ok'"

const helpers =
  "window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask' });" +
  "window.__frame = async (fn) => { const before = window.__long.length; const t = performance.now(); fn(); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); const ms = performance.now() - t; await new Promise(r => setTimeout(r, 1500)); return { toFrameMs: Math.round(ms), freezesMs: window.__long.slice(before) } }; 'ok'"

const steps = [
  // Keep every module URL so __appImport can find the app's instance.
  { onNewDocument: 'performance.setResourceTimingBufferSize(100000)' },
  { navigate: appUrl },
  { wait: 1500 },
  { name: 'setup', eval: `window.__DATA_BASE = 'http://127.0.0.1:${DATA_PORT}'` },
  { name: 'app-import', eval: appImport },
  { inject: 'page-harness.js' },
  {
    name: 'open dataset',
    eval: `(async () => { const mod = await window.__appImport('/src/features/data-flow/1.ingest/open-mothbox-next-package.ts'); const t = performance.now(); const res = await mod.openMothboxNextPackageFromHandle(window.__harness.makeDir('', ${JSON.stringify(handleName)})); return { ok: res.ok, message: res.message, ms: Math.round(performance.now() - t) } })()`,
  },
  { wait: 1500 },
  { name: 'helpers', eval: helpers },
  {
    name: 'first render',
    eval: `(async () => { const { router } = await window.__appImport('/src/router.tsx'); const t = performance.now(); router.navigate({ to: '/datasets/$folderName/groups/$leafGroupId', params: { folderName: ${JSON.stringify(handleName)}, leafGroupId: ${JSON.stringify(nightId)} } }); while (!document.querySelector('[data-id]') && performance.now() - t < 120000) { if (document.body.innerText.includes('hit an error')) return 'ERROR: ' + document.body.innerText.slice(0, 300); await new Promise(r => setTimeout(r, 20)) } return { firstPatchMs: Math.round(performance.now() - t), freezesMs: window.__long.slice() } })()`,
  },
  { wait: 3000 },
  { name: 'parts', eval: "(() => { const el = document.querySelector('select[aria-label=\"Night part\"]'); return el ? [...el.options].map(o => o.textContent) : 'not split' })()" },
  {
    name: 'accept 3 detections',
    eval: "(async () => { const d = await window.__appImport('/src/stores/entities/detections.ts'); const ids = [...document.querySelectorAll('[data-id]')].map(e => e.getAttribute('data-id')); const res = []; for (const id of ids.slice(2, 5)) res.push(await window.__frame(() => d.acceptDetections({ detectionIds: [id] }))); return res })()",
  },
  { heap: true },
  { screenshot: 'night.png' },
]
const stepsPath = path.join(out, 'steps.json')
writeFileSync(stepsPath, JSON.stringify(steps))

const server = spawn('bun', [path.join(HERE, 'serve-dataset.ts'), path.resolve(packageDir), String(DATA_PORT)], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1000))
const driver = spawn('bun', [path.join(HERE, 'cdp-drive.ts'), stepsPath], { stdio: ['ignore', 'pipe', 'inherit'] })
driver.stdout.on('data', (chunk: Buffer) => {
  for (const line of chunk.toString().split('\n')) {
    if (/\[(open dataset|first render|parts|accept 3 detections)\]|heap|screenshot|EXCEPTION|THREW/.test(line)) console.log(line)
  }
})
await new Promise((r) => driver.on('exit', r))
server.kill()
