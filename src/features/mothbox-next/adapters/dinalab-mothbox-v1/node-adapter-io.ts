import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { DinalabAdapterIO } from './adapter-io'

export function createNodeDinalabAdapterIO(params: {
  sourceDir: string
  packageDir: string
}): DinalabAdapterIO {
  const { sourceDir, packageDir } = params
  const sourceRoot = path.resolve(sourceDir)
  const packageRoot = path.resolve(packageDir)

  return {
    source: {
      exists: async (relativePath) => existsAt(path.join(sourceRoot, relativePath)),
      readText: async (relativePath) => readFile(path.join(sourceRoot, relativePath), 'utf8'),
      readBinary: async (relativePath) => {
        const buffer = await readFile(path.join(sourceRoot, relativePath))
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      },
      findFiles: async (predicate) => findFilesUnder(sourceRoot, predicate),
    },
    package: {
      writeText: async (relativePath, text) => {
        const abs = path.join(packageRoot, relativePath)
        await mkdir(path.dirname(abs), { recursive: true })
        await writeFile(abs, text, 'utf8')
      },
      copyFromSource: async ({ sourceRelativePath, packageRelativePath }) => {
        const from = path.join(sourceRoot, sourceRelativePath)
        const to = path.join(packageRoot, packageRelativePath)
        await mkdir(path.dirname(to), { recursive: true })
        await copyFile(from, to)
      },
    },
  }
}

async function findFilesUnder(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const out: string[] = []

  async function walk(current: string, prefix: string) {
    const entries = await readdirWithTypes(current)
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(abs, rel)
      else if (predicate(entry.name)) out.push(rel.replaceAll('\\', '/'))
    }
  }

  await walk(dir, '')
  return out
}

async function readdirWithTypes(dir: string) {
  const { readdir } = await import('node:fs/promises')
  return readdir(dir, { withFileTypes: true })
}

async function existsAt(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}
