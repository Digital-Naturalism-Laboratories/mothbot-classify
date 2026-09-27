// Injected into the app page. Builds a FileSystemDirectoryHandle look-alike
// backed by the read-only dataset server. Writes stay in memory (logged, never persisted).
(() => {
  const BASE = window.__DATA_BASE || 'http://127.0.0.1:5299'
  const mem = new Map()
  const writes = []
  const q = (p) => encodeURIComponent(p)
  const join = (a, b) => (a ? `${a}/${b}` : b)
  const notFound = (n) => new DOMException(`${n} not found`, 'NotFoundError')
  async function stat(rel) {
    const r = await fetch(`${BASE}/stat?path=${q(rel)}`)
    return r.ok ? r.json() : null
  }
  function makeFile(rel, name, size) {
    const h = {
      kind: 'file', name,
      async getFile() {
        if (mem.has(rel)) return new File([mem.get(rel)], name)
        const r = await fetch(`${BASE}/file?path=${q(rel)}`)
        if (!r.ok) throw notFound(name)
        return new File([await r.blob()], name)
      },
      async createWritable() {
        const parts = []
        return {
          async write(d) { parts.push(d && typeof d === 'object' && 'data' in d ? d.data : d) },
          async close() { mem.set(rel, new Blob(parts)); writes.push(`write ${rel}`) },
          async abort() {}, async truncate() {}, async seek() {},
        }
      },
      async move(...a) { writes.push(`move ${rel} -> ${JSON.stringify(a.map((x) => x?.name ?? x))}`) },
      async queryPermission() { return 'granted' },
      async requestPermission() { return 'granted' },
      async isSameEntry(o) { return o === h },
    }
    return h
  }
  function makeDir(rel, name) {
    const h = {
      kind: 'directory', name,
      async *values() {
        const list = await (await fetch(`${BASE}/list?path=${q(rel)}`)).json()
        for (const e of list) yield e.kind === 'directory' ? makeDir(join(rel, e.name), e.name) : makeFile(join(rel, e.name), e.name, e.size)
      },
      async *entries() { for await (const c of h.values()) yield [c.name, c] },
      async *keys() { for await (const c of h.values()) yield c.name },
      [Symbol.asyncIterator]() { return h.entries() },
      async getDirectoryHandle(n, o) {
        const p = join(rel, n)
        const s = await stat(p)
        if (s?.kind === 'directory' || o?.create) return makeDir(p, n)
        throw notFound(n)
      },
      async getFileHandle(n, o) {
        const p = join(rel, n)
        if (mem.has(p)) return makeFile(p, n, 0)
        const s = await stat(p)
        if (s?.kind === 'file') return makeFile(p, n, s.size)
        if (o?.create) { mem.set(p, new Blob([])); writes.push(`create ${p}`); return makeFile(p, n, 0) }
        throw notFound(n)
      },
      async removeEntry(n) { writes.push(`remove ${join(rel, n)}`); mem.delete(join(rel, n)) },
      async queryPermission() { return 'granted' },
      async requestPermission() { return 'granted' },
      async isSameEntry(o) { return o === h },
      async resolve() { return null },
    }
    return h
  }
  window.__harness = { makeDir, writes }
})()
