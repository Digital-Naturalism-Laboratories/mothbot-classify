import { toast } from 'sonner'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { saveProjectSpeciesSelection } from '~/stores/species/project-species-list'
import { readFileBlob, writeBlobFile, type FileSystemDirectoryHandleLike } from '~/utils/fs-directory-handle'
import { requireDatasetsFolderHandle } from './datasets-folder-handle'
import { ingestSpeciesListsFromFiles } from './species.ingest'
import { WORKSPACE_SPECIES_HINT_DIR } from './load-workspace-species-lists'

const SPECIES_LIST_ACCEPT = '.csv,.tsv,text/csv,text/tab-separated-values'

/**
 * Asks the user for a species list CSV/TSV anywhere on their computer. Uses the
 * file picker where the browser has one, otherwise a plain file input (Firefox).
 * Must be called from a click handler. Resolves null when cancelled.
 */
export async function pickSpeciesListFile(): Promise<File | null> {
  const picker = (window as unknown as { showOpenFilePicker?: (options: unknown) => Promise<Array<{ getFile: () => Promise<File> }>> })
    .showOpenFilePicker
  if (typeof picker === 'function') {
    try {
      const [handle] = await picker({
        id: 'species-list',
        multiple: false,
        types: [{ description: 'Species list', accept: { 'text/csv': ['.csv'], 'text/tab-separated-values': ['.tsv'] } }],
      })
      return handle ? await handle.getFile() : null
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return null
      throw err
    }
  }
  return pickFileWithInput()
}

function pickFileWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = SPECIES_LIST_ACCEPT
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

/**
 * Adds a species list the user picked from anywhere and selects it for the
 * project. The file is checked first, then copied into `<datasets folder>/Species/`
 * so it is found again on every launch (like any CSV already there) and travels
 * with the data. Without a datasets folder it is only kept for this session.
 * Returns the list id, or null when the file couldn't be used.
 */
export async function addSpeciesListFromFile(params: { file: File; projectId?: string }): Promise<string | null> {
  const { file, projectId } = params
  const toastId = 'add-species-list'
  toast.loading('Loading species list…', { id: toastId, description: file.name })

  try {
    const root = await requireDatasetsFolderHandle({ mode: 'readwrite', notifyOnDenied: false })
    const fileName = root ? await chooseFileNameInSpeciesFolder({ root, file }) : file.name
    const relativePath = root ? `${WORKSPACE_SPECIES_HINT_DIR}/${fileName}` : fileName

    // Lists are keyed by file name, so ingest under the name it will have on disk.
    const named = fileName === file.name ? file : new File([file], fileName, { type: file.type })
    await ingestSpeciesListsFromFiles({ files: [{ path: relativePath, name: fileName, size: named.size, file: named }] })

    const list = speciesListsStore.get()?.[fileName]
    if (!list || list.validation?.status === 'invalid') {
      if (list) {
        const { [fileName]: _removed, ...rest } = speciesListsStore.get() || {}
        speciesListsStore.set(rest)
      }
      toast.error(`“${file.name}” can't be used as a species list`, {
        id: toastId,
        description: list?.validation?.reason ?? 'It could not be read as a CSV/TSV of taxa. Pick a different file.',
      })
      return null
    }

    if (root && !(await speciesFolderHasSameFile({ root, relativePath, file }))) {
      await writeBlobFile(root, relativePath, file)
    }

    if (projectId) await saveProjectSpeciesSelection({ projectId, speciesListId: fileName })

    toast.success('Species list added', {
      id: toastId,
      description: root
        ? `Saved to ${WORKSPACE_SPECIES_HINT_DIR}/${fileName} in your datasets folder.`
        : 'Choose a datasets folder to keep it for next time.',
    })
    return fileName
  } catch (err) {
    console.warn('🚨 addSpeciesListFromFile: failed', err)
    toast.error('Could not add species list', { id: toastId, description: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** The file's own name, unless a different file already has it — then "name (2).csv", etc. */
async function chooseFileNameInSpeciesFolder(params: { root: FileSystemDirectoryHandleLike; file: File }) {
  const { root, file } = params
  const dot = file.name.lastIndexOf('.')
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name
  const ext = dot > 0 ? file.name.slice(dot) : ''

  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? file.name : `${stem} (${n})${ext}`
    const path = `${WORKSPACE_SPECIES_HINT_DIR}/${candidate}`
    const existing = await readFileBlob(root, path).catch(() => null)
    if (!existing || (await isSameFile(existing, file))) return candidate
  }
  throw new Error(`Too many species lists named “${file.name}” in ${WORKSPACE_SPECIES_HINT_DIR}/.`)
}

async function speciesFolderHasSameFile(params: { root: FileSystemDirectoryHandleLike; relativePath: string; file: File }) {
  const existing = await readFileBlob(params.root, params.relativePath).catch(() => null)
  return !!existing && (await isSameFile(existing, params.file))
}

/** Same size and same first/last 64 KB — enough to tell copies of a list apart without reading 300 MB files whole. */
async function isSameFile(a: Blob, b: Blob) {
  if (a.size !== b.size) return false
  const span = 64 * 1024
  const head = async (blob: Blob) => new Uint8Array(await blob.slice(0, span).arrayBuffer())
  const tail = async (blob: Blob) => new Uint8Array(await blob.slice(Math.max(0, blob.size - span)).arrayBuffer())
  const [ha, hb, ta, tb] = await Promise.all([head(a), head(b), tail(a), tail(b)])
  return bytesEqual(ha, hb) && bytesEqual(ta, tb)
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
