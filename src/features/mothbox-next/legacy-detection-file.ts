/** Fields read from legacy *_botdetection.json / *_identified.json shape entries. */
export type LegacyDetectionShape = {
  patch_path?: string
  label?: string
  score?: number
  detection_id?: string
  is_error?: boolean
  kingdom?: string
  phylum?: string
  class?: string
  order?: string
  family?: string
  genus?: string
  species?: string
  morphospecies?: string
  taxonID?: string
  acceptedTaxonKey?: string
  [key: string]: unknown
}

export function readLegacyDetectionShapes(text: string): LegacyDetectionShape[] {
  const json = JSON.parse(text) as { shapes?: unknown }
  if (!Array.isArray(json?.shapes)) return []

  return json.shapes.filter(isLegacyDetectionShape)
}

function isLegacyDetectionShape(value: unknown): value is LegacyDetectionShape {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
