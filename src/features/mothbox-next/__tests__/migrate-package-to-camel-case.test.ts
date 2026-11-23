import { describe, expect, it } from 'vitest'
import { cp, mkdtemp, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compareNdjson, migratePackageToCamelCase, type PackageFileSystem } from '../migrate-package-to-camel-case'
import { loadMothboxNextPackageData } from '../load-package-data'
import { createNodePackageDataAccess, fixturePackageRoot, walkFixtureFiles } from './node-fixture-access'

function nodeFs(root: string, opts: { corrupt?: string } = {}): PackageFileSystem {
  const abs = (p: string) => path.join(root, p)
  return {
    readText: (p) => readFile(abs(p), 'utf8'),
    writeText: async (p, text) => {
      await mkdir(path.dirname(abs(p)), { recursive: true })
      // Simulates a write that goes wrong for one file.
      await writeFile(abs(p), opts.corrupt === p && !p.endsWith('.bak') ? text.replace(/"patchID"/, '"patchIDX"') : text)
    },
    exists: async (p) => !!(await stat(abs(p)).catch(() => null)),
    listNdjson: async (folder) => {
      const names = await readdir(abs(folder)).catch(() => [] as string[])
      const rel = folder.replace(/\/+$/, '')
      return names.filter((n) => n.endsWith('.ndjson')).sort().map((n) => `${rel}/${n}`)
    },
    remove: (p) => rm(abs(p)),
    removeEmptyDirectory: (p) => rmdir(abs(p)),
  }
}

async function copyFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'camel-migration-'))
  await cp(fixturePackageRoot('04_dinacon_lightweight_substrate'), root, { recursive: true })
  return root
}

async function load(root: string) {
  const loaded = await loadMothboxNextPackageData({
    packageRoot: '',
    readManifestText: () => readFile(path.join(root, 'dataset.json'), 'utf8'),
    access: createNodePackageDataAccess(root),
  })
  // The manifest's version is expected to change; everything read from the files must not.
  return { ...loaded!, manifest: { ...loaded!.manifest, version: 0 }, paths: undefined }
}

describe('converting a package to camelCase', () => {
  it('converts every file, reads exactly as before, and removes the backup', async () => {
    const root = await copyFixture()
    const before = await load(root)

    const result = await migratePackageToCamelCase({ fs: nodeFs(root) })
    expect(result).toMatchObject({ status: 'migrated' })

    const manifest = JSON.parse(await readFile(path.join(root, 'dataset.json'), 'utf8'))
    expect(manifest.version).toBe(4)
    expect(manifest.datasetID).toBe('dinacon2025_lightweight_substrate')
    const human = await readFile(path.join(root, '03_classifications/bf.ndjson'), 'utf8')
    expect(human).toContain('"identifierType":"human"')
    expect(human).not.toContain('"patch_id"')

    expect(await load(root)).toEqual(before)
    // Backup removed, nothing left behind.
    expect((await walkFixtureFiles(root)).some((f) => f.path.startsWith('00_format_backup'))).toBe(false)

    // A second open finds nothing to do.
    expect(await migratePackageToCamelCase({ fs: nodeFs(root) })).toEqual({ status: 'not-needed' })
  })

  it('restores the originals and keeps the backup when a converted file does not check out', async () => {
    const root = await copyFixture()
    const originalHuman = await readFile(path.join(root, '03_classifications/bf.ndjson'), 'utf8')
    const originalManifest = await readFile(path.join(root, 'dataset.json'), 'utf8')

    const result = await migratePackageToCamelCase({ fs: nodeFs(root, { corrupt: '03_classifications/bf.ndjson' }) })
    expect(result).toMatchObject({ status: 'failed', restored: true })
    expect(await readFile(path.join(root, '03_classifications/bf.ndjson'), 'utf8')).toBe(originalHuman)
    expect(await readFile(path.join(root, 'dataset.json'), 'utf8')).toBe(originalManifest)

    const backup = (await walkFixtureFiles(root)).filter((f) => f.path.startsWith('00_format_backup'))
    expect(backup.some((f) => f.path.endsWith('03_classifications/bf.ndjson.bak'))).toBe(true)
    const backedUp = backup.find((f) => f.path.endsWith('bf.ndjson.bak'))!
    expect(await readFile(path.join(root, backedUp.path), 'utf8')).toBe(originalHuman)
  })

  it('leaves folders without a dataset.json alone', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'camel-migration-'))
    expect(await migratePackageToCamelCase({ fs: nodeFs(root) })).toEqual({ status: 'not-a-package' })
  })

  it('spots rows that read differently', () => {
    expect(compareNdjson('{"patch_id":"a"}\n', '{"patchID":"a"}\n')).toBeNull()
    expect(compareNdjson('{"patch_id":"a"}\n', '{"patchID":"b"}\n')).toMatch(/line 1/)
    expect(compareNdjson('{"patch_id":"a"}\n{"patch_id":"b"}\n', '{"patchID":"a"}\n')).toMatch(/line count/)
  })
})
