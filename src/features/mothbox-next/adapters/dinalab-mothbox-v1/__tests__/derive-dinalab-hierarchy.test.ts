import { describe, it, expect } from 'vitest'
import { resolveDeploymentContext, enrichPatchesFromPatchSources } from '../derive-dinalab-hierarchy'
import type { PatchRecord, PatchSourceRecord } from '../../../records'

describe('resolveDeploymentContext', () => {
  it('groups a prefixed night folder under the same deployment as a plain-date night folder', () => {
    const legacySourceRootName = 'photos_backup_cutTambor'
    const datasetId = 'MarburgBioBlitz_offpathtree_CutTambor_2026-06-01'

    const night1 = resolveDeploymentContext({
      botRelativePath: '2026-06-01/x_botdetection.json',
      datasetId,
      legacySourceRootName,
    })

    const night2 = resolveDeploymentContext({
      botRelativePath: 'cutTambor_2026-06-02/y_botdetection.json',
      datasetId,
      legacySourceRootName,
    })

    expect(night1.deploymentId).toBe('photos_backup_cutTambor')
    expect(night2.deploymentId).toBe('photos_backup_cutTambor')
    expect(night1.nightDate).toBe('2026-06-01')
    expect(night2.nightDate).toBe('2026-06-02')
    expect(night1.cameraDayId).not.toBe(night2.cameraDayId)
  })

  it('still resolves plain ISO-date night folders correctly', () => {
    const result = resolveDeploymentContext({
      botRelativePath: '2026-06-01/x_botdetection.json',
      datasetId: 'dataset',
      legacySourceRootName: 'MyDeployment',
    })

    expect(result.deploymentId).toBe('MyDeployment')
    expect(result.nightDate).toBe('2026-06-01')
  })
})

describe('enrichPatchesFromPatchSources', () => {
  it('does not split a prefixed night folder into its own deployment', () => {
    const datasetId = 'MarburgBioBlitz_offpathtree_CutTambor_2026-06-01'

    const patches: PatchRecord[] = [
      {
        patch_id: 'p1',
        deployment_id: 'placeholder',
        camera_day_id: 'placeholder',
      } as PatchRecord,
      {
        patch_id: 'p2',
        deployment_id: 'placeholder',
        camera_day_id: 'placeholder',
      } as PatchRecord,
    ]

    const patchSources: PatchSourceRecord[] = [
      {
        patch_id: 'p1',
        original_bot_detection_path: 'photos_backup_cutTambor/2026-06-01/x_botdetection.json',
      } as PatchSourceRecord,
      {
        patch_id: 'p2',
        original_bot_detection_path: 'photos_backup_cutTambor/cutTambor_2026-06-02/y_botdetection.json',
      } as PatchSourceRecord,
    ]

    const enriched = enrichPatchesFromPatchSources({ patches, patchSources, datasetId })

    const byId = Object.fromEntries(enriched.map((p) => [p.patch_id, p]))
    expect(byId.p1.deployment_id).toBe(byId.p2.deployment_id)
    expect(byId.p1.camera_day_id).not.toBe(byId.p2.camera_day_id)
  })
})
