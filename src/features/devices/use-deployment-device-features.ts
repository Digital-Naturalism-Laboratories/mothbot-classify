import { useStore } from '@nanostores/react'
import { useMemo } from 'react'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { deviceFeaturesByDeployment } from './device-filter'

/** The open package's deployments' device features, by deployment id (empty for non-package datasets). */
export function useDeploymentDeviceFeatures() {
  const active = useStore(mothboxNextPackageStore)
  const deployments = active?.loaded?.deployments
  const customTypes = active?.loaded?.deviceTypes
  return useMemo(() => deviceFeaturesByDeployment(deployments ?? [], customTypes ?? []), [deployments, customTypes])
}
