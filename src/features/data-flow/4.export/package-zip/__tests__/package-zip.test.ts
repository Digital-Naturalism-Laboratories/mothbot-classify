// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { loadMothboxNextPackageData } from '~/features/mothbox-next/load-package-data'
import { createNodePackageDataAccess, fixturePackageRoot } from '~/features/mothbox-next/__tests__/node-fixture-access'
import { planPackageZip, sessionsForExport } from '../plan-package-zip'
import { writePackageZip } from '../write-package-zip'
import { PACKAGE_DEVICE_TYPES_RECORD, parseDeviceTypes } from '~/features/mothbox-next/device-types-records'
import { PACKAGE_POWER_SOURCES_RECORD, parsePowerSources } from '~/features/mothbox-next/power-sources-records'
import { newCustomDeviceType, newCustomPowerSource } from '~/models/device-types'

const root = fixturePackageRoot('04_dinacon_lightweight_substrate')

async function loadFrom(dir: string) {
  return loadMothboxNextPackageData({
    packageRoot: '',
    readManifestText: () => readFile(path.join(dir, 'dataset.json'), 'utf8'),
    access: createNodePackageDataAccess(dir),
  })
}

describe('zipped export for a collaborator', () => {
  it('exports one session as a package that opens on its own', async () => {
    const loaded = (await loadFrom(root))!
    const sessions = sessionsForExport(loaded)
    expect(sessions.length).toBeGreaterThan(1)
    const session = sessions.find((s) => s.patchCount > 0)!

    const manifestText = await readFile(path.join(root, 'dataset.json'), 'utf8')
    const plan = planPackageZip({ loaded, manifestText, cameraDayIds: [session.id] })
    expect(plan.patchCount).toBe(session.patchCount)
    expect(plan.entries.some((e) => e.kind === 'file' && e.role === 'patch')).toBe(true)
    expect(plan.entries.some((e) => e.kind === 'file' && e.role === 'photo')).toBe(false)

    const chunks: Uint8Array[] = []
    const writable = new WritableStream<Uint8Array>({ write: (chunk) => void chunks.push(chunk) })
    const result = await writePackageZip({
      plan,
      readFile: async (rel) => {
        try {
          const bytes = await readFile(path.join(root, rel))
          return new File([bytes], path.basename(rel))
        } catch {
          return null
        }
      },
      writable,
    })

    const outDir = await mkdtemp(path.join(tmpdir(), 'zip-export-'))
    const zipPath = path.join(outDir, 'export.zip')
    await writeFile(zipPath, Buffer.concat(chunks.map((c) => Buffer.from(c))))
    // Python's zipfile checks the archive independently of the library that wrote it.
    execFileSync('python3', ['-c', 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])', zipPath, path.join(outDir, 'pkg')])

    const unzipped = (await loadFrom(path.join(outDir, 'pkg')))!
    expect(unzipped.patches.map((p) => p.patch_id).sort()).toEqual(
      loaded.patches.filter((p) => p.camera_day_id === session.id).map((p) => p.patch_id).sort(),
    )
    expect(unzipped.cameraDays.map((d) => d.camera_day_id)).toEqual([session.id])
    // Identification history and determinations carried for those patches.
    const ids = new Set(unzipped.patches.map((p) => p.patch_id))
    const originalRows = loaded.classificationFiles.flatMap((f) => f.rows).filter((r) => ids.has(r.patch_id))
    expect(unzipped.classificationFiles.flatMap((f) => f.rows)).toEqual(originalRows)
    expect(unzipped.resolvedClassifications.map((r) => r.patch_id).sort()).toEqual(
      loaded.resolvedClassifications.filter((r) => ids.has(r.patch_id)).map((r) => r.patch_id).sort(),
    )

    const report = JSON.parse(await readFile(path.join(outDir, 'pkg', 'export-report.json'), 'utf8'))
    expect(report.patchCount).toBe(session.patchCount)
    expect(report.missingFiles).toEqual(result.missing)
  })

  it('adds background-removed patches as optional files', async () => {
    const loaded = (await loadFrom(root))!
    const plan = planPackageZip({ loaded, manifestText: '{}', includeNobgPatches: true })
    const nobg = plan.entries.filter((e) => e.kind === 'file' && e.role === 'nobg')
    expect(nobg.length).toBeGreaterThan(0)
    expect(nobg.every((e) => e.kind === 'file' && e.optional && e.path.endsWith('_nobg.png'))).toBe(true)

    const chunks: Uint8Array[] = []
    const result = await writePackageZip({
      plan,
      readFile: async () => null,
      writable: new WritableStream<Uint8Array>({ write: (c) => void chunks.push(c) }),
    })
    // Absent silhouettes aren't problems; absent patches are.
    expect(result.missing.some((p) => p.endsWith('_nobg.png'))).toBe(false)
    expect(result.missing.length).toBeGreaterThan(0)
  })

  it('carries the project’s own device types and power setups', async () => {
    const loaded = (await loadFrom(root))!
    const withDevices = {
      ...loaded,
      deviceTypes: [newCustomDeviceType({ name: 'Field kit', existingIds: [] })],
      powerSources: [newCustomPowerSource({ name: 'Field battery', powerSourceType: 'battery', existingIds: [] })],
    }
    const plan = planPackageZip({ loaded: withDevices, manifestText: '{}' })
    const text = (p: string) => plan.entries.find((e) => e.kind === 'text' && e.path === p)
    expect(parseDeviceTypes((text(PACKAGE_DEVICE_TYPES_RECORD) as { text: string }).text)).toEqual(withDevices.deviceTypes)
    expect(parsePowerSources((text(PACKAGE_POWER_SOURCES_RECORD) as { text: string }).text)).toEqual(withDevices.powerSources)
    // None of its own: no empty files.
    const bare = planPackageZip({ loaded: { ...loaded, deviceTypes: [], powerSources: [] }, manifestText: '{}' })
    expect(bare.entries.some((e) => e.path === PACKAGE_DEVICE_TYPES_RECORD || e.path === PACKAGE_POWER_SOURCES_RECORD)).toBe(false)
  })

  it('exports every session when none are chosen', async () => {
    const loaded = (await loadFrom(root))!
    const plan = planPackageZip({ loaded, manifestText: '{}' })
    expect(plan.patchCount).toBe(loaded.patches.length)
    expect(plan.sessionCount).toBe(loaded.cameraDays.length)
  })
})
