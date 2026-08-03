import { describe, it, expect, beforeEach } from 'vitest'
import {
  STANDARD_ERROR_REASONS,
  addCustomErrorReason,
  allErrorReasons,
  customErrorReasonsStore,
  errorLabelForReason,
  isErrorLabel,
  reasonFromErrorLabel,
} from '../error-categories'
import { identifyDetection } from '../identify'
import type { DetectionEntity } from '~/stores/entities/detections'

describe('error-categories helpers', () => {
  beforeEach(() => {
    customErrorReasonsStore.set([])
    localStorage.clear()
  })

  it('builds and parses error labels', () => {
    expect(errorLabelForReason()).toBe('ERROR')
    expect(errorLabelForReason('Frass')).toBe('ERROR_Frass')
    expect(isErrorLabel('ERROR')).toBe(true)
    expect(isErrorLabel('ERROR_Frass')).toBe(true)
    expect(isErrorLabel('ERROR: Blur')).toBe(true)
    expect(isErrorLabel('Diptera')).toBe(false)
    expect(reasonFromErrorLabel('ERROR_Frass')).toBe('Frass')
    expect(reasonFromErrorLabel('ERROR')).toBeNull()
  })

  it('adds custom reasons without duplicating standard ones', () => {
    addCustomErrorReason('Frass') // already standard → ignored
    addCustomErrorReason('Antenna only')
    addCustomErrorReason('antenna only') // case-insensitive dupe → ignored
    expect(customErrorReasonsStore.get()).toEqual(['Antenna only'])
    expect(allErrorReasons()).toEqual([...STANDARD_ERROR_REASONS, 'Antenna only'])
  })
})

describe('identifyDetection error input', () => {
  const base: DetectionEntity = { id: 'p1', patchId: 'p1', photoId: 'ph1', leafGroupId: 'lg1' }

  it('marks a generic error', () => {
    const { detection } = identifyDetection({ detection: base, input: { type: 'error' } })
    expect(detection.isError).toBe(true)
    expect(detection.label).toBe('ERROR')
    expect(detection.classificationType).toBe('error')
    expect(detection.taxon).toBeUndefined()
  })

  it('keeps a sub-category label', () => {
    const { detection } = identifyDetection({ detection: base, input: { type: 'error', label: 'ERROR_Frass' } })
    expect(detection.isError).toBe(true)
    expect(detection.label).toBe('ERROR_Frass')
    expect(reasonFromErrorLabel(detection.label!)).toBe('Frass')
  })

  it('falls back to generic for a non-error label', () => {
    const { detection } = identifyDetection({ detection: base, input: { type: 'error', label: 'Diptera' } })
    expect(detection.label).toBe('ERROR')
  })
})
