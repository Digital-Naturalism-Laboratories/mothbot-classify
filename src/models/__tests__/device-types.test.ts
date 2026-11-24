import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_DEVICE_TYPES,
  deviceTypeIdFor,
  deviceTypeProblems,
  newCustomDeviceType,
  normalizeDeviceType,
  resolveDeviceType,
  type DeviceType,
} from '../device-types'

describe('device types', () => {
  it('has the built-in types, each with at least one sensor', () => {
    expect(BUILT_IN_DEVICE_TYPES.map((t) => t.deviceType)).toEqual([
      'Standard Mothbox Pro',
      'Standard Mothbox DIY',
      'AMI Device',
      'DIOPSIS',
      'Entocam',
      'LepiSense',
    ])
    for (const type of BUILT_IN_DEVICE_TYPES) expect(deviceTypeProblems(type)).toEqual([])
  })

  it('resolves a customized type over its parent, replacing lists whole', () => {
    const custom: DeviceType[] = [
      {
        deviceTypeID: 'mothbox-pro-external-uv',
        deviceType: 'Mothbox Pro, external UV attractor',
        derivedFrom: 'mothbox-pro',
        attractors: [{ channel: 'ATTRACT_A', attractorType: 'UV LED', attractorLocation: 'external', powerW: 10 }],
        firmware: { version: '6.1.2' },
      },
    ]
    const resolved = resolveDeviceType('mothbox-pro-external-uv', custom)
    expect(resolved?.attractors).toEqual(custom[0]!.attractors)
    expect(resolved?.computer).toBe('Raspberry Pi 5')
    expect(resolved?.firmware).toMatchObject({ family: 'Mothbox Unified 6.x', version: '6.1.2', hardwareID: 'pro' })
    expect(resolved?.sensors?.[0]?.model).toContain('OwlSight')
    expect(resolveDeviceType('nope')).toBeUndefined()
  })

  it('reads the older single-target format', () => {
    const old = normalizeDeviceType({
      deviceTypeID: 'x',
      deviceType: 'X',
      target: { targetType: 'sheet', targetWidthCm: 50, targetDistanceCm: 30 },
      sensors: [{ sensorType: 'camera', resolutionMegapixels: 12 }],
    })
    expect(old?.targets).toEqual([{ targetType: 'sheet', widthCm: 50, heightCm: null, distanceCm: 30 }])
    expect(old?.sensors?.[0]).toMatchObject({ sensorType: 'camera', resolution: '12 MP' })
    expect(normalizeDeviceType({ deviceType: 'no id' })).toBeNull()
    // A list of power sources (format 3) becomes the one power source.
    expect(normalizeDeviceType({ deviceTypeID: 'y', deviceType: 'Y', powerSources: [{ powerSourceType: 'grid' }, { powerSourceType: 'solar' }] })?.powerSource)
      .toEqual({ powerSourceType: 'grid' })
  })

  it('makes new types from scratch or as a copy, with unique ids', () => {
    const pro = BUILT_IN_DEVICE_TYPES[0]!
    const copy = newCustomDeviceType({ name: 'Mothbox Pro, field kit', from: pro, existingIds: [] })
    expect(copy).toMatchObject({ deviceTypeID: 'custom-mothbox-pro-field-kit', derivedFrom: 'mothbox-pro', computer: 'Raspberry Pi 5' })
    copy.sensors![0]!.model = 'changed'
    expect(pro.sensors![0]!.model).not.toBe('changed')

    const blank = newCustomDeviceType({ name: 'Bucket trap', existingIds: ['custom-bucket-trap'] })
    expect(blank.deviceTypeID).toBe('custom-bucket-trap-2')
    expect(blank.sensors).toHaveLength(1)
    expect(blank.attractors).toEqual([])
    expect(blank.derivedFrom).toBeNull()
  })

  it('checks a type before saving', () => {
    const blank = newCustomDeviceType({ name: ' ', existingIds: [] })
    blank.sensors = []
    blank.attractors = [{ attractorType: 'UV', powerW: -1 }]
    blank.targets = [{ targetType: 'sheet', widthCm: Number.NaN }]
    expect(deviceTypeProblems(blank)).toEqual([
      'Give the device type a name.',
      'A device needs at least one sensor.',
      'Attractor power must be a number of watts, 0 or more.',
      'Target sizes and distances must be numbers of centimetres, 0 or more.',
    ])
  })

  it('finds ids from names and firmware spellings', () => {
    expect(deviceTypeIdFor('Mothbox Pro')).toBe('mothbox-pro')
    expect(deviceTypeIdFor('Standard Mothbox DIY')).toBe('mothbox-diy')
    expect(deviceTypeIdFor('diy')).toBe('mothbox-diy')
    expect(deviceTypeIdFor('toaster')).toBeUndefined()
  })
})
