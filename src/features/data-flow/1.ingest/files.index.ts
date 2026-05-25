import { filesByLeafGroupIdStore, patchFileMapByNightStore, type IndexedFile } from './files.state'
import { parsePathParts } from './ingest-paths'

type ParsedParts = {
  leafGroupId?: string
  isPatch?: boolean
  fileName?: string
}

export function buildNightIndexes(params: { files: IndexedFile[] }) {
  const { files } = params

  if (!Array.isArray(files) || files.length === 0) {
    filesByLeafGroupIdStore.set({})
    patchFileMapByNightStore.set({})
    return
  }

  const byLeafGroup: Record<string, IndexedFile[]> = {}
  const patchMapByNight: Record<string, Record<string, IndexedFile>> = {}

  for (const f of files) {
    const parts = fastParsePathParts(f.path)
    const leafGroupId = parts?.leafGroupId
    if (!leafGroupId) continue

    if (!byLeafGroup[leafGroupId]) byLeafGroup[leafGroupId] = []
    byLeafGroup[leafGroupId].push(f)

    if (parts?.isPatch && parts?.fileName) {
      const patchId = parts.fileName
      const bucket = patchMapByNight[leafGroupId] || (patchMapByNight[leafGroupId] = {})
      bucket[patchId.toLowerCase()] = f
    }
  }
  filesByLeafGroupIdStore.set(byLeafGroup)
  patchFileMapByNightStore.set(patchMapByNight)
}

function fastParsePathParts(path: string): ParsedParts | null {
  const parsed = parsePathParts({ path })
  if (!parsed) return null

  const leafGroupId = `${parsed.project}/${parsed.deployment}/${parsed.night}`
  return {
    leafGroupId,
    isPatch: parsed.isPatch,
    fileName: parsed.fileName,
  }
}
