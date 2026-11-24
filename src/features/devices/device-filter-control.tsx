import { useStore } from '@nanostores/react'
import { useEffect, useMemo } from 'react'
import { CpuIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Icon } from '~/components/atomic/Icon'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import { cn } from '~/utils/cn'
import { useDeploymentDeviceFeatures } from './use-deployment-device-features'
import {
  describeDeviceFilter,
  deviceFilterOptions,
  deviceViewStore,
  EMPTY_DEVICE_FILTER,
  isDeviceFilterActive,
  type DeviceFilter,
  type DeviceFilterOption,
} from './device-filter'

type ListKey = keyof DeviceFilter

/**
 * "Devices" menu on the project page: show only some device types, or only deployments
 * whose device has a kind of attractor, target or sensor (e.g. UV), and group by device type.
 */
export function DeviceFilterControl(props: { className?: string }) {
  const view = useStore(deviceViewStore)
  const active = useStore(mothboxNextPackageStore)
  const features = useDeploymentDeviceFeatures()
  const options = useMemo(() => deviceFilterOptions([...features.values()]), [features])
  const filterOn = isDeviceFilterActive(view.filter)

  // A filter belongs to the project it was set in.
  const packageKey = active?.packageRoot ?? ''
  useEffect(() => {
    deviceViewStore.set({ filter: EMPTY_DEVICE_FILTER, groupByDeviceType: false })
  }, [packageKey])

  if (!features.size) return null

  function toggle(key: ListKey, value: string) {
    const current = deviceViewStore.get()
    const list = current.filter[key]
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    deviceViewStore.set({ ...current, filter: { ...current.filter, [key]: next } })
  }

  const section = (title: string, key: ListKey, list: DeviceFilterOption[]) =>
    list.length ? (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className='text-12 font-medium text-neutral-500'>{title}</DropdownMenuLabel>
        {list.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={view.filter[key].includes(option.value)}
            onSelect={(e) => {
              e.preventDefault()
              toggle(key, option.value)
            }}
          >
            <span className='min-w-0 flex-1 truncate'>{option.label}</span>
            <span className='ml-8 shrink-0 text-12 text-neutral-400'>{option.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </>
    ) : null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          className={cn(
            'inline-flex min-w-0 items-center gap-6 rounded-md px-8 py-4 text-left text-13 transition-colors hover:bg-neutral-100',
            filterOn ? 'bg-blue-50 text-blue-800' : 'text-neutral-600',
            props.className,
          )}
        >
          <Icon icon={CpuIcon} className='shrink-0 opacity-70' />
          <span className='truncate'>{filterOn ? `Devices: ${describeDeviceFilter(view.filter, options)}` : 'Devices: all'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-280'>
        <DropdownMenuCheckboxItem
          checked={view.groupByDeviceType}
          onSelect={(e) => {
            e.preventDefault()
            deviceViewStore.set({ ...deviceViewStore.get(), groupByDeviceType: !deviceViewStore.get().groupByDeviceType })
          }}
        >
          Group deployments by device type
        </DropdownMenuCheckboxItem>
        {section('Device type', 'deviceTypeIDs', options.deviceTypes)}
        {section('Attractor', 'attractorTypes', options.attractorTypes)}
        {section('Target', 'targetTypes', options.targetTypes)}
        {section('Sensor', 'sensorTypes', options.sensorTypes)}
        {section('Power source', 'powerSourceTypes', options.powerSourceTypes)}
        {filterOn ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => deviceViewStore.set({ ...deviceViewStore.get(), filter: EMPTY_DEVICE_FILTER })}>
              Show all devices
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
