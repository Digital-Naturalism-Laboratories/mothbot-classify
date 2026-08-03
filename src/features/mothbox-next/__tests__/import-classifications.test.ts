import { describe, expect, it, beforeEach } from 'vitest'
import { cp, mkdtemp, readFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { detectionsStore } from '~/stores/entities/detections'
import { importClassifierNdjsonFile } from '../import-classifications'
import { ingestMothboxNextPackageFromIndexedFiles } from '~/features/data-flow/1.ingest/package/ingest-package'
import {
  createNodePackageTextWriter,
  fixturePackageRoot,
  walkFixtureFiles,
} from './node-fixture-access'
import { serializeNdjsonLines } from '../parse-ndjson'
import type { ClassificationRecord } from '../records'

const TEST_PATCH_ID = 'grupoKite_2025_06_23__04_56_19_HDR0_2_Mothbot_last.pt'

describe('import classifications (L5)', () => {
  beforeEach(() => {
    detectionsStore.set({})
  })

  it('replaces classifier file and refreshes resolved state from disk', async () => {
    const src = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const packageRoot = await mkdtemp(path.join(tmpdir(), 'mothbox-import-'))
    await cp(src, packageRoot, { recursive: true })

    const walked = await walkFixtureFiles(packageRoot)
    const indexed = await Promise.all(
      walked.map(async (f) => {
        const bytes = await readFile(path.join(packageRoot, f.path))
        const textContent = bytes.toString('utf8')
        return {
          path: f.path,
          name: f.name,
          size: f.size,
          file: { text: async () => textContent } as File,
        }
      }),
    )

    await ingestMothboxNextPackageFromIndexedFiles({ files: indexed as any })

    const before = detectionsStore.get()?.[TEST_PATCH_ID]
    expect(before?.taxon?.order).toBe('Coleoptera')

    const altRow: ClassificationRecord = {
      patch_id: TEST_PATCH_ID,
      classifier_id: 'collab',
      classifier_type: 'human',
      classification_type: 'taxon',
      label: 'ORDER_Lepidoptera',
      taxon: { kingdom: 'Animalia', class: 'Insecta', order: 'Lepidoptera' },
      classified_at: Date.now() + 1_000_000,
    }

    const writer = createNodePackageTextWriter(packageRoot)
    await importClassifierNdjsonFile({
      classifierId: 'collab',
      ndjsonText: serializeNdjsonLines([altRow]),
      writer,
      indexedFiles: indexed as any,
    })

    const detection = detectionsStore.get()?.[TEST_PATCH_ID]
    expect(detection?.taxon?.order).toBe('Lepidoptera')
  })
})
