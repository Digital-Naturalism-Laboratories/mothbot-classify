import { DownloadIcon } from 'lucide-react'
import { useState } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from '~/components/ui/context-menu'
import { useStandardizedImageDownloadUrl } from '~/utils/use-standardized-image-download-url'

type HandleLike = { getFile?: () => Promise<File> }

export type PatchDownloadContextMenuProps = {
  children: React.ReactNode
  file?: File | null
  handle?: HandleLike | unknown
  originalUrl?: string | null
  originalDownloadName?: string | null
  maxLongSide?: number
  menuLabel?: string
}

const DEFAULT_MAX_LONG_SIDE = 1000

export function PatchDownloadContextMenu(props: PatchDownloadContextMenuProps) {
  const { children, file, handle, originalUrl, originalDownloadName, maxLongSide = DEFAULT_MAX_LONG_SIDE, menuLabel = 'Patch download options' } = props
  const [shouldPrepareDownload, setShouldPrepareDownload] = useState(false)

  const standardizedUrl = useStandardizedImageDownloadUrl(
    shouldPrepareDownload ? file : undefined,
    shouldPrepareDownload ? handle : undefined,
    maxLongSide,
  )
  const resolvedOriginalDownloadName = (originalDownloadName ?? '').trim() || 'patch.jpg'
  const standardizedDownloadName = getStandardizedDownloadFilename(resolvedOriginalDownloadName, maxLongSide)

  function onOpenChange(open: boolean) {
    if (open) setShouldPrepareDownload(true)
  }

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='w-[220px]'>
        <ContextMenuItem
          icon={<DownloadIcon className='h-14 w-14' />}
          disabled={!originalUrl}
          onSelect={() => downloadBlobUrl({ url: originalUrl, filename: resolvedOriginalDownloadName })}
        >
          Download original
        </ContextMenuItem>
        <ContextMenuItem
          icon={<DownloadIcon className='h-14 w-14' />}
          disabled={!standardizedUrl}
          onSelect={() => downloadBlobUrl({ url: standardizedUrl, filename: standardizedDownloadName })}
        >
          Download 1000px
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function downloadBlobUrl(params: { url?: string | null; filename: string }) {
  const { url, filename } = params
  if (!url) return

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noreferrer'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function getStandardizedDownloadFilename(filename: string, maxLongSide: number) {
  const sanitized = filename.trim()
  if (!sanitized) return `patch-${maxLongSide}px.jpg`

  const extensionMatch = sanitized.match(/\.[^./]+$/)
  const extension = extensionMatch?.[0] ?? ''
  const basename = extension ? sanitized.slice(0, -extension.length) : sanitized

  return `${basename}-${maxLongSide}px.jpg`
}
