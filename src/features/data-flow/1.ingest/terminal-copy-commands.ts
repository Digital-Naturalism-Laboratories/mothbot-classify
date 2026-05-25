import { sanitizeDatasetFolderName } from './choose-datasets-folder'
import { loadSavedLegacySourcePathForFolder } from './terminal-paths.storage'

export type TerminalPlatform = 'windows' | 'mac' | 'linux'

export function detectTerminalPlatform(): TerminalPlatform {
  const platform = (navigator.platform ?? '').toLowerCase()
  const userAgent = (navigator.userAgent ?? '').toLowerCase()
  if (platform.includes('win') || userAgent.includes('windows')) return 'windows'
  if (platform.includes('mac') || userAgent.includes('mac')) return 'mac'
  return 'linux'
}

export function joinTerminalPaths(...segments: string[]) {
  const platform = detectTerminalPlatform()
  const separator = platform === 'windows' ? '\\' : '/'
  const cleaned = segments
    .map((segment) => segment.trim().replace(/[/\\]+/g, separator))
    .filter(Boolean)
    .map((segment, index) => {
      if (index === 0) return segment.replace(new RegExp(`${separator}+$`), '')
      return segment.replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '')
    })

  return cleaned.join(separator)
}

export function buildPackagePathFromLegacyPick(params: { datasetsRootPath: string; legacyFolderName: string }) {
  const { datasetsRootPath, legacyFolderName } = params
  const safeName = sanitizeDatasetFolderName(legacyFolderName)
  return joinTerminalPaths(datasetsRootPath, safeName)
}

export function inferLegacySourcePathFromPick(params: { datasetsRootPath: string; legacyFolderName: string }) {
  const { datasetsRootPath, legacyFolderName } = params
  const trimmedName = legacyFolderName.trim()
  if (!trimmedName) return ''

  const saved = loadSavedLegacySourcePathForFolder(trimmedName)
  if (saved) return saved

  const parent = parentDir(datasetsRootPath.trim())
  if (!parent) return trimmedName

  return joinTerminalPaths(parent, trimmedName)
}

export function buildTerminalPatchCopyCommand(params: {
  legacySourcePath: string
  packagePath: string
  platform?: TerminalPlatform
}) {
  const { legacySourcePath, packagePath, platform = detectTerminalPlatform() } = params
  const patchesDir = joinTerminalPaths(packagePath, '01_patches')

  if (platform === 'windows') {
    return buildWindowsCopyCommand({ legacySourcePath, patchesDir })
  }

  return buildUnixCopyCommand({ legacySourcePath, patchesDir })
}

function buildUnixCopyCommand(params: { legacySourcePath: string; patchesDir: string }) {
  const { legacySourcePath, patchesDir } = params
  const legacy = shellQuote(legacySourcePath)
  const patches = shellQuote(patchesDir)

  return [
    `mkdir -p ${patches}`,
    `find ${legacy} -type f \\( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' \\) -path '*/patches/*' -exec cp {} ${patches}/ \\;`,
  ].join('\n')
}

function buildWindowsCopyCommand(params: { legacySourcePath: string; patchesDir: string }) {
  const { legacySourcePath, patchesDir } = params
  const legacy = powershellQuote(legacySourcePath)
  const patches = powershellQuote(patchesDir)

  return [
    `$LEGACY = ${legacy}`,
    `$PATCHES = ${patches}`,
    `New-Item -ItemType Directory -Force -Path $PATCHES | Out-Null`,
    `Get-ChildItem -Path $LEGACY -Recurse -File -Include *.jpg,*.jpeg,*.png | Where-Object { $_.FullName -match '[\\\\/]patches[\\\\/]' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $PATCHES $_.Name) -Force }`,
  ].join('\n')
}

function shellQuote(path: string) {
  return `'${path.replace(/'/g, `'\\''`)}'`
}

function powershellQuote(path: string) {
  return `'${path.replace(/'/g, "''")}'`
}

function parentDir(path: string) {
  const normalized = path.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index <= 0) return ''
  return normalized.slice(0, index)
}

