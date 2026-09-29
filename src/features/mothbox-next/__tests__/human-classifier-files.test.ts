import { describe, expect, it } from 'vitest'
import type { ClassificationRecord } from '../records'
import { classifierIdFromIdentifierHuman, groupHumanRowsByClassifierFile } from '../human-classifier-files'

describe('classifierIdFromIdentifierHuman', () => {
  it('matches how the app derives an id from session initials', () => {
    expect(classifierIdFromIdentifierHuman('HS')).toBe('hs')
    expect(classifierIdFromIdentifierHuman('  aQ ')).toBe('aq')
  })

  it('keeps ids safe to use as file names', () => {
    expect(classifierIdFromIdentifierHuman('H/S')).toBe('h_s')
    expect(classifierIdFromIdentifierHuman('Hubert S.')).toBe('hubert_s')
    expect(classifierIdFromIdentifierHuman('_bot')).toBe('bot')
  })

  it('rejects values that cannot name a person’s file', () => {
    expect(classifierIdFromIdentifierHuman('')).toBeNull()
    expect(classifierIdFromIdentifierHuman('  ')).toBeNull()
    expect(classifierIdFromIdentifierHuman('...')).toBeNull()
    expect(classifierIdFromIdentifierHuman(null)).toBeNull()
    expect(classifierIdFromIdentifierHuman(42)).toBeNull()
  })
})

describe('groupHumanRowsByClassifierFile', () => {
  it('writes one file per person, falling back for rows without a classifier', () => {
    const rows = [
      humanRow({ patch_id: 'p1', classifier_id: 'hs' }),
      humanRow({ patch_id: 'p2', classifier_id: 'aq' }),
      humanRow({ patch_id: 'p3', classifier_id: 'hs' }),
      humanRow({ patch_id: 'p4', classifier_id: '' }),
    ]

    const files = groupHumanRowsByClassifierFile({ rows, fallbackClassifierId: 'user' })

    expect(files.map((file) => [file.path, file.rows.map((row) => row.patch_id)])).toEqual([
      ['03_classifications/aq.ndjson', ['p2']],
      ['03_classifications/hs.ndjson', ['p1', 'p3']],
      ['03_classifications/user.ndjson', ['p4']],
    ])
  })
})

function humanRow(params: { patch_id: string; classifier_id: string }): ClassificationRecord {
  return {
    ...params,
    classifier_type: 'human',
    classification_type: 'error',
    label: 'ERROR',
    taxon: null,
    morphospecies: null,
    is_error: true,
    classified_at: 1,
  }
}
