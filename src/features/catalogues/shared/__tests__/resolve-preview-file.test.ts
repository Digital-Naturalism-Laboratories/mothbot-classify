import { describe, expect, it } from 'vitest'
import { resolvePreviewFileFromPairs } from '../resolve-preview-file'

describe('resolvePreviewFileFromPairs', () => {
  it('hydrates preview images from patchesStore when only a handle is available', async () => {
    const previewFile = new File(['patch'], 'metallicus.jpg', { type: 'image/jpeg' })
    const handle = {
      getFile: async () => previewFile,
    }

    const result = await resolvePreviewFileFromPairs({
      previewPairs: [{ leafGroupId: 'dataset/camera-day-1', patchId: 'metallicus.jpg' }],
      patches: {
        'metallicus.jpg': {
          id: 'metallicus.jpg',
          name: 'metallicus.jpg',
          leafGroupId: 'dataset/camera-day-1',
          photoId: 'photo.jpg',
          imageFile: { path: '01_patches/metallicus.jpg', name: 'metallicus.jpg', size: 1, handle },
        },
      },
      patchMapByNight: {},
    })

    expect(result).toBe(previewFile)
  })

  it('falls back to legacy night patch indexes when patchesStore has no image', async () => {
    const previewFile = new File(['patch'], 'legacy.jpg', { type: 'image/jpeg' })

    const result = await resolvePreviewFileFromPairs({
      previewPairs: [{ leafGroupId: 'Project/Deployment/Night', patchId: 'legacy.jpg' }],
      patches: {},
      patchMapByNight: {
        'Project/Deployment/Night': {
          'legacy.jpg': { path: 'Project/Deployment/Night/patches/legacy.jpg', name: 'legacy.jpg', size: 1, file: previewFile },
        },
      },
    })

    expect(result).toBe(previewFile)
  })
})
