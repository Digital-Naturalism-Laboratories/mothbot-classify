#!/usr/bin/env bun
/**
 * Bakes a Mothball game level pack from real nights in headless Chrome, using
 * the same code as the Visualizer's "Export game level" button
 * (src/features/data-flow/4.export/visualization/viz-game-level.ts).
 *
 *   1. Start the dev server:  bun dev
 *   2. Run:  bun scripts/chrome-harness/bake-game-level.ts <package-dir> <out.zip> <night-id> [night-id…] [--detector <id>] [--limit N]
 *
 *   <package-dir>  folder containing dataset.json
 *   <night-id>     camera_day_id from 02_records/camera-days.ndjson
 *   --detector     detection run to use (e.g. Mothbot_MBD-0-2.pt); default: each night's newest
 *   --limit        keep only the largest N insects (default: all)
 *
 * Safe on real data: the dataset is served read-only, and the zip comes back
 * through the DevTools protocol to <out.zip>; nothing is written to the package.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  if (i < 0) return undefined
  const value = args[i + 1]
  args.splice(i, 2)
  return value
}
const detectorId = flag('--detector')
const limit = Number(flag('--limit') ?? 0)
const appUrl = flag('--app') ?? 'http://localhost:5173/'
const [packageDir, outZip, ...nightIds] = args
if (!packageDir || !outZip || !nightIds.length) {
  console.error('usage: bun scripts/chrome-harness/bake-game-level.ts <package-dir> <out.zip> <night-id> [night-id…] [--detector <id>] [--limit N]')
  process.exit(1)
}

const HERE = import.meta.dir
const DATA_PORT = 5299
const CDP_PORT = 9334
const handleName = path.basename(path.resolve(packageDir))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const server = spawn('bun', [path.join(HERE, 'serve-dataset.ts'), path.resolve(packageDir), String(DATA_PORT)], { stdio: 'ignore' })
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'classify-bake-'))}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1400,900', 'about:blank',
], { stdio: 'ignore' })
const cleanup = () => {
  if (chrome.exitCode === null) chrome.kill('SIGKILL')
  if (server.exitCode === null) server.kill()
}
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => process.exit(1))

let wsUrl = ''
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
    wsUrl = targets.find((t: any) => t.type === 'page')?.webSocketDebuggerUrl
  } catch {
    // Chrome isn't listening yet; retry.
  }
  if (!wsUrl) await sleep(200)
}
const ws = new WebSocket(wsUrl)
await new Promise((r) => (ws.onopen = r))
let nextId = 1
const pending = new Map<number, (v: any) => void>()
let loaded: (() => void) | null = null
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data))
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); return }
  if (m.method === 'Page.loadEventFired') loaded?.()
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a: any) => a.value ?? a.description ?? a.type).join(' ')
    if (/\[bake\]|error/i.test(text) || m.params.type === 'error') console.log(`  [page] ${text.slice(0, 400)}`)
  }
  if (m.method === 'Runtime.exceptionThrown') console.log(`  [page exception] ${m.params.exceptionDetails?.exception?.description?.slice(0, 600)}`)
}
const send = (method: string, params: any = {}): Promise<any> => {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((r) => pending.set(id, r))
}
async function evaluate(expression: string): Promise<any> {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}

await send('Runtime.enable'); await send('Page.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(100000)' })
await new Promise<void>((resolve) => { loaded = resolve; void send('Page.navigate', { url: appUrl }) })
await sleep(1500)
await evaluate(`window.__DATA_BASE = 'http://127.0.0.1:${DATA_PORT}'`)
// Import modules as the app's own instances (after HMR the app loads "?t=…" URLs).
await evaluate("window.__appImport = (p) => { const hits = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new URL(n).pathname === p); return import(hits.length ? hits[hits.length - 1] : p) }; 'ok'")
await send('Runtime.evaluate', { expression: readFileSync(path.join(HERE, 'page-harness.js'), 'utf8') })

const t0 = performance.now()
const opened = await evaluate(`(async () => {
  const mod = await window.__appImport('/src/features/data-flow/1.ingest/open-mothbox-next-package.ts')
  const res = await mod.openMothboxNextPackageFromHandle(window.__harness.makeDir('', ${JSON.stringify(handleName)}))
  return { ok: res.ok, message: res.message }
})()`)
console.log(`opened ${handleName} in ${((performance.now() - t0) / 1000).toFixed(1)}s`, opened)

const config = JSON.stringify({ nightIds, detectorId, limit })
const bake = evaluate(`(async () => {
  const { nightIds, detectorId, limit } = ${config}
  const { defaultVizConfig } = await window.__appImport('/src/features/data-flow/4.export/visualization/viz-types.ts')
  const { buildGameLevelZip } = await window.__appImport('/src/features/data-flow/4.export/visualization/viz-game-level.ts')
  const cfg = { ...defaultVizConfig(nightIds, false, detectorId), scope: 'night', limit }
  let last = 0
  const built = await buildGameLevelZip(cfg, (frac, msg) => {
    if (Date.now() - last > 4000) { last = Date.now(); console.log('[bake] ' + msg) }
  })
  if (!built) return null
  window.__bakeBytes = built.bytes
  return { stats: built.stats, title: built.level.title, calibrated: built.level.calibrated }
})()`)
const result = await bake
if (!result) {
  console.error('Nothing baked: no detections in scope (check the night ids and detector).')
  process.exit(1)
}
console.log(`baked in ${((performance.now() - t0) / 1000).toFixed(1)}s`, result)

// Pull the zip out in base64 slices (one big CDP message can exceed WebSocket limits).
const CHUNK = 4 * 1024 * 1024
const total = result.stats.bytes as number
const parts: Buffer[] = []
for (let offset = 0; offset < total; offset += CHUNK) {
  const b64 = await evaluate(`(() => { const s = window.__bakeBytes.subarray(${offset}, ${offset + CHUNK}); let bin = ''; for (let i = 0; i < s.length; i += 32768) bin += String.fromCharCode.apply(null, s.subarray(i, i + 32768)); return btoa(bin) })()`)
  parts.push(Buffer.from(b64, 'base64'))
}
writeFileSync(outZip, Buffer.concat(parts))
console.log(`wrote ${outZip} (${(total / 1e6).toFixed(1)} MB)`)
ws.close()
process.exit(0)
