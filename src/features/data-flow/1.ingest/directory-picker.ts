import type { FileSystemDirectoryHandleLike } from '~/features/mothbox-next/adapters/dinalab-mothbox-v1/browser-adapter-io'

export function isDirectoryPickerAvailable(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown })?.showDirectoryPicker === 'function'
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
    throw new Error(`Could not open folder picker (${title}): ${String(err)}`)
  }
}

function isAbortError(err: unknown) {
  return (err as { name?: string })?.name === 'AbortError'
}
