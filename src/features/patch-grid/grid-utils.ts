import type { DetectionEntity } from '~/stores/entities/detections'

const DEBUG = false

export function chunkIds(ids: string[], size: number) {
  const res: string[][] = []
  if (!Array.isArray(ids) || ids.length === 0 || size <= 0) return res
  for (let i = 0; i < ids.length; i += size) res.push(ids.slice(i, i + size))
  return res
}

export function computeDetectionArea(params: { detection?: DetectionEntity }) {
  const { detection } = params
  const bounds = computeDetectionBounds({ detection })
  if (!bounds) return 0

  const area = bounds.width * bounds.height
  return area
}

export function computeDetectionLongestDimension(params: { detection?: DetectionEntity }) {
  const { detection } = params
  const bounds = computeDetectionBounds({ detection })
  if (!bounds) return 0

  const longestDimension = Math.max(bounds.width, bounds.height)
  return longestDimension
}

function computeDetectionBounds(params: { detection?: DetectionEntity }) {
  const { detection } = params
  const points = detection?.points
  if (!Array.isArray(points) || points.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const x = typeof point?.[0] === 'number' ? point[0] : null
    const y = typeof point?.[1] === 'number' ? point[1] : null
    if (x == null || y == null) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null

  const width = Math.max(0, maxX - minX)
  const height = Math.max(0, maxY - minY)
  return { width, height }
}

export function getRankValue(params: { det?: DetectionEntity; rank: 'order' | 'family' | 'genus' | 'species' }) {
  const { det, rank } = params
  if (!det) {
    if (DEBUG) console.log('🔍 getRankValue - no det, rank:', rank)
    return undefined
  }
  const tax = det?.taxon
  if (rank === 'order') {
    const result = tax?.order || undefined
    if (DEBUG) console.log('🔍 getRankValue - order:', result, 'tax:', tax)
    return result
  }
  if (rank === 'family') {
    const result = tax?.family || undefined
    if (DEBUG) console.log('🔍 getRankValue - family:', result, 'tax:', tax)
    return result
  }
  if (rank === 'genus') {
    const result = tax?.genus || undefined
    if (DEBUG) console.log('🔍 getRankValue - genus:', result, 'tax:', tax)
    return result
  }
  if (rank === 'species') {
    const morphospecies = typeof det?.morphospecies === 'string' ? det.morphospecies : undefined
    const species = tax?.species || undefined
    if (DEBUG)
      console.log('🔍 getRankValue - species:', {
        morphospecies,
        taxonSpecies: species,
        hasMorphospecies: !!morphospecies,
        hasTaxonSpecies: !!species,
        returning: morphospecies || species,
      })
    if (morphospecies) return morphospecies
    return species
  }
  if (DEBUG) console.log('🔍 getRankValue - no match, rank:', rank)
  return undefined
}

export function getHorizontalPadding(el: HTMLElement) {
  if (!el) return 0
  const styles = getComputedStyle(el)
  const left = parseFloat(styles?.paddingLeft || '0')
  const right = parseFloat(styles?.paddingRight || '0')
  const total = (isFinite(left) ? left : 0) + (isFinite(right) ? right : 0)
  return total
}

export function isMorphospeciesDetection(params: { detection?: DetectionEntity }) {
  const { detection } = params
  return typeof detection?.morphospecies === 'string' && detection.morphospecies.length > 0
}

export function separateRegularAndMorphoItems(params: { itemIds: string[]; detections: Record<string, DetectionEntity> }) {
  const { itemIds, detections } = params
  const regularItems: string[] = []
  const morphoItems: string[] = []
  for (const id of itemIds) {
    const det = detections?.[id]
    if (isMorphospeciesDetection({ detection: det })) morphoItems.push(id)
    else regularItems.push(id)
  }
  return { regularItems, morphoItems }
}

export function sortGroupsByCount(params: { groups: Map<string, string[]> }) {
  const { groups } = params
  return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}

export function addRowBlocks(params: {
  itemIds: string[]
  columns: number
  keyPrefix: string
  out: Array<
    | { kind: 'row'; key: string; itemIds: string[] }
    | {
        kind: 'header'
        key: string
        title: string
        rank?: 'class' | 'order' | 'family' | 'genus' | 'species' | 'morphospecies'
        count: number
      }
  >
}) {
  const { itemIds, columns, keyPrefix, out } = params
  if (itemIds.length === 0) return
  const rows = chunkIds(itemIds, Math.max(1, columns))
  rows.forEach((ids, idx) => {
    out.push({ kind: 'row', key: `${keyPrefix}:${idx}`, itemIds: ids })
  })
}
