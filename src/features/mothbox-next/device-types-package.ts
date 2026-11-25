import { resolveDeviceType, type DeviceType, type DeviceTypePowerSource } from '~/models/device-types'
import { PACKAGE_DEVICE_TYPES_RECORD, serializeDeviceTypes } from './device-types-records'
import { PACKAGE_POWER_SOURCES_RECORD, serializePowerSources } from './power-sources-records'
import { mothboxNextPackageStore } from './active-package'
import { fileKeyStyleForVersion, serializePackageRows } from './file-keys'
import type { DeploymentRecord } from './records'
import { idbGet } from '~/utils/index-db'
import { ensureReadWritePermission, persistenceConstants } from '~/features/data-flow/3.persist/files.persistence'
import { writeTextFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { joinPackagePath } from './package-paths'

async function packageRootHandle(): Promise<FileSystemDirectoryHandleLike> {
  const root = (await idbGet(persistenceConstants.IDB_NAME, persistenceConstants.IDB_STORE, 'projectsRoot')) as
    | FileSystemDirectoryHandleLike
    | null
  if (!root) throw new Error('The project folder is not available — reopen the project.')
  if (!(await ensureReadWritePermission(root))) throw new Error('Write access to the project folder is needed.')
  return root
}

/** Saves the dataset's custom device types (replacing the list) and updates the open package. */
export async function saveCustomDeviceTypes(types: readonly DeviceType[]): Promise<void> {
  const active = mothboxNextPackageStore.get()
  if (!active?.loaded) throw new Error('Open a project first.')
  const root = await packageRootHandle()
  await writeTextFile(root, joinPackagePath(active.packageRoot, PACKAGE_DEVICE_TYPES_RECORD), serializeDeviceTypes(types))
  mothboxNextPackageStore.set({ ...active, loaded: { ...active.loaded, deviceTypes: [...types] } })
}

/** Saves the dataset's own power setups (replacing the list) and updates the open package. */
export async function saveCustomPowerSources(setups: readonly DeviceTypePowerSource[]): Promise<void> {
  const active = mothboxNextPackageStore.get()
  if (!active?.loaded) throw new Error('Open a project first.')
  const root = await packageRootHandle()
  await writeTextFile(root, joinPackagePath(active.packageRoot, PACKAGE_POWER_SOURCES_RECORD), serializePowerSources(setups))
  mothboxNextPackageStore.set({ ...active, loaded: { ...active.loaded, powerSources: [...setups] } })
}

/**
 * Sets which device type each deployment used (`device_type_id`, plus the type's name in
 * `device_type`), rewriting `deployments.ndjson` in the package's own field style.
 */
export async function saveDeploymentDeviceTypes(assignments: Record<string, string | null>): Promise<void> {
  const active = mothboxNextPackageStore.get()
  const loaded = active?.loaded
  if (!active || !loaded) throw new Error('Open a project first.')
  const deployments: DeploymentRecord[] = loaded.deployments.map((d) => {
    if (!(d.deployment_id in assignments)) return d
    const id = assignments[d.deployment_id]
    const type = id ? resolveDeviceType(id, loaded.deviceTypes ?? []) : undefined
    const { device_type: _t, device_type_id: _i, ...rest } = d
    void _t
    void _i
    return type ? { ...rest, device_type_id: type.deviceTypeID, device_type: type.deviceType } : rest
  })
  const root = await packageRootHandle()
  const path = active.manifest.records.deployments ?? '02_records/deployments.ndjson'
  const style = fileKeyStyleForVersion(active.manifest.version)
  await writeTextFile(root, joinPackagePath(active.packageRoot, path), serializePackageRows(deployments, style))
  mothboxNextPackageStore.set({ ...active, loaded: { ...loaded, deployments } })
}
