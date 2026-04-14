import type { IndexedFile } from '~/stores/entities/photos'

export type BotDetectionJson = {
  version?: string
  shapes: Array<{
    patch_path: string

    confidence_detection: number
    confidence_ID: number

    identifier_bot: string
    identifier_human: string

    timestamp_detection: string
    timestamp_ID_bot: string
    timestamp_ID_human: string

    detector_bot: string

    species_list: string // DOI string

    kingdom: string
    phylum: string
    class: string
    order: string

    clusterID: number

    // Optionally, keep other fields for backward compatibility or extensibility
    label?: unknown
    score?: unknown
    direction?: unknown
    shape_type?: unknown
    points?: number[][]
    family?: unknown
    genus?: unknown
    species?: unknown
  }>
}

/** `_identified.json` shapes: bot-like row plus optional user / UI fields. */
export type UserIdentifiedShape = BotDetectionJson['shapes'][number] & {
  is_error?: boolean
  morphospecies?: string
}

export type UserDetectionJson = {
  version?: string
  photoBase?: string
  shapes?: UserIdentifiedShape[]
}

export async function parseBotDetectionJsonSafely(params: { file: IndexedFile }): Promise<BotDetectionJson | null> {
  try {
    const text = await ensureTextFromIndexedFile(params.file)
    const json = JSON.parse(text) as BotDetectionJson
    if (!json || !Array.isArray(json.shapes)) return null
    return json
  } catch {
    return null
  }
}

export async function parseUserDetectionJsonSafely(params: { file: IndexedFile }): Promise<UserDetectionJson | null> {
  try {
    const text = await ensureTextFromIndexedFile(params.file)
    const json = JSON.parse(text) as UserDetectionJson
    if (!json) return null
    if (!Array.isArray((json as any).shapes)) return null
    return json
  } catch {
    return null
  }
}

export function extractPatchFilename(params: { patchPath: string }) {
  const { patchPath } = params
  if (!patchPath) return ''
  const normalized = patchPath.replaceAll('\\', '/').trim()
  const segments = normalized.split('/')
  const name = segments[segments.length - 1]
  return name ?? ''
}

async function ensureTextFromIndexedFile(f: IndexedFile): Promise<string> {
  const hasFile = !!(f as any)?.file
  if (hasFile) return await (f as any).file.text()
  const handle = (f as any)?.handle as { getFile?: () => Promise<File> } | undefined
  if (handle && typeof handle.getFile === 'function') {
    const file = await handle.getFile()
    const text = await file.text()
    return text
  }
  throw new Error('No file or handle available for reading')
}
