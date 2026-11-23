import { describe, expect, it, beforeEach, vi } from 'vitest'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { agreeWithIdentification, detectionsStore, resetDetections } from '~/stores/entities/detections'
import { identificationHistory, identificationIdOf } from '../identifications'
import { patchesStore } from '~/stores/entities/5.patches'
import { photosStore } from '~/stores/entities/photos'
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
import { migratePackageToCamelCase } from '../migrate-package-to-camel-case'
import { userSessionStore } from '~/stores/ui'
import { parseClassificationRecords } from '../parse-package-records'
import type { ClassificationRecord } from '../records'

// jsdom has no IndexedDB; ingest reads cluster overrides / caches through it.
vi.mock('~/utils/index-db', () => import('~/test/memory-index-db'))

describe('persist round-trip (L4)', () => {
  beforeEach(() => {
    detectionsStore.set({})
    patchesStore.set({})
    photosStore.set({})
    mothboxNextPackageStore.set(null)
    userSessionStore.set({ initials: 'user' })
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
        humanClassifierId: 'user',
      }
    }

    const second = updated[patchIds[1]]
    if (second) {
      updated[patchIds[1]] = {
        ...acceptDetection({ existing: second }),
        detectedBy: 'user',
        identifiedAt: Date.now() + 10_000_000_000_000,
        humanClassifierId: 'user',
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

  it('keeps the human row and appends a withdrawal when reset takes an identification back', async () => {
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
    const foliumRows = humanRows.filter((row) => row.patch_id === foliumPatchId)
    // The identification stays in the history; a withdrawal row takes it back.
    expect(foliumRows.length).toBe(2)
    expect(foliumRows[0]?.taxon?.species).toBe('folium')
    expect(foliumRows[1]?.classification_type).toBe('withdrawn')
    expect(foliumRows[1]?.withdraws).toBe(`bf::${foliumPatchId}`)

    // The determination falls back to the machine identification.
    const current = parseClassificationRecords(await readFile(path.join(tempRoot, '02_records/current-classifications.ndjson'), 'utf8'))
    const determination = current.find((row) => row.patch_id === foliumPatchId)
    expect(determination?.classifier_type).toBe('bot')

    // Saving again appends nothing.
    await persistPackageClassifications({ writer, leafGroupId: leafGroupId! })
    expect(await readFile(userPath, 'utf8')).toBe(humanText)
  })

  it('choosing an identification from the history records an Agree with it', async () => {
    const src = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'mothbox-next-'))
    await cp(src, tempRoot, { recursive: true })

    const walked = await walkFixtureFiles(tempRoot)
    const indexed = await Promise.all(
      walked.map(async (f) => {
        const textContent = (await readFile(path.join(tempRoot, f.path))).toString('utf8')
        return { path: f.path, name: f.name, size: f.size, file: { text: async () => textContent } as File }
      }),
    )
    await ingestMothboxNextPackageFromIndexedFiles({ files: indexed as any })
    userSessionStore.set({ initials: 'BF' })

    const foliumPatchId = 'hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt'
    const loaded = mothboxNextPackageStore.get()?.loaded
    const history = identificationHistory({ classificationFiles: loaded?.classificationFiles, occurrenceKey: foliumPatchId })
    expect(history.map((e) => e.row.classifier_type)).toEqual(['bot', 'human'])
    const machine = history[0]!.row

    agreeWithIdentification({ detectionId: foliumPatchId, identification: machine })
    const chosen = detectionsStore.get()?.[foliumPatchId]
    expect(chosen?.classificationType).toBe('accept')
    expect(chosen?.taxon?.order).toBe('Diptera')
    expect(chosen?.agreedWith).toBe(identificationIdOf(machine))
    expect(chosen?.humanClassifierId).toBe('bf')

    const writer = createNodePackageTextWriter(tempRoot)
    await persistPackageClassifications({ writer, leafGroupId: chosen!.leafGroupId })

    const rows = parseClassificationRecords(await readFile(path.join(tempRoot, '03_classifications/bf.ndjson'), 'utf8'))
    const foliumRows = rows.filter((row) => row.patch_id === foliumPatchId)
    expect(foliumRows.map((row) => row.classification_type)).toEqual(['taxon', 'accept'])
    expect(foliumRows[1]?.agreed_with).toBe(identificationIdOf(machine))
    expect(foliumRows[1]?.identifier_name).toBe('BF')

    const current = parseClassificationRecords(await readFile(path.join(tempRoot, '02_records/current-classifications.ndjson'), 'utf8'))
    const determination = current.find((row) => row.patch_id === foliumPatchId)
    expect(determination?.classification_type).toBe('accept')
    expect(determination?.taxon?.order).toBe('Diptera')
  })

  it('saves and reloads identifications in a package converted to camelCase', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'mothbox-next-'))
    await cp(fixturePackageRoot('04_dinacon_lightweight_substrate'), tempRoot, { recursive: true })
    const migrated = await migratePackageToCamelCase({
      fs: {
        readText: (p) => readFile(path.join(tempRoot, p), 'utf8'),
        writeText: async (p, text) => {
          await mkdir(path.dirname(path.join(tempRoot, p)), { recursive: true })
          await writeFile(path.join(tempRoot, p), text)
        },
        exists: async () => true,
        listNdjson: async (folder) => {
          const rel = folder.replace(/\/+$/, '')
          return (await readdir(path.join(tempRoot, rel))).filter((n) => n.endsWith('.ndjson')).sort().map((n) => `${rel}/${n}`)
        },
        remove: (p) => rm(path.join(tempRoot, p)),
      },
    })
    expect(migrated.status).toBe('migrated')

    const ingest = async () => {
      const walked = await walkFixtureFiles(tempRoot)
      const indexed = await Promise.all(
        walked.map(async (f) => {
          const textContent = (await readFile(path.join(tempRoot, f.path))).toString('utf8')
          return { path: f.path, name: f.name, size: f.size, file: { text: async () => textContent } as File }
        }),
      )
      await ingestMothboxNextPackageFromIndexedFiles({ files: indexed as any })
    }
    await ingest()
    userSessionStore.set({ initials: 'bf' })

    const foliumPatchId = 'hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot_yolo11m_4500_imgsz1600_b1_2024-01-18.pt'
    const before = detectionsStore.get()?.[foliumPatchId]
    expect(before?.taxon?.species).toBe('folium')
    detectionsStore.set({
      ...(detectionsStore.get() || {}),
      [foliumPatchId]: {
        ...updateDetectionWithTaxon({ existing: before!, taxon: { kingdom: 'Animalia', class: 'Insecta', order: 'Coleoptera' }, label: 'Coleoptera' }),
        humanClassifierId: 'bf',
      },
    })
    await persistPackageClassifications({ writer: createNodePackageTextWriter(tempRoot), leafGroupId: before!.leafGroupId })

    const lines = (await readFile(path.join(tempRoot, '03_classifications/bf.ndjson'), 'utf8')).trim().split('\n')
    const last = JSON.parse(lines[lines.length - 1]!)
    expect(last).toMatchObject({ patchID: foliumPatchId, identifierType: 'human', classificationType: 'taxon' })
    expect(last.patch_id).toBeUndefined()

    detectionsStore.set({})
    patchesStore.set({})
    mothboxNextPackageStore.set(null)
    await ingest()
    expect(detectionsStore.get()?.[foliumPatchId]?.taxon?.order).toBe('Coleoptera')
  })

  it('clears human taxonomy when resetting a patch-only package without bot rows', async () => {
    mothboxNextPackageStore.set({
      packageRoot: '',
      manifest: {
        format: 'mothbox-next-dataset',
        version: 3,
        dataset_id: 'patch-only',
        folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
        records: { patches: '02_records/patches.ndjson' },
      },
      loaded: { classificationFiles: [] } as any,
    })
    photosStore.set({
      'photo.jpg': { id: 'photo.jpg', name: 'photo.jpg', leafGroupId: 'patch-only__default' } as any,
    })
    detectionsStore.set({
      p1: {
        id: 'p1',
        patchId: 'p1',
        photoId: 'photo.jpg',
        leafGroupId: 'patch-only__default',
        detectedBy: 'user',
        identifiedAt: 10,
        label: 'Diptera',
        taxon: { kingdom: 'Animalia', class: 'Insecta', order: 'Diptera' },
        classificationType: 'taxon',
        humanClassifierId: 'bf',
        score: 0.8,
      },
    })

    await resetDetections({ detectionIds: ['p1'] })

    const reset = detectionsStore.get()?.p1
    expect(reset?.detectedBy).toBe('auto')
    expect(reset?.label).toBeUndefined()
    expect(reset?.taxon).toBeUndefined()
    expect(reset?.classificationType).toBeUndefined()
    expect(reset?.humanClassifierId).toBeUndefined()
    expect(reset?.score).toBeUndefined()
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

  it('does not copy another classifier rows into the active classifier file', async () => {
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
    userSessionStore.set({ initials: 'bob' })

    const writer = createNodePackageTextWriter(tempRoot)
    await persistPackageClassifications({ writer })

    expect(await writer.fileExists('03_classifications/bob.ndjson')).toBe(false)
  })
})
