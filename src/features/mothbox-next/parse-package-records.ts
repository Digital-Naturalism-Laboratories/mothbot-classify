import type {
  CameraDayRecord,
  ClassificationRecord,
  DeploymentRecord,
  MorphoLinkRecord,
  PatchRecord,
  PatchSourceRecord,
} from './records'

export function parseNdjsonObjectLines<T>(params: {
  text: string
  parseLine: (value: unknown, lineNumber: number) => T | null
}): T[] {
  const { text, parseLine } = params
  const rows: T[] = []

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index]?.trim()
    if (!trimmed) continue

    const parsed = JSON.parse(trimmed) as unknown
    const row = parseLine(parsed, index + 1)
    if (row) rows.push(row)
  }

  return rows
}

export function parsePatchRecords(text: string): PatchRecord[] {
  return parseNdjsonObjectLines({
    text,
    parseLine: parsePatchRecordLine,
  })
}

export function parsePatchSourceRecords(text: string): PatchSourceRecord[] {
  return parseNdjsonObjectLines({
    text,
    parseLine: parsePatchSourceRecordLine,
  })
}

export function parseDeploymentRecords(text: string): DeploymentRecord[] {
  return parseNdjsonObjectLines({
    text,
    parseLine: parseDeploymentRecordLine,
  })
}

export function parseCameraDayRecords(text: string): CameraDayRecord[] {
  return parseNdjsonObjectLines({
    text,
    parseLine: parseCameraDayRecordLine,
  })
}

export function parseClassificationRecords(text: string): ClassificationRecord[] {
  return parseNdjsonObjectLines({
    text,
    parseLine: parseClassificationRecordLine,
  })
}

export function parseMorphoLinkRecords(text: string): MorphoLinkRecord[] {
  return parseNdjsonObjectLines({
    text,
    parseLine: parseMorphoLinkRecordLine,
  })
}

function parsePatchRecordLine(value: unknown): PatchRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as PatchRecord
  if (typeof row.patch_id !== 'string' || !row.patch_id) return null
  if (typeof row.dataset_id !== 'string' || !row.dataset_id) return null
  if (typeof row.asset_path !== 'string' || !row.asset_path) return null
  return row
}

function parsePatchSourceRecordLine(value: unknown): PatchSourceRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as PatchSourceRecord
  if (typeof row.patch_id !== 'string' || !row.patch_id) return null
  if (typeof row.source_type !== 'string' || !row.source_type) return null
  return row
}

function parseDeploymentRecordLine(value: unknown): DeploymentRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as DeploymentRecord
  if (typeof row.deployment_id !== 'string' || !row.deployment_id) return null
  return row
}

function parseCameraDayRecordLine(value: unknown): CameraDayRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as CameraDayRecord
  if (typeof row.camera_day_id !== 'string' || !row.camera_day_id) return null
  return row
}

function parseClassificationRecordLine(value: unknown): ClassificationRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as ClassificationRecord
  if (typeof row.patch_id !== 'string' || !row.patch_id) return null
  if (typeof row.classifier_id !== 'string' || !row.classifier_id) return null
  if (typeof row.classifier_type !== 'string' || !row.classifier_type) return null
  if (typeof row.classification_type !== 'string' || !row.classification_type) return null
  return row
}

function parseMorphoLinkRecordLine(value: unknown): MorphoLinkRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as MorphoLinkRecord
  if (typeof row.morpho_key !== 'string' || !row.morpho_key.trim()) return null
  if (typeof row.url !== 'string' || !row.url.trim()) return null
  return { morpho_key: row.morpho_key, url: row.url }
}
