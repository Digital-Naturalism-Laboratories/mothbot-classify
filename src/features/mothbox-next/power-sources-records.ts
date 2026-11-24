import { normalizePowerSource, type DeviceTypePowerSource } from '~/models/device-types'

/**
 * A dataset's own power setups (ontology: Device → powerSource), one per line, camelCase:
 * `02_records/power-sources.ndjson`. Standard setups are never stored here. The file is small,
 * so it is rewritten whole on each change.
 */
export const PACKAGE_POWER_SOURCES_RECORD = '02_records/power-sources.ndjson'

export function parsePowerSources(text: string): DeviceTypePowerSource[] {
  const out: DeviceTypePowerSource[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const p = normalizePowerSource(JSON.parse(trimmed))
      if (p?.powerSourceID) out.push(p)
    } catch {
      // skip a damaged line rather than lose the rest
    }
  }
  return out
}

export function serializePowerSources(setups: readonly DeviceTypePowerSource[]): string {
  return setups.map((p) => JSON.stringify(p)).join('\n') + (setups.length ? '\n' : '')
}

/** Setups in `incoming` whose ids aren't in `existing` (the dataset's own edits win). */
export function newPowerSources(existing: readonly DeviceTypePowerSource[], incoming: readonly DeviceTypePowerSource[]) {
  const known = new Set(existing.map((p) => p.powerSourceID))
  const out: DeviceTypePowerSource[] = []
  for (const p of incoming) {
    if (p.powerSourceID && !known.has(p.powerSourceID)) {
      known.add(p.powerSourceID)
      out.push(p)
    }
  }
  return out
}
