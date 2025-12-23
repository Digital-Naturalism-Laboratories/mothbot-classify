import { Button } from '~/components/ui/button'
import { toast } from 'sonner'
import type { NightEntity } from '~/stores/entities/4.nights'
import { exportScopeDarwinCSV } from './item-actions-helpers'
// import { exportScopeRS } from './item-actions-helpers'

export type ItemActionsProps = { scope: 'project' | 'site' | 'deployment' | 'night'; id: string; nights: Record<string, NightEntity> }

export function ItemActions(props: ItemActionsProps) {
  const { scope, id, nights } = props

  return (
    <div
      className={
        scope === 'project'
          ? 'opacity-0 group-hover/project:opacity-100 transition-opacity flex items-center gap-6'
          : scope === 'site'
          ? 'opacity-0 group-hover/site:opacity-100 transition-opacity flex items-center gap-6'
          : scope === 'deployment'
          ? 'opacity-0 group-hover/deployment:opacity-100 transition-opacity flex items-center gap-6'
          : 'opacity-0 group-hover/night:opacity-100 transition-opacity flex items-center gap-6'
      }
    >
      <Button
        size='sm'
        variant='ghost'
        onClick={() => {
          const p = exportScopeDarwinCSV({ scope, id, nights })
          toast.promise(p, { loading: '💾 Exporting DwC…', success: '✅ DwC exported', error: '🚨 Failed to export DwC' })
        }}
      >
        Export DwC
      </Button>
      {/* <Button
        size='sm'
        variant='ghost'
        onClick={() => {
          const p = exportScopeRS({ scope, id, nights })
          toast.promise(p, { loading: '💾 Exporting RS…', success: '✅ RS exported', error: '🚨 Failed to export RS' })
        }}
      >
        Export RS
      </Button> */}
    </div>
  )
}

export {}
