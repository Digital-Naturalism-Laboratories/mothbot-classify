import { toast } from 'sonner'
import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

export function isDirectoryPickerAvailable(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown })?.showDirectoryPicker === 'function'
}

/**
 * Always true: the button should never be permanently disabled based on
 * this check. Some Firefox builds don't expose `showDirectoryPicker` at all
 * (vs. exposing it but blocking the call outside a user gesture, which is a
 * separate case handled in pickDirectoryHandle's catch block). Leaving the
 * button enabled lets pickDirectoryHandle surface a clear, actionable error
 * instead of the button looking permanently broken.
 */
export function isDirectoryPickerLikelySupported(): boolean {
  return true
}

export async function pickDirectoryHandle(params: {
  mode: 'read' | 'readwrite'
  title: string
}): Promise<FileSystemDirectoryHandleLike | null> {
  const { mode, title } = params

  if (!isDirectoryPickerAvailable()) {
    toast.error('Folder picker is not supported in this browser', {
      description:
        'This feature needs the File System Access API (showDirectoryPicker). Try the latest Chrome or Edge, or check that Firefox is fully up to date.',
    })
    return null
  }

  try {
    const handle = await (
      window as unknown as {
        showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>
      }
    ).showDirectoryPicker?.({ mode })

    return handle ?? null
  } catch (err) {
    if (isAbortError(err)) return null
    // Firefox throws SecurityError when showDirectoryPicker is called outside
    // a trusted user-gesture context (e.g. after an await broke the gesture
    // chain). Surface a friendlier message instead of the raw DOMException.
    if (isSecurityError(err)) {
      throw new Error(
        `Folder picker was blocked by the browser. Make sure you click the button directly (${title}).`,
      )
    }
    throw new Error(`Could not open folder picker (${title}): ${String(err)}`)
  }
}

function isAbortError(err: unknown) {
  return (err as { name?: string })?.name === 'AbortError'
}

function isSecurityError(err: unknown) {
  const name = (err as { name?: string })?.name
  return name === 'SecurityError' || name === 'NotAllowedError'
}
