import { describe, expect, it } from 'vitest'
import { parseClassificationRecords, parsePatchRecords } from '../parse-package-records'

describe('parse-package-records', () => {
  it('parses valid patch rows and skips malformed lines', () => {
    const rows = parsePatchRecords(
      [
        JSON.stringify({ patch_id: 'a.pt', dataset_id: 'ds', asset_path: '01_patches/a.jpg' }),
        JSON.stringify({ patch_id: '', dataset_id: 'ds', asset_path: 'x' }),
        '',
      ].join('\n'),
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]?.patch_id).toBe('a.pt')
  })

  it('requires classification identity fields', () => {
    const rows = parseClassificationRecords(
      JSON.stringify({
        patch_id: 'a.pt',
        classifier_id: 'bf',
        classifier_type: 'human',
        classification_type: 'taxon',
      }),
    )

    expect(rows).toHaveLength(1)
    expect(
      parseClassificationRecords(JSON.stringify({ patch_id: 'a.pt', classifier_id: 'bf' })),
    ).toHaveLength(0)
  })
})
