import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'

import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { speciesListsStore } from '~/features/data-flow/2.identify/species-list.store'
import { ingestSpeciesListsFromFiles, type IndexedFile } from '~/features/data-flow/1.ingest/species.ingest'
import {
  loadProjectSpeciesSelection,
  projectSpeciesSelectionStore,
  saveProjectSpeciesSelection,
} from '~/stores/species/project-species-list'

export function TestIdentification() {
  const projectId = 'test'

  const speciesLists = useStore(speciesListsStore)
  const selection = useStore(projectSpeciesSelectionStore)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [chosenListId, setChosenListId] = useState<string>('')
  const [lastLabel, setLastLabel] = useState<string>('')
  const [lastTaxon, setLastTaxon] = useState<any>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProjectSpeciesSelection()
  }, [])

  useEffect(() => {
    const ids = Object.keys(speciesLists || {})
    if (ids.length === 1) {
      const only = ids[0]
      if (only && selection?.[projectId] !== only) saveProjectSpeciesSelection({ projectId, speciesListId: only })
      setChosenListId(only)
    } else {
      const existing = selection?.[projectId]
      if (existing) setChosenListId(existing)
    }
  }, [speciesLists, selection])

  function handlePickFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target?.files ?? [])
    if (!files.length) return

    const mapped: IndexedFile[] = files.map((file) => ({
      file,
      handle: undefined,
      path: `species/${file.name}`,
      name: file.name,
      size: file.size,
    }))

    void ingestSpeciesListsFromFiles({ files: mapped })
  }

  function handleListChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const speciesListId = e.target.value
    setChosenListId(speciesListId)
    if (speciesListId) void saveProjectSpeciesSelection({ projectId, speciesListId })
  }

  function handleSubmit(label: string, taxon?: any) {
    setLastLabel(label)
    setLastTaxon(taxon ?? null)
  }

  const listOptions = useMemo(() => Object.values(speciesLists || []), [speciesLists])

  return (
    <div className='p-16 space-y-16'>
      <div className='flex items-center gap-12'>
        <input ref={inputRef} type='file' accept='.csv,.tsv,text/csv,text/tab-separated-values' multiple onChange={handlePickFilesChange} />

        <select value={chosenListId} onChange={handleListChange} className='border px-8 py-4 rounded'>
          <option value=''>Select species list…</option>
          {listOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name || l.fileName}
            </option>
          ))}
        </select>

        <button className='border px-12 py-8 rounded' onClick={() => setDialogOpen(true)} disabled={!chosenListId}>
          Open Identify
        </button>
      </div>

      {lastLabel ? (
        <div className='text-13'>
          <div>
            <span className='font-medium'>Last label:</span> {lastLabel}
          </div>
          {lastTaxon?.scientificName ? (
            <div>
              <span className='font-medium'>Taxon:</span> {lastTaxon.scientificName} ({lastTaxon?.taxonRank || '—'})
            </div>
          ) : null}
        </div>
      ) : null}

      <IdentifyDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleSubmit} datasetId={projectId} />
    </div>
  )
}
