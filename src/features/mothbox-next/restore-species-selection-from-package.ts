import type { ClassificationRecord } from './records'
import type { SpeciesList } from '~/features/data-flow/2.identify/species-list.store'
import { saveProjectSpeciesSelection } from '~/stores/species/project-species-list'

export function restoreSpeciesListSelectionFromPackage(params: {
  projectId: string
  classifications: ClassificationRecord[]
  speciesLists: Record<string, SpeciesList>
}) {
  const { projectId, classifications, speciesLists } = params
  if (!projectId) return

  const counts = new Map<string, number>()
  for (const row of classifications) {
    if (row.classifier_type !== 'human') continue
    const raw = readSpeciesListRef(row.taxon)
    if (typeof raw !== 'string' || !raw.trim()) continue
    const key = normalizeSpeciesListRef(raw)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  if (!counts.size) return

  let bestRef = ''
  let bestCount = 0
  for (const [ref, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestRef = ref
    }
  }

  const listId = matchSpeciesListId({ ref: bestRef, speciesLists })
  if (!listId) return

  void saveProjectSpeciesSelection({ projectId, speciesListId: listId })
}

function matchSpeciesListId(params: { ref: string; speciesLists: Record<string, SpeciesList> }) {
  const { ref, speciesLists } = params
  const normalizedRef = normalizeSpeciesListRef(ref)

  for (const list of Object.values(speciesLists)) {
    if (normalizeSpeciesListRef(list.id) === normalizedRef) return list.id
    if (normalizeSpeciesListRef(list.fileName) === normalizedRef) return list.id
    if (normalizeSpeciesListRef(list.doi) === normalizedRef) return list.id
    if (normalizeSpeciesListRef(list.sourcePath) === normalizedRef) return list.id
  }

  return undefined
}

function readSpeciesListRef(taxon: ClassificationRecord['taxon']) {
  if (!taxon) return undefined
  const extras = taxon.extras?.species_list
  if (typeof extras === 'string') return extras
  const direct = (taxon as { species_list?: unknown }).species_list
  return typeof direct === 'string' ? direct : undefined
}

function normalizeSpeciesListRef(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^doi:/, '')
    .replace(/^doi\.org\/?/, '')
    .replace(/[^a-z0-9]+/g, '')
}
