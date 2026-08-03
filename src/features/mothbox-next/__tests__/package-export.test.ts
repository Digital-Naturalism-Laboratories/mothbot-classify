import { describe, expect, it } from 'vitest'
import { buildPackageExportRows, PACKAGE_EXPORT_CSV_HEADERS } from '../package-export'
import type { PatchEntity } from '~/stores/entities/5.patches'
import type { DetectionEntity } from '~/models/detection.types'

describe('package export (L6)', () => {
  it('builds one row per patch with expected headers shape', () => {
    const patches: Record<string, PatchEntity> = {
      p1: { id: 'p1', name: 'p1', leafGroupId: 'night/a', photoId: 'photo.jpg', imageFile: { path: '01_patches/p1.jpg', name: 'p1.jpg', size: 1 } },
    }
    const detections: Record<string, DetectionEntity> = {
      p1: {
        id: 'p1',
        patchId: 'p1',
        photoId: 'photo.jpg',
        leafGroupId: 'night/a',
        detectedBy: 'user',
        taxon: { kingdom: 'Animalia', class: 'Insecta', order: 'Diptera' },
      },
    }

    const rows = buildPackageExportRows({ patches, detections })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.patch_id).toBe('p1')
    expect(PACKAGE_EXPORT_CSV_HEADERS).toContain('scientific_name')
  })

  it('preserves explicit accept classification type', () => {
    const patches: Record<string, PatchEntity> = {
      p1: { id: 'p1', name: 'p1', leafGroupId: 'night/a', photoId: 'photo.jpg', imageFile: { path: '01_patches/p1.jpg', name: 'p1.jpg', size: 1 } },
    }
    const detections: Record<string, DetectionEntity> = {
      p1: {
        id: 'p1',
        patchId: 'p1',
        photoId: 'photo.jpg',
        leafGroupId: 'night/a',
        detectedBy: 'user',
        classificationType: 'accept',
        taxon: { kingdom: 'Animalia', class: 'Insecta', order: 'Diptera' },
      },
    }

    const rows = buildPackageExportRows({ patches, detections })

    expect(rows[0]?.classification_type).toBe('accept')
  })
})
