import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeviceTypesDialog } from '~/features/devices/device-types-dialog'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { parseDeviceTypes, serializeDeviceTypes } from '~/features/mothbox-next/device-types-records'
import { parsePowerSources, serializePowerSources } from '~/features/mothbox-next/power-sources-records'
import { newCustomDeviceType, newCustomPowerSource } from '~/models/device-types'

const saved: { types?: unknown[]; power?: unknown[]; assignments?: Record<string, string | null> } = {}
vi.mock('~/features/mothbox-next/device-types-package', () => ({
  saveCustomDeviceTypes: async (types: unknown[]) => {
    saved.types = types
  },
  saveCustomPowerSources: async (power: unknown[]) => {
    saved.power = power
  },
  saveDeploymentDeviceTypes: async (assignments: Record<string, string | null>) => {
    saved.assignments = assignments
  },
}))

function openPackage() {
  mothboxNextPackageStore.set({
    packageRoot: '',
    manifest: {
      format: 'mothbox-next-dataset',
      version: 4,
      dataset_id: 'd1',
      folders: { records: '02_records/', classifications: '03_classifications/', patches: '01_patches/' },
      records: { patches: '02_records/patches.ndjson' },
    },
    loaded: { deployments: [{ deployment_id: 'Dep_A', device_name: 'SnappySloth' }], deviceTypes: [] } as any,
  })
}

describe('power setups file', () => {
  it('round-trips, skipping damaged lines and setups without an id', () => {
    const setup = newCustomPowerSource({ name: 'Field battery', powerSourceType: 'battery', existingIds: [] })
    expect(parsePowerSources(serializePowerSources([setup]) + 'not json\n{"powerSourceType":"grid"}\n')).toEqual([setup])
  })
})

describe('device types file', () => {
  it('round-trips, skipping damaged lines', () => {
    const type = newCustomDeviceType({ name: 'Field kit', existingIds: [] })
    expect(parseDeviceTypes(serializeDeviceTypes([type]) + 'not json\n')).toEqual([type])
  })
})

describe('Devices dialog', () => {
  beforeEach(() => {
    saved.types = undefined
    saved.power = undefined
    saved.assignments = undefined
    openPackage()
  })
  afterEach(() => cleanup())

  it('customizes a built-in type, edits it and saves', async () => {
    const user = userEvent.setup()
    render(<DeviceTypesDialog open onClose={() => {}} />)

    expect(screen.getByText(/Built-in device types can’t be changed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Customize selected' }))

    const name = screen.getByDisplayValue('Standard Mothbox Pro (custom)')
    await user.clear(name)
    await user.type(name, 'Pro, external UV')
    await user.clear(screen.getByPlaceholderText('e.g. 6.1.2'))
    await user.type(screen.getByPlaceholderText('e.g. 6.1.2'), '6.1.3')
    // The copy keeps the Pro's two attractor slots; set the first one's power.
    const powers = screen.getAllByPlaceholderText('Power')
    await user.clear(powers[0]!)
    await user.type(powers[0]!, '10')

    await user.click(screen.getByRole('button', { name: 'Save device types' }))
    const savedType = (saved.types as any[])[0]
    expect(savedType).toMatchObject({
      deviceType: 'Pro, external UV',
      derivedFrom: 'mothbox-pro',
      firmware: { version: '6.1.3' },
    })
    expect(savedType.attractors[0].powerW).toBe(10)
    expect(savedType.sensors).toHaveLength(1)
  })

  it('offers Mothbeam power settings, batteries and a description', async () => {
    const user = userEvent.setup()
    render(<DeviceTypesDialog open onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Customize selected' }))

    // A new attractor: choosing a Mothbeam fills in its hardware version.
    await user.click(within(screen.getByRole('heading', { name: 'Attractors' }).closest('section')!).getByRole('button', { name: /Add/ }))
    const added = screen.getAllByPlaceholderText('Type, e.g. Mothbeam (UV)').length - 1
    const at = (placeholder: string) => screen.getAllByPlaceholderText(placeholder)[added]!
    await user.type(at('Type, e.g. Mothbeam (UV)'), 'Mothbeam (UV)')
    expect(at('Hardware version (optional)')).toHaveValue('5.0.3')
    const switches = screen.getAllByRole('combobox', { name: 'Switches on' })[added]!
    expect([...switches.querySelectorAll('option:not([hidden])')].map((o) => o.textContent)).toEqual([
      '0 switches',
      '1 switch',
      '1 and 2 switches',
      '1, 2 and 3 switches',
      '3 and 4 switches',
      '1, 3 and 4 switches',
      'All 4 switches',
    ])
    await user.selectOptions(switches, '1 and 2 switches')
    expect(at('Power')).toHaveValue(3.5)
    await user.type(at('Location'), 'in target')
    await user.clear(screen.getAllByPlaceholderText('Color (optional)')[0]!)
    await user.type(screen.getAllByPlaceholderText('Color (optional)')[0]!, 'yellow')

    // One power source: a battery starts as the standard TalentCell; changing a detail makes it custom.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Power source type' }), 'battery')
    expect(screen.getByRole('combobox', { name: 'Power setup' })).toHaveDisplayValue('Standard TalentCell PB120B1')
    expect(screen.getByPlaceholderText('Capacity')).toHaveValue(142)
    expect(screen.getByPlaceholderText('At 80% full')).toHaveValue(12)
    await user.clear(screen.getByPlaceholderText('Capacity'))
    await user.type(screen.getByPlaceholderText('Capacity'), '100')
    expect(screen.getByRole('combobox', { name: 'Power setup' })).toHaveDisplayValue('TalentCell PB120B1 (custom)')
    await user.clear(screen.getByPlaceholderText('Notes about the whole device'))
    await user.type(screen.getByPlaceholderText('Notes about the whole device'), 'Sheet hung from a tree.')

    await user.click(screen.getByRole('button', { name: 'Save device types' }))
    const savedType = (saved.types as any[])[0]
    // The standard Pro's two Mothbeams come along.
    expect(savedType.attractors.slice(0, 2).map((a: any) => a.attractorType)).toEqual(['Mothbeam (UV)', 'Mothbeam (Visible)'])
    expect(savedType.attractors[added]).toMatchObject({
      attractorType: 'Mothbeam (UV)',
      hardwareVersion: '5.0.3',
      attractorLocation: 'in target',
      configuration: '1 and 2 switches',
      powerW: 3.5,
    })
    expect(savedType.targets[0].color).toBe('yellow')
    expect(savedType.powerSource).toMatchObject({
      powerSourceType: 'battery',
      powerSourceID: 'custom-battery',
      derivedFrom: 'talentcell-pb120b1',
      model: 'TalentCell PB120B1',
      capacityWh: 100,
      nominalVoltageV: 11.1,
      voltageAt80PercentV: 12,
      voltageAt20PercentV: 10.5,
    })
    expect(savedType.description).toBe('Sheet hung from a tree.')
  })

  it('saves the dataset’s own power setups and offers them to device types', async () => {
    const user = userEvent.setup()
    render(<DeviceTypesDialog open onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Power setups' }))
    expect(screen.getByText(/Standard power setups can’t be changed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Customize selected' }))

    const name = screen.getByDisplayValue('TalentCell PB120B1 (custom)')
    await user.clear(name)
    await user.type(name, 'Field battery')
    await user.clear(screen.getByPlaceholderText('Capacity'))
    await user.type(screen.getByPlaceholderText('Capacity'), '200')
    await user.click(screen.getByRole('button', { name: 'Save power setups' }))
    expect(saved.power).toEqual([
      expect.objectContaining({ name: 'Field battery', powerSourceType: 'battery', derivedFrom: 'talentcell-pb120b1', capacityWh: 200, nominalVoltageV: 11.1 }),
    ])

    // A device type can now choose it.
    await user.click(screen.getByRole('button', { name: 'Device types' }))
    await user.click(screen.getByRole('button', { name: 'Customize selected' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Power source type' }), 'battery')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Power setup' }), 'Field battery')
    expect(screen.getByPlaceholderText('Capacity')).toHaveValue(200)
  })

  it('will not save a type without a name, and keeps at least one sensor', async () => {
    const user = userEvent.setup()
    render(<DeviceTypesDialog open onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'New device type' }))
    await user.clear(screen.getByDisplayValue('New device'))
    expect(screen.getByText(/Give the device type a name/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save device types' })).toBeDisabled()
    expect(screen.getByTitle('A device needs at least one sensor')).toBeDisabled()
  })

  it('sets the device type a deployment used', async () => {
    const user = userEvent.setup()
    render(<DeviceTypesDialog open onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Deployments' }))
    const row = screen.getByText('Dep_A').closest('tr')!
    expect(within(row).getByText('SnappySloth')).toBeInTheDocument()
    await user.selectOptions(within(row).getByRole('combobox'), 'mothbox-diy')
    await user.click(screen.getByRole('button', { name: /Save device types for 1 deployment/ }))
    expect(saved.assignments).toEqual({ Dep_A: 'mothbox-diy' })
  })
})
