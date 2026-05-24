import { describe, expect, it, beforeEach } from 'vitest'
import { cp, mkdtemp, readFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { detectionsStore } from '~/stores/entities/detections'
import { patchesStore } from '~/stores/entities/5.patches'
import { acceptDetection, updateDetectionWithTaxon } from '~/models/detection-shapes'
import { loadMothboxNextPackageData } from '../load-package-data'
import { ingestMothboxNextPackageFromIndexedFiles } from '~/features/data-flow/1.ingest/package/ingest-package'
import { mothboxNextPackageStore } from '../active-package'
import {
  createNodePackageDataAccess,
  createNodePackageTextWriter,
  fixturePackageRoot,
  walkFixtureFiles,
} from './node-fixture-access'
import { persistPackageClassifications } from '../persist/persist-human-classifications'
import { parseNdjsonLines } from '../parse-ndjson'
import type { ClassificationRecord } from '../records'

describe('persist round-trip (L4)', () => {
  beforeEach(() => {
    detectionsStore.set({})
    patchesStore.set({})
    mothboxNextPackageStore.set(null)
  })

  it('writes human classifications and reloads', async () => {
    const src = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'mothbox-next-'))
    await cp(src, tempRoot, { recursive: true })

    const walked = await walkFixtureFiles(tempRoot)
    const indexed = await Promise.all(
      walked.map(async (f) => {
        const bytes = await readFile(path.join(tempRoot, f.path))
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

    const all = detectionsStore.get() || {}
    const patchIds = Object.keys(all).slice(0, 2)
    const updated = { ...all }

    const first = updated[patchIds[0]]
    if (first) {
      updated[patchIds[0]] = {
        ...updateDetectionWithTaxon({
          existing: first,
          taxon: { kingdom: 'Animalia', class: 'Insecta', order: 'Coleoptera' },
          label: 'Coleoptera',
        }),
        detectedBy: 'user',
        identifiedAt: Date.now() + 10_000_000_000_000,
      }
    }

    const second = updated[patchIds[1]]
    if (second) {
      updated[patchIds[1]] = {
        ...acceptDetection({ existing: second }),
        detectedBy: 'user',
        identifiedAt: Date.now() + 10_000_000_000_000,
      }
    }

    detectionsStore.set(updated)

    const writer = createNodePackageTextWriter(tempRoot)
    const nightId = updated[patchIds[0]]?.nightId
    if (nightId) await persistPackageClassifications({ writer, nightId })

    const userPath = path.join(tempRoot, '03_classifications/user.ndjson')
    const humanText = await readFile(userPath, 'utf8')
    const humanRows = await parseNdjsonLines<ClassificationRecord>(humanText)

    expect(humanRows.some((r) => r.classifier_type === 'human')).toBe(true)

    detectionsStore.set({})
    patchesStore.set({})
    mothboxNextPackageStore.set(null)

    const walkedAfter = await walkFixtureFiles(tempRoot)
    const indexedAfter = await Promise.all(
      walkedAfter.map(async (f) => {
        const bytes = await readFile(path.join(tempRoot, f.path))
        const textContent = bytes.toString('utf8')
        return {
          path: f.path,
          name: f.name,
          size: f.size,
          file: { text: async () => textContent } as File,
        }
      }),
    )

    await ingestMothboxNextPackageFromIndexedFiles({ files: indexedAfter as any })
    const reloaded = detectionsStore.get() || {}
    const reloadedFirst = reloaded[patchIds[0]]
    expect(reloadedFirst?.detectedBy).toBe('user')
    expect(reloadedFirst?.taxon?.order).toBe('Coleoptera')
  })
})
