import { DownloadIcon, FoldVerticalIcon, ImageIcon, MoreHorizontal, UnfoldVerticalIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '~/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { exportScopeDarwinCSV } from '~/features/data-flow/4.export/export-orchestrator'
import { VisualizationDialog } from '~/features/data-flow/4.export/visualization/visualization-dialog'
import type { LeafGroupEntity } from '~/stores/entities/leaf-groups'
import { toast } from 'sonner'
// import { exportScopeRS } from '~/features/data-flow/4.export/export-orchestrator'

export type ProjectsTreeRowContextMenuProps = {
  scope: 'site' | 'deployment' | 'night'
  id: string
  nights: Record<string, LeafGroupEntity>
  children: ReactNode
}

export function ProjectsTreeRowContextMenu(props: ProjectsTreeRowContextMenuProps) {
  const { scope, id, nights, children } = props
  const [vizOpen, setVizOpen] = useState(false)

  const initialLeafGroupIds = scope === 'night' ? [id] : Object.keys(nights)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className='w-[200px]'>
          <ContextMenuItem
            icon={<DownloadIcon className='h-14 w-14' />}
            onSelect={() => {
              const p = exportScopeDarwinCSV({ scope, id, nights })
              toast.promise(p, { loading: '💾 Exporting DwC…', success: '✅ DwC exported', error: '🚨 Failed to export DwC' })
            }}
          >
            Export DwC
          </ContextMenuItem>
          <ContextMenuItem
            icon={<ImageIcon className='h-14 w-14' />}
            onSelect={() => setVizOpen(true)}
          >
            Export Visualization
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <VisualizationDialog
        open={vizOpen}
        onClose={() => setVizOpen(false)}
        initialLeafGroupIds={initialLeafGroupIds}
      />
    </>
  )
}

export type DatasetHeaderMenuProps = {
  projectId: string
  nights: Record<string, LeafGroupEntity>
  onExpandAll: () => void
  onCollapseAll: () => void
  menuAlign?: 'start' | 'end'
}

export function DatasetHeaderMenu(props: DatasetHeaderMenuProps) {
  const { projectId, nights, onExpandAll, onCollapseAll, menuAlign = 'start' } = props
  const [vizOpen, setVizOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='xsm' type='button' className='min-w-28 px-4' aria-label='More options'>
            <MoreHorizontal className='h-14 w-14' aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={menuAlign} sideOffset={4}>
          <DropdownMenuItem onClick={onExpandAll}>
            <DropdownMenuItemLabel icon={<UnfoldVerticalIcon className='h-14 w-14' />} label='Expand all' />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCollapseAll}>
            <DropdownMenuItemLabel icon={<FoldVerticalIcon className='h-14 w-14' />} label='Collapse all' />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              const p = exportScopeDarwinCSV({ scope: 'project', id: projectId, nights })
              toast.promise(p, { loading: '💾 Exporting DwC…', success: '✅ DwC exported', error: '🚨 Failed to export DwC' })
            }}
          >
            <DropdownMenuItemLabel icon={<DownloadIcon className='h-14 w-14' />} label='Export DwC' />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setVizOpen(true)}>
            <DropdownMenuItemLabel icon={<ImageIcon className='h-14 w-14' />} label='Export Visualization' />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VisualizationDialog
        open={vizOpen}
        onClose={() => setVizOpen(false)}
        initialLeafGroupIds={Object.keys(nights)}
      />
    </>
  )
}

type DropdownMenuItemLabelProps = {
  icon: ReactNode
  label: string
}

function DropdownMenuItemLabel(props: DropdownMenuItemLabelProps) {
  const { icon, label } = props

  return (
    <span className='inline-flex items-center gap-8'>
      <span className='flex h-14 w-14 shrink-0 items-center justify-center text-neutral-500'>{icon}</span>
      {label}
    </span>
  )
}

