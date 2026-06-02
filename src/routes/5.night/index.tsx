import { useStore } from '@nanostores/react'
import { useParams, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { leafGroupIngestProgressStore } from '~/stores/ui'
import { CenteredLoader } from '~/components/atomic/CenteredLoader'
import { useAppLoading } from '~/features/data-flow/1.ingest/files-queries'
import { NightView } from './night-view'
import { useLeafGroupIngest } from './use-night-ingest'
import { resolveLeafGroupIdFromRoute } from '~/features/mothbox-next/hierarchy-routes'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'

export function Night() {
  const { pathname } = useRouterState({ select: (s) => s.location })
  const leafParams = useParams({ strict: false }) as {
    leafGroupId?: string
    projectId?: string
    deploymentId?: string
  }
  const nights = useStore(leafGroupsStore)
  const resolvedHierarchy = useStore(activeHierarchyStore)
  const { isBlockingLoading } = useAppLoading()

  const ingestProgress = useStore(leafGroupIngestProgressStore)
  const [isLeafGroupIngesting, setIsNightIngesting] = useState(false)

  const leafGroupId =
    leafParams.leafGroupId ??
    resolveLeafGroupIdFromRoute({
      pathname,
      nights,
      leafGroupIds: resolvedHierarchy?.leafGroupIds,
    }) ??
    ''

  const night = nights[leafGroupId]

  const ingestState = useLeafGroupIngest({ leafGroupId })
  useEffect(() => {
    setIsNightIngesting(ingestState.isLeafGroupIngesting)
  }, [ingestState.isLeafGroupIngesting])

  const isNightLoading = isBlockingLoading || isLeafGroupIngesting

  if (isNightLoading) {
    const processed = ingestProgress?.processed ?? 0
    const total = ingestProgress?.total ?? 0
    return (
      <CenteredLoader>
        🌀 Processing patches {processed}/{total}
      </CenteredLoader>
    )
  }

  if (!night) return <p className='text-sm text-neutral-500'>Night not found</p>

  return <NightView leafGroupId={leafGroupId} />
}
