/**
 * Every ID carries the species list it was made from. A bot (Mothbot Process) ID
 * and a later human ID in Classify can use different lists, so each records its
 * own DOI — and the export keeps both.
 */
import { describe, expect, it } from 'vitest'
import { classificationFromBotShape } from '~/features/mothbox-next/bot-shape-to-classification'
import { classificationFromDetection, detectionFromClassification } from '~/features/mothbox-next/classification-to-detection'
import { identifyDetection } from '~/features/data-flow/2.identify/identify'
import { buildDetectionFromBotShape, buildIdentifiedJsonShapeFromDetection } from '~/models/detection-shapes'
import { buildDarwinShapeFromDetection } from '~/features/data-flow/4.export/darwin-csv'
import type { DetectionEntity } from '~/models/detection.types'

const BOT_DOI = 'https://doi.org/10.15468/dl.4j8kfb' // worldwide list Process used
const HUMAN_DOI = 'https://doi.org/10.15468/dl.x3qf72' // Panama list picked in Classify
const EXCLUSIONS = 'light-trap-exclusions@d62bede7'

const botShape = {
  patch_path: 'patches/photo_0_Mothbot_model.pt.jpg',
  label: 'ORDER_Lepidoptera',
  score: 0.8,
  kingdom: 'Animalia',
  phylum: 'Arthropoda',
  class: 'Insecta',
  order: 'Lepidoptera',
  identifier_bot: 'BioCLIP2',
  species_list: BOT_DOI,
  species_list_exclusions: EXCLUSIONS,
}

function botDetection(): DetectionEntity {
  const row = classificationFromBotShape({ shape: botShape as any, patchId: 'p1', classifierId: 'BioCLIP2' })
  return {
    ...detectionFromClassification({ row, leafGroupId: 'night', photoId: 'photo' }),
    originalMothboxLabel: 'ORDER_Lepidoptera',
    originalMothboxSpeciesList: BOT_DOI,
    originalMothboxSpeciesListExclusions: EXCLUSIONS,
  }
}

const humanTaxon = {
  scientificName: 'Hypercompe albescens',
  taxonRank: 'species',
  kingdom: 'Animalia',
  phylum: 'Arthropoda',
  class: 'Insecta',
  order: 'Lepidoptera',
  family: 'Erebidae',
  genus: 'Hypercompe',
  species: 'Hypercompe albescens',
}

describe('species-list provenance', () => {
  it('bot IDs carry the DOI and exclusions Process wrote', () => {
    const row = classificationFromBotShape({ shape: botShape as any, patchId: 'p1', classifierId: 'BioCLIP2' })
    expect(row.species_list).toBe(BOT_DOI)
    expect(row.species_list_exclusions).toBe(EXCLUSIONS)

    const detection = detectionFromClassification({ row, leafGroupId: 'night', photoId: 'photo' })
    expect(detection.speciesListDOI).toBe(BOT_DOI)
    expect(detection.speciesListExclusions).toBe(EXCLUSIONS)
  })

  it('ignores Process\'s "no_doi" placeholder', () => {
    const row = classificationFromBotShape({ shape: { ...botShape, species_list: 'no_doi' } as any, patchId: 'p1', classifierId: 'b' })
    expect(row.species_list).toBeNull()
  })

  it('a human ID records the human\'s list and drops the bot\'s exclusions', () => {
    const { detection } = identifyDetection({
      detection: botDetection(),
      input: { type: 'taxon', taxon: humanTaxon },
      context: { speciesListId: 'panama.csv', speciesListDOI: HUMAN_DOI },
    })
    expect(detection.speciesListDOI).toBe(HUMAN_DOI)
    expect(detection.speciesListExclusions).toBeUndefined()
    // …while the original bot ID's list is still known.
    expect(detection.originalMothboxSpeciesList).toBe(BOT_DOI)

    const row = classificationFromDetection({ detection, classifierId: 'AQ', classifierType: 'human' })
    expect(row.species_list).toBe(HUMAN_DOI)
    expect(row.species_list_exclusions).toBeNull()
  })

  it('a human ID with no list selected is not credited to the bot\'s list', () => {
    const { detection } = identifyDetection({ detection: botDetection(), input: { type: 'taxon', taxon: humanTaxon } })
    expect(detection.speciesListDOI).toBeUndefined()
  })

  it('accepting a bot ID keeps the bot\'s list and exclusions, whatever list is selected', () => {
    const { detection } = identifyDetection({
      detection: botDetection(),
      input: { type: 'accept' },
      context: { speciesListId: 'panama.csv', speciesListDOI: HUMAN_DOI },
    })
    expect(detection.speciesListDOI).toBe(BOT_DOI)
    expect(detection.speciesListExclusions).toBe(EXCLUSIONS)
  })

  it('survives the legacy _identified.json round trip', () => {
    const bot = buildDetectionFromBotShape({
      shape: botShape,
      existingDetection: { id: 'p1', patchId: 'p1', photoId: 'photo', leafGroupId: 'night' },
    })
    expect(bot.speciesListDOI).toBe(BOT_DOI)
    expect(bot.originalMothboxSpeciesList).toBe(BOT_DOI)

    const accepted = identifyDetection({ detection: bot, input: { type: 'accept' } }).detection
    const shape = buildIdentifiedJsonShapeFromDetection({ detection: accepted, identifierHuman: 'AQ' })
    expect(shape.species_list).toBe(BOT_DOI)
    expect(shape.species_list_exclusions).toBe(EXCLUSIONS)
  })

  it('exports both the final ID\'s list and the original bot ID\'s list', () => {
    const { detection } = identifyDetection({
      detection: botDetection(),
      input: { type: 'taxon', taxon: humanTaxon },
      context: { speciesListId: 'panama.csv', speciesListDOI: HUMAN_DOI },
    })
    const row = buildDarwinShapeFromDetection({ detection, leafGroupId: 'P/D/2026-01-01', nightDiskPath: '' }) as Record<string, string>
    expect(row.species_list_doi).toBe(HUMAN_DOI)
    expect(row.species_list_exclusions).toBe('')
    expect(row.original_mothbox_identifciation).toBe('ORDER_Lepidoptera')
    expect(row.original_mothbox_species_list_doi).toBe(BOT_DOI)
    expect(row.original_mothbox_species_list_exclusions).toBe(EXCLUSIONS)

    const untouched = buildDarwinShapeFromDetection({ detection: botDetection(), leafGroupId: 'P/D/2026-01-01', nightDiskPath: '' }) as Record<string, string>
    expect(untouched.species_list_doi).toBe(BOT_DOI)
    expect(untouched.species_list_exclusions).toBe(EXCLUSIONS)
  })
})
