import { Slider } from '~/components/ui/slider'

type LabeledSliderControlProps = {
  label: string
  value: string
  sliderValue: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}

export function LabeledSliderControl(props: LabeledSliderControlProps) {
  const { label, value, sliderValue, min, max, step, disabled = false, onChange } = props

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-8'>
        <span className='text-12 font-medium text-ink-primary'>{label}</span>
        <span className='text-12 text-neutral-600'>{value}</span>
      </div>

      <Slider
        value={[sliderValue]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(values) => {
          const nextValue = getSliderValue({ values })
          if (nextValue == null) return
          onChange(nextValue)
        }}
      />
    </div>
  )
}

function getSliderValue(params: { values: number[] }) {
  const { values } = params
  const nextValue = values?.[0]
  if (typeof nextValue !== 'number') return null
  return nextValue
}
