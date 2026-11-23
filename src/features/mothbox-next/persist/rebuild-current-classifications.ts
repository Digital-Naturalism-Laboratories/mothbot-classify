import { serializePackageRows, type FileKeyStyle } from '../file-keys'
import type { ClassificationRecord } from '../records'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../resolve-classifications'

export function buildCurrentClassificationsNdjson(params: {
  classificationFiles: Array<{ path: string; rows: ClassificationRecord[] }>
  occurrenceIdByPatch?: ReadonlyMap<string, string>
  /** The package's file style; snake_case for packages before format 4. */
  style?: FileKeyStyle
}): string {
  const flattened = flattenClassificationFiles({ files: params.classificationFiles })
  const resolved = resolveCurrentClassifications({ rows: flattened, occurrenceIdByPatch: params.occurrenceIdByPatch })
  return serializePackageRows(resolved, params.style ?? 'snake')
}
