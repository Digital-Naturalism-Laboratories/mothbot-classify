import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { PackageDataAccess } from '../load-package-data'
import type { PackageFileAccess } from '../validate-dataset-package'
import type { PackageTextWriter } from '../persist/persist-human-classifications'

export function fixturePackageRoot(fixtureName: string): string {
  return path.join(
    import.meta.dirname,
    'fixtures',
    'packages',
    fixtureName,
  )
}

export async function walkFixtureFiles(packageRoot: string): Promise<Array<{ path: string; name: string; size: number }>> {
  const out: Array<{ path: string; name: string; size: number }> = []

  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(abs, rel)
        continue
      }
      const info = await stat(abs)
      out.push({ path: rel.replaceAll('\\', '/'), name: entry.name, size: info.size })
    }
  }

  await walk(packageRoot, '')
  return out
}

export function createNodePackageDataAccess(packageRoot: string): PackageDataAccess {
  return {
    readPackageFile: async (packageRelativePath) => {
      const rel = toRelative(packageRoot, packageRelativePath)
      return readFile(path.join(packageRoot, rel), 'utf8')
    },
    listClassificationFiles: async (classificationsDir) => {
      const relDir = toRelative(packageRoot, classificationsDir)
      const absDir = path.join(packageRoot, relDir)
      const names = await readdir(absDir)
      return names
        .filter((n) => n.endsWith('.ndjson'))
        .map((n) => (relDir ? `${relDir}/${n}` : n))
        .sort()
    },
  }
}

export function createNodePackageFileAccess(packageRoot: string): PackageFileAccess {
  return {
    readText: async (absolutePath) => {
      const rel = toRelative(packageRoot, absolutePath)
      return readFile(path.join(packageRoot, rel), 'utf8')
    },
    fileExists: async (absolutePath) => {
      try {
        const rel = toRelative(packageRoot, absolutePath)
        await stat(path.join(packageRoot, rel))
        return true
      } catch {
        return false
      }
    },
  }
}

export function createNodePackageTextWriter(packageRoot: string): PackageTextWriter {
  return {
    readText: async (relativePath) => {
      return readFile(path.join(packageRoot, relativePath.replace(/^\/+/, '')), 'utf8')
    },
    writeText: async (relativePath, text) => {
      const abs = path.join(packageRoot, relativePath.replace(/^\/+/, ''))
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, text, 'utf8')
    },
    fileExists: async (relativePath) => {
      try {
        await stat(path.join(packageRoot, relativePath.replace(/^\/+/, '')))
        return true
      } catch {
        return false
      }
    },
    listClassificationNdjsonPaths: async (classificationsFolder) => {
      const folderRel = classificationsFolder.replace(/^\/+/, '').replace(/\/+$/, '')
      const absDir = path.join(packageRoot, folderRel)
      const names = await readdir(absDir)
      return names
        .filter((name) => name.endsWith('.ndjson'))
        .map((name) => (folderRel ? `${folderRel}/${name}` : name))
        .sort()
    },
  }
}

function toRelative(packageRoot: string, absolutePath: string): string {
  const root = path.resolve(packageRoot)
  const abs = path.resolve(absolutePath)
  if (abs === root) return ''
  if (abs.startsWith(root + path.sep)) {
    return abs.slice(root.length + 1).replaceAll('\\', '/')
  }
  return absolutePath.replaceAll('\\', '/').replace(/^\/+/, '')
}
