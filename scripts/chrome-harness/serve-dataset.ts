// Read-only HTTP view of a dataset folder for the headless-Chrome harness.
// GET only; every path is resolved and confined to ROOT. Never writes.
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
const ROOT = path.resolve(process.argv[2])
const PORT = Number(process.argv[3] || 5299)
const cors = { 'Access-Control-Allow-Origin': '*' }
function safe(rel: string | null) {
  const abs = path.resolve(ROOT, rel || '.')
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null
  return abs
}
Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method !== 'GET') return new Response('read-only', { status: 405, headers: cors })
    const url = new URL(req.url)
    const abs = safe(url.searchParams.get('path'))
    if (!abs) return new Response('forbidden', { status: 403, headers: cors })
    try {
      if (url.pathname === '/stat') {
        const s = await stat(abs)
        return Response.json({ kind: s.isDirectory() ? 'directory' : 'file', size: s.size }, { headers: cors })
      }
      if (url.pathname === '/list') {
        const ents = await readdir(abs, { withFileTypes: true })
        const out = await Promise.all(ents.filter((e) => e.name !== '.DS_Store').map(async (e) => ({
          name: e.name, kind: e.isDirectory() ? 'directory' : 'file',
          size: e.isDirectory() ? 0 : (await stat(path.join(abs, e.name))).size,
        })))
        return Response.json(out, { headers: cors })
      }
      if (url.pathname === '/file') return new Response(Bun.file(abs), { headers: cors })
    } catch {
      if (url.pathname === '/list') return Response.json([], { headers: cors })
      return new Response('not found', { status: 404, headers: cors })
    }
    return new Response('?', { status: 400, headers: cors })
  },
})
console.log(`serving ${ROOT} read-only on ${PORT}`)
