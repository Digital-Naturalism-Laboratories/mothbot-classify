import { afterEach, describe, expect, it } from 'vitest'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { PACKAGE_EXPORTS_FOLDER, getPackageExportFolderPath } from '../export-utils'
import { describeDarwinExportFolder, getNightDarwinExportPathParts } from '../darwin-csv'

function setPackageRoot(packageRoot: string) {
  mothboxNextPackageStore.set({ packageRoot, manifest: {} as any })
}

afterEach(() => {
  mothboxNextPackageStore.set(null)
})

describe('getPackageExportFolderPath', () => {
  it('puts exports beside 02_records / 03_classifications in the package root', () => {
    setPackageRoot('Tucson/_processed/DesertHouse')
    expect(getPackageExportFolderPath()).toBe('Tucson/_processed/DesertHouse/04_exports')
  })

  it('uses the numbered folder name', () => {
    expect(PACKAGE_EXPORTS_FOLDER).toBe('04_exports')
  })

  it('tolerates a trailing slash on the package root', () => {
    setPackageRoot('Tucson/_processed/DesertHouse/')
    expect(getPackageExportFolderPath()).toBe('Tucson/_processed/DesertHouse/04_exports')
  })

  it('handles a package opened at its own root, where packageRoot is empty', () => {
    // Regression: the persisted projectsRoot handle IS the package directory,
    // so dataset.json sits at depth 1 and packageRoot is ''. Treating that as
    // "no package" silently disabled 04_exports entirely.
    setPackageRoot('')
    expect(getPackageExportFolderPath()).toBe('04_exports')
  })

  it('returns null when no package is open, so legacy datasets keep their path', () => {
    mothboxNextPackageStore.set(null)
    expect(getPackageExportFolderPath()).toBeNull()
  })
})

describe('Darwin CSV export location', () => {
  const night = 'Tucson/DesertHouse_2026-01/2026-01-15'

  it('writes package exports to 04_exports, not a stray <project>/exports folder', () => {
    setPackageRoot('')
    const parts = getNightDarwinExportPathParts({ leafGroupId: night })
    expect(parts.slice(0, -1)).toEqual(['04_exports'])
    expect(parts.at(-1)).toMatch(/^Tucson_.*_exported-\d{4}-\d{2}_\d{2}\.csv$/)
  })

  it('keeps <project>/exports for legacy datasets', () => {
    mothboxNextPackageStore.set(null)
    expect(getNightDarwinExportPathParts({ leafGroupId: night }).slice(0, -1)).toEqual(['Tucson', 'exports'])
  })

  it('describes the folder starting from the opened folder\'s name', () => {
    setPackageRoot('')
    localStorage.setItem('mbl/pickedDirName', 'DesertHouse_pkg')
    expect(describeDarwinExportFolder({ leafGroupId: night })).toBe('DesertHouse_pkg/04_exports')
    localStorage.removeItem('mbl/pickedDirName')
  })
})
