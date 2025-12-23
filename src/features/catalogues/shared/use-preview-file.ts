import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { patchesStore } from '~/stores/entities/5.patches'
import { patchFileMapByNightStore, type IndexedFile } from '~/features/data-flow/1.ingest/files.state'
import { ensureFileFromIndexed } from './catalog-utils'

export function usePreviewFile(params: { previewPairs: Array<{ nightId: string; patchId: string }> }) {
  const { previewPairs } = params
  const patches = useStore(patchesStore)
  const patchMapByNight = useStore(patchFileMapByNightStore)

  const [previewFile, setPreviewFile] = useState<File | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    async function pickPreviewFile() {
      for (const pair of previewPairs) {
        const f = (patches?.[pair.patchId] as any)?.imageFile?.file as File | undefined
        if (f) {
          if (!cancelled) setPreviewFile(f)
          return
        }
      }
      for (const pair of previewPairs) {
        const mapForNight = patchMapByNight?.[pair.nightId]
        const indexed: IndexedFile | undefined = mapForNight?.[pair.patchId.toLowerCase()]
        if (!indexed) continue
        const file = await ensureFileFromIndexed(indexed)
        if (file) {
          if (!cancelled) setPreviewFile(file)
          return
        }
      }
      if (!cancelled) setPreviewFile(undefined)
    }
    void pickPreviewFile()
    return () => {
      cancelled = true
    }
  }, [previewPairs, patches, patchMapByNight])

  return previewFile
}

