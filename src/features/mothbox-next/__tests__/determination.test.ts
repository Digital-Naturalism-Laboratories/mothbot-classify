import { describe, expect, it } from 'vitest'
import {
  DETERMINATION_ALGORITHM,
  determineFromRows,
  resolveCurrentClassifications,
  type ClassificationRowWithSource,
} from '../resolve-classifications'
import { identificationHistory, identificationIdOf, sameIdentificationClaim } from '../identifications'
import type { ClassificationRecord } from '../records'

function row(partial: Partial<ClassificationRowWithSource> & Pick<ClassificationRecord, 'patch_id' | 'classifier_id'>): ClassificationRowWithSource {
  return {
    classifier_type: 'human',
    classification_type: 'taxon',
    sourceFile: `${partial.classifier_id}.ndjson`,
    ...partial,
  }
}

const bot = (patch: string, extra: Partial<ClassificationRowWithSource> = {}) =>
  row({ patch_id: patch, classifier_id: 'mothbot', classifier_type: 'bot', classified_at: null, label: 'Diptera', sourceFile: '_bot.ndjson', ...extra })

describe(`determination algorithm ${DETERMINATION_ALGORITHM}`, () => {
  it('any human identification beats a machine one, even a later one', () => {
    const winner = determineFromRows([
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, label: 'Coleoptera' }),
      bot('p1', { classified_at: 500 }),
    ])
    expect(winner?.classifier_id).toBe('bf')
  })

  it('the latest human identification wins', () => {
    const winner = determineFromRows([
      bot('p1'),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, label: 'Coleoptera' }),
      row({ patch_id: 'p1', classifier_id: 'aq', classified_at: 300, label: 'Lepidoptera' }),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 200, label: 'Diptera' }),
    ])
    expect(winner?.label).toBe('Lepidoptera')
  })

  it('a later row in the same file wins a timestamp tie (rows are appended)', () => {
    const winner = determineFromRows([
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, label: 'first' }),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, label: 'second' }),
    ])
    expect(winner?.label).toBe('second')
  })

  it('without people, the preferred machine row wins and ties keep the first', () => {
    expect(
      determineFromRows([
        bot('p1', { classifier_id: 'ami-a', label: 'A' }),
        bot('p1', { classifier_id: 'ami-b', label: 'B', classified_at: 1 }),
        bot('p1', { classifier_id: 'ami-c', label: 'C' }),
      ])?.label,
    ).toBe('B')
    expect(determineFromRows([bot('p1', { label: 'first' }), bot('p1', { label: 'second' })])?.label).toBe('first')
  })

  it('a withdrawal takes back that person’s earlier identifications only', () => {
    const rows = [
      bot('p1'),
      row({ patch_id: 'p1', classifier_id: 'aq', classified_at: 50, label: 'Lepidoptera' }),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, label: 'Coleoptera' }),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 200, classification_type: 'withdrawn' }),
    ]
    expect(determineFromRows(rows)?.label).toBe('Lepidoptera')
    expect(determineFromRows(rows.filter((r) => r.classifier_id !== 'aq'))?.classifier_type).toBe('bot')
  })

  it('an identification made after a withdrawal counts again', () => {
    const winner = determineFromRows([
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, label: 'Coleoptera' }),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 200, classification_type: 'withdrawn' }),
      row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 300, label: 'Diptera' }),
    ])
    expect(winner?.label).toBe('Diptera')
  })

  it('records the algorithm and the identification it took', () => {
    const [resolved] = resolveCurrentClassifications({
      rows: [bot('p1'), row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, identification_id: 'id-1' })],
    })
    expect(resolved?.determination_algorithm).toBe('mothbox-default/1')
    expect(resolved?.determined_from).toBe('id-1')
    expect(resolved?.resolved_from).toBe('bf.ndjson')
  })

  it('every detection of an occurrence gets the occurrence’s determination', () => {
    const resolved = resolveCurrentClassifications({
      rows: [bot('p1'), bot('p2'), row({ patch_id: 'p2', classifier_id: 'bf', classified_at: 100, label: 'Coleoptera' })],
      occurrenceIdByPatch: new Map([['p2', 'p1']]),
    })
    const byPatch = new Map(resolved.map((r) => [r.patch_id, r]))
    expect(byPatch.get('p1')?.label).toBe('Coleoptera')
    expect(byPatch.get('p2')?.label).toBe('Coleoptera')
    expect(byPatch.get('p1')?.determined_from).toBe('bf::p2')
  })

  it('an occurrence whose only identifications were withdrawn has no determination', () => {
    const resolved = resolveCurrentClassifications({
      rows: [
        row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100 }),
        row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 200, classification_type: 'withdrawn' }),
      ],
    })
    expect(resolved).toHaveLength(0)
  })
})

describe('identifications', () => {
  it('older rows get a stable derived id', () => {
    expect(identificationIdOf({ patch_id: 'p1', classifier_id: 'bf' })).toBe('bf::p1')
    expect(identificationIdOf({ patch_id: 'p1', classifier_id: 'bf', identification_id: 'abc' })).toBe('abc')
  })

  it('compares claims, ignoring time and treating legacy Non-Target labels as the same', () => {
    const base = row({ patch_id: 'p1', classifier_id: 'bf', classification_type: 'error', is_error: true, label: 'ERROR_Blur', classified_at: 1 })
    expect(sameIdentificationClaim(base, { ...base, label: 'NON_TARGET/Error/Blur', classified_at: 99 })).toBe(true)
    expect(sameIdentificationClaim(base, { ...base, label: 'NON_TARGET/Abiotic' })).toBe(false)
    const taxon = row({ patch_id: 'p1', classifier_id: 'bf', label: 'Diptera', taxon: { order: 'Diptera', scientificName: 'Diptera' } })
    expect(sameIdentificationClaim(taxon, { ...taxon, agreed_with: 'mothbot::p1' })).toBe(false)
  })

  it('lists an occurrence’s history oldest first and marks withdrawn identifications', () => {
    const history = identificationHistory({
      occurrenceKey: 'p1',
      classificationFiles: [
        { path: '_bot.ndjson', rows: [bot('p1'), bot('p2')] },
        {
          path: 'bf.ndjson',
          rows: [
            row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 100, identification_id: 'a' }),
            row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 200, classification_type: 'withdrawn', identification_id: 'b' }),
            row({ patch_id: 'p1', classifier_id: 'bf', classified_at: 300, identification_id: 'c' }),
          ],
        },
      ],
    })
    expect(history.map((e) => e.id)).toEqual(['mothbot::p1', 'a', 'b', 'c'])
    expect(history.map((e) => e.withdrawn)).toEqual([false, true, false, false])
  })
})
