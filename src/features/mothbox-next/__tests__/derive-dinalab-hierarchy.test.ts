import { describe, expect, it } from 'vitest'
import {
  buildDeploymentAndCameraDayRecords,
  enrichPatchesFromPatchSources,
  inferLegacySourceRootFromIndexedPaths,
  inferLegacySourceRootNameFromPatchSources,
  parseDinalabDeploymentFolderName,
  resolveDeploymentContext,
  resolveDeploymentContextFromPatchPath,
  resolveLegacySourceRootForPackage,
} from '../adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'

describe('derive-dinalab-hierarchy', () => {
  it('does not treat a date-only folder as both site and deployment name', () => {
    const parsed = parseDinalabDeploymentFolderName('2025-01-26')

    expect(parsed.deploymentId).toBe('2025-01-26')
    expect(parsed.deploymentDate).toBe('2025-01-26')
    expect(parsed.siteName).toBeUndefined()
  })

  it('parses Dinacon deployment folder names', () => {
    const parsed = parseDinalabDeploymentFolderName('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')

    expect(parsed.deploymentId).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')
    expect(parsed.datasetName).toBe('Dinacon2025')
    expect(parsed.siteName).toBe('Les_BeachPalm')
    expect(parsed.deviceId).toBe('hopeCobo')
    expect(parsed.deploymentDate).toBe('2025-06-20')
  })

  it('parses Dinacon device names such as grupoKite at the deployment level', () => {
    const parsed = parseDinalabDeploymentFolderName('Dinacon2025_Les_BeachPalm_grupoKite_2025-06-23')

    expect(parsed.datasetName).toBe('Dinacon2025')
    expect(parsed.siteName).toBe('Les_BeachPalm')
    expect(parsed.deviceId).toBe('grupoKite')
    expect(parsed.deploymentDate).toBe('2025-06-23')
  })

  it('parses Hoya deployment folder names with site and device segments', () => {
    const parsed = parseDinalabDeploymentFolderName('Hoya_168m_doubleParina_2025-01-26')

    expect(parsed.deploymentId).toBe('Hoya_168m_doubleParina_2025-01-26')
    expect(parsed.datasetName).toBe('Hoya')
    expect(parsed.siteName).toBe('168m')
    expect(parsed.deviceId).toBe('doubleParina')
    expect(parsed.deploymentDate).toBe('2025-01-26')
  })

  it('uses legacy source root when night folders sit under a wrapped deployment directory', () => {
    const ctx = resolveDeploymentContext({
      botRelativePath: '2025-01-26/fondo_botdetection.json',
      datasetId: 'Hoya',
      legacySourceRootName: 'Hoya_168m_doubleParina_2025-01-26',
    })

    expect(ctx.deploymentId).toBe('Hoya_168m_doubleParina_2025-01-26')
    expect(ctx.nightDate).toBe('2025-01-26')
    expect(ctx.cameraDayId).toBe('Hoya_168m_doubleParina_2025-01-26__2025-01-26')
    expect(ctx.siteId).toBe('Hoya/site/168m')
  })

  it('resolves hierarchy from patch image paths under night/patches', () => {
    const ctx = resolveDeploymentContextFromPatchPath({
      patchRelativePath: '2025-01-26/patches/foo_0_Mothbot_yolo.pt.jpg',
      datasetId: 'Only-Images',
      legacySourceRootName: 'Hoya_168m_doubleParina_2025-01-26',
    })

    expect(ctx.deploymentId).toBe('Hoya_168m_doubleParina_2025-01-26')
    expect(ctx.nightDate).toBe('2025-01-26')
    expect(ctx.cameraDayId).toBe('Hoya_168m_doubleParina_2025-01-26__2025-01-26')
  })

  it('uses legacy source folder name when bot json is at the picked root', () => {
    const ctx = resolveDeploymentContext({
      botRelativePath: 'fondoGorila_botdetection.json',
      datasetId: 'Dinacon2025',
      legacySourceRootName: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
    })

    expect(ctx.deploymentId).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')
    expect(ctx.siteId).toBe('Dinacon2025/site/Les_BeachPalm')
  })

  it('infers deployment root from patch sources when paths use 00_source prefix', () => {
    const root = inferLegacySourceRootNameFromPatchSources([
      {
        original_bot_detection_path:
          '00_source/Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20/2025-06-21/foo_botdetection.json',
      },
    ])

    expect(root).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')
  })

  it('infers legacy deployment root from indexed source tree paths', () => {
    const root = inferLegacySourceRootFromIndexedPaths([
      'Hoya_168m_doubleParina_2025-01-26/2025-01-26/night_a_botdetection.json',
      'Hoya_168m_doubleParina_2025-01-26/2025-01-27/night_b_botdetection.json',
    ])

    expect(root).toBe('Hoya_168m_doubleParina_2025-01-26')
    expect(
      resolveLegacySourceRootForPackage({
        indexedPaths: ['Hoya_168m_doubleParina_2025-01-26/2025-01-26/foo.json'],
      }),
    ).toBe('Hoya_168m_doubleParina_2025-01-26')
  })

  it('rebuilds hierarchy from patch source paths after a wrapped deployment import', () => {
    const patches = enrichPatchesFromPatchSources({
      datasetId: 'Hoya',
      legacySourceRootName: 'Hoya_168m_doubleParina_2025-01-26',
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
          original_bot_detection_path: '2025-01-26/night_a_botdetection.json',
        },
        {
          patch_id: 'patch-b.pt',
          original_bot_detection_path: '2025-01-27/night_b_botdetection.json',
        },
      ],
    })

    const { deployments, cameraDays } = buildDeploymentAndCameraDayRecords({
      datasetId: 'Hoya',
      patches,
    })

    expect(deployments).toHaveLength(1)
    expect(deployments[0]?.deployment_id).toBe('Hoya_168m_doubleParina_2025-01-26')
    expect(cameraDays.map((day) => day.night_date).sort()).toEqual(['2025-01-26', '2025-01-27'])
  })

  it('builds deployment and camera day records from patches', () => {
    const { deployments, cameraDays } = buildDeploymentAndCameraDayRecords({
      datasetId: 'Dinacon2025',
      patches: [
        {
          patch_id: 'hopeCobo_2025_06_22__04_58_06_HDR0_0_Mothbot.pt',
          dataset_id: 'Dinacon2025',
          asset_path: '01_patches/a.jpg',
          deployment_id: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20',
          camera_day_id: 'Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20__2025-06-22',
        },
      ],
    })

    expect(deployments[0]?.deployment_id).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')
    expect(deployments[0]?.site_id).toBe('Dinacon2025/site/Les_BeachPalm')
    expect(cameraDays[0]?.night_date).toBe('2025-06-22')
  })
})
