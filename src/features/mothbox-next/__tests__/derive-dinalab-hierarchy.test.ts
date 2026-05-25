import { describe, expect, it } from 'vitest'
import {
  buildDeploymentAndCameraDayRecords,
  parseDinalabDeploymentFolderName,
  resolveDeploymentContext,
} from '../adapters/dinalab-mothbox-v1/derive-dinalab-hierarchy'

describe('derive-dinalab-hierarchy', () => {
  it('parses Dinacon deployment folder names', () => {
    const parsed = parseDinalabDeploymentFolderName('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')

    expect(parsed.deploymentId).toBe('Dinacon2025_Les_BeachPalm_hopeCobo_2025-06-20')
    expect(parsed.datasetName).toBe('Dinacon2025')
    expect(parsed.siteName).toBe('Les_BeachPalm')
    expect(parsed.deviceId).toBe('hopeCobo')
    expect(parsed.deploymentDate).toBe('2025-06-20')
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
