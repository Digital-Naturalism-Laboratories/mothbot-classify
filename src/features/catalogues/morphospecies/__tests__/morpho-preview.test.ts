import { describe, expect, it } from 'vitest'
import { buildFallbackPreviewPairs, buildSummaryPreviewPairs, selectMorphoPreviewPairs } from '../morpho-preview'

describe('morpho preview fallback', () => {
  it('uses summary preview pairs when they exist', () => {
    const summaryPreviewPairs = buildSummaryPreviewPairs({
      morphoKey: 'Forcipomyia1',
      summaries: {
        'project/deployment/night': {
          morphoCounts: { forcipomyia1: 3 },
          morphoPreviewPatchIds: { forcipomyia1: 'summary-patch.jpg' },
        },
      },
      nights: {
        'project/deployment/night': {},
      },
      covers: {},
    })

    const fallbackPreviewPairs = buildFallbackPreviewPairs({
      morphoKey: 'Forcipomyia1',
      detections: {
        a: {
          detectedBy: 'user',
          morphospecies: 'Forcipomyia1',
          nightId: 'project/deployment/night',
          patchId: 'fallback-patch.jpg',
        },
      },
    })

    const selected = selectMorphoPreviewPairs({ summaryPreviewPairs, fallbackPreviewPairs })

    expect(summaryPreviewPairs).toEqual([{ nightId: 'project/deployment/night', patchId: 'summary-patch.jpg' }])
    expect(selected).toEqual(summaryPreviewPairs)
  })

  it('falls back to user detections when summaries lack preview ids', () => {
    const summaryPreviewPairs = buildSummaryPreviewPairs({
      morphoKey: 'Miridae13',
      summaries: {
        'project/deployment/night': {
          morphoCounts: { miridae13: 24 },
        },
      },
      nights: {
        'project/deployment/night': {},
      },
      covers: {},
    })

    const fallbackPreviewPairs = buildFallbackPreviewPairs({
      morphoKey: 'Miridae13',
      detections: {
        a: {
          detectedBy: 'user',
          morphospecies: 'Miridae13',
          nightId: 'project/deployment/night',
          patchId: 'patch-a.jpg',
        },
        b: {
          detectedBy: 'user',
          morphospecies: ' miridae13 ',
          nightId: 'project/deployment/night',
          patchId: 'patch-b.jpg',
        },
        c: {
          detectedBy: 'auto',
          morphospecies: 'Miridae13',
          nightId: 'project/deployment/night',
          patchId: 'ignored-auto.jpg',
        },
        d: {
          detectedBy: 'user',
          morphospecies: 'OtherMorpho',
          nightId: 'project/deployment/night',
          patchId: 'ignored-other.jpg',
        },
      },
    })

    const selected = selectMorphoPreviewPairs({ summaryPreviewPairs, fallbackPreviewPairs })

    expect(summaryPreviewPairs).toEqual([])
    expect(fallbackPreviewPairs).toEqual([
      { nightId: 'project/deployment/night', patchId: 'patch-a.jpg' },
      { nightId: 'project/deployment/night', patchId: 'patch-b.jpg' },
    ])
    expect(selected).toEqual(fallbackPreviewPairs)
  })
})
