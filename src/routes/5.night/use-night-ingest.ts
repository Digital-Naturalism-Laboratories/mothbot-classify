import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { filesByLeafGroupIdStore, patchFileMapByNightStore, indexedFilesStore } from '~/features/data-flow/1.ingest/files.state'
import { detectionsStore } from '~/stores/entities/detections'
import { ingestDetectionsForLeafGroup } from '~/features/data-flow/1.ingest/ingest'
import { isMothboxNextIngestMode } from '~/features/data-flow/1.ingest/ingest-mode'
import { resetNightIngestProgress, setNightIngestTotal, getActiveLeafGroupIds } from '~/stores/ui'
import { clearFileObjectsForInactiveLeafGroups } from '~/stores/entities'

const inFlightNightIds = new Set<string>()

export function useLeafGroupIngest(params: { leafGroupId: string }) {
  const { leafGroupId } = params

  const indexedFiles = useStore(indexedFilesStore)
  const filesByNight = useStore(filesByLeafGroupIdStore)
  const patchMapByNight = useStore(patchFileMapByNightStore)

  const [isLeafGroupIngesting, setIsNightIngesting] = useState(false)
  const ingestRunRef = useRef(0)

  useEffect(() => {
    if (isMothboxNextIngestMode()) return

    const hasAnyForNight = Object.values(detectionsStore.get() || {}).some((d: any) => d?.leafGroupId === leafGroupId)
    if (hasAnyForNight) return
    if (!indexedFiles?.length) return
    if (inFlightNightIds.has(leafGroupId)) {
      console.log('⏭️ night: ingest already in-flight', { leafGroupId })
      return
    }
    const perNight = filesByNight?.[leafGroupId] || indexedFiles
    const patchMap = patchMapByNight?.[leafGroupId]
    const runId = ++ingestRunRef.current

    setIsNightIngesting(true)
    console.log('🌀 night: ingesting detections for night', {
      leafGroupId,
      filesCount: perNight?.length || 0,
      patchMapSize: patchMap ? Object.keys(patchMap).length : 0,
    })
    // Initialize progress from prebuilt patch map (trust the store)
    const total = patchMap ? Object.keys(patchMap).length : 0
    resetNightIngestProgress({ leafGroupId })
    setNightIngestTotal({ leafGroupId, total })
    inFlightNightIds.add(leafGroupId)
    void ingestDetectionsForLeafGroup({ files: perNight, leafGroupId, patchMap }).finally(() => {
      if (ingestRunRef.current === runId) setIsNightIngesting(false)
      inFlightNightIds.delete(leafGroupId)
      const activeLeafGroupIds = getActiveLeafGroupIds()
      clearFileObjectsForInactiveLeafGroups({ activeLeafGroupIds })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafGroupId, indexedFiles])

  return { isLeafGroupIngesting }
}
