import { afterEach, describe, expect, it } from 'vitest'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { PACKAGE_EXPORTS_FOLDER, getPackageExportFolderPath } from '../export-utils'

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

  it('handles a package sitting at the datasets root', () => {
    setPackageRoot('')
    // No package root recorded ⇒ caller falls back to the legacy path.
    expect(getPackageExportFolderPath()).toBeNull()
  })

  it('returns null when no package is open, so legacy datasets keep their path', () => {
    mothboxNextPackageStore.set(null)
    expect(getPackageExportFolderPath()).toBeNull()
  })
})
