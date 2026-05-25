import { parseNdjsonLines } from './parse-ndjson'
import type { ClassificationRecord } from './records'
import type { IndexedFile } from '~/stores/entities/photos'
import { joinRelativePaths, classifierFileName } from './package-paths'
import { mothboxNextPackageStore } from './active-package'
import type { PackageTextWriter } from './persist/persist-human-classifications'
import { reloadActivePackageFromWriter } from './reload-package'

export async function importClassifierNdjsonFile(params: {
  classifierId: string
  ndjsonText: string
  writer: PackageTextWriter
  indexedFiles: IndexedFile[]
}) {
  const { classifierId, ndjsonText, writer, indexedFiles } = params
  const active = mothboxNextPackageStore.get()
  if (!active) throw new Error('No mothbox-next package is open.')

  await parseNdjsonLines<ClassificationRecord>(ndjsonText)

  const relPath = joinRelativePaths(active.manifest.folders.classifications, classifierFileName(classifierId))
  await writer.writeText(relPath, ndjsonText)

  await reloadActivePackageFromWriter({
    writer,
    indexedFiles,
    rebuildCache: true,
  })
}
