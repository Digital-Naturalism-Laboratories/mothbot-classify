import { describe, expect, it } from 'vitest'
import {
  isCsvFileName,
  isParquetFileName,
  isPatchImageFileName,
  isReservedDatasetsChildFolderName,
  isUnderPackageSource,
  isUnderProcessedMirror,
} from '../classify-dataset-folder'

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
