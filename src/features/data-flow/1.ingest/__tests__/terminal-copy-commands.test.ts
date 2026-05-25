import { describe, it, expect } from 'vitest'
import {
  buildPackagePathFromLegacyPick,
  buildTerminalPatchCopyCommand,
  inferLegacySourcePathFromPick,
  joinTerminalPaths,
} from '../terminal-copy-commands'

describe('terminal-copy-commands', () => {
  it('joins paths with forward slashes on mac/linux', () => {
    expect(joinTerminalPaths('/Users/me/datasets', 'my-dataset')).toBe('/Users/me/datasets/my-dataset')
  })

  it('builds package path from datasets root and legacy folder name', () => {
    expect(
      buildPackagePathFromLegacyPick({
        datasetsRootPath: '/data/datasets',
        legacyFolderName: 'Dinacon2025_test',
      }),
    ).toBe('/data/datasets/Dinacon2025_test')
  })

  it('infers legacy path as sibling of datasets parent', () => {
    expect(
      inferLegacySourcePathFromPick({
        datasetsRootPath: '/Mothbox/datasets',
        legacyFolderName: 'Dinacon2025_Les_Beach',
      }),
    ).toBe('/Mothbox/Dinacon2025_Les_Beach')
  })

  it('builds unix find/cp command', () => {
    const command = buildTerminalPatchCopyCommand({
      legacySourcePath: '/src/legacy',
      packagePath: '/data/datasets/pkg',
      platform: 'mac',
    })

    expect(command).toContain("find '/src/legacy'")
    expect(command).toContain("mkdir -p '/data/datasets/pkg/01_patches'")
    expect(command).toContain("*/patches/*")
  })

  it('builds windows powershell command', () => {
    const command = buildTerminalPatchCopyCommand({
      legacySourcePath: 'C:\\legacy',
      packagePath: 'C:\\datasets\\pkg',
      platform: 'windows',
    })

    expect(command).toContain("$LEGACY = 'C:\\legacy'")
    expect(command).toContain('Get-ChildItem')
    expect(command).toContain('01_patches')
  })
})
