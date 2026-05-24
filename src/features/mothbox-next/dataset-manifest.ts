export type MothboxNextDatasetManifest = {
  format: 'mothbox-next-dataset'
  version: number
  dataset_id: string
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
  }
  classification_sources?: string[]
  cloud_upload_default?: {
    include_source?: boolean
    include_patches?: boolean
  }
}

export function parseDatasetManifest(raw: unknown): MothboxNextDatasetManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as MothboxNextDatasetManifest
  if (m.format !== 'mothbox-next-dataset') return null
  if (typeof m.version !== 'number') return null
  if (typeof m.dataset_id !== 'string') return null
  if (!m.folders?.records || !m.folders?.classifications || !m.folders?.patches) return null
  if (!m.records?.patches) return null
  return m
}
