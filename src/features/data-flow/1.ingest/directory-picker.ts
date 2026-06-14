import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

export function isDirectoryPickerAvailable(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown })?.showDirectoryPicker === 'function'
}

/**
 * Returns true when the browser supports the File System Access API
 * (`showDirectoryPicker`) BUT gates it behind a user-gesture requirement
 * that isn't met in the current context.
 *
 * Firefox 111+ ships `showDirectoryPicker` but only allows it to be called
 * from a trusted user-gesture event (click/keypress). When the function
 * exists yet the call throws a `SecurityError` or `NotAllowedError`, that
 * means the browser *has* the API but the picker wasn't triggered from an
 * appropriate user gesture — not that the API is missing altogether.
 *
 * This helper lets callers distinguish "API not supported" (show a warning)
 * from "API available" (show the button, let the browser decide at click time).
 */
export function isDirectoryPickerLikelySupported(): boolean {
  // If the function exists at all, show the button — Firefox will enforce
  // the gesture requirement at call time, which is fine.
  return isDirectoryPickerAvailable()
}

export async function pickDirectoryHandle(params: {
  mode: 'read' | 'readwrite'
  title: string
}): Promise<FileSystemDirectoryHandleLike | null> {
  const { mode, title } = params
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
    // a trusted user-gesture context. Surface a friendlier message instead of
    // the raw DOMException.
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
