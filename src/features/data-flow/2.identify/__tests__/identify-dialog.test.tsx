import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdentifyDialog } from '~/features/data-flow/2.identify/identify-dialog'
import { identifyDetection } from '~/features/data-flow/2.identify/identify'
import { speciesListsLoadingStore } from '~/features/data-flow/2.identify/species-list.store'
import type { DetectionEntity } from '~/models/detection.types'
import type { TaxonRecord } from '~/models/taxonomy/types'
import { detectionsStore } from '~/stores/entities/detections'
import { projectSpeciesSelectionStore } from '~/stores/species/project-species-list'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

function createBaseDetection(): DetectionEntity {
  return {
    id: 'test-detection',
    patchId: 'test-patch',
    photoId: 'test-photo',
    nightId: 'test-night',
    detectedBy: 'auto',
  }
}

afterEach(() => {
  cleanup()
  detectionsStore.set({})
  projectSpeciesSelectionStore.set({})
  speciesListsLoadingStore.set(false)
})

describe('IdentifyDialog - identification logic', () => {
  it('identifies detection with order taxon', () => {
    const detection = createBaseDetection()
    const taxon: TaxonRecord = {
      scientificName: 'Lepidoptera',
      taxonRank: 'order',
      order: 'Lepidoptera',
      taxonID: '12345',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.order).toBe('Lepidoptera')
    expect(result.detection.taxon?.taxonRank).toBe('order')
    expect(result.detection.taxon?.taxonID).toBe('12345')
    expect(result.detection.detectedBy).toBe('user')
    expect(result.detection.identifiedAt).toBeTruthy()
  })

  it('identifies detection with class taxon', () => {
    const detection = createBaseDetection()
    const taxon: TaxonRecord = {
      scientificName: 'Arachnida',
      taxonRank: 'class',
      class: 'Arachnida',
      taxonID: '67890',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.class).toBe('Arachnida')
    expect(result.detection.taxon?.taxonRank).toBe('class')
    expect(result.detection.taxon?.taxonID).toBe('67890')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies detection with genus taxon', () => {
    const detection = createBaseDetection()
    const taxon: TaxonRecord = {
      scientificName: 'Olinta',
      taxonRank: 'genus',
      genus: 'Olinta',
      taxonID: '11111',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.genus).toBe('Olinta')
    expect(result.detection.taxon?.taxonRank).toBe('genus')
    expect(result.detection.taxon?.taxonID).toBe('11111')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies detection with family taxon', () => {
    const detection = createBaseDetection()
    const taxon: TaxonRecord = {
      scientificName: 'Muscidae',
      taxonRank: 'family',
      family: 'Muscidae',
      taxonID: '22222',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.family).toBe('Muscidae')
    expect(result.detection.taxon?.taxonRank).toBe('family')
    expect(result.detection.taxon?.taxonID).toBe('22222')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies detection with tribe taxon', () => {
    const detection: DetectionEntity = {
      ...createBaseDetection(),
      taxon: { scientificName: 'TestFamily', family: 'TestFamily' },
    }
    const taxon: TaxonRecord = {
      scientificName: 'TestTribe',
      taxonRank: 'tribe',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.taxonRank).toBe('tribe')
    expect(result.detection.taxon?.scientificName).toBe('TestTribe')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies detection with subfamily taxon', () => {
    const detection: DetectionEntity = {
      ...createBaseDetection(),
      taxon: { scientificName: 'TestFamily', family: 'TestFamily' },
    }
    const taxon: TaxonRecord = {
      scientificName: 'TestSubfamily',
      taxonRank: 'subfamily',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.taxonRank).toBe('subfamily')
    expect(result.detection.taxon?.scientificName).toBe('TestSubfamily')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies detection with suborder taxon', () => {
    const detection: DetectionEntity = {
      ...createBaseDetection(),
      taxon: { scientificName: 'Diptera', order: 'Diptera' },
    }
    const taxon: TaxonRecord = {
      scientificName: 'TestSuborder',
      taxonRank: 'suborder',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'taxon', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.taxon?.taxonRank).toBe('suborder')
    expect(result.detection.taxon?.scientificName).toBe('TestSuborder')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies detection with morphospecies label', () => {
    const detection: DetectionEntity = {
      ...createBaseDetection(),
      taxon: { scientificName: 'Muscidae', order: 'Diptera', family: 'Muscidae' },
    }

    const result = identifyDetection({
      detection,
      input: { type: 'morphospecies', text: '111' },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.label).toBe('111')
    expect(result.detection.morphospecies).toBe('111')
    expect(result.detection.taxon?.order).toBe('Diptera')
    expect(result.detection.taxon?.family).toBe('Muscidae')
    expect(result.detection.detectedBy).toBe('user')
  })

  it('identifies morphospecies with inherited taxon context', () => {
    const detection: DetectionEntity = {
      ...createBaseDetection(),
      taxon: {
        scientificName: 'Lepidoptera',
        order: 'Lepidoptera',
        taxonRank: 'order',
      },
    }
    const taxon: TaxonRecord = {
      scientificName: 'Epimecis',
      order: 'Lepidoptera',
      family: 'Geometridae',
      genus: 'Epimecis',
      taxonRank: 'genus',
    }

    const result = identifyDetection({
      detection,
      input: { type: 'morphospecies', text: 'epimecis1', taxon },
    })

    expect(result.changed).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.detection.label).toBe('epimecis1')
    expect(result.detection.morphospecies).toBe('epimecis1')
    expect(result.detection.taxon?.order).toBe('Lepidoptera')
    expect(result.detection.taxon?.family).toBe('Geometridae')
    expect(result.detection.taxon?.genus).toBe('Epimecis')
  })

  it('skips morphospecies when no parent taxonomy exists', () => {
    const detection = createBaseDetection()

    const result = identifyDetection({
      detection,
      input: { type: 'morphospecies', text: '111' },
    })

    expect(result.changed).toBe(false)
    expect(result.skipped).toBe(true)
    expect(result.skipReason).toContain('higher taxonomy context')
  })
})

describe('IdentifyDialog - morphospecies suggestions', () => {
  it('submits inherited taxon when selecting an existing morphospecies', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    detectionsStore.set({
      'known-morpho': {
        ...createBaseDetection(),
        id: 'known-morpho',
        patchId: 'known-morpho',
        nightId: 'project-1/site-1/deployment-1/night-1',
        label: 'epimecis1',
        morphospecies: 'epimecis1',
        detectedBy: 'user',
        identifiedAt: 123,
        taxon: {
          scientificName: 'Epimecis',
          order: 'Lepidoptera',
          family: 'Geometridae',
          genus: 'Epimecis',
          taxonRank: 'genus',
        },
      },
    })

    render(<IdentifyDialog open={true} onOpenChange={() => {}} onSubmit={onSubmit} projectId='project-1' detectionIds={['target']} />)

    const options = await screen.findAllByText('epimecis1')
    await user.click(options[0])

    expect(onSubmit).toHaveBeenCalledWith(
      'epimecis1',
      expect.objectContaining({
        order: 'Lepidoptera',
        family: 'Geometridae',
        genus: 'Epimecis',
        taxonRank: 'genus',
      }),
    )
  })

  it('does not reuse morphospecies taxonomy from another project in recent options', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    detectionsStore.set({
      'project-1-morpho': {
        ...createBaseDetection(),
        id: 'project-1-morpho',
        patchId: 'project-1-morpho',
        nightId: 'project-1/site-1/deployment-1/night-1',
        label: 'epimecis1',
        morphospecies: 'epimecis1',
        detectedBy: 'user',
        identifiedAt: 456,
        taxon: {
          scientificName: 'Epimecis',
          order: 'Lepidoptera',
          family: 'Geometridae',
          genus: 'Epimecis',
          taxonRank: 'genus',
        },
      },
      'project-2-morpho': {
        ...createBaseDetection(),
        id: 'project-2-morpho',
        patchId: 'project-2-morpho',
        nightId: 'project-2/site-1/deployment-1/night-1',
        label: 'epimecis1',
        morphospecies: 'epimecis1',
        detectedBy: 'user',
        identifiedAt: 123,
        taxon: {
          scientificName: 'SomethingElse',
          order: 'Diptera',
          family: 'Muscidae',
          genus: 'SomethingElse',
          taxonRank: 'genus',
        },
      },
    })

    render(<IdentifyDialog open={true} onOpenChange={() => {}} onSubmit={onSubmit} projectId='project-2' detectionIds={['target']} />)

    const options = await screen.findAllByText('epimecis1')
    await user.click(options[0])

    expect(screen.queryByText(/Geometridae/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/SomethingElse/).length).toBeGreaterThan(0)
    expect(onSubmit).toHaveBeenCalledWith(
      'epimecis1',
      expect.objectContaining({
        order: 'Diptera',
        family: 'Muscidae',
        genus: 'SomethingElse',
        taxonRank: 'genus',
      }),
    )
  })
})
