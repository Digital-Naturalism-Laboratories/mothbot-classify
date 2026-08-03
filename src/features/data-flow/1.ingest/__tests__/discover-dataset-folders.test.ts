import { describe, expect, it } from 'vitest'
import { findUntrackedPendingMigrations } from '../untracked-pending-datasets'

describe('findUntrackedPendingMigrations', () => {
  it('returns pending folders not in registry or dismissed set', () => {
    const pending = [
      { folderName: 'new-dataset', kind: 'legacy-root' as const },
      { folderName: 'other', kind: 'legacy-root' as const },
    ]
    const registry = [{ folderName: 'other', hasManifest: true }]
    const dismissed = new Set(['skipped'])

    const result = findUntrackedPendingMigrations({
      pendingMigration: pending,
      registry,
      dismissedFolderNames: dismissed,
    })

    expect(result).toEqual([{ folderName: 'new-dataset', kind: 'legacy-root' }])
  })

  it('returns empty when all pending are tracked', () => {
    const pending = [{ folderName: 'done', kind: 'source-only' as const }]
    const registry = [{ folderName: 'done', hasManifest: true }]

    const result = findUntrackedPendingMigrations({ pendingMigration: pending, registry })

    expect(result).toEqual([])
  })
})
