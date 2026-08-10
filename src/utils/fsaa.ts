export type FileSystemDirectoryHandleLike = {
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>
}

export type FileSystemFileHandleLike = {
  createWritable?: () => Promise<{ write: (data: any) => Promise<void>; close: () => Promise<void> }>
}

/** Splits "a.b.png" into { stem: "a.b", ext: ".png" }. No dot ⇒ empty ext. */
function splitFileName(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return { stem: fileName, ext: '' }
  return { stem: fileName.slice(0, dot), ext: fileName.slice(dot) }
}

async function fileExists(dir: FileSystemDirectoryHandleLike, fileName: string) {
  try {
    await dir.getFileHandle?.(fileName, { create: false })
    return true
  } catch {
    // NotFoundError (and anything else we can't inspect) ⇒ treat the name as free.
    return false
  }
}

/**
 * Returns `fileName` if nothing by that name exists in the target folder, else
 * the first free `stem_2.ext`, `stem_3.ext`, … so exports become versions
 * instead of silently clobbering the previous file.
 *
 * Best-effort: if the folder can't be traversed (it doesn't exist yet, or the
 * handle lacks the APIs), the original name is returned unchanged.
 */
export async function fsaaResolveAvailableFileName(
  root: FileSystemDirectoryHandleLike,
  path: string[],
  options?: { maxAttempts?: number },
): Promise<string[]> {
  const maxAttempts = options?.maxAttempts ?? 999
  const fileName = path[path.length - 1]
  const dirParts = path.slice(0, -1)
  if (!fileName || !root?.getDirectoryHandle || !root?.getFileHandle) return path

  let dir: FileSystemDirectoryHandleLike | undefined = root
  for (const part of dirParts) {
    try {
      dir = await dir?.getDirectoryHandle?.(part, { create: false })
    } catch {
      // Folder doesn't exist yet ⇒ nothing to collide with.
      return path
    }
    if (!dir) return path
  }

  if (!(await fileExists(dir, fileName))) return path

  const { stem, ext } = splitFileName(fileName)
  for (let n = 2; n < maxAttempts + 2; n++) {
    const candidate = `${stem}_${n}${ext}`
    if (!(await fileExists(dir, candidate))) return [...dirParts, candidate]
  }

  return path
}

export async function fsaaWriteText(root: FileSystemDirectoryHandleLike, path: string[], content: string) {
  if (!root?.getDirectoryHandle || !root?.getFileHandle) return

  const fileName = path[path.length - 1]
  const dirParts = path.slice(0, -1)

  let dir = root
  for (const part of dirParts) {
    dir = (await dir.getDirectoryHandle?.(part, { create: true })) as any
    if (!dir) return
  }

  const fh = (await dir.getFileHandle?.(fileName, { create: true })) as FileSystemFileHandleLike
  const writable = await fh?.createWritable?.()
  if (!writable) return

  await writable.write(content)
  await writable.close()
}

export async function fsaaWriteBytes(root: FileSystemDirectoryHandleLike, path: string[], content: Uint8Array | ArrayBuffer | Blob) {
  if (!root?.getDirectoryHandle || !root?.getFileHandle) return

  const fileName = path[path.length - 1]
  const dirParts = path.slice(0, -1)

  let dir = root
  for (const part of dirParts) {
    dir = (await dir.getDirectoryHandle?.(part, { create: true })) as any
    if (!dir) return
  }

  const fh = (await dir.getFileHandle?.(fileName, { create: true })) as FileSystemFileHandleLike
  const writable = await fh?.createWritable?.()
  if (!writable) return

  const toWrite = content instanceof Blob ? content : content instanceof ArrayBuffer ? new Uint8Array(content) : (content as Uint8Array)

  await writable.write(toWrite)
  await writable.close()
}
