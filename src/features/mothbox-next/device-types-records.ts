import { normalizeDeviceType, type DeviceType } from '~/models/device-types'

/**
 * A dataset's own device types (ontology: Device Type), one per line, camelCase:
 * `02_records/device-types.ndjson`. Built-in types are never stored here. The file is
 * small and holds no identifications, so it is rewritten whole on each change.
 */
export const PACKAGE_DEVICE_TYPES_RECORD = '02_records/device-types.ndjson'

export function parseDeviceTypes(text: string): DeviceType[] {
  const out: DeviceType[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const type = normalizeDeviceType(JSON.parse(trimmed))
      if (type) out.push(type)
    } catch {
      // skip a damaged line rather than lose the rest
    }
  }
  return out
}

export function serializeDeviceTypes(types: readonly DeviceType[]): string {
  return types.map((t) => JSON.stringify(t)).join('\n') + (types.length ? '\n' : '')
}

