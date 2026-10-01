import { formatInteger, Number } from '~/components/atomic/number'
import { Progress } from '~/components/ui/progress'
import type { ProgressCounts } from './projects-progress'

export const DATASET_PROGRESS_BAR_WIDTH_PX = 128
export const TREE_PROGRESS_BAR_WIDTH_PX = 80

export type InlineProgressProps = {
  total: number
  identified: number
  barWidthPx?: number
  /** Newest detector and latest dates, shown as a small label before the counts. */
  activity?: ProgressCounts
}

function shortDetector(id: string) {
  return id.replace(/\.pt$/, '').replace(/^Mothbot_/, '')
}

function shortDate(ms: number) {
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** "MBD-1-1 · clustered Jul 5 · last ID Sep 29" — empty when the night's details aren't loaded. */
function ActivityLabel(props: { activity?: ProgressCounts }) {
  const a = props.activity
  if (!a) return null
  const parts: string[] = []
  if (a.newestDetector) parts.push(shortDetector(a.newestDetector))
  if (a.clusteredAt) parts.push(`clustered ${shortDate(a.clusteredAt)}`)
  if (a.lastIdentifiedAt) parts.push(`last ID ${shortDate(a.lastIdentifiedAt)}`)
  if (!parts.length) return null
  const runs = a.detectorIds ?? []
  const title = [
    runs.length ? `Detection runs: ${runs.map(shortDetector).join(', ')}${runs.length > 1 ? ' (newest shown)' : ''}` : '',
    a.clusteredAt ? `Clustered by Mothbot Process: ${new Date(a.clusteredAt).toLocaleString()} (as of when the dataset was loaded)` : '',
    a.lastIdentifiedAt ? `Last identification in Classify: ${new Date(a.lastIdentifiedAt).toLocaleString()}` : '',
  ].filter(Boolean).join('\n')
  return (
    <span className='hidden min-w-0 truncate text-11 text-neutral-400 lg:inline' title={title}>
      {parts.join(' · ')}
    </span>
  )
}

export function InlineProgress(props: InlineProgressProps) {
  const { total, identified, barWidthPx = TREE_PROGRESS_BAR_WIDTH_PX, activity } = props

  const pct = total ? Math.round((identified / total) * 100) : 0
  const isComplete = identified === total && total > 0

  return (
    <div
      className='inline-flex shrink-0 items-center gap-8 text-12 text-neutral-600'
      aria-label={`${formatInteger(identified)} of ${formatInteger(total)} identified`}
    >
      <ActivityLabel activity={activity} />
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
