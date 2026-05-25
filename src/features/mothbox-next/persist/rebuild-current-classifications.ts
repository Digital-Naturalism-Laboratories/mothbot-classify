import { serializeNdjsonLines } from '../parse-ndjson'
import type { ClassificationRecord } from '../records'
import { flattenClassificationFiles, resolveCurrentClassifications } from '../resolve-classifications'

export function buildCurrentClassificationsNdjson(params: {
  classificationFiles: Array<{ path: string; rows: ClassificationRecord[] }>
}): string {
  const flattened = flattenClassificationFiles({ files: params.classificationFiles })
  const resolved = resolveCurrentClassifications({ rows: flattened })
  return serializeNdjsonLines(resolved)
}
