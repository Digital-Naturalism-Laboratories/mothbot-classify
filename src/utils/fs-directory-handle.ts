export type FileSystemDirectoryHandleLike = {
  name?: string
  kind?: string
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>
  queryPermission?: (options: {
    mode: 'read' | 'readwrite'
  }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  requestPermission?: (options: {
    mode: 'read' | 'readwrite'
  }) => Promise<'granted' | 'denied' | 'prompt'> | 'granted' | 'denied' | 'prompt'
  entries?: () => AsyncIterable<[string, FileSystemDirectoryHandleLike | FileSystemFileHandleLike]>
  values?: () => AsyncIterable<FileSystemDirectoryHandleLike | FileSystemFileHandleLike>
}

export type FileSystemFileHandleLike = {
  kind?: string
  getFile?: () => Promise<File>
  createWritable?: () => Promise<{ write: (data: Blob | string) => Promise<void>; close: () => Promise<void> }>
}

export async function readTextFile(root: FileSystemDirectoryHandleLike, relativePath: string): Promise<string> {
  const file = await readFileBlob(root, relativePath)
  return file.text()
}

export async function readFileBlob(root: FileSystemDirectoryHandleLike, relativePath: string): Promise<File> {
  const fileHandle = await getFileHandle(root, relativePath)
  const file = await fileHandle?.getFile?.()
  if (!file) throw new Error(`Missing file: ${relativePath}`)
  return file
}

export async function writeTextFile(root: FileSystemDirectoryHandleLike, relativePath: string, text: string): Promise<void> {
  const fileHandle = await getFileHandle(root, relativePath, { create: true })
  const writable = await fileHandle?.createWritable?.()
  if (!writable) throw new Error(`Cannot write: ${relativePath}`)
  await writable.write(text)
  await writable.close()
}

export async function writeBlobFile(root: FileSystemDirectoryHandleLike, relativePath: string, file: File | Blob): Promise<void> {
  const fileHandle = await getFileHandle(root, relativePath, { create: true })
  const writable = await fileHandle?.createWritable?.()
  if (!writable) throw new Error(`Cannot write: ${relativePath}`)
  await writable.write(file)
  await writable.close()
}

export async function fileExistsAt(root: FileSystemDirectoryHandleLike, relativePath: string): Promise<boolean> {
  try {
    await getFileHandle(root, relativePath)
    return true
  } catch {
    return false
  }
}

export async function getDirectoryAt(
  root: FileSystemDirectoryHandleLike,
  relativePath: string,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandleLike | null> {
  const parts = relativePath.replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean)
  let dir = root
  for (const part of parts) {
    dir = (await dir.getDirectoryHandle?.(part, { create: options?.create })) as FileSystemDirectoryHandleLike
    if (!dir) return null
  }
  return dir
}

export async function getFileHandle(
  root: FileSystemDirectoryHandleLike,
  relativePath: string,
  options?: { create?: boolean },
): Promise<FileSystemFileHandleLike | null> {
  const parts = relativePath.replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean)
  if (!parts.length) return null

  const fileName = parts[parts.length - 1]
  const dirParts = parts.slice(0, -1)
  let dir = root
  for (const part of dirParts) {
    dir = (await dir.getDirectoryHandle?.(part, { create: options?.create })) as FileSystemDirectoryHandleLike
    if (!dir) return null
  }
  return (await dir.getFileHandle?.(fileName, { create: options?.create })) as FileSystemFileHandleLike
}

export async function listNdjsonPathsInFolder(
  root: FileSystemDirectoryHandleLike,
  folderRelativePath: string,
): Promise<string[]> {
  const folderRel = folderRelativePath.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const dir = await getDirectoryAt(root, folderRel)
  if (!dir?.entries) return []

  const paths: string[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle?.kind === 'file' && name.endsWith('.ndjson')) {
      paths.push(folderRel ? `${folderRel}/${name}` : name)
    }
  }

  return paths.sort()
}
