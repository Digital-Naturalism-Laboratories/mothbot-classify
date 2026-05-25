import { describe, expect, it } from 'vitest'
import { buildForeignContentDialogCopy } from '../foreign-content-dialog-copy'
import { buildPendingDatasetSetupCopy } from '../pending-dataset-setup-copy'
import { formatPendingDatasetSetupError } from '../pending-dataset-setup-errors'

describe('buildForeignContentDialogCopy', () => {
  it('builds single-folder copy', () => {
    const copy = buildForeignContentDialogCopy({
      packageFolderName: 'my-dataset',
      foreignFolders: [{ folderName: 'night-2', botDetectionFileCount: 3, photosOnly: false }],
      photosOnly: [],
    })

    expect(copy.title).toBe('Add new folder to dataset?')
    expect(copy.lead).toContain('my-dataset')
    expect(copy.lead).toContain('night-2')
    expect(copy.photosOnlyNote).toBeNull()
  })

  it('notes skipped photos-only folders', () => {
    const copy = buildForeignContentDialogCopy({
      packageFolderName: 'my-dataset',
      foreignFolders: [{ folderName: 'night-2', botDetectionFileCount: 1, photosOnly: false }],
      photosOnly: [{ folderName: 'pics', botDetectionFileCount: 0, photosOnly: true }],
    })

    expect(copy.photosOnlyNote).toContain('Skipped 1 folder')
  })
})

describe('buildPendingDatasetSetupCopy', () => {
  it('uses patch-image copy for image-only folders', () => {
    const copy = buildPendingDatasetSetupCopy({
      count: 1,
      folderNames: ['patches'],
      imageOnlyCount: 1,
      legacyCount: 0,
    })

    expect(copy.confirmLabel).toBe('Set up as patch images')
    expect(copy.lead).toContain('patch images')
  })
})

describe('formatPendingDatasetSetupError', () => {
  it('formats multiple errors as a bullet list', () => {
    const formatted = formatPendingDatasetSetupError([
      { folderName: 'a', message: 'missing' },
      { folderName: 'b', message: 'empty' },
    ])

    expect(formatted).toBe('• a: missing\n• b: empty')
  })
})
