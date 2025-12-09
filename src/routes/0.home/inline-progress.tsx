import { Progress } from '~/components/ui/progress'

export type InlineProgressProps = { total: number; identified: number }

export function InlineProgress(props: InlineProgressProps) {
  const { total, identified } = props

  const pct = total ? Math.round((identified / total) * 100) : 0
  const isComplete = identified === total && total > 0

  return (
    <div className='flex items-center gap-8 text-12 text-neutral-600'>
      <span>
        {identified}/{total}
      </span>
      <div className='w-[80px]'>
        <Progress value={pct} indicatorClassName={isComplete ? 'bg-green-500' : undefined} />
      </div>
    </div>
  )
}
