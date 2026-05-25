import { describe, expect, it } from 'vitest'
import {
  deploymentRecordDisplayName,
  isSyntheticDefaultSite,
  shouldSkipSiteLevelInProjectsTree,
  siteDisplayNameForDeployment,
} from '../hierarchy-display-labels'
import { hydratePackageEntities } from '../hydration-bridge'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadMothboxNextPackageData } from '../load-package-data'
import { createNodePackageDataAccess, fixturePackageRoot, walkFixtureFiles } from './node-fixture-access'

describe('hierarchy-display-labels', () => {
  it('formats Dinacon deployment rows without repeating the site name', () => {
    const name = deploymentRecordDisplayName({
      deployment_id: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
      site_name_from_folder: 'Les_BeachPalm',
      device_id_from_folder: 'hopeCobo',
      deployment_start_from_folder: '2025-06-20',
    })

    expect(name).toBe('hopeCobo · 2025-06-20')
  })

  it('formats Hoya deployment rows as device and deployment date', () => {
    const name = deploymentRecordDisplayName({
      deployment_id: 'Hoya_168m_doubleParina_2025-01-26',
    })

    expect(name).toBe('doubleParina · 2025-01-26')
  })

  it('uses site name from deployment metadata instead of the site id tail', () => {
    const label = siteDisplayNameForDeployment({
      siteId: 'Dinacon2025/site/Les_BeachPalm',
      deployment: {
        deployment_id: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
        site_name_from_folder: 'Les_BeachPalm',
      },
    })

    expect(label).toBe('Les BeachPalm')
  })

  it('skips the site row for a single synthetic default site', () => {
    expect(
      shouldSkipSiteLevelInProjectsTree([
        { id: 'dinacon2025/site/_default', name: 'dinacon2025' },
      ]),
    ).toBe(true)
    expect(isSyntheticDefaultSite({ id: 'dinacon2025/site/_default', name: 'dinacon2025' })).toBe(true)
    expect(
      shouldSkipSiteLevelInProjectsTree([
        { id: 'dinacon2025/site/Les_BeachPalm', name: 'Les BeachPalm' },
      ]),
    ).toBe(false)
  })
})

describe('hydratePackageEntities hierarchy names', () => {
  it('assigns distinct site, deployment, and night labels from the Dinacon fixture', async () => {
    const packageRoot = fixturePackageRoot('04_dinacon_lightweight_substrate')
    const loaded = await loadMothboxNextPackageData({
      packageRoot,
      readManifestText: () => readFile(path.join(packageRoot, 'dataset.json'), 'utf8'),
      access: createNodePackageDataAccess(packageRoot),
    })
    expect(loaded).not.toBeNull()

    const indexedByAssetPath: Record<string, { path: string; name: string; size: number }> = {}
    const walked = await walkFixtureFiles(packageRoot)
    for (const f of walked) {
      if (f.path.startsWith('01_patches/')) indexedByAssetPath[f.path] = f as any
    }

    const hydrated = hydratePackageEntities({
      datasetId: loaded!.manifest.dataset_id,
      manifest: loaded!.manifest,
      patches: loaded!.patches,
      patchSources: loaded!.patchSources,
      deployments: loaded!.deployments,
      cameraDays: loaded!.cameraDays,
      resolvedClassifications: loaded!.resolvedClassifications,
      indexedByAssetPath: indexedByAssetPath as any,
    })

    const sites = Object.values(hydrated.sites)
    const deployments = Object.values(hydrated.deployments)
    const nights = Object.values(hydrated.nights)

    expect(sites).toHaveLength(1)
    expect(sites[0]?.name).toBe('Les BeachPalm')
    expect(deployments.map((d) => d.name).sort()).toEqual(['grupoKite · 2025-06-23', 'hopeCobo · 2025-06-20'])
    expect(new Set(nights.map((n) => n.name))).toEqual(new Set(['2025-06-21', '2025-06-22']))
    expect(sites[0]?.name).not.toEqual(deployments[0]?.name)
    expect(deployments[0]?.name).not.toEqual(nights[0]?.name)
  })

  it('rebuilds Hoya hierarchy from patch sources when package deployments are date-only', () => {
    const hydrated = hydratePackageEntities({
      datasetId: 'Hoya',
      manifest: {
        format: 'mothbox-next-dataset',
        version: 3,
        dataset_id: 'Hoya',
        folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
        records: {
          patches: '02_records/patches.ndjson',
          deployments: '02_records/deployments.ndjson',
          camera_days: '02_records/camera-days.ndjson',
          patch_sources: '02_records/patch-sources.ndjson',
        },
      },
      patches: [
        {
          patch_id: 'patch-a.pt',
          dataset_id: 'Hoya',
          asset_path: '01_patches/a.jpg',
          deployment_id: '2025-01-26',
          camera_day_id: '2025-01-26__2025-01-27',
        },
        {
          patch_id: 'patch-b.pt',
          dataset_id: 'Hoya',
          asset_path: '01_patches/b.jpg',
          deployment_id: '2025-01-27',
          camera_day_id: '2025-01-27__2025-01-28',
        },
      ],
      patchSources: [
        {
          patch_id: 'patch-a.pt',
          original_bot_detection_path:
            'Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_a_botdetection.json',
        },
        {
          patch_id: 'patch-b.pt',
          original_bot_detection_path:
            'Hoya_168m_doubleParina_2025-01-26/2025-01-27/night_b_botdetection.json',
        },
      ],
      deployments: [
        { deployment_id: '2025-01-26' },
        { deployment_id: '2025-01-27' },
      ],
      cameraDays: [
        { camera_day_id: '2025-01-26__2025-01-27', deployment_id: '2025-01-26', night_date: '2025-01-27' },
        { camera_day_id: '2025-01-27__2025-01-28', deployment_id: '2025-01-27', night_date: '2025-01-28' },
      ],
      resolvedClassifications: [],
      indexedByAssetPath: {},
      legacySourceRootName: 'Hoya_168m_doubleParina_2025-01-26',
    })

    const sites = Object.values(hydrated.sites)
    const deployments = Object.values(hydrated.deployments)
    const nights = Object.values(hydrated.nights)

    expect(sites).toHaveLength(1)
    expect(sites[0]?.name).toBe('168m')
    expect(deployments).toHaveLength(1)
    expect(deployments[0]?.name).toBe('doubleParina · 2025-01-26')
    expect(deployments[0]?.id).toBe('Hoya_168m_doubleParina_2025-01-26')
    expect(nights.map((night) => night.name).sort()).toEqual(['2025-01-26', '2025-01-27'])
  })
})
