import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '~/utils/cn'

export type ExpandDisclosureToggleProps = {
  expanded: boolean
  panelId: string
  onToggle: () => void
  label: string
  className?: string
}

export function ExpandDisclosureToggle(props: ExpandDisclosureToggleProps) {
  const { expanded, panelId, onToggle, label, className } = props
  const Icon = expanded ? ChevronDown : ChevronRight

  return (
    <button
      type='button'
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      aria-label={label}
      className={cn(
        'flex h-28 w-28 shrink-0 items-center justify-center rounded-md text-neutral-500',
        'hover:bg-neutral-100 hover:text-neutral-800',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
        className,
      )}
    >
      <Icon className='h-16 w-16' aria-hidden />
    </button>
  )
}

type ExpandDisclosureTitleRowCollapsibleProps = {
  collapsible: true
  expanded: boolean
  panelId: string
  onToggle: () => void
  expandAriaLabel: string
  collapseAriaLabel: string
  titleClassName?: string
  className?: string
  children: ReactNode
}

type ExpandDisclosureTitleRowStaticProps = {
  collapsible: false
  titleClassName?: string
  className?: string
  children: ReactNode
}

export type ExpandDisclosureTitleRowProps =
  | ExpandDisclosureTitleRowCollapsibleProps
  | ExpandDisclosureTitleRowStaticProps

export function ExpandDisclosureTitleRow(props: ExpandDisclosureTitleRowProps) {
  if (props.collapsible) {
    const { expanded, panelId, onToggle, expandAriaLabel, collapseAriaLabel, titleClassName, className, children } = props

    return (
      <div className={cn('flex min-w-0 items-center gap-2', className)}>
        <ExpandDisclosureToggle
          expanded={expanded}
          panelId={panelId}
          onToggle={onToggle}
          label={expanded ? collapseAriaLabel : expandAriaLabel}
        />
        <div className={cn('min-w-0', titleClassName)}>{children}</div>
      </div>
    )
  }

  const { titleClassName, className, children } = props

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className={cn('min-w-0', titleClassName)}>{children}</div>
    </div>
  )
}

export type ExpandDisclosurePanelProps = {
  id: string
  hidden: boolean
  className?: string
  children: ReactNode
}

export function ExpandDisclosurePanel(props: ExpandDisclosurePanelProps) {
  const { id, hidden, className, children } = props

  return (
    <div id={id} hidden={hidden} className={className}>
      {children}
    </div>
  )
}

export function expandDisclosurePanelId(params: { namespace: string; segment: string; entityId: string }) {
  const { namespace, segment, entityId } = params
  const token = encodeURIComponent(entityId).replace(/%/g, '_')
  return `${namespace}-${segment}-${token}`
}
