import { describe, expect, it } from 'vitest'
import { BUILT_IN_DEVICE_TYPES, deviceTypeIdFor, resolveDeviceType, type DeviceType } from '../device-types'

describe('device types', () => {
  it('has the three built-in types', () => {
    expect(BUILT_IN_DEVICE_TYPES.map((t) => t.deviceType)).toEqual(['Standard Mothbox Pro', 'Standard Mothbox DIY', 'AMI Device'])
  })

  it('resolves a customized type over its parent', () => {
    const custom: DeviceType[] = [
      {
        deviceTypeID: 'mothbox-pro-external-uv',
        deviceType: 'Mothbox Pro, external UV attractor',
        derivedFrom: 'mothbox-pro',
        attractors: [{ channel: 'ATTRACT_A', attractorType: 'UV LED', attractorLocation: 'external' }],
        target: { targetDistanceCm: 40 },
      },
    ]
    const resolved = resolveDeviceType('mothbox-pro-external-uv', custom)
    expect(resolved?.deviceType).toBe('Mothbox Pro, external UV attractor')
    expect(resolved?.attractors).toHaveLength(1)
    expect(resolved?.computer).toBe('Raspberry Pi 5')
    expect(resolved?.target).toMatchObject({ targetDistanceCm: 40, targetWidthCm: null })
    expect(resolveDeviceType('nope')).toBeUndefined()
  })

  it('finds ids from names and firmware spellings', () => {
    expect(deviceTypeIdFor('Mothbox Pro')).toBe('mothbox-pro')
    expect(deviceTypeIdFor('Standard Mothbox DIY')).toBe('mothbox-diy')
    expect(deviceTypeIdFor('diy')).toBe('mothbox-diy')
    expect(deviceTypeIdFor('toaster')).toBeUndefined()
  })
})
