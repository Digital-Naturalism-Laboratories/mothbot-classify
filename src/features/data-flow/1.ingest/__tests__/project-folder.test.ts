import { describe, expect, it } from 'vitest'
import { discoverDatasetFoldersUnderRoot } from '../discover-dataset-folders'
import { describeFolderWithoutProject, detectProjectAtRoot, originalSourcePathForPackage } from '../project-folder'
import type { FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'

// A project laid out the way current Mothbot Process writes it:
//   Desert2026/mothbox-project.json, Desert2026/Cactus/<night>/*.jpg,
//   Desert2026/_processed/{mothbox-project.json, Cactus/sessions.json, Cactus/<night>/*_botdetection.json}
const MARKER = JSON.stringify({ format: 'mothbox-project', projectID: 'prj-1', name: 'Desert2026' })
const MANIFEST = JSON.stringify({
  format: 'mothbox-next-dataset',
  version: 3,
  dataset_id: 'Desert2026',
  folders: { records: '02_records', classifications: '03_classifications', patches: '01_patches' },
  records: { patches: '02_records/patches.ndjson' },
})
const NIGHT = 'Cactus/superDorada_2026-08-11'

function projectFiles(prefix: string, opts: { packaged?: boolean } = {}): Record<string, string> {
  const p = prefix ? `${prefix}/` : ''
  return {
    [`${p}mothbox-project.json`]: MARKER,
    [`${p}${NIGHT}/superDorada_2026-08-11T20-01-22-07-00.jpg`]: '',
    [`${p}_processed/mothbox-project.json`]: MARKER,
    [`${p}_processed/Cactus/sessions.json`]: '{}',
    [`${p}_processed/${NIGHT}/superDorada_2026-08-11T20-01-22-07-00_botdetection.json`]: '{}',
    ...(opts.packaged ? { [`${p}_processed/dataset.json`]: MANIFEST } : {}),
  }
}

describe('a project with its own _processed folder', () => {
  it('opens straight into a picked project folder once it is set up', async () => {
    const root = createDirectoryHandle('Desert2026', projectFiles('', { packaged: true }))
    const result = await discoverDatasetFoldersUnderRoot(root)
    expect(result.packages).toEqual([
      { folderName: 'Desert2026', datasetId: 'Desert2026', hasManifest: true, packagePath: '_processed' },
    ])
    expect(result.pendingMigration).toEqual([])
  })

  it('offers setup for a picked project folder, writing the package into its _processed', async () => {
    const root = createDirectoryHandle('Desert2026', projectFiles(''))
    const result = await discoverDatasetFoldersUnderRoot(root)
    expect(result.packages).toEqual([])
    expect(result.pendingMigration).toHaveLength(1)
    expect(result.pendingMigration[0]).toMatchObject({
      folderName: 'Desert2026',
      kind: 'mothbox-project',
      relativePath: '',
      packagePath: '_processed',
    })
    expect((result.pendingMigration[0].processedMirrorHandle as { name?: string })?.name).toBe('_processed')
  })

  it('opens a picked _processed folder on its own, named after its project', async () => {
    const files = projectFiles('', { packaged: true })
    const processedOnly = Object.fromEntries(
      Object.entries(files)
        .filter(([path]) => path.startsWith('_processed/'))
        .map(([path, text]) => [path.slice('_processed/'.length), text]),
    )
    const root = createDirectoryHandle('_processed', processedOnly)
    const result = await discoverDatasetFoldersUnderRoot(root)
    expect(result.packages).toEqual([
      { folderName: 'Desert2026', datasetId: 'Desert2026', hasManifest: true, packagePath: '' },
    ])
  })

  it('lists projects inside a picked folder of projects', async () => {
    const root = createDirectoryHandle('Field Data', {
      ...projectFiles('Desert2026', { packaged: true }),
      ...projectFiles('Coast2026'),
    })
    const result = await discoverDatasetFoldersUnderRoot(root)
    expect(result.packages).toEqual([
      { folderName: 'Desert2026', datasetId: 'Desert2026', hasManifest: true, packagePath: 'Desert2026/_processed' },
    ])
    expect(result.pendingMigration).toHaveLength(1)
    expect(result.pendingMigration[0]).toMatchObject({
      folderName: 'Coast2026',
      kind: 'mothbox-project',
      packagePath: 'Coast2026/_processed',
    })
  })

  it('keeps the older layout (one _processed for a folder of projects) as it was', async () => {
    const root = createDirectoryHandle('MB Projects', {
      'Panama/PlotA/2026-07-14/a.jpg': '',
      '_processed/Panama/dataset.json': MANIFEST,
      '_processed/Panama/PlotA/2026-07-14/a_botdetection.json': '{}',
    })
    const result = await discoverDatasetFoldersUnderRoot(root)
    expect(result.packages).toEqual([
      { folderName: 'Panama', datasetId: 'Desert2026', hasManifest: true, packagePath: '_processed/Panama' },
    ])
  })

  it('says when a picked project has not been processed yet', async () => {
    const root = createDirectoryHandle('Desert2026', {
      'mothbox-project.json': MARKER,
      '_processed/mothbox-project.json': MARKER,
      [`${NIGHT}/a.jpg`]: '',
    })
    await expect(detectProjectAtRoot(root)).resolves.toEqual({ kind: 'not-processed', projectName: 'Desert2026' })
    const result = await discoverDatasetFoldersUnderRoot(root)
    expect(result).toMatchObject({ packages: [], pendingMigration: [], unprocessedProjectName: 'Desert2026' })
  })
})

describe('originalSourcePathForPackage', () => {
  it('finds the photos around a project _processed folder', () => {
    expect(originalSourcePathForPackage({ folderName: 'Desert2026', packagePath: 'Desert2026/_processed' })).toBe('Desert2026')
    expect(originalSourcePathForPackage({ folderName: 'Desert2026', packagePath: '_processed' })).toBe('')
    expect(originalSourcePathForPackage({ folderName: 'Desert2026', packagePath: '' })).toBeUndefined()
    expect(originalSourcePathForPackage({ folderName: 'night5_6', packagePath: '_processed/night5_6' })).toBe('night5_6')
    expect(originalSourcePathForPackage({ folderName: 'Panama' })).toBeUndefined()
  })
})

describe('describeFolderWithoutProject', () => {
  it('points from a night folder to its project', async () => {
    const night = createDirectoryHandle('superDorada_2026-08-11', { 'a.jpg': '', 'a_botdetection.json': '{}' })
    await expect(describeFolderWithoutProject(night)).resolves.toMatchObject({
      title: 'No project in “superDorada_2026-08-11”',
      description: expect.stringContaining('one night'),
    })
  })

  it('points from a deployment folder to its project', async () => {
    const deployment = createDirectoryHandle('Cactus', { 'superDorada_2026-08-11/a.jpg': '' })
    await expect(describeFolderWithoutProject(deployment)).resolves.toMatchObject({
      description: expect.stringContaining('one deployment'),
    })
  })

  it('says unprocessed photos need Mothbot Process', async () => {
    const photos = createDirectoryHandle('Field photos', { 'a.jpg': '', 'b.jpg': '' })
    await expect(describeFolderWithoutProject(photos)).resolves.toMatchObject({
      description: expect.stringContaining('Found 2 photos but no Mothbot results'),
    })
  })
})

// ── In-memory folders with file contents ─────────────────────────────────────

type MemoryFile = { kind: 'file'; name: string; text: string; getFile: () => Promise<File> }
type MemoryDirectory = FileSystemDirectoryHandleLike & {
  kind: 'directory'
  name: string
  children: Map<string, MemoryDirectory | MemoryFile>
}

function createDirectoryHandle(name: string, files: Record<string, string>): MemoryDirectory {
  const root = createDirectory(name)
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean)
    let current = root
    for (const part of parts.slice(0, -1)) {
      let child = current.children.get(part)
      if (!child) {
        child = createDirectory(part)
        current.children.set(part, child)
      }
      if (child.kind !== 'directory') throw new Error(`Path segment is not a directory: ${part}`)
      current = child
    }
    const fileName = parts[parts.length - 1]
    current.children.set(fileName, {
      kind: 'file',
      name: fileName,
      text,
      // The test environment's File has no text(); the readers only need that.
      getFile: async () => ({ name: fileName, text: async () => text }) as unknown as File,
    })
  }
  return root
}

function createDirectory(name: string): MemoryDirectory {
  const directory: MemoryDirectory = {
    name,
    kind: 'directory',
    children: new Map(),
    async getDirectoryHandle(childName: string) {
      const child = directory.children.get(childName)
      if (child?.kind === 'directory') return child
      throw notFoundError()
    },
    async getFileHandle(childName: string) {
      const child = directory.children.get(childName)
      if (child?.kind === 'file') return child
      throw notFoundError()
    },
    async *entries() {
      for (const entry of directory.children.entries()) yield entry
    },
    async *values() {
      for (const entry of directory.children.values()) yield entry
    },
  }
  return directory
}

function notFoundError() {
  const err = new Error('not found on disk')
  err.name = 'NotFoundError'
  return err
}
