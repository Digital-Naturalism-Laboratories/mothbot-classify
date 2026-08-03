import { describe, expect, it } from 'vitest'
import {
  formatFilesystemError,
  formatFilesystemPathError,
  isFilesystemNotFoundError,
} from '../fs-error'

describe('isFilesystemNotFoundError', () => {
  it('recognizes browser NotFoundError by name', () => {
    const err = {
      name: 'NotFoundError',
      message: 'A requested file or directory could not be found at the time an operation was processed',
    }
    expect(isFilesystemNotFoundError(err)).toBe(true)
  })

  it('recognizes not-found by message alone', () => {
    const err = new Error(
      'A requested file or directory could not be found at the time an operation was processed',
    )
    expect(isFilesystemNotFoundError(err)).toBe(true)
  })

  it('recognizes not found on disk phrasing', () => {
    expect(isFilesystemNotFoundError(new Error('File not found on disk: foo.ndjson'))).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isFilesystemNotFoundError(new Error('Permission denied'))).toBe(false)
  })
})

describe('formatFilesystemError', () => {
  it('returns a user-facing hint for missing files', () => {
    const err = { name: 'NotFoundError', message: 'missing' }
    expect(formatFilesystemError(err)).toContain('missing on disk')
  })

  it('passes through generic error messages', () => {
    expect(formatFilesystemError(new Error('Permission denied'))).toBe('Permission denied')
  })
})

describe('formatFilesystemPathError', () => {
  it('includes the path in the formatted message', () => {
    const err = { name: 'NotFoundError', message: 'missing' }
    expect(formatFilesystemPathError({ path: '02_records/patches.ndjson', err })).toContain(
      '02_records/patches.ndjson',
    )
  })
})
