import { Progress } from '~/components/ui/progress'

export type InlineProgressProps = { total: number; identified: number }

export function InlineProgress(props: InlineProgressProps) {
  const { total, identified } = props

  const pct = total ? Math.round((identified / total) * 100) : 0
  const isComplete = identified === total && total > 0

  return (
    <div
      className='inline-flex shrink-0 items-center gap-8 text-12 tabular-nums text-neutral-600'
      aria-label={`${identified} of ${total} identified`}
    >
      <span className='w-[5rem] shrink-0 text-right'>{identified}/{total}</span>
      <div className='h-4 w-20 shrink-0'>
        <Progress value={pct} indicatorClassName={isComplete ? 'bg-green-500' : undefined} className='h-4 w-full' />
      </div>
    </div>
  )
}
