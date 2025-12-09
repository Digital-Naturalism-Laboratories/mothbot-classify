import { useState } from 'react'
import { DialogHeader, DialogTitle, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { closeGlobalDialog } from '~/components/dialogs/global-dialog'
import { TaxonRankBadge } from '~/components/taxon-rank-badge'
import type { TaxonRecord } from './species-list.store'

export type TaxonKeyDialogProps = {
  taxon: TaxonRecord
  onConfirm: (taxonID: string | number) => void
}

export function TaxonKeyDialogContent(props: TaxonKeyDialogProps) {
  const { taxon, onConfirm } = props
  const [taxonID, setTaxonID] = useState<string>('')

  function handleSubmit() {
    const trimmed = taxonID.trim()
    if (!trimmed) return

    const id = isNaN(Number(trimmed)) ? trimmed : Number(trimmed)
    closeGlobalDialog()
    onConfirm(id)
  }

  function handleCancel() {
    closeGlobalDialog()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && taxonID.trim()) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const displayName = taxon?.scientificName || taxon?.class || taxon?.order || taxon?.family || taxon?.genus || taxon?.species || ''
  const rank = taxon?.taxonRank || 'taxon'

  return (
    <div className='w-[480px]'>
      <DialogHeader>
        <DialogTitle>Add Taxon Key</DialogTitle>
      </DialogHeader>

      <div className='mt-16 space-y-12'>
        <div>
          <div className='flex items-center gap-8 mb-8'>
            <TaxonRankBadge rank={taxon?.taxonRank} />
            <span className='text-14 font-medium'>{displayName}</span>
          </div>
          <p className='text-13 text-neutral-600'>Enter a taxon ID/key for this {rank}.</p>
        </div>

        <div>
          <input
            className='w-full rounded border px-8 py-6 text-13 outline-none ring-1 ring-inset ring-black/10 focus:ring-black/30'
            placeholder='e.g. 12345'
            value={taxonID}
            onChange={(e) => setTaxonID(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            autoComplete='off'
            autoCorrect='off'
          />
        </div>
      </div>

      <DialogFooter className='mt-20'>
        <Button size='xsm' variant='ghost' onClick={handleCancel}>
          Cancel
        </Button>
        <Button size='xsm' variant='primary' onClick={handleSubmit} disabled={!taxonID.trim()}>
          Submit
        </Button>
      </DialogFooter>
    </div>
  )
}
