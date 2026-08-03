import { describe, expect, it } from 'vitest'
import { resolveCurrentClassifications } from '../resolve-classifications'
import type { ClassificationRecord } from '../records'

function row(partial: Partial<ClassificationRecord> & Pick<ClassificationRecord, 'patch_id' | 'classifier_id'>): ClassificationRecord {
  return {
    classifier_type: 'human',
    classification_type: 'taxon',
    ...partial,
    patch_id: partial.patch_id,
    classifier_id: partial.classifier_id,
  }
}

describe('resolveCurrentClassifications (L1)', () => {
  it('latest classified_at wins', () => {
    const resolved = resolveCurrentClassifications({
      rows: [
        { ...row({ patch_id: 'p1', classifier_id: 'bot', classifier_type: 'bot', classified_at: null }), sourceFile: '_bot.ndjson' },
        { ...row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100 }), sourceFile: 'bf.ndjson' },
        { ...row({ patch_id: 'p1', classifier_id: 'other', classified_at: 50 }), sourceFile: 'other.ndjson' },
      ],
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.classifier_id).toBe('bf')
  })

  it('human beats bot when timestamps missing', () => {
    const resolved = resolveCurrentClassifications({
      rows: [
        { ...row({ patch_id: 'p2', classifier_id: 'bot', classifier_type: 'bot', classified_at: null }), sourceFile: '_bot.ndjson' },
        { ...row({ patch_id: 'p2', classifier_id: 'bf', classifier_type: 'human', classified_at: null }), sourceFile: 'bf.ndjson' },
      ],
    })

    expect(resolved[0]?.classifier_id).toBe('bf')
  })

  it('accept preserves taxon from winning row', () => {
    const taxon = { kingdom: 'Animalia', class: 'Insecta', order: 'Diptera' }
    const resolved = resolveCurrentClassifications({
      rows: [
        {
          ...row({
            patch_id: 'p3',
            classifier_id: 'bf',
            classification_type: 'accept',
            taxon,
            classified_at: 200,
          }),
          sourceFile: 'bf.ndjson',
        },
      ],
    })

    expect(resolved[0]?.classification_type).toBe('accept')
    expect(resolved[0]?.taxon?.order).toBe('Diptera')
  })

  it('error row wins when newest', () => {
    const resolved = resolveCurrentClassifications({
      rows: [
        { ...row({ patch_id: 'p4', classifier_id: 'bot', classifier_type: 'bot', classified_at: null }), sourceFile: '_bot.ndjson' },
        {
          ...row({
            patch_id: 'p4',
            classifier_id: 'bf',
            classification_type: 'error',
            label: 'ERROR',
            is_error: true,
            classified_at: 300,
          }),
          sourceFile: 'bf.ndjson',
        },
      ],
    })

    expect(resolved[0]?.classification_type).toBe('error')
  })
})
