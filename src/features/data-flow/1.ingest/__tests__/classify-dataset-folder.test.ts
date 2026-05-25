import { describe, expect, it } from 'vitest'
import { isPatchImageFileName, isReservedDatasetsChildFolderName, isUnderPackageSource } from '../classify-dataset-folder'

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
})
