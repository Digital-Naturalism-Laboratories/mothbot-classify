import deviceTypesFile from '~/config/device-types.json'

/**
 * Device types (ontology: Device Type). The built-in types come from
 * `src/config/device-types.json`, a copy of the ontology's
 * `device-types/device-types.json`; update the copy when that file changes.
 *
 * A customized type names the type it changes in `derivedFrom` and lists only the
 * fields it changes; every other field comes from the parent. A device's own record
 * can override its type's fields the same way.
 */

export type DeviceTypeAttractor = {
  channel?: string
  attractorType?: string | null
  attractorLocation?: string | null
  powerW?: number | null
}

export type DeviceType = {
  deviceTypeID: string
  deviceType: string
  derivedFrom?: string | null
  maker?: string | null
  firmware?: { family?: string | null; hardwareID?: string | null }
  attractors?: DeviceTypeAttractor[]
  target?: Record<string, unknown>
  sensors?: Array<Record<string, unknown>>
  computer?: string | null
  customFields?: Record<string, unknown>
}

export const BUILT_IN_DEVICE_TYPES: readonly DeviceType[] = (deviceTypesFile as { deviceTypes: DeviceType[] }).deviceTypes

/**
 * The full description of a device type: its own fields over its parent's, all the way
 * up. `customTypes` are a dataset's own types; unknown ids give undefined.
 */
export function resolveDeviceType(id: string | undefined | null, customTypes: readonly DeviceType[] = []): DeviceType | undefined {
  if (!id) return undefined
  const byId = new Map<string, DeviceType>()
  for (const type of BUILT_IN_DEVICE_TYPES) byId.set(type.deviceTypeID, type)
  for (const type of customTypes) byId.set(type.deviceTypeID, type)

  const chain: DeviceType[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.deviceTypeID)) {
    seen.add(current.deviceTypeID)
    chain.unshift(current)
    current = current.derivedFrom ? byId.get(current.derivedFrom) : undefined
  }
  if (!chain.length) return undefined

  return chain.reduce<DeviceType>((merged, type) => {
    const next: DeviceType = { ...merged }
    for (const [key, value] of Object.entries(type)) {
      if (value === undefined) continue
      if (key === 'target' || key === 'firmware' || key === 'customFields') {
        ;(next as Record<string, unknown>)[key] = { ...((merged as Record<string, unknown>)[key] as object), ...(value as object) }
      } else {
        ;(next as Record<string, unknown>)[key] = value
      }
    }
    return next
  }, chain[0]!)
}

/** The device-type id for a name, id or firmware spelling ("Mothbox Pro", "mothbox-pro", "pro"). */
export function deviceTypeIdFor(name: string | undefined | null, customTypes: readonly DeviceType[] = []): string | undefined {
  const text = (name ?? '').trim().toLowerCase()
  if (!text) return undefined
  for (const type of [...BUILT_IN_DEVICE_TYPES, ...customTypes]) {
    if (text === type.deviceTypeID.toLowerCase() || text === type.deviceType.toLowerCase()) return type.deviceTypeID
  }
  const squashed = text.replace(/[\s_-]+/g, '')
  if (['mothboxpro', 'pro', 'standardmothboxpro'].includes(squashed)) return 'mothbox-pro'
  if (['mothboxdiy', 'diy', 'standardmothboxdiy'].includes(squashed)) return 'mothbox-diy'
  if (['ami', 'amidevice', 'amitrap'].includes(squashed)) return 'ami-device'
  return undefined
}
