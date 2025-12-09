/**
 * Taxonomy Gap Fill Dialog
 *
 * When identifying a species from GBIF data, sometimes the taxonomy hierarchy is incomplete
 * (e.g., a species record missing family or order names). This dialog automatically appears
 * to let users manually fill in missing parent rank names before saving the identification.
 *
 * The dialog only shows fields for ranks that are missing, allowing users to complete the
 * taxonomy hierarchy or skip if they prefer to proceed without the missing data.
 */

import { useState } from 'react'
import { DialogHeader, DialogTitle, DialogFooter } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { closeGlobalDialog } from '~/components/dialogs/global-dialog'
import { TaxonRankBadge, TaxonRankLetterBadge } from '~/components/taxon-rank-badge'
import { Column, Row } from '~/styles'
import type { TaxonRecord, TaxonomyRank, MissingRank } from '~/models/taxonomy/types'
import { RANK_LABELS } from '~/models/taxonomy/types'
import { getRankValue, setRankValue } from '~/models/taxonomy/rank'

export type TaxonomyGapFillDialogProps = {
  taxon: TaxonRecord
  missingRanks: MissingRank[]
  existingTaxon?: TaxonRecord
  onSubmit: (filledTaxon: TaxonRecord) => void
  onSkip: () => void
}

export function TaxonomyGapFillDialogContent(props: TaxonomyGapFillDialogProps) {
  const { taxon, missingRanks, existingTaxon, onSubmit, onSkip } = props

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const { rank } of missingRanks) {
      const newTaxonValue = getRankValue(taxon, rank)
      const existingTaxonValue = existingTaxon ? getRankValue(existingTaxon, rank) : undefined
      initial[rank] = newTaxonValue || existingTaxonValue || ''
    }
    return initial
  })

  function handleChange(rank: TaxonomyRank, value: string) {
    setValues((prev) => ({ ...prev, [rank]: value }))
  }

  function handleSubmit() {
    const filledTaxon = mergeTaxonNames({ taxon, values })
    onSubmit(filledTaxon)
    closeGlobalDialog()
  }

  function handleSkip() {
    onSkip()
    closeGlobalDialog()
  }

  function handleCancel() {
    closeGlobalDialog()
  }

  const displayName = taxon?.scientificName || taxon?.genus || taxon?.family || taxon?.order || ''
  const rank = taxon?.taxonRank || 'taxon'

  const hasAnyValue = Object.values(values).some((v) => v.trim())

  return (
    <div className=''>
      <DialogHeader>
        <DialogTitle>Fill Missing Taxonomy</DialogTitle>
      </DialogHeader>

      <div className='mt-16 space-y-16'>
        <div className='flex items-center gap-8'>
          <TaxonRankBadge rank={taxon?.taxonRank} />
          <span className='text-14 font-medium'>{displayName}</span>
        </div>

        <p className='text-13 text-neutral-600'>
          This {rank} is missing some taxonomy data. Fill in the missing information below, or skip to proceed without it.
        </p>

        <Column className='gap-12'>
          {missingRanks.map(({ rank: missingRank }) => (
            <GapFillRow
              key={missingRank}
              rank={missingRank}
              value={values[missingRank] ?? ''}
              onChange={(v) => handleChange(missingRank, v)}
            />
          ))}
        </Column>
      </div>

      <DialogFooter className='mt-20'>
        <Button size='xsm' variant='ghost' onClick={handleCancel}>
          Cancel
        </Button>
        <Button size='xsm' variant='outline' onClick={handleSkip}>
          Skip
        </Button>
        <Button size='xsm' variant='primary' onClick={handleSubmit} disabled={!hasAnyValue}>
          Save
        </Button>
      </DialogFooter>
    </div>
  )
}

type GapFillRowProps = {
  rank: TaxonomyRank
  value: string
  onChange: (value: string) => void
}

function GapFillRow(props: GapFillRowProps) {
  const { rank, value, onChange } = props

  return (
    <Row className='gap-12 items-center'>
      <div className='w-[80px] shrink-0'>
        <span className='flex items-center gap-6'>
          <TaxonRankLetterBadge rank={rank} size='xsm' />
          <span className='text-13 font-medium text-ink-secondary'>{RANK_LABELS[rank]}</span>
        </span>
      </div>

      <div className='flex-1'>
        <input
          className='w-full rounded border px-8 py-6 text-13 outline-none ring-1 ring-inset ring-black/10 focus:ring-black/30'
          placeholder={`${RANK_LABELS[rank]} name`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete='off'
          autoCorrect='off'
        />
      </div>
    </Row>
  )
}

type MergeTaxonNamesParams = {
  taxon: TaxonRecord
  values: Record<string, string>
}

function mergeTaxonNames(params: MergeTaxonNamesParams): TaxonRecord {
  const { taxon, values } = params

  const merged: TaxonRecord = { ...taxon }

  for (const [rank, name] of Object.entries(values)) {
    const trimmedName = name.trim()
    if (trimmedName) {
      setRankValue(merged, rank as TaxonomyRank, trimmedName)
    }
  }

  return merged
}
