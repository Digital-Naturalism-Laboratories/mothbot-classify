import { useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { toast } from 'sonner'
import { CpuIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { cn } from '~/utils/cn'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { saveCustomDeviceTypes, saveDeploymentDeviceTypes } from '~/features/mothbox-next/device-types-package'
import {
  BUILT_IN_DEVICE_TYPES,
  DEVICE_CHOICES,
  SENSOR_TYPES,
  attractorPowerOptions,
  deviceTypeProblems,
  isBuiltInDeviceType,
  newCustomDeviceType,
  resolveDeviceType,
  type DeviceType,
  type DeviceTypeAttractor,
  type DeviceTypePowerSource,
  type DeviceTypeSensor,
  type DeviceTypeTarget,
} from '~/models/device-types'

type Props = { open: boolean; onClose: () => void }

/**
 * Choose and customize device types (ontology: Device, Device Type), like the printer list
 * in a 3D-printer slicer: start from a built-in device or make your own, then say which
 * device type each deployment used. Custom types are saved in the open dataset
 * (`02_records/device-types.ndjson`). Renders nothing while closed.
 */
export function DeviceTypesDialog(props: Props) {
  if (!props.open) return null
  return <DeviceTypesDialogBody {...props} />
}

function DeviceTypesDialogBody(props: Props) {
  const { onClose } = props
  const active = useStore(mothboxNextPackageStore)
  const loaded = active?.loaded
  const [tab, setTab] = useState<'types' | 'deployments'>('types')
  const [customTypes, setCustomTypes] = useState<DeviceType[]>(() => (loaded?.deviceTypes ?? []).map(clone))
  const [selectedId, setSelectedId] = useState<string>(BUILT_IN_DEVICE_TYPES[0]!.deviceTypeID)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const allTypes = useMemo(() => [...BUILT_IN_DEVICE_TYPES, ...customTypes], [customTypes])
  const selected = allTypes.find((t) => t.deviceTypeID === selectedId) ?? allTypes[0]!
  const selectedIsBuiltIn = isBuiltInDeviceType(selected.deviceTypeID)
  const shown = selectedIsBuiltIn ? selected : resolveDeviceType(selected.deviceTypeID, customTypes) ?? selected

  function updateSelected(change: (type: DeviceType) => DeviceType) {
    setCustomTypes((types) => types.map((t) => (t.deviceTypeID === selected.deviceTypeID ? change(clone(t)) : t)))
    setDirty(true)
  }

  function addType(from?: DeviceType) {
    const name = from ? `${from.deviceType} (custom)` : 'New device'
    const type = newCustomDeviceType({
      name,
      from: from ? resolveDeviceType(from.deviceTypeID, customTypes) : undefined,
      existingIds: allTypes.map((t) => t.deviceTypeID),
    })
    setCustomTypes((types) => [...types, type])
    setSelectedId(type.deviceTypeID)
    setDirty(true)
  }

  function deleteSelected() {
    const inUse = (loaded?.deployments ?? []).filter((d) => d.device_type_id === selected.deviceTypeID)
    if (inUse.length) {
      toast.error(`Used by ${inUse.length} deployment${inUse.length === 1 ? '' : 's'}`, {
        description: 'Choose another device type for them on the Deployments tab first.',
      })
      return
    }
    if (customTypes.some((t) => t.derivedFrom === selected.deviceTypeID)) {
      toast.error('Other device types are based on this one', { description: 'Delete or change those first.' })
      return
    }
    setCustomTypes((types) => types.filter((t) => t.deviceTypeID !== selected.deviceTypeID))
    setSelectedId(BUILT_IN_DEVICE_TYPES[0]!.deviceTypeID)
    setDirty(true)
  }

  const problems = customTypes.flatMap((t) => deviceTypeProblems(t).map((p) => `${t.deviceType || 'Unnamed'}: ${p}`))

  async function onSave() {
    setSaving(true)
    try {
      await saveCustomDeviceTypes(customTypes)
      setDirty(false)
      toast.success('Device types saved')
    } catch (err) {
      toast.error('Could not save device types', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-w-[1040px] max-h-[90vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-8'>
            <CpuIcon className='h-16 w-16' /> Devices
          </DialogTitle>
        </DialogHeader>

        {!loaded ? (
          <p className='text-13 text-ink-secondary'>Open a dataset first: device types are saved with the dataset.</p>
        ) : (
          <>
            <div className='flex gap-4 mb-12'>
              {(['types', 'deployments'] as const).map((t) => (
                <button key={t} type='button' onClick={() => setTab(t)}
                  className={cn('px-12 py-4 rounded text-13 border', tab === t ? 'bg-blue-600 text-white border-blue-600' : 'border-black/15 text-ink-secondary')}>
                  {t === 'types' ? 'Device types' : 'Deployments'}
                </button>
              ))}
            </div>

            {tab === 'types' ? (
              <div className='flex gap-16 flex-1 min-h-0'>
                <TypeList
                  customTypes={customTypes}
                  selectedId={selected.deviceTypeID}
                  onSelect={setSelectedId}
                  onNew={() => addType()}
                  onCustomize={() => addType(selected)}
                />
                <div className='flex-1 min-w-0 overflow-y-auto pr-8'>
                  {selectedIsBuiltIn ? (
                    <div className='mb-12 rounded bg-neutral-50 px-12 py-8 text-12 text-ink-secondary'>
                      Built-in device types can’t be changed. Use <b>Customize</b> to make your own version of this one.
                    </div>
                  ) : null}
                  <TypeEditor type={shown} readOnly={selectedIsBuiltIn} onChange={updateSelected}
                    basedOn={selected.derivedFrom ? allTypes.find((t) => t.deviceTypeID === selected.derivedFrom)?.deviceType : undefined}
                    onDelete={selectedIsBuiltIn ? undefined : deleteSelected} />
                </div>
              </div>
            ) : (
              <DeploymentAssignments allTypes={allTypes} unsavedTypes={dirty} />
            )}
          </>
        )}

        <DialogFooter className='mt-12 items-center'>
          {tab === 'types' && problems.length ? (
            <div className='mr-auto text-12 text-red-700 max-w-[640px] truncate' title={problems.join('\n')}>{problems[0]}</div>
          ) : null}
          <Button variant='outline' onClick={onClose}>{dirty ? 'Close without saving' : 'Close'}</Button>
          {tab === 'types' && loaded ? (
            <Button onClick={() => void onSave()} disabled={!dirty || saving || problems.length > 0}>
              {saving ? 'Saving…' : 'Save device types'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TypeList(props: {
  customTypes: DeviceType[]
  selectedId: string
  onSelect: (id: string) => void
  onNew: () => void
  onCustomize: () => void
}) {
  const { customTypes, selectedId, onSelect, onNew, onCustomize } = props
  const item = (t: DeviceType) => (
    <button key={t.deviceTypeID} type='button' onClick={() => onSelect(t.deviceTypeID)}
      className={cn('w-full text-left px-8 py-6 rounded text-13 truncate', t.deviceTypeID === selectedId ? 'bg-blue-100 text-blue-900' : 'hover:bg-neutral-100')}>
      {t.deviceType || 'Unnamed'}
    </button>
  )
  return (
    <div className='w-[240px] shrink-0 flex flex-col gap-8 overflow-y-auto'>
      <div className='text-11 font-semibold uppercase tracking-wide text-ink-secondary'>Built-in</div>
      <div className='space-y-2'>{BUILT_IN_DEVICE_TYPES.map(item)}</div>
      <div className='text-11 font-semibold uppercase tracking-wide text-ink-secondary mt-8'>This dataset</div>
      <div className='space-y-2'>
        {customTypes.length ? customTypes.map(item) : <p className='text-12 text-ink-secondary px-8'>None yet.</p>}
      </div>
      <div className='flex flex-col gap-6 mt-8'>
        <Button size='xsm' variant='outline' onClick={onCustomize}>Customize selected</Button>
        <Button size='xsm' variant='outline' onClick={onNew}>New device type</Button>
      </div>
    </div>
  )
}

function TypeEditor(props: {
  type: DeviceType
  readOnly: boolean
  basedOn?: string
  onChange: (change: (type: DeviceType) => DeviceType) => void
  onDelete?: () => void
}) {
  const { type, readOnly, basedOn, onChange, onDelete } = props
  const set = (patch: Partial<DeviceType>) => onChange((t) => ({ ...t, ...patch }))
  const attractors = type.attractors ?? []
  const targets = type.targets ?? []
  const sensors = type.sensors ?? []
  const powerSources = type.powerSources ?? []
  const setAttractor = (i: number, a: DeviceTypeAttractor) => set({ attractors: replace(attractors, i, a) })
  const setPower = (i: number, p: DeviceTypePowerSource) => set({ powerSources: replace(powerSources, i, p) })

  return (
    <div className='space-y-16 text-13'>
      <div className='grid grid-cols-2 gap-12'>
        <Field label='Name'>
          <TextInput value={type.deviceType} readOnly={readOnly} onChange={(v) => set({ deviceType: v })} />
        </Field>
        <Field label='Based on'>
          <div className='py-6 text-ink-secondary'>{basedOn ?? '—'}</div>
        </Field>
        <Field label='Maker'>
          <TextInput value={type.maker ?? ''} readOnly={readOnly} onChange={(v) => set({ maker: v || null })} />
        </Field>
        <Field label='Computer'>
          <TextInput value={type.computer ?? ''} readOnly={readOnly} onChange={(v) => set({ computer: v || null })} />
        </Field>
        <Field label='Hardware version'>
          <TextInput value={type.hardwareVersion ?? ''} readOnly={readOnly} placeholder='e.g. 5.1.0'
            onChange={(v) => set({ hardwareVersion: v || null })} />
        </Field>
        <Field label='Firmware version'>
          <TextInput value={type.firmware?.version ?? ''} readOnly={readOnly} placeholder='e.g. 6.1.2'
            onChange={(v) => set({ firmware: { ...type.firmware, version: v || null } })} />
        </Field>
      </div>

      <ListSection title='Attractors' hint='Zero or more, used at the same time.' readOnly={readOnly}
        onAdd={() => set({ attractors: [...attractors, { attractorType: '', hardwareVersion: null, attractorLocation: null, configuration: null, powerW: null }] })}>
        {attractors.map((a, i) => {
          const power = attractorPowerOptions(a.attractorType)
          return (
            <Row key={i} readOnly={readOnly} onRemove={() => set({ attractors: without(attractors, i) })}>
              <TextInput list='attractor-types' placeholder='Type, e.g. Mothbeam (UV)' value={a.attractorType ?? ''} readOnly={readOnly}
                onChange={(v) => {
                  const options = attractorPowerOptions(v)
                  // Choosing a Mothbeam suggests its hardware version.
                  setAttractor(i, { ...a, attractorType: v || null, hardwareVersion: a.hardwareVersion || options?.hardwareVersion || null })
                }} />
              <TextInput placeholder='Hardware version (optional)' value={a.hardwareVersion ?? ''} readOnly={readOnly}
                onChange={(v) => setAttractor(i, { ...a, hardwareVersion: v || null })} />
              <TextInput list='attractor-locations' placeholder='Location' value={a.attractorLocation ?? ''} readOnly={readOnly}
                onChange={(v) => setAttractor(i, { ...a, attractorLocation: v || null })} />
              {power ? (
                <select aria-label='Switches on' className='rounded border border-black/15 px-6 py-4 bg-transparent min-w-0'
                  disabled={readOnly} value={a.configuration ?? ''}
                  onChange={(e) => {
                    const option = power.options.find((o) => o.configuration === e.target.value)
                    setAttractor(i, { ...a, configuration: option?.configuration ?? null, powerW: option ? option.powerW : a.powerW })
                  }}>
                  {/* Hidden blank: nothing chosen yet shows an empty box, not a fake first choice. */}
                  <option value='' disabled hidden />
                  {power.options.map((o) => (
                    <option key={o.configuration} value={o.configuration} title={o.measured}>
                      {o.configuration}
                    </option>
                  ))}
                  {a.configuration && !power.options.some((o) => o.configuration === a.configuration) ? (
                    <option value={a.configuration}>{a.configuration}</option>
                  ) : null}
                </select>
              ) : null}
              <NumberInput placeholder='Power' unit='W' value={a.powerW} readOnly={readOnly}
                onChange={(v) => setAttractor(i, { ...a, powerW: v })} />
            </Row>
          )
        })}
      </ListSection>

      <ListSection title='Targets' hint='Zero or more: what creatures land on (sheet, tube, flower…).' readOnly={readOnly}
        onAdd={() => set({ targets: [...targets, { targetType: '', material: null, color: null, widthCm: null, heightCm: null, distanceCm: null }] })}>
        {targets.map((t, i) => (
          <Row key={i} readOnly={readOnly} onRemove={() => set({ targets: without(targets, i) })}>
            <TextInput list='target-types' placeholder='Type, e.g. sheet' value={t.targetType ?? ''} readOnly={readOnly}
              onChange={(v) => set({ targets: replace(targets, i, { ...t, targetType: v || null }) })} />
            <TextInput list='target-materials' placeholder='Material' value={t.material ?? ''} readOnly={readOnly}
              onChange={(v) => set({ targets: replace(targets, i, { ...t, material: v || null }) })} />
            <TextInput list='target-colors' placeholder='Color (optional)' value={t.color ?? ''} readOnly={readOnly}
              onChange={(v) => set({ targets: replace(targets, i, { ...t, color: v || null }) })} />
            <NumberInput placeholder='Width' unit='cm' value={t.widthCm} readOnly={readOnly}
              onChange={(v) => set({ targets: replace<DeviceTypeTarget>(targets, i, { ...t, widthCm: v }) })} />
            <NumberInput placeholder='Height' unit='cm' value={t.heightCm} readOnly={readOnly}
              onChange={(v) => set({ targets: replace<DeviceTypeTarget>(targets, i, { ...t, heightCm: v }) })} />
            <NumberInput placeholder='Distance' unit='cm' value={t.distanceCm} readOnly={readOnly}
              onChange={(v) => set({ targets: replace<DeviceTypeTarget>(targets, i, { ...t, distanceCm: v }) })} />
          </Row>
        ))}
      </ListSection>

      <ListSection title='Sensors' hint='One or more.' readOnly={readOnly}
        onAdd={() => set({ sensors: [...sensors, { sensorType: 'camera', model: null, resolution: null, notes: null }] })}>
        {sensors.map((s, i) => (
          <Row key={i} readOnly={readOnly} canRemove={sensors.length > 1} onRemove={() => set({ sensors: without(sensors, i) })}>
            <select className='rounded border border-black/15 px-6 py-4 bg-transparent' value={s.sensorType} disabled={readOnly}
              onChange={(e) => set({ sensors: replace<DeviceTypeSensor>(sensors, i, { ...s, sensorType: e.target.value }) })}>
              {[...new Set([...SENSOR_TYPES, s.sensorType])].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <TextInput placeholder='Model' value={s.model ?? ''} readOnly={readOnly}
              onChange={(v) => set({ sensors: replace(sensors, i, { ...s, model: v || null }) })} />
            <TextInput placeholder='Resolution, e.g. 64 MP' value={s.resolution ?? ''} readOnly={readOnly}
              onChange={(v) => set({ sensors: replace(sensors, i, { ...s, resolution: v || null }) })} />
            <TextInput placeholder='Notes' value={s.notes ?? ''} readOnly={readOnly}
              onChange={(v) => set({ sensors: replace(sensors, i, { ...s, notes: v || null }) })} />
          </Row>
        ))}
      </ListSection>

      <ListSection title='Power sources' hint='Optional: one or more.' readOnly={readOnly}
        onAdd={() => set({ powerSources: [...powerSources, { powerSourceType: 'battery', model: null, capacityWh: null }] })}>
        {powerSources.map((p, i) => (
          <Row key={i} readOnly={readOnly} onRemove={() => set({ powerSources: without(powerSources, i) })}>
            <select aria-label='Power source type' className='rounded border border-black/15 px-6 py-4 bg-transparent' value={p.powerSourceType} disabled={readOnly}
              onChange={(e) => setPower(i, { ...p, powerSourceType: e.target.value })}>
              {[...new Set([...DEVICE_CHOICES.powerSourceTypes, p.powerSourceType])].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <TextInput list={p.powerSourceType === 'battery' ? 'battery-models' : undefined}
              placeholder={p.powerSourceType === 'battery' ? 'Model, e.g. Standard TalentCell PB120B1' : 'Model (optional)'}
              value={p.model ?? ''} readOnly={readOnly}
              onChange={(v) => {
                // A known battery fills in its capacity and voltages (where they're empty).
                const known = DEVICE_CHOICES.batteries.find((b) => b.model.toLowerCase() === v.trim().toLowerCase())
                setPower(i, {
                  ...p,
                  model: v || null,
                  capacityWh: p.capacityWh ?? known?.capacityWh ?? null,
                  nominalVoltageV: p.nominalVoltageV ?? known?.nominalVoltageV ?? null,
                  voltageAt80PercentV: p.voltageAt80PercentV ?? known?.voltageAt80PercentV ?? null,
                  voltageAt20PercentV: p.voltageAt20PercentV ?? known?.voltageAt20PercentV ?? null,
                })
              }} />
            {p.powerSourceType === 'battery' ? (
              <>
                <NumberInput placeholder='Capacity' unit='Wh' value={p.capacityWh} readOnly={readOnly}
                  onChange={(v) => setPower(i, { ...p, capacityWh: v })} />
                <NumberInput placeholder='Nominal' unit='V' value={p.nominalVoltageV} readOnly={readOnly}
                  onChange={(v) => setPower(i, { ...p, nominalVoltageV: v })} />
                <NumberInput placeholder='At 80% full' unit='V' value={p.voltageAt80PercentV} readOnly={readOnly}
                  onChange={(v) => setPower(i, { ...p, voltageAt80PercentV: v })} />
                <NumberInput placeholder='At 20% full' unit='V' value={p.voltageAt20PercentV} readOnly={readOnly}
                  onChange={(v) => setPower(i, { ...p, voltageAt20PercentV: v })} />
              </>
            ) : null}
          </Row>
        ))}
      </ListSection>

      <Field label='Description'>
        <textarea rows={3} className='w-full rounded border border-black/15 px-6 py-4 bg-transparent read-only:bg-neutral-50'
          placeholder='Notes about the whole device' value={type.description ?? ''} readOnly={readOnly}
          onChange={(e) => set({ description: e.target.value || null })} />
      </Field>

      <ChoiceList id='attractor-types' values={DEVICE_CHOICES.attractorTypes} />
      <ChoiceList id='attractor-locations' values={DEVICE_CHOICES.attractorLocations} />
      <ChoiceList id='target-types' values={DEVICE_CHOICES.targetTypes} />
      <ChoiceList id='target-materials' values={DEVICE_CHOICES.targetMaterials} />
      <ChoiceList id='target-colors' values={DEVICE_CHOICES.targetColors} />
      <ChoiceList id='battery-models' values={DEVICE_CHOICES.batteries.map((b) => b.model)} />

      {onDelete ? (
        <div className='pt-8'>
          <Button size='xsm' variant='outline' onClick={onDelete}>Delete this device type</Button>
        </div>
      ) : null}
    </div>
  )
}

function DeploymentAssignments(props: { allTypes: DeviceType[]; unsavedTypes: boolean }) {
  const { allTypes, unsavedTypes } = props
  const loaded = useStore(mothboxNextPackageStore)?.loaded
  const deployments = loaded?.deployments ?? []
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(deployments.map((d) => [d.deployment_id, d.device_type_id ?? ''])),
  )
  const [saving, setSaving] = useState(false)
  const changed = deployments.filter((d) => (d.device_type_id ?? '') !== (choices[d.deployment_id] ?? ''))
  const savedTypeIds = new Set([...BUILT_IN_DEVICE_TYPES, ...(loaded?.deviceTypes ?? [])].map((t) => t.deviceTypeID))

  async function onSave() {
    if (changed.some((d) => choices[d.deployment_id] && !savedTypeIds.has(choices[d.deployment_id]!))) {
      toast.error('Save the new device types first', { description: 'On the Device types tab, press Save device types.' })
      return
    }
    setSaving(true)
    try {
      await saveDeploymentDeviceTypes(Object.fromEntries(changed.map((d) => [d.deployment_id, choices[d.deployment_id] || null])))
      toast.success(`Device type saved for ${changed.length} deployment${changed.length === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex-1 min-h-0 overflow-y-auto text-13'>
      {unsavedTypes ? (
        <p className='mb-8 text-12 text-amber-700'>You have unsaved device types; save them on the Device types tab before choosing them here.</p>
      ) : null}
      <table className='w-full'>
        <thead>
          <tr className='text-left text-11 uppercase tracking-wide text-ink-secondary'>
            <th className='py-4 pr-12 font-semibold'>Deployment</th>
            <th className='py-4 pr-12 font-semibold'>Device</th>
            <th className='py-4 font-semibold'>Device type</th>
          </tr>
        </thead>
        <tbody>
          {deployments.map((d) => (
            <tr key={d.deployment_id} className='border-t border-black/5'>
              <td className='py-6 pr-12 truncate max-w-[360px]' title={d.deployment_id}>{d.deployment_id}</td>
              <td className='py-6 pr-12'>{d.device_name ?? d.device_id_from_folder ?? d.device_id ?? '—'}</td>
              <td className='py-6'>
                <select className='rounded border border-black/15 px-6 py-4 bg-transparent min-w-[240px]'
                  value={choices[d.deployment_id] ?? ''}
                  onChange={(e) => setChoices({ ...choices, [d.deployment_id]: e.target.value })}>
                  <option value=''>Not set</option>
                  {allTypes.map((t) => <option key={t.deviceTypeID} value={t.deviceTypeID}>{t.deviceType || 'Unnamed'}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!deployments.length ? <p className='text-ink-secondary'>This dataset has no deployment records.</p> : null}
      <div className='mt-12'>
        <Button size='xsm' onClick={() => void onSave()} disabled={!changed.length || saving}>
          {saving ? 'Saving…' : `Save device types for ${changed.length} deployment${changed.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}

function ChoiceList(props: { id: string; values: readonly string[] }) {
  return (
    <datalist id={props.id}>
      {props.values.map((v) => <option key={v} value={v} />)}
    </datalist>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className='block'>
      <span className='block text-11 font-semibold uppercase tracking-wide text-ink-secondary mb-2'>{props.label}</span>
      {props.children}
    </label>
  )
}

function ListSection(props: { title: string; hint: string; readOnly: boolean; onAdd: () => void; children: React.ReactNode }) {
  return (
    <section>
      <div className='flex items-baseline gap-8 mb-6'>
        <h4 className='text-13 font-semibold'>{props.title}</h4>
        <span className='text-11 text-ink-secondary'>{props.hint}</span>
        {!props.readOnly ? (
          <button type='button' onClick={props.onAdd} className='ml-auto flex items-center gap-4 text-12 text-blue-600 hover:underline'>
            <PlusIcon className='h-12 w-12' /> Add
          </button>
        ) : null}
      </div>
      <div className='space-y-6'>{props.children}</div>
    </section>
  )
}

function Row(props: { readOnly: boolean; canRemove?: boolean; onRemove: () => void; children: React.ReactNode }) {
  const canRemove = props.canRemove !== false
  return (
    <div className='flex items-center gap-6'>
      <div className='flex-1 grid grid-flow-col auto-cols-fr gap-6'>{props.children}</div>
      {!props.readOnly ? (
        <button type='button' onClick={props.onRemove} disabled={!canRemove}
          title={canRemove ? 'Remove' : 'A device needs at least one sensor'}
          className='p-4 text-ink-secondary hover:text-red-700 disabled:opacity-30'>
          <Trash2Icon className='h-14 w-14' />
        </button>
      ) : null}
    </div>
  )
}

function TextInput(props: { value: string; onChange: (v: string) => void; readOnly?: boolean; placeholder?: string; list?: string }) {
  return (
    <input type='text' className='w-full min-w-0 rounded border border-black/15 px-6 py-4 bg-transparent read-only:bg-neutral-50'
      value={props.value} readOnly={props.readOnly} placeholder={props.placeholder} list={props.list}
      onChange={(e) => props.onChange(e.target.value)} />
  )
}

function NumberInput(props: { value?: number | null; onChange: (v: number | null) => void; readOnly?: boolean; placeholder?: string; unit: string }) {
  return (
    <div className='flex items-center gap-4 min-w-0'>
      <input type='number' min={0} step='any' className='w-full min-w-0 rounded border border-black/15 px-6 py-4 bg-transparent read-only:bg-neutral-50'
        value={props.value ?? ''} readOnly={props.readOnly} placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value === '' ? null : Number(e.target.value))} />
      <span className='text-11 text-ink-secondary'>{props.unit}</span>
    </div>
  )
}

function without<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

function replace<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
