import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { cn } from '~/utils/cn'
import { LabeledSliderControl } from '~/components/atomic/labeled-slider-control'

export const patchColumnsStore = atom<number>(6)

export function setPatchColumns(value: number) {
  const clamped = Math.max(1, Math.min(12, Math.round(value || 1)))
  patchColumnsStore.set(clamped)
}

type PatchSizeControlProps = {
  className?: string
  compact?: boolean
}

export function PatchSizeControl(props: PatchSizeControlProps) {
  const { className, compact = false } = props
  const columns = useStore(patchColumnsStore)
  const value = `${columns} col`

  return (
    <div className={cn('space-y-6', className)}>
      {compact ? null : <h3 className='text-16 font-semibold'>Grid columns</h3>}

      <LabeledSliderControl
        label='Grid columns'
        value={value}
        sliderValue={columns}
        min={1}
        max={12}
        step={1}
        onChange={setPatchColumns}
      />
    </div>
  )
}
