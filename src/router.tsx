import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { Night } from './routes/5.night'
import { TestIdentification } from './routes/test-identification'
import { RootLayout } from '~/root-layout'
import { Home } from '~/routes/0.home'

export const rootRoute = createRootRoute({
  component: RootLayout,
})

export const indexRoute = createRoute({
  getParentRoute,
  path: '/',
  component: Home,
})

export const nightRoute = createRoute({
  getParentRoute,
  path: '/projects/$projectId/sites/$siteId/deployments/$deploymentId/nights/$nightId',
  component: Night,
})

export const testIdentificationRoute = createRoute({
  getParentRoute,
  path: '/test-identification',
  component: TestIdentification,
})

export const routeTree = rootRoute.addChildren([indexRoute, nightRoute, testIdentificationRoute])

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
