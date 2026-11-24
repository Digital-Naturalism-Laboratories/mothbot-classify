import deviceTypesFile from '~/config/device-types.json'

/**
 * Device types (ontology: Device Type). The built-in types come from
 * `src/config/device-types.json`, a copy of the ontology's
 * `device-types/device-types.json`; after editing that file, run its
 * `device-types/sync-copies.py` to update this copy (and Process's and the firmware's).
 *
 * A device has 0 or more attractors, 0 or more targets, 1 or more sensors and 0 or more
 * power sources, plus hardware and firmware versions and a free-text description. A customized type names the type it came from in
 * `derivedFrom`; its own fields replace its parent's (lists are replaced whole).
 */

export type DeviceTypeAttractor = {
  channel?: string | null
  attractorType?: string | null
  /** The attractor's own hardware version, e.g. Mothbeam `5.0.3`. */
  hardwareVersion?: string | null
  attractorLocation?: string | null
  /** Which of its lights are on, e.g. Mothbeam "1 and 2" (see `DEVICE_CHOICES.attractorPowerOptions`). */
  configuration?: string | null
  powerW?: number | null
}

export type DeviceTypeTarget = {
  targetType?: string | null
  material?: string | null
  color?: string | null
  widthCm?: number | null
  heightCm?: number | null
  distanceCm?: number | null
}

export type DeviceTypeSensor = {
  sensorType: string
  model?: string | null
  lens?: string | null
  resolution?: string | null
  effectiveResolutionPxPerMm?: number | null
  sensitivityRange?: string | null
  orientation?: string | null
  notes?: string | null
}

export type DeviceTypePowerSource = {
  /** `battery`, `grid` or `solar`. */
  powerSourceType: string
  model?: string | null
  /** Batteries: energy capacity in watt hours. */
  capacityWh?: number | null
  /** Batteries: the voltage printed on the battery. */
  nominalVoltageV?: number | null
  /** Batteries: the voltage when about 80% / 20% full (calibrates a battery gauge). */
  voltageAt80PercentV?: number | null
  voltageAt20PercentV?: number | null
}

export type DeviceType = {
  deviceTypeID: string
  deviceType: string
  derivedFrom?: string | null
  maker?: string | null
  hardwareVersion?: string | null
  firmware?: { family?: string | null; version?: string | null; hardwareID?: string | null }
  attractors?: DeviceTypeAttractor[]
  targets?: DeviceTypeTarget[]
  sensors?: DeviceTypeSensor[]
  powerSources?: DeviceTypePowerSource[]
  computer?: string | null
  customFields?: Record<string, unknown>
  /** Notes about the whole device. */
  description?: string | null
}

export type AttractorPowerOption = { configuration: string; powerW: number; measured?: string }

/** Suggested values for the editors, from the shared file's `choices`. Any other value is allowed too. */
export type DeviceChoices = {
  attractorTypes: string[]
  attractorLocations: string[]
  /** Per attractor type: its hardware version and the power of each light configuration. */
  attractorPowerOptions: Record<string, { hardwareVersion?: string; measuredOn?: string; options: AttractorPowerOption[] }>
  targetTypes: string[]
  targetMaterials: string[]
  targetColors: string[]
  sensorTypes: string[]
  powerSourceTypes: string[]
  batteries: Array<{ model: string; capacityWh?: number; nominalVoltageV?: number; voltageAt80PercentV?: number; voltageAt20PercentV?: number }>
}

export const DEVICE_CHOICES: DeviceChoices = (deviceTypesFile as unknown as { choices: DeviceChoices }).choices

export const SENSOR_TYPES: readonly string[] = DEVICE_CHOICES.sensorTypes

/** The power choices for an attractor type (matched ignoring case), or undefined. */
export function attractorPowerOptions(attractorType: string | null | undefined) {
  const wanted = (attractorType ?? '').trim().toLowerCase()
  if (!wanted) return undefined
  const key = Object.keys(DEVICE_CHOICES.attractorPowerOptions).find((k) => k.toLowerCase() === wanted)
  return key ? DEVICE_CHOICES.attractorPowerOptions[key] : undefined
}

export const BUILT_IN_DEVICE_TYPES: readonly DeviceType[] = (deviceTypesFile as { deviceTypes: unknown[] }).deviceTypes.map(
  (raw) => normalizeDeviceType(raw)!,
)

export function isBuiltInDeviceType(id: string | undefined | null): boolean {
  return !!id && BUILT_IN_DEVICE_TYPES.some((t) => t.deviceTypeID === id)
}

/**
 * A device type from stored JSON, reading the older format too (a single `target`
 * object with `targetWidthCm`…, `resolutionMegapixels` on sensors). Null when unusable.
 */
export function normalizeDeviceType(raw: unknown): DeviceType | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown> & {
    target?: { targetType?: string; targetWidthCm?: number; targetHeightCm?: number; targetDistanceCm?: number }
    sensors?: Array<Record<string, unknown>>
  }
  if (typeof r.deviceTypeID !== 'string' || !r.deviceTypeID || typeof r.deviceType !== 'string') return null

  const targets = Array.isArray(r.targets)
    ? (r.targets as DeviceTypeTarget[])
    : r.target && typeof r.target === 'object'
      ? [{ targetType: r.target.targetType ?? null, widthCm: r.target.targetWidthCm ?? null, heightCm: r.target.targetHeightCm ?? null, distanceCm: r.target.targetDistanceCm ?? null }]
      : undefined
  const sensors = Array.isArray(r.sensors)
    ? r.sensors.map((s) => {
        const { resolutionMegapixels, ...rest } = s as { resolutionMegapixels?: number } & Record<string, unknown>
        return {
          ...rest,
          sensorType: typeof rest.sensorType === 'string' && rest.sensorType ? rest.sensorType : 'camera',
          resolution: (rest.resolution as string | null | undefined) ?? (resolutionMegapixels ? `${resolutionMegapixels} MP` : null),
        } as DeviceTypeSensor
      })
    : undefined

  const { target: _oldTarget, ...rest } = r
  void _oldTarget
  return {
    ...(rest as unknown as DeviceType),
    ...(targets ? { targets } : {}),
    ...(sensors ? { sensors } : {}),
  }
}

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
      if (key === 'firmware' || key === 'customFields') {
        ;(next as Record<string, unknown>)[key] = { ...((merged as Record<string, unknown>)[key] as object), ...(value as object) }
      } else {
        ;(next as Record<string, unknown>)[key] = value
      }
    }
    return next
  }, chain[0]!)
}

/** Problems that stop a device type from being saved; empty when it is fine. */
export function deviceTypeProblems(type: DeviceType): string[] {
  const problems: string[] = []
  if (!type.deviceType.trim()) problems.push('Give the device type a name.')
  if (!type.sensors?.length) problems.push('A device needs at least one sensor.')
  if (type.sensors?.some((s) => !s.sensorType?.trim())) problems.push('Every sensor needs a type.')
  for (const a of type.attractors ?? []) {
    if (a.powerW != null && (!Number.isFinite(a.powerW) || a.powerW < 0)) problems.push('Attractor power must be a number of watts, 0 or more.')
  }
  for (const p of type.powerSources ?? []) {
    if (!p.powerSourceType?.trim()) problems.push('Every power source needs a type (battery, grid or solar).')
    if (p.capacityWh != null && (!Number.isFinite(p.capacityWh) || p.capacityWh < 0)) problems.push('Battery capacity must be a number of watt hours, 0 or more.')
    for (const v of [p.nominalVoltageV, p.voltageAt80PercentV, p.voltageAt20PercentV]) {
      if (v != null && (!Number.isFinite(v) || v < 0)) problems.push('Battery voltages must be numbers of volts, 0 or more.')
    }
    if (p.voltageAt80PercentV != null && p.voltageAt20PercentV != null && p.voltageAt80PercentV <= p.voltageAt20PercentV) {
      problems.push('The battery’s 80% voltage has to be higher than its 20% voltage.')
    }
  }
  for (const t of type.targets ?? []) {
    for (const v of [t.widthCm, t.heightCm, t.distanceCm]) {
      if (v != null && (!Number.isFinite(v) || v < 0)) {
        problems.push('Target sizes and distances must be numbers of centimetres, 0 or more.')
        break
      }
    }
  }
  return [...new Set(problems)]
}

/** A new custom type: a copy of `from` (built-in or custom) or a blank one with one camera. */
export function newCustomDeviceType(params: { name: string; from?: DeviceType; existingIds: Iterable<string> }): DeviceType {
  const taken = new Set(params.existingIds)
  const base = `custom-${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device'}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  const from = params.from ? structuredCloneSafe(params.from) : undefined
  return {
    ...(from ?? {
      maker: null,
      hardwareVersion: null,
      firmware: { family: null, version: null, hardwareID: null },
      attractors: [],
      targets: [],
      sensors: [{ sensorType: 'camera', model: null, resolution: null, notes: null }],
      powerSources: [],
      computer: null,
      customFields: {},
      description: null,
    }),
    deviceTypeID: id,
    deviceType: params.name,
    derivedFrom: params.from?.deviceTypeID ?? null,
  }
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

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
