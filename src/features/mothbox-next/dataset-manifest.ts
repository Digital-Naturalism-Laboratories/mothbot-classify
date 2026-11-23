import { SUPPORTED_PACKAGE_VERSION, manifestFromFile } from './file-keys'
import type { HierarchyDef } from './hierarchy-manifest'

export type MothboxNextDatasetManifest = {
  format: 'mothbox-next-dataset'
  version: number
  dataset_id: string
  hierarchy?: HierarchyDef
  title?: string
  description?: string
  package_kind?: 'source_managed_working_dataset' | 'lightweight_substrate'
  classification_unit?: string
  source?: {
    included: boolean
    path?: string | null
    adapter_id?: string
    adapter_path?: string
    original_source_available_elsewhere?: boolean
    trace_fields?: string[]
  }
  patches?: {
    included: boolean
    path: string
    required_when_source_absent?: boolean
  }
  folders: {
    source?: string
    records: string
    classifications: string
    patches: string
    exports?: string
  }
  records: {
    patches: string
    current_classifications?: string
    patch_sources?: string
    deployments?: string
    camera_days?: string
    morpho_links?: string
    /** Sessions and capture windows (ontology: Session); `02_records/sessions.ndjson`. */
    sessions?: string
  }
  classification_sources?: string[]
  cloud_upload_default?: {
    include_source?: boolean
    include_patches?: boolean
  }
}

export function parseDatasetManifest(raw: unknown): MothboxNextDatasetManifest | null {
  if (!raw || typeof raw !== 'object') return null
  // dataset.json may be snake_case (format ≤ 3) or camelCase (format 4); see file-keys.ts.
  const m = manifestFromFile(raw) as MothboxNextDatasetManifest
  if (m.format !== 'mothbox-next-dataset') return null
  if (typeof m.version !== 'number') return null
  if (m.version > SUPPORTED_PACKAGE_VERSION) {
    // Written by a newer Classify: refuse rather than misread (and later rewrite) it.
    console.warn('🚨 dataset.json is a newer package format than this Classify can read', { version: m.version })
    return null
  }
  if (typeof m.dataset_id !== 'string') return null
  if (!m.folders?.records || !m.folders?.classifications || !m.folders?.patches) return null
  if (!m.records?.patches) return null
  return m
}
