import { projectsStore } from '~/stores/entities/1.projects'
import { sitesStore } from '~/stores/entities/2.sites'
import { deploymentsStore } from '~/stores/entities/3.deployments'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { photosStore } from '~/stores/entities/photos'
import { patchesStore } from '~/stores/entities/5.patches'
import { detectionsStore } from '~/stores/entities/detections'
import { leafGroupSummariesStore } from '~/stores/entities/night-summaries'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { morphoLinksStore } from '~/features/data-flow/3.persist/links'
import { indexedFilesStore } from '~/features/data-flow/1.ingest/files.state'
import { normalizeIndexedPathsToPackageRoot } from '~/features/mothbox-next/package-indexed-access'
import {
  buildPackageSessionCacheEntry,
  persistPackageSessionCacheEntry,
} from './package-session-cache'

export async function savePackageSessionCacheFromStores(params: { folderName: string }): Promise<void> {
  const entry = await buildPackageSessionCacheEntry({
    folderName: params.folderName,
    indexed: indexedFilesStore.get() || [],
    activePackage: mothboxNextPackageStore.get(),
    projects: projectsStore.get() || {},
    sites: sitesStore.get() || {},
    deployments: deploymentsStore.get() || {},
    leafGroups: leafGroupsStore.get() || {},
    photos: photosStore.get() || {},
    patches: patchesStore.get() || {},
    detections: detectionsStore.get() || {},
    leafGroupSummaries: leafGroupSummariesStore.get() || {},
    morphoLinks: morphoLinksStore.get() || {},
  })

  if (!entry) return

  await persistPackageSessionCacheEntry(entry)
}
