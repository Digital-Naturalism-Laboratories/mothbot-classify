import { describe, expect, it } from 'vitest'
import { appendNdjsonRows, collectNewIdentificationRows } from '../persist/persist-human-classifications'
import type { ClassificationRecord } from '../records'
import type { DetectionEntity } from '~/models/detection.types'

const taxon = { kingdom: 'Animalia', class: 'Insecta', order: 'Coleoptera', scientificName: 'Coleoptera' }

function detection(partial: Partial<DetectionEntity> = {}): DetectionEntity {
  return { id: 'p1', patchId: 'p1', photoId: 'ph1', leafGroupId: 'night1', ...partial }
}

function mine(partial: Partial<ClassificationRecord> = {}): ClassificationRecord {
  return {
    patch_id: 'p1',
    classifier_id: 'bf',
    classifier_type: 'human',
    classification_type: 'taxon',
    label: 'Coleoptera',
    taxon,
    morphospecies: null,
    is_error: false,
    classified_at: 100,
    ...partial,
  }
}

const identifiedByMe = detection({
  detectedBy: 'user',
  humanClassifierId: 'bf',
  classificationType: 'taxon',
  label: 'Coleoptera',
  taxon,
  identifiedAt: 100,
})

describe('append-only identification files', () => {
  it('adds nothing when the detection still shows the latest identification', () => {
    expect(collectNewIdentificationRows({ detections: [identifiedByMe], existing: [mine()], classifierId: 'bf' })).toEqual([])
  })

  it('appends a new identification, with an id and the occurrence, when the claim changed', () => {
    const changed = { ...identifiedByMe, label: 'Diptera', taxon: { ...taxon, order: 'Diptera', scientificName: 'Diptera' }, identifiedAt: 200 }
    const [added, ...rest] = collectNewIdentificationRows({
      detections: [changed],
      existing: [mine()],
      classifierId: 'bf',
      identifierName: 'Ben F',
    })
    expect(rest).toHaveLength(0)
    expect(added?.label).toBe('Diptera')
    expect(added?.identification_id).toBeTruthy()
    expect(added?.occurrence_id).toBe('p1')
    expect(added?.identifier_name).toBe('Ben F')
    expect(added?.classified_at).toBe(200)
  })

  it('withdraws the identification when the detection was reset to the machine’s', () => {
    const reset = detection({ detectedBy: 'auto', label: 'Diptera', botClassifierId: 'mothbot' })
    const [added] = collectNewIdentificationRows({ detections: [reset], existing: [mine()], classifierId: 'bf', now: 500 })
    expect(added?.classification_type).toBe('withdrawn')
    expect(added?.withdraws).toBe('bf::p1')
    expect(added?.classified_at).toBe(500)
  })

  it('does not withdraw when another person’s later identification is showing', () => {
    const theirs = detection({ detectedBy: 'user', humanClassifierId: 'aq', label: 'Diptera', identifiedAt: 300 })
    expect(collectNewIdentificationRows({ detections: [theirs], existing: [mine()], classifierId: 'bf' })).toEqual([])
  })

  it('withdraws when another person’s older identification shows after a reset', () => {
    const theirs = detection({ detectedBy: 'user', humanClassifierId: 'aq', label: 'Diptera', identifiedAt: 50 })
    const [added] = collectNewIdentificationRows({ detections: [theirs], existing: [mine()], classifierId: 'bf', now: 500 })
    expect(added?.classification_type).toBe('withdrawn')
  })

  it('does not withdraw twice', () => {
    const existing = [mine(), mine({ classification_type: 'withdrawn', classified_at: 200, label: null, taxon: null })]
    const reset = detection({ detectedBy: 'auto' })
    expect(collectNewIdentificationRows({ detections: [reset], existing, classifierId: 'bf' })).toEqual([])
  })

  it('never writes another person’s identification into this file', () => {
    const theirs = detection({ detectedBy: 'user', humanClassifierId: 'aq', label: 'Diptera', identifiedAt: 300 })
    expect(collectNewIdentificationRows({ detections: [theirs], existing: [], classifierId: 'bf' })).toEqual([])
  })

  it('stamps a new row no earlier than the row it replaces (clock skew)', () => {
    const future = mine({ classified_at: 9_000 })
    const changed = { ...identifiedByMe, label: 'Diptera', taxon: { ...taxon, order: 'Diptera', scientificName: 'Diptera' }, identifiedAt: 200 }
    const [added] = collectNewIdentificationRows({ detections: [changed], existing: [future], classifierId: 'bf' })
    expect(added?.classified_at).toBe(9_000)
  })

  it('treats a legacy ERROR row and the same Non-Target label as unchanged', () => {
    const legacy = mine({ classification_type: 'error', is_error: true, label: 'ERROR', taxon: null })
    const nonTarget = detection({ detectedBy: 'user', humanClassifierId: 'bf', classificationType: 'error', isError: true, label: 'NON_TARGET' })
    expect(collectNewIdentificationRows({ detections: [nonTarget], existing: [legacy], classifierId: 'bf' })).toEqual([])
  })

  it('records which identification an Agree endorses', () => {
    const agreed = detection({
      detectedBy: 'user',
      humanClassifierId: 'bf',
      classificationType: 'accept',
      label: 'Diptera',
      agreedWith: 'mothbot::p1',
      identifiedAt: 100,
    })
    const [added] = collectNewIdentificationRows({ detections: [agreed], existing: [], classifierId: 'bf' })
    expect(added?.classification_type).toBe('accept')
    expect(added?.agreed_with).toBe('mothbot::p1')
  })

  it('appends without touching the existing lines', () => {
    const existingText = '{"a":1}'
    const out = appendNdjsonRows(existingText, [mine()])
    expect(out.startsWith('{"a":1}\n')).toBe(true)
    expect(out.endsWith('\n')).toBe(true)
  })
})
