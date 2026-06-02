import { describe, expect, it } from 'vitest'
import {
  classifyDatasetFolder,
  isCsvFileName,
  isParquetFileName,
  isPatchImageFileName,
  isReservedDatasetsChildFolderName,
  isUnderPackageSource,
  isUnderProcessedMirror,
} from '../classify-dataset-folder'
import type { FileSystemDirectoryHandleLike, FileSystemFileHandleLike } from '~/utils/fs-directory-handle'

describe('classify-dataset-folder helpers', () => {
  it('reserves Species folder at datasets root', () => {
    expect(isReservedDatasetsChildFolderName('Species')).toBe(true)
    expect(isReservedDatasetsChildFolderName('my-dataset')).toBe(false)
  })

  it('detects paths under 00_source', () => {
    expect(isUnderPackageSource('00_source/Les/night/patches/a.jpg')).toBe(true)
    expect(isUnderPackageSource('Les/night/patches/a.jpg')).toBe(false)
  })

  it('detects patch image file extensions', () => {
    expect(isPatchImageFileName('a.jpg')).toBe(true)
    expect(isPatchImageFileName('a.JPEG')).toBe(true)
    expect(isPatchImageFileName('notes.txt')).toBe(false)
  })

  it('detects AMI metadata extensions', () => {
    expect(isParquetFileName('snapshot.parquet')).toBe(true)
    expect(isCsvFileName('snapshot.csv')).toBe(true)
    expect(isParquetFileName('snapshot.jpg')).toBe(false)
  })

  it('detects _processed mirror paths', () => {
    expect(isUnderProcessedMirror('_processed/deployment/night/a.jpg')).toBe(true)
    expect(isUnderProcessedMirror('abms/_processed/2025/denmark/F1/a.jpg')).toBe(true)
    expect(isUnderProcessedMirror('deployment/night/a.jpg')).toBe(false)
  })
})

describe('classifyDatasetFolder', () => {
  it('classifies AMI metadata plus processed crops before generic patch images', async () => {
    const directory = createDirectoryHandle([
      'snapshot_abms_denmark_2025_25.10.0.parquet',
      'snapshot_abms_denmark_2025_toke_special.csv',
      'abms/_processed/2025/denmark/F1/20250501231959-snapshot_crop_0403014a-ef2b-40ef-bdc1-2d72c55d1b3d.jpg',
      'abms/2025/denmark/F1/20250501231959-snapshot.jpg',
    ])

    await expect(classifyDatasetFolder({ directory, folderName: 'ami_abms' })).resolves.toBe('ami')
  })

  it('classifies processed crop images without AMI metadata as patch images only', async () => {
    const directory = createDirectoryHandle([
      'abms/_processed/2025/denmark/F1/20250501231959-snapshot_crop_0403014a-ef2b-40ef-bdc1-2d72c55d1b3d.jpg',
    ])

    await expect(classifyDatasetFolder({ directory, folderName: 'images' })).resolves.toBe('patch-images-only')
  })
})

type MemoryDirectoryHandle = FileSystemDirectoryHandleLike & {
  kind: 'directory'
  children: Map<string, MemoryDirectoryHandle | FileSystemFileHandleLike>
}

function createDirectoryHandle(paths: string[]): MemoryDirectoryHandle {
  const root = createDirectory('')

  for (const path of paths) {
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
    if (fileName) current.children.set(fileName, { kind: 'file' })
  }

  return root
}

function createDirectory(name: string): MemoryDirectoryHandle {
  const directory: MemoryDirectoryHandle = {
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
  }

  return directory
}

function notFoundError() {
  const err = new Error('not found on disk')
  err.name = 'NotFoundError'
  return err
}
