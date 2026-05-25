import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { Night } from './routes/5.night'
import { TestIdentification } from './routes/test-identification'
import { RootLayout } from '~/root-layout'
import { Home } from '~/routes/0.home'
import { activeDatasetFolderNameStore } from '~/stores/datasets-registry'
import { leafGroupsStore } from '~/stores/entities/leaf-groups'
import { activeHierarchyStore } from '~/features/mothbox-next/active-hierarchy'
import { isSingleLeafHierarchy } from '~/features/mothbox-next/hierarchy-routes'
import { resolveLeafGroupEntityIdFromRoute } from '~/features/data-flow/1.ingest/ingest-paths'

export const rootRoute = createRootRoute({
  component: RootLayout,
})

export const indexRoute = createRoute({
  getParentRoute,
  path: '/',
  component: Home,
})

export const datasetSingleLeafRoute = createRoute({
  getParentRoute,
  path: '/datasets/$folderName',
  component: Night,
})

export const leafGroupRoute = createRoute({
  getParentRoute,
  path: '/datasets/$folderName/groups/$leafGroupId',
  beforeLoad: ({ params }) => {
    const resolved = activeHierarchyStore.get()
    if (!resolved || !isSingleLeafHierarchy(resolved)) return
    if (resolved.leafGroupIds[0] !== params.leafGroupId) return

    throw redirect({
      to: '/datasets/$folderName',
      params: { folderName: params.folderName },
    })
  },
  component: Night,
})

export const nightRoute = createRoute({
  getParentRoute,
  path: '/projects/$projectId/deployments/$deploymentId/nights/$nightId',
  beforeLoad: ({ params }) => {
    const folderName = activeDatasetFolderNameStore.get()
    if (!folderName) return

    const nights = leafGroupsStore.get() || {}
    const leafGroupId = resolveLeafGroupEntityIdFromRoute({
      nights,
      projectId: params.projectId,
      deploymentId: params.deploymentId,
      leafGroupId: params.nightId,
    })

    const resolved = activeHierarchyStore.get()
    if (isSingleLeafHierarchy(resolved)) {
      throw redirect({
        to: '/datasets/$folderName',
        params: { folderName },
      })
    }

    throw redirect({
      to: '/datasets/$folderName/groups/$leafGroupId',
      params: { folderName, leafGroupId },
    })
  },
  component: Night,
})

export const testIdentificationRoute = createRoute({
  getParentRoute,
  path: '/test-identification',
  component: TestIdentification,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  datasetSingleLeafRoute,
  leafGroupRoute,
  nightRoute,
  testIdentificationRoute,
])

export const router = createRouter({
  routeTree,
  basepath: '/',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function getParentRoute() {
  const parent = rootRoute
  return parent
}
