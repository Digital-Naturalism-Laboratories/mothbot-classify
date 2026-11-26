import { describe, expect, it } from 'vitest'
import { addNewNightsToPackage } from '../add-new-nights'
import { PACKAGE_DEVICE_TYPES_RECORD, parseDeviceTypes } from '../device-types-records'
import { PACKAGE_POWER_SOURCES_RECORD, parsePowerSources } from '../power-sources-records'
import type { DinalabAdapterIO } from '../adapters/dinalab-mothbox-v1/adapter-io'

function memoryIo(files: Map<string, string>): DinalabAdapterIO {
  return {
    source: {
      exists: async (p) => files.has(p),
      readText: async (p) => files.get(p) ?? '',
      readBinary: async (p) => new TextEncoder().encode(files.get(p) ?? '').buffer,
      findFiles: async (predicate) => [...files.keys()].filter((p) => predicate(p.split('/').pop() ?? p)),
    },
    package: {
      readText: async (p) => {
        if (!files.has(p)) throw new Error(`missing ${p}`)
        return files.get(p)!
      },
      writeText: async (p, text) => void files.set(p, text),
      copyFromSource: async () => undefined,
    },
  }
}

const shape = (patch: string) => ({ label: 'creature', patch_path: patch, points: [[1, 1], [9, 1], [9, 9], [1, 9]], shape_type: 'rotation' })

describe('adding sessions keeps the project’s device types and power setups', () => {
  it('adds new ones from the detection files and never overwrites edited ones', async () => {
    const editedType = { deviceTypeID: 'custom-pro-uv-ext', deviceType: 'Edited in Classify', derivedFrom: 'mothbox-pro', sensors: [{ sensorType: 'camera' }] }
    const editedPower = { powerSourceID: 'custom-power-field-battery', name: 'Edited battery', powerSourceType: 'battery', capacityWh: 300 }
    const files = new Map<string, string>([
      ['dataset.json', JSON.stringify({ format: 'mothbox-next-dataset', version: 4, datasetID: 'P', folders: {}, records: {} })],
      [PACKAGE_DEVICE_TYPES_RECORD, JSON.stringify(editedType) + '\n'],
      [PACKAGE_POWER_SOURCES_RECORD, JSON.stringify(editedPower) + '\n'],
    ])
    const night = '_processed/Dep/2026-07-28'
    // The new night's photos carry the original custom type (same id) and a brand-new one.
    files.set(`${night}/a_botdetection.json`, JSON.stringify({
      deviceTypeDefinition: {
        deviceTypeID: 'custom-pro-uv-ext', deviceType: 'Original name', derivedFrom: 'mothbox-pro', sensors: [{ sensorType: 'camera' }],
        powerSource: { powerSourceID: 'custom-power-field-battery', name: 'Field battery', powerSourceType: 'battery', capacityWh: 200 },
      },
      shapes: [shape('a_0_m.pt.jpg')],
    }))
    files.set(`${night}/a_0_m.pt.jpg`, '')
    files.set(`_processed/Dep2/2026-07-28/b_botdetection.json`, JSON.stringify({
      deviceTypeDefinition: {
        deviceTypeID: 'custom-grid-box', deviceType: 'Grid box', derivedFrom: 'mothbox-diy', sensors: [{ sensorType: 'camera' }],
        powerSource: { powerSourceID: 'custom-power-wall', name: 'Wall adapter', powerSourceType: 'grid', supplyVoltageV: 12 },
      },
      shapes: [shape('b_0_m.pt.jpg')],
    }))
    files.set(`_processed/Dep2/2026-07-28/b_0_m.pt.jpg`, '')

    await addNewNightsToPackage({
      datasetId: 'P',
      io: memoryIo(files),
      folders: [night, '_processed/Dep2/2026-07-28'],
      packageRelativeSourcePrefix: '',
      packageSourceLayout: 'in_place',
    })

    const types = parseDeviceTypes(files.get(PACKAGE_DEVICE_TYPES_RECORD)!)
    expect(types.map((t) => [t.deviceTypeID, t.deviceType])).toEqual([
      ['custom-pro-uv-ext', 'Edited in Classify'],
      ['custom-grid-box', 'Grid box'],
    ])
    const power = parsePowerSources(files.get(PACKAGE_POWER_SOURCES_RECORD)!)
    expect(power.map((p) => [p.powerSourceID, p.name])).toEqual([
      ['custom-power-field-battery', 'Edited battery'],
      ['custom-power-wall', 'Wall adapter'],
    ])
  })
})
