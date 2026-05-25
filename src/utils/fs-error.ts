const NOT_FOUND_MESSAGE =
  'A requested file or directory could not be found at the time an operation was processed'

const NOT_FOUND_ON_DISK = 'not found on disk'

const MISSING_ON_DISK_HINT =
  'A file or folder in this dataset is missing on disk (moved, deleted, or still downloading from iCloud). Re-select the datasets folder in the menu, then run Set up or Refresh datasets on this package.'

export function isFilesystemNotFoundError(err: unknown): boolean {
  const name = (err as { name?: string })?.name
  if (name === 'NotFoundError') return true

  const message = err instanceof Error ? err.message : String(err ?? '')
  return message.includes(NOT_FOUND_MESSAGE) || message.includes(NOT_FOUND_ON_DISK)
}

export function formatFilesystemError(err: unknown): string {
  if (isFilesystemNotFoundError(err)) return MISSING_ON_DISK_HINT

  return err instanceof Error ? err.message : String(err)
}

export function formatFilesystemPathError(params: { path: string; err: unknown }): string {
  const { path, err } = params
  return `${path}: ${formatFilesystemError(err)}`
}
