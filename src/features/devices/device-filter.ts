import { atom } from 'nanostores'
import { resolveDeviceType, type DeviceType } from '~/models/device-types'
import type { DeploymentRecord } from '~/features/mothbox-next/records'

/**
 * Viewing a project by device (ontology: Device, Device Type): which deployments to show,
 * by their device type or by what the device has (attractor, target and sensor types).
 *
 * A deployment's own attractors / target / sensor (from the field sheet) describe what was
 * actually used, so they win over the device type's defaults.
 */

export const UNKNOWN_DEVICE_TYPE = '__unknown__'

export type DeviceFilter = {
  /** Device type ids to show; empty shows every type. `UNKNOWN_DEVICE_TYPE` is "not set". */
  deviceTypeIDs: string[]
  /** Show deployments with an attractor of one of these types (e.g. "UV LED"); empty = any. */
  attractorTypes: string[]
  targetTypes: string[]
  sensorTypes: string[]
  /** battery, grid, solar */
  powerSourceTypes: string[]
}

export type DeviceView = {
  filter: DeviceFilter
  /** Group deployments by device type in the project tree. */
  groupByDeviceType: boolean
}

export const EMPTY_DEVICE_FILTER: DeviceFilter = { deviceTypeIDs: [], attractorTypes: [], targetTypes: [], sensorTypes: [], powerSourceTypes: [] }

export const deviceViewStore = atom<DeviceView>({ filter: EMPTY_DEVICE_FILTER, groupByDeviceType: false })

export function isDeviceFilterActive(filter: DeviceFilter): boolean {
  return !!(
    filter.deviceTypeIDs.length ||
    filter.attractorTypes.length ||
    filter.targetTypes.length ||
    filter.sensorTypes.length ||
    filter.powerSourceTypes.length
  )
}

/** What one deployment's device has, as plain lists of types. */
export type DeploymentDeviceFeatures = {
  deviceTypeID: string
  deviceType: string
  attractorTypes: string[]
  targetTypes: string[]
  sensorTypes: string[]
  powerSourceTypes: string[]
}

export function deploymentDeviceFeatures(deployment: DeploymentRecord, customTypes: readonly DeviceType[] = []): DeploymentDeviceFeatures {
  const type = resolveDeviceType(deployment.device_type_id, customTypes)
  const ownAttractors = (deployment.attractors ?? []).map((a) => a.attractorType)
  const ownTarget = stringField(deployment.target, 'targetType')
  const ownSensor = stringField(deployment.sensor, 'sensorType')
  return {
    deviceTypeID: type?.deviceTypeID ?? (deployment.device_type_id || UNKNOWN_DEVICE_TYPE),
    deviceType: type?.deviceType ?? deployment.device_type ?? 'Device type not set',
    attractorTypes: cleanList(ownAttractors.some(Boolean) ? ownAttractors : (type?.attractors ?? []).map((a) => a.attractorType)),
    targetTypes: cleanList(ownTarget ? [ownTarget] : (type?.targets ?? []).map((t) => t.targetType)),
    sensorTypes: cleanList(ownSensor ? [ownSensor] : (type?.sensors ?? []).map((s) => s.sensorType)),
    powerSourceTypes: cleanList((deployment.power_sources?.length ? deployment.power_sources : (type?.powerSources ?? [])).map((p) => p.powerSourceType)),
  }
}

export function deploymentMatchesDeviceFilter(features: DeploymentDeviceFeatures, filter: DeviceFilter): boolean {
  if (filter.deviceTypeIDs.length && !filter.deviceTypeIDs.includes(features.deviceTypeID)) return false
  if (!anyShared(filter.attractorTypes, features.attractorTypes)) return false
  if (!anyShared(filter.targetTypes, features.targetTypes)) return false
  if (!anyShared(filter.sensorTypes, features.sensorTypes)) return false
  if (!anyShared(filter.powerSourceTypes, features.powerSourceTypes)) return false
  return true
}

export type DeviceFilterOption = { value: string; label: string; count: number }

export type DeviceFilterOptions = {
  deviceTypes: DeviceFilterOption[]
  attractorTypes: DeviceFilterOption[]
  targetTypes: DeviceFilterOption[]
  sensorTypes: DeviceFilterOption[]
  powerSourceTypes: DeviceFilterOption[]
}

/** The choices a project's deployments offer, each with how many deployments have it. */
export function deviceFilterOptions(features: readonly DeploymentDeviceFeatures[]): DeviceFilterOptions {
  const deviceTypes = new Map<string, DeviceFilterOption>()
  const tally = (pick: (f: DeploymentDeviceFeatures) => string[]) => {
    const counts = new Map<string, DeviceFilterOption>()
    for (const f of features) {
      for (const value of new Set(pick(f))) {
        const key = value.toLowerCase()
        const option = counts.get(key) ?? { value, label: value, count: 0 }
        option.count++
        counts.set(key, option)
      }
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label))
  }
  for (const f of features) {
    const option = deviceTypes.get(f.deviceTypeID) ?? { value: f.deviceTypeID, label: f.deviceType, count: 0 }
    option.count++
    deviceTypes.set(f.deviceTypeID, option)
  }
  return {
    deviceTypes: [...deviceTypes.values()].sort(
      (a, b) => Number(a.value === UNKNOWN_DEVICE_TYPE) - Number(b.value === UNKNOWN_DEVICE_TYPE) || a.label.localeCompare(b.label),
    ),
    attractorTypes: tally((f) => f.attractorTypes),
    targetTypes: tally((f) => f.targetTypes),
    sensorTypes: tally((f) => f.sensorTypes),
    powerSourceTypes: tally((f) => f.powerSourceTypes),
  }
}

/** Features for every deployment record, by deployment id. */
export function deviceFeaturesByDeployment(
  deployments: readonly DeploymentRecord[],
  customTypes: readonly DeviceType[] = [],
): Map<string, DeploymentDeviceFeatures> {
  return new Map(deployments.map((d) => [d.deployment_id, deploymentDeviceFeatures(d, customTypes)]))
}

/** Ids of the deployments the filter keeps (deployments without a record are kept only when no filter is set). */
export function deploymentIdsMatching(params: {
  deploymentIds: Iterable<string>
  features: Map<string, DeploymentDeviceFeatures>
  filter: DeviceFilter
}): Set<string> {
  const { deploymentIds, features, filter } = params
  const active = isDeviceFilterActive(filter)
  const out = new Set<string>()
  for (const id of deploymentIds) {
    const f = features.get(id) ?? unknownFeatures()
    if (!active || deploymentMatchesDeviceFilter(f, filter)) out.add(id)
  }
  return out
}

/** A short description of an active filter, e.g. "Standard Mothbox Pro · attractor: UV LED". */
export function describeDeviceFilter(filter: DeviceFilter, options: DeviceFilterOptions): string {
  const label = (list: DeviceFilterOption[], value: string) => list.find((o) => o.value === value)?.label ?? value
  const parts: string[] = []
  if (filter.deviceTypeIDs.length) parts.push(filter.deviceTypeIDs.map((id) => label(options.deviceTypes, id)).join(' or '))
  if (filter.attractorTypes.length) parts.push(`attractor: ${filter.attractorTypes.join(' or ')}`)
  if (filter.targetTypes.length) parts.push(`target: ${filter.targetTypes.join(' or ')}`)
  if (filter.sensorTypes.length) parts.push(`sensor: ${filter.sensorTypes.join(' or ')}`)
  if (filter.powerSourceTypes.length) parts.push(`power: ${filter.powerSourceTypes.join(' or ')}`)
  return parts.join(' · ')
}

function unknownFeatures(): DeploymentDeviceFeatures {
  return { deviceTypeID: UNKNOWN_DEVICE_TYPE, deviceType: 'Device type not set', attractorTypes: [], targetTypes: [], sensorTypes: [], powerSourceTypes: [] }
}

function anyShared(wanted: string[], have: string[]): boolean {
  if (!wanted.length) return true
  const lower = new Set(have.map((v) => v.toLowerCase()))
  return wanted.some((w) => lower.has(w.toLowerCase()))
}

function cleanList(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))]
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = value?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** Deployments grouped by device type, groups in name order with "not set" last; order within a group is kept. */
export function groupDeploymentsByDeviceType<T extends { id: string }>(
  deployments: readonly T[],
  features: Map<string, DeploymentDeviceFeatures>,
): Array<{ deviceTypeID: string; deviceType: string; items: T[] }> {
  const groups = new Map<string, { deviceTypeID: string; deviceType: string; items: T[] }>()
  for (const d of deployments) {
    const f = features.get(d.id) ?? unknownFeatures()
    const group = groups.get(f.deviceTypeID) ?? { deviceTypeID: f.deviceTypeID, deviceType: f.deviceType, items: [] }
    group.items.push(d)
    groups.set(f.deviceTypeID, group)
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.deviceTypeID === UNKNOWN_DEVICE_TYPE) - Number(b.deviceTypeID === UNKNOWN_DEVICE_TYPE) ||
      a.deviceType.localeCompare(b.deviceType),
  )
}
