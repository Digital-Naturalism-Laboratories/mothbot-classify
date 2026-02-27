import { filesByNightIdStore, patchFileMapByNightStore, type IndexedFile } from './files.state'
import { parsePathParts } from './ingest-paths'

type ParsedParts = {
  nightId?: string
  isPatch?: boolean
  fileName?: string
}

export function buildNightIndexes(params: { files: IndexedFile[] }) {
  const { files } = params

  if (!Array.isArray(files) || files.length === 0) {
    filesByNightIdStore.set({})
    patchFileMapByNightStore.set({})
    return
  }

  const byNight: Record<string, IndexedFile[]> = {}
  const patchMapByNight: Record<string, Record<string, IndexedFile>> = {}

  for (const f of files) {
    const parts = fastParsePathParts(f.path)
    const nightId = parts?.nightId
    if (!nightId) continue

    if (!byNight[nightId]) byNight[nightId] = []
    byNight[nightId].push(f)

    if (parts?.isPatch && parts?.fileName) {
      const patchId = parts.fileName
      const bucket = patchMapByNight[nightId] || (patchMapByNight[nightId] = {})
      bucket[patchId.toLowerCase()] = f
    }
  }
  filesByNightIdStore.set(byNight)
  patchFileMapByNightStore.set(patchMapByNight)
}

function fastParsePathParts(path: string): ParsedParts | null {
  const parsed = parsePathParts({ path })
  if (!parsed) return null

  const nightId = `${parsed.project}/${parsed.deployment}/${parsed.night}`
  return {
    nightId,
    isPatch: parsed.isPatch,
    fileName: parsed.fileName,
  }
}
