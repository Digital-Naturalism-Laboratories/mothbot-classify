import { describe, expect, it } from 'vitest'
import type { DeploymentRecord } from '~/features/mothbox-next/records'
import type { DeviceType } from '~/models/device-types'
import {
  deploymentIdsMatching,
  describeDeviceFilter,
  deviceFeaturesByDeployment,
  deviceFilterOptions,
  EMPTY_DEVICE_FILTER,
  groupDeploymentsByDeviceType,
  UNKNOWN_DEVICE_TYPE,
} from '../device-filter'

const custom: DeviceType[] = [
  {
    deviceTypeID: 'custom-pro-white',
    deviceType: 'Pro, white light only',
    derivedFrom: 'mothbox-pro',
    attractors: [{ attractorType: 'White LED', powerW: 5 }],
  },
]

const deployments: DeploymentRecord[] = [
  { deployment_id: 'pro', device_type_id: 'mothbox-pro' },
  { deployment_id: 'white', device_type_id: 'custom-pro-white' },
  // The field sheet says what was actually used, over the type's defaults.
  { deployment_id: 'pro-sheet', device_type_id: 'mothbox-pro', attractors: [{ attractorType: 'Mercury vapour' }] },
  { deployment_id: 'unknown' },
]

describe('device filter', () => {
  const features = deviceFeaturesByDeployment(deployments, custom)
  const all = ['pro', 'white', 'pro-sheet', 'unknown', 'no-record']
  const match = (filter: Partial<typeof EMPTY_DEVICE_FILTER>) =>
    [...deploymentIdsMatching({ deploymentIds: all, features, filter: { ...EMPTY_DEVICE_FILTER, ...filter } })]

  it('keeps everything without a filter', () => {
    expect(match({})).toEqual(all)
  })

  it('filters by device type, including “not set”', () => {
    expect(match({ deviceTypeIDs: ['mothbox-pro'] })).toEqual(['pro', 'pro-sheet'])
    expect(match({ deviceTypeIDs: [UNKNOWN_DEVICE_TYPE] })).toEqual(['unknown', 'no-record'])
  })

  it('filters by what the device has, from the type or the deployment’s own sheet', () => {
    expect(match({ attractorTypes: ['white led'] })).toEqual(['white'])
    expect(match({ attractorTypes: ['mercury vapour', 'White LED'] })).toEqual(['white', 'pro-sheet'])
    // Lists of different kinds must all match.
    expect(match({ attractorTypes: ['White LED'], deviceTypeIDs: ['mothbox-pro'] })).toEqual([])
    expect(match({ sensorTypes: ['camera'] })).toEqual(['pro', 'white', 'pro-sheet'])
  })

  it('uses a box’s own power sources over its type’s', () => {
    const own = deviceFeaturesByDeployment(
      [
        { deployment_id: 'on-grid', device_type_id: 'mothbox-pro', power_source: { powerSourceType: 'grid' } },
        { deployment_id: 'plain', device_type_id: 'mothbox-pro' },
      ],
      custom,
    )
    expect(own.get('on-grid')!.powerSourceTypes).toEqual(['grid'])
    // Without its own, a box uses its type's (the standard Pro runs on a battery).
    expect(own.get('plain')!.powerSourceTypes).toEqual(['battery'])
    expect([...deploymentIdsMatching({ deploymentIds: ['on-grid', 'plain'], features: own, filter: { ...EMPTY_DEVICE_FILTER, powerSourceTypes: ['grid'] } })]).toEqual(['on-grid'])
    expect([...deploymentIdsMatching({ deploymentIds: ['on-grid', 'plain'], features: own, filter: { ...EMPTY_DEVICE_FILTER, powerSourceTypes: ['battery'] } })]).toEqual(['plain'])
  })

  it('offers the choices present, with counts, and describes a filter', () => {
    const options = deviceFilterOptions([...features.values()])
    expect(options.deviceTypes.map((o) => [o.value, o.count])).toEqual([
      ['custom-pro-white', 1],
      ['mothbox-pro', 2],
      [UNKNOWN_DEVICE_TYPE, 1],
    ])
    expect(options.sensorTypes).toEqual([{ value: 'camera', label: 'camera', count: 3 }])
    expect(
      describeDeviceFilter({ ...EMPTY_DEVICE_FILTER, deviceTypeIDs: ['mothbox-pro'], attractorTypes: ['UV LED'] }, options),
    ).toBe('Standard Mothbox Pro · attractor: UV LED')
  })

  it('groups deployments by device type, “not set” last', () => {
    const groups = groupDeploymentsByDeviceType(
      all.map((id) => ({ id })),
      features,
    )
    expect(groups.map((g) => [g.deviceType, g.items.map((i) => i.id)])).toEqual([
      ['Pro, white light only', ['white']],
      ['Standard Mothbox Pro', ['pro', 'pro-sheet']],
      ['Device type not set', ['unknown', 'no-record']],
    ])
  })
})
