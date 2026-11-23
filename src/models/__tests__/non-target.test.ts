import { describe, expect, it } from 'vitest'
import {
  NON_TARGET,
  formatNonTargetLabel,
  isNonTargetLabel,
  nonTargetLabel,
  nonTargetPathOf,
  normalizeNonTargetLabel,
  parseNonTargetPath,
} from '../non-target'

describe('Non-Target labels', () => {
  it('builds labels from category paths', () => {
    expect(nonTargetLabel()).toBe(NON_TARGET)
    expect(nonTargetLabel([])).toBe('NON_TARGET')
    expect(nonTargetLabel(['Error', 'Blur'])).toBe('NON_TARGET/Error/Blur')
    expect(nonTargetLabel('Plantae > Leaf')).toBe('NON_TARGET/Plantae/Leaf')
  })

  it('parses typed paths with /, > or ›', () => {
    expect(parseNonTargetPath('Error / Glare')).toEqual(['Error', 'Glare'])
    expect(parseNonTargetPath('Error > Glare')).toEqual(['Error', 'Glare'])
    expect(parseNonTargetPath('Error › Glare')).toEqual(['Error', 'Glare'])
    expect(parseNonTargetPath('  ')).toEqual([])
  })

  it('recognises new, display and legacy labels', () => {
    for (const label of ['NON_TARGET', 'NON_TARGET/Error', 'Non-Target › Abiotic', 'non-target', 'ERROR', 'ERROR_Frass', 'ERROR: Blur']) {
      expect(isNonTargetLabel(label)).toBe(true)
    }
    for (const label of ['Diptera', 'Nonagria', 'Errantia', '', undefined]) {
      expect(isNonTargetLabel(label)).toBe(false)
    }
  })

  it('converts legacy error labels', () => {
    expect(normalizeNonTargetLabel('ERROR')).toBe('NON_TARGET')
    expect(normalizeNonTargetLabel('ERROR_Blur')).toBe('NON_TARGET/Error/Blur')
    expect(normalizeNonTargetLabel('ERROR: blur')).toBe('NON_TARGET/Error/blur')
    // Frass is biological, so it sits directly under Non-Target.
    expect(normalizeNonTargetLabel('ERROR_Frass')).toBe('NON_TARGET/Frass')
    expect(normalizeNonTargetLabel('ERROR_Antenna only')).toBe('NON_TARGET/Antenna only')
    expect(normalizeNonTargetLabel('ERROR_Error')).toBe('NON_TARGET/Error')
  })

  it('keeps new labels and reads the display form', () => {
    expect(normalizeNonTargetLabel('NON_TARGET/Error/Blur')).toBe('NON_TARGET/Error/Blur')
    expect(normalizeNonTargetLabel(' NON_TARGET / Plantae ')).toBe('NON_TARGET/Plantae')
    expect(normalizeNonTargetLabel('Non-Target › Error › Blur')).toBe('NON_TARGET/Error/Blur')
    expect(normalizeNonTargetLabel('Diptera')).toBe('NON_TARGET')
  })

  it('formats labels for display', () => {
    expect(formatNonTargetLabel('NON_TARGET')).toBe('Non-Target')
    expect(formatNonTargetLabel('ERROR_Blur')).toBe('Non-Target › Error › Blur')
    expect(nonTargetPathOf('NON_TARGET/Abiotic/Glare')).toEqual(['Abiotic', 'Glare'])
  })
})
