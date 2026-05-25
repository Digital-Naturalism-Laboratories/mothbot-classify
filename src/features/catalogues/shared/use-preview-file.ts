import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { patchesStore } from '~/stores/entities/5.patches'
import { patchFileMapByNightStore } from '~/features/data-flow/1.ingest/files.state'
import { resolvePreviewFileFromPairs } from './resolve-preview-file'

export function usePreviewFile(params: { previewPairs: Array<{ leafGroupId: string; patchId: string }> }) {
  const { previewPairs } = params
  const patches = useStore(patchesStore)
  const patchMapByNight = useStore(patchFileMapByNightStore)

  const [previewFile, setPreviewFile] = useState<File | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    async function pickPreviewFile() {
      const file = await resolvePreviewFileFromPairs({ previewPairs, patches, patchMapByNight })
      if (!cancelled) setPreviewFile(file)
    }

    void pickPreviewFile()
    return () => {
      cancelled = true
    }
  }, [previewPairs, patches, patchMapByNight])

  return previewFile
}
