// Minimal Chrome DevTools Protocol driver: runs a JSON list of steps in headless Chrome.
// Used by measure-night.ts; see there for usage.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
const HERE = import.meta.dir
const stepsPath = process.argv[2]
const OUT = path.dirname(stepsPath)
const steps = JSON.parse(readFileSync(stepsPath, 'utf8')) as any[]
const PORT = 9333
const profileDir = mkdtempSync(path.join(tmpdir(), 'classify-harness-'))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1600,1000', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let wsUrl = ''
for (let i = 0; i < 50 && !wsUrl; i++) {
  try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = t.find((x: any) => x.type === 'page')?.webSocketDebuggerUrl } catch {}
  if (!wsUrl) await sleep(200)
}
const ws = new WebSocket(wsUrl)
await new Promise((r) => (ws.onopen = r))
let nextId = 1
const pending = new Map<number, (v: any) => void>()
const waiters: Array<{ method: string; resolve: () => void }> = []
const t0 = performance.now()
const stamp = () => `+${((performance.now() - t0) / 1000).toFixed(1)}s`
const clip = (s: string, n = 1200) => (s.length > n ? s.slice(0, n) + '…' : s)
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data))
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); return }
  for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === m.method) { waiters[i].resolve(); waiters.splice(i, 1) }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    console.log(`${stamp()} [EXCEPTION] ${clip(d.exception?.description || d.text, 3000)}`)
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const { type, args } = m.params
    const text = args.map((a: any) => a.value ?? a.description ?? a.type).join(' ')
    if (type === 'error' || type === 'warning' || /\[harness\]|✅|🚨|RangeError|stack/i.test(text)) console.log(`${stamp()} [console.${type}] ${clip(text)}`)
  }
}
function send(method: string, params: any = {}): Promise<any> {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((r) => pending.set(id, r))
}
const once = (method: string) => new Promise<void>((resolve) => waiters.push({ method, resolve }))
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
for (const step of steps) {
  if (step.onNewDocument) await send('Page.addScriptToEvaluateOnNewDocument', { source: step.onNewDocument })
  if (step.navigate) { const loaded = once('Page.loadEventFired'); await send('Page.navigate', { url: step.navigate }); await loaded; console.log(`${stamp()} navigated ${step.navigate}`) }
  if (step.inject) { await send('Runtime.evaluate', { expression: readFileSync(path.join(HERE, step.inject), 'utf8') }) }
  if (step.eval) {
    const r = await send('Runtime.evaluate', { expression: step.eval, awaitPromise: true, returnByValue: true })
    const res = r.result
    if (res?.exceptionDetails) console.log(`${stamp()} [${step.name}] THREW: ${clip(res.exceptionDetails.exception?.description || res.exceptionDetails.text, 3000)}`)
    else console.log(`${stamp()} [${step.name}] => ${clip(JSON.stringify(res?.result?.value), 2000)}`)
  }
  if (step.wait) await sleep(step.wait)
  if (step.screenshot) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(OUT, step.screenshot), Buffer.from(r.result.data, 'base64')); console.log(`${stamp()} screenshot ${path.join(OUT, step.screenshot)}`) }
  if (step.profileStart) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start') }
  if (step.profileStop) {
    const r = await send('Profiler.stop')
    const prof = r.result.profile
    const byId = new Map(prof.nodes.map((n: any) => [n.id, n]))
    const self = new Map<number, number>()
    const dts = prof.timeDeltas as number[]
    prof.samples.forEach((id: number, i: number) => self.set(id, (self.get(id) ?? 0) + (dts[i] ?? 0)))
    // inclusive time: walk parents
    const parent = new Map<number, number>()
    for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const selfAgg = new Map<string, number>(), inclAgg = new Map<string, number>()
    const key = (n: any) => { const f = n.callFrame; const file = (f.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, ''); return `${f.functionName || '(anon)'}  ${file}:${f.lineNumber + 1}` }
    for (const [id, t] of self) {
      const n: any = byId.get(id); selfAgg.set(key(n), (selfAgg.get(key(n)) ?? 0) + t)
      const seen = new Set<string>(); let cur: number | undefined = id
      while (cur != null) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); inclAgg.set(k, (inclAgg.get(k) ?? 0) + t) } cur = parent.get(cur) }
    }
    const top = (m: Map<string, number>, n: number) => [...m].filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `  ${(t / 1000).toFixed(0).padStart(6)}ms  ${k}`).join('\n')
    console.log(`${stamp()} PROFILE ${step.profileStop} — top SELF:\n${top(selfAgg, step.topSelf ?? 18)}\n  — top INCLUSIVE (src only):\n${top(new Map([...inclAgg].filter(([k]) => k.includes(' src/'))), step.topIncl ?? 22)}`)
  }
  if (step.heap) { const r = await send('Runtime.getHeapUsage'); console.log(`${stamp()} heap used=${Math.round(r.result.usedSize / 1e6)}MB total=${Math.round(r.result.totalSize / 1e6)}MB`) }
}
ws.close(); chrome.kill('SIGKILL'); process.exit(0)
