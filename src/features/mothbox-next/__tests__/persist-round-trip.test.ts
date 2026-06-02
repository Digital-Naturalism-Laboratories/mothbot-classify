import { describe, expect, it, beforeEach } from 'vitest'
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { detectionsStore, resetDetections } from '~/stores/entities/detections'
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
import { userSessionStore } from '~/stores/ui'
import { parseClassificationRecords } from '../parse-package-records'
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
    const leafGroupId = updated[patchIds[0]]?.leafGroupId
    if (leafGroupId) await persistPackageClassifications({ writer, leafGroupId })

    const userPath = path.join(tempRoot, '03_classifications/user.ndjson')
    const humanText = await readFile(userPath, 'utf8')
    const humanRows = parseClassificationRecords(humanText)

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

  it('removes human rows from disk when reset clears identifications', async () => {
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
    userSessionStore.set({ initials: 'bf' })

    const foliumPatchId = 'hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt'
    const before = detectionsStore.get()?.[foliumPatchId]
    expect(before?.detectedBy).toBe('user')
    expect(before?.taxon?.species).toBe('folium')
    expect(Array.isArray(before?.points)).toBe(true)
    const beforePoints = before?.points
    detectionsStore.set({
      ...(detectionsStore.get() || {}),
      [foliumPatchId]: {
        ...before!,
        botClassifierId: 'stale-classifier',
      },
    })

    await resetDetections({ detectionIds: [foliumPatchId] })

    const afterReset = detectionsStore.get()?.[foliumPatchId]
    expect(afterReset?.detectedBy).toBe('auto')
    expect(afterReset?.taxon?.order).toBe('Diptera')
    expect(afterReset?.botClassifierId).toBe('Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt')
    expect(afterReset?.points).toEqual(beforePoints)

    const writer = createNodePackageTextWriter(tempRoot)
    const leafGroupId = afterReset?.leafGroupId
    if (leafGroupId) await persistPackageClassifications({ writer, leafGroupId })

    const userPath = path.join(tempRoot, '03_classifications/bf.ndjson')
    const humanText = await readFile(userPath, 'utf8')
    const humanRows = parseClassificationRecords(humanText)
    expect(humanRows.some((row) => row.patch_id === foliumPatchId)).toBe(false)
  })

  it('preserves human rows from other leaf groups when saving one leaf group', async () => {
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
    userSessionStore.set({ initials: 'bf' })

    const current = detectionsStore.get() || {}
    const currentLeafPatchId = 'hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt'
    const otherLeafPatchId = 'grupoKite_2025_06_23__04_56_19_HDR0_0_Mothbot_last.pt'
    const leafGroupId = current[currentLeafPatchId]?.leafGroupId
    expect(leafGroupId).toBeTruthy()
    expect(current[otherLeafPatchId]?.leafGroupId).not.toBe(leafGroupId)

    const classifierPath = path.join(tempRoot, '03_classifications/bf.ndjson')
    const existingText = await readFile(classifierPath, 'utf8')
    const otherLeafRow: ClassificationRecord = {
      patch_id: otherLeafPatchId,
      classifier_id: 'bf',
      classifier_type: 'human',
      classification_type: 'taxon',
      label: 'Coleoptera',
      taxon: { kingdom: 'Animalia', phylum: 'Arthropoda', class: 'Insecta', order: 'Coleoptera', scientificName: 'Coleoptera' },
      morphospecies: null,
      is_error: false,
      classified_at: Date.now() + 10_000_000_000_000,
    }
    await writeFile(classifierPath, `${existingText.trim()}\n${JSON.stringify(otherLeafRow)}\n`)

    const writer = createNodePackageTextWriter(tempRoot)
    await persistPackageClassifications({ writer, leafGroupId })

    const humanRows = parseClassificationRecords(await readFile(classifierPath, 'utf8'))
    expect(humanRows.some((row) => row.patch_id === currentLeafPatchId)).toBe(true)
    expect(humanRows.some((row) => row.patch_id === otherLeafPatchId)).toBe(true)
  })
})
