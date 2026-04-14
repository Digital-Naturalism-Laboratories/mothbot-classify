import { MoreHorizontal } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { exportScopeDarwinCSV } from '~/features/data-flow/4.export/export-orchestrator'
import type { NightEntity } from '~/stores/entities/4.nights'
import { toast } from 'sonner'
// import { exportScopeRS } from '~/features/data-flow/4.export/export-orchestrator'

export type ExportDwCDropdownProps = {
  scope: 'project' | 'site' | 'deployment' | 'night'
  id: string
  nights: Record<string, NightEntity>
  /** Radix `align` for the menu panel (use `start` beside catalog buttons, `end` for trailing row actions). */
  menuAlign?: 'start' | 'end'
}

export function ExportDwCDropdown(props: ExportDwCDropdownProps) {
  const { scope, id, nights, menuAlign = 'end' } = props

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='xxsm' type='button' className='min-w-24 px-4' aria-label='More options'>
          <MoreHorizontal className='h-14 w-14' aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={menuAlign} sideOffset={4}>
        <DropdownMenuItem
          onClick={() => {
            const p = exportScopeDarwinCSV({ scope, id, nights })
            toast.promise(p, { loading: '💾 Exporting DwC…', success: '✅ DwC exported', error: '🚨 Failed to export DwC' })
          }}
        >
          Export DwC
        </DropdownMenuItem>
        {/* Future: Export RS via exportScopeRS */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
      <ExportDwCDropdown scope={scope} id={id} nights={nights} />
    </div>
  )
}

export {}
