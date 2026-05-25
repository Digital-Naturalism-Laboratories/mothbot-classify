import { formatInteger, Number } from '~/components/atomic/number'
import { Progress } from '~/components/ui/progress'

export const DATASET_PROGRESS_BAR_WIDTH_PX = 128
export const TREE_PROGRESS_BAR_WIDTH_PX = 80

export type InlineProgressProps = {
  total: number
  identified: number
  barWidthPx?: number
}

export function InlineProgress(props: InlineProgressProps) {
  const { total, identified, barWidthPx = TREE_PROGRESS_BAR_WIDTH_PX } = props

  const pct = total ? Math.round((identified / total) * 100) : 0
  const isComplete = identified === total && total > 0

  return (
    <div
      className='inline-flex shrink-0 items-center gap-8 text-12 text-neutral-600'
      aria-label={`${formatInteger(identified)} of ${formatInteger(total)} identified`}
    >
      <span className='inline-flex min-w-[7rem] shrink-0 items-baseline justify-end text-12'>
        <Number value={identified} mono format />
        <span className='font-mono tabular-nums'>/</span>
        <Number value={total} mono format />
      </span>
      <div className='h-6 shrink-0' style={{ width: barWidthPx }}>
        <Progress value={pct} indicatorClassName={isComplete ? 'bg-green-500' : undefined} className='h-6 w-full' />
      </div>
    </div>
  )
}
