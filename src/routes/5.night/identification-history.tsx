import { useMemo } from 'react'
import { useStore } from '@nanostores/react'
import { Button } from '~/components/ui/button'
import { mothboxNextPackageStore } from '~/features/mothbox-next/active-package'
import {
  identificationHistory,
  identificationIdOf,
  occurrenceIdByPatchFromRecords,
  type IdentificationHistoryEntry,
} from '~/features/mothbox-next/identifications'
import { determineFromRows } from '~/features/mothbox-next/resolve-classifications'
import { botAlgorithmLabel } from '~/features/mothbox-next/bot-shape-to-classification'
import type { ClassificationRecord } from '~/features/mothbox-next/records'
import { agreeWithIdentification, type DetectionEntity } from '~/stores/entities/detections'
import { formatNonTargetLabel } from '~/models/non-target'

/**
 * Every identification of a detection's occurrence, oldest first (ontology: Identification,
 * Determination). The determination is marked; any other identification can be chosen,
 * which records the current person agreeing with it.
 */
export function IdentificationHistory(props: { detection?: DetectionEntity }) {
  const { detection } = props
  const activePackage = useStore(mothboxNextPackageStore)
  const loaded = activePackage?.loaded

  const { entries, determinationId } = useMemo(() => {
    if (!detection || !loaded) return { entries: [] as IdentificationHistoryEntry[], determinationId: undefined }
    const occurrenceIdByPatch = occurrenceIdByPatchFromRecords(loaded.patches)
    const occurrenceKey = detection.occurrenceId || occurrenceIdByPatch.get(detection.patchId) || detection.patchId
    const history = identificationHistory({ classificationFiles: loaded.classificationFiles, occurrenceKey, occurrenceIdByPatch })
    const winner = determineFromRows(history.map((e) => ({ ...e.row, sourceFile: e.sourceFile })))
    return { entries: history, determinationId: winner ? identificationIdOf(winner) : undefined }
  }, [detection, loaded])

  if (!activePackage) return null

  return (
    <div className='mt-12 space-y-4 text-12 text-neutral-700'>
      <h4 className='text-14 font-semibold text-neutral-800'>Identification history</h4>
      <p className='text-11 text-neutral-500'>
        Every identification of this occurrence, oldest first. The determination is the latest identification by a
        person, or the machine's if no person has identified it. Choosing another identification records you agreeing
        with it.
      </p>
      {entries.length === 0 ? (
        <p className='text-neutral-500'>No identifications saved yet.</p>
      ) : (
        <ol className='divide-y divide-black/5 rounded-md border border-black/10'>
          {entries.map((entry) => (
            <HistoryRow
              key={entry.id + entry.sourceFile}
              entry={entry}
              isDetermination={entry.id === determinationId}
              onChoose={
                detection && entry.row.classification_type !== 'withdrawn' && entry.id !== determinationId
                  ? () => agreeWithIdentification({ detectionId: detection.id, identification: entry.row })
                  : undefined
              }
            />
          ))}
        </ol>
      )}
    </div>
  )
}

function HistoryRow(props: { entry: IdentificationHistoryEntry; isDetermination: boolean; onChoose?: () => void }) {
  const { entry, isDetermination, onChoose } = props
  const { row } = entry
  const isMachine = row.classifier_type === 'bot'
  const who = isMachine ? `Machine: ${botAlgorithmLabel(row.classifier_id)}` : `Person: ${row.identifier_name || row.classifier_id}`

  return (
    <li className={`flex items-start gap-12 px-8 py-6 ${entry.withdrawn ? 'opacity-60' : ''}`}>
      <div className='flex-1 min-w-0 space-y-2'>
        <div className='flex flex-wrap items-center gap-6'>
          <span className='font-medium text-neutral-800'>{describeClaim(row)}</span>
          {isDetermination ? (
            <span className='rounded bg-green-100 px-4 text-11 font-medium text-green-800'>Determination</span>
          ) : null}
          {entry.withdrawn ? <span className='rounded bg-neutral-100 px-4 text-11 text-neutral-600'>Withdrawn</span> : null}
        </div>
        <div className='text-11 text-neutral-500 break-all'>
          {who}
          {' · '}
          {formatWhen(row)}
          {typeof row.confidence === 'number' ? ` · score ${row.confidence.toFixed(2)}` : ''}
          {row.species_list ? ` · taxa list ${row.species_list}` : ''}
        </div>
      </div>
      {onChoose ? (
        <Button size='xsm' variant='outline' onClick={onChoose}>
          Use this
        </Button>
      ) : null}
    </li>
  )
}

function describeClaim(row: ClassificationRecord): string {
  if (row.classification_type === 'withdrawn') return 'Withdrew their identification'
  if (row.classification_type === 'error' || row.is_error) return formatNonTargetLabel(row.label)
  const name = row.morphospecies || row.taxon?.scientificName || row.label || 'Unnamed'
  if (row.classification_type === 'accept') return `Agreed: ${name}`
  return name
}

function formatWhen(row: ClassificationRecord): string {
  // Adapters mark a preferred machine algorithm with classified_at: 1; that isn't a real time.
  if (typeof row.classified_at === 'number' && row.classified_at > 1_000_000) {
    return new Date(row.classified_at).toLocaleString()
  }
  if (row.machine_identified_at) return row.machine_identified_at
  return 'time unknown'
}
