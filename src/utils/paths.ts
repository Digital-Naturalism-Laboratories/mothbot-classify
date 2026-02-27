import type { PhotoEntity } from '~/stores/entities/photos'

/**
 * Extracts the base name from a photo ID by removing the .jpg extension.
 * Returns the photoId unchanged if it doesn't end with .jpg.
 */
export function getPhotoBaseFromPhotoId(photoId: string): string {
  const id = photoId || ''
  if (!id.toLowerCase().endsWith('.jpg')) return id
  const base = id.slice(0, -'.jpg'.length)
  return base
}

/**
 * Extracts the night disk path from a photo entity.
 * Returns the directory path (without filename) from the photo's imageFile or botDetectionFile path.
 */
export function getNightDiskPathFromPhoto(photo: PhotoEntity): string {
  const path = (photo as any)?.imageFile?.path || (photo as any)?.botDetectionFile?.path
  if (!path) return ''
  const norm = String(path).replaceAll('\\', '/').replace(/^\/+/, '')
  const segments = norm.split('/').filter(Boolean)
  if (segments.length < 2) return ''
  const withoutFile = segments.slice(0, -1)
  const joined = withoutFile.join('/')
  return joined
}

/**
 * Extracts the night disk path from an array of photos.
 * Returns the first valid path found, or empty string if none found.
 */
export function getNightDiskPathFromPhotos(params: { photos: PhotoEntity[] }): string {
  const { photos } = params
  for (const p of photos) {
    const path = getNightDiskPathFromPhoto(p)
    if (path) return path
  }
  return ''
}

/**
 * Extracts the project ID from a night ID.
 * Night IDs follow the pattern: project/deployment/night
 * Returns the first segment (project name) or undefined if invalid.
 */
export function getProjectIdFromNightId(nightId?: string | null): string | undefined {
  const id = (nightId ?? '').trim()
  if (!id) return undefined

  const parts = id.split('/').filter(Boolean)
  if (!parts.length) return undefined

  return parts[0]
}

